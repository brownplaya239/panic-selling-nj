/**
 * Panic Selling NJ — Historical Closed-Sales Backfill
 * ====================================================
 * One-shot loader that pulls CLOSED sales from the Spark API and populates the
 * `listings` table so the Outcome Engine (listing_outcomes / town_stats) has a
 * training substrate on day one instead of waiting months to accrue.
 *
 *   node backfill-sales.js         ← last 12 months
 *   node backfill-sales.js 24      ← last 24 months
 *
 * Notes:
 *  - The feed MASKS OriginalListPrice on closed records, so this backfill NEVER
 *    writes original_price (that would null out the true original we captured
 *    while a listing was active). It writes current_price = final ListPrice, so
 *    the view can compute sold_vs_list_pct; total capitulation (original→close)
 *    only exists for listings we tracked live.
 *  - Idempotent: upsert on id. Re-running refreshes, never duplicates.
 *  - Deterministic month × price-bucket paging (the Spark cursor is unreliable).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SPARK_BASE_URL = 'https://replication.sparkapi.com/v1';
const PAGE_SIZE      = 1000;
const MIN_PRICE      = 200000;
const PRICE_EDGES    = [MIN_PRICE, 300000, 400000, 500000, 650000, 850000, 1200000, 2000000];
const SALE_CLASSES   = new Set(['Residential', 'Multi-Family', 'Land/Lots']);
const UPSERT_BATCH   = 500;

const MONMOUTH = new Set([
  'Long Branch','Asbury Park','Red Bank','Rumson','Sea Bright','Manasquan','Spring Lake',
  'Spring Lake Heights','Belmar','Bradley Beach','Avon-by-the-Sea','Keyport','Keansburg',
  'Hazlet','Middletown','Fair Haven','Shrewsbury','Tinton Falls','Eatontown','Neptune',
  'Neptune Township','Neptune City','Ocean Grove','Wall','Wall Township','Freehold',
  'Freehold Township','Marlboro','Morganville','Manalapan','Howell','Colts Neck','Holmdel',
  'Ocean Township','Ocean Twp','Oakhurst','Oceanport','West Long Branch','Little Silver',
  'Atlantic Highlands','Highlands','Matawan','Aberdeen','Farmingdale','Union Beach','Brielle',
  'Monmouth Beach','Belford','Englishtown','Sea Girt','Allentown','Deal','Allenhurst',
  'Loch Arbour','Interlaken','Wanamassa','Leonardo','Port Monmouth','Navesink','Lincroft',
]);
const OCEAN = new Set([
  'Toms River','Brick','Lavallette','Point Pleasant','Point Pleasant Beach','Bay Head',
  'Seaside Heights','Seaside Park','Barnegat','Stafford','Manahawkin','Ship Bottom',
  'Beach Haven','Harvey Cedars','Surf City','Long Beach Township','Lacey','Jackson',
  'Lakewood','Lakehurst','Berkeley','Bayville','Beachwood','Pine Beach','Island Heights',
  'Waretown','Forked River','Tuckerton','Little Egg Harbor','Plumsted','Ocean Gate',
  'South Toms River','Manchester','Manchester Township','Whiting','Lanoka Harbor',
  'Ortley Beach','Normandy Beach','Mantoloking','Barnegat Light','Ocean Acres','Silverton',
]);

// ── SPARK FETCH ───────────────────────────────────────────────────────────────
const CLOSED_FIELDS = [
  'ListingId', 'MlsId', 'StandardFields.UnparsedAddress', 'StandardFields.City',
  'StandardFields.PostalCode', 'StandardFields.PropertySubType', 'StandardFields.PropertyTypeLabel',
  'StandardFields.BedsTotal', 'StandardFields.BathsTotal', 'StandardFields.BuildingAreaTotal',
  'StandardFields.YearBuilt', 'StandardFields.ListPrice', 'StandardFields.ClosePrice',
  'StandardFields.CloseDate', 'StandardFields.PurchaseContractDate',
  'StandardFields.ListingContractDate', 'StandardFields.Latitude', 'StandardFields.Longitude',
].join(',');

async function sparkFetch(params) {
  const token = process.env.SPARK_ACCESS_TOKEN;
  if (!token) throw new Error('SPARK_ACCESS_TOKEN is not set in .env');
  const url = new URL(`${SPARK_BASE_URL}/listings`);
  Object.entries({ _limit: PAGE_SIZE, _fields: CLOSED_FIELDS, ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'PanicSellingNJ-Backfill/1.0' } });
  if (!resp.ok) throw new Error(`Spark API ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
  return resp.json();
}

// Recursive price-bucket fetch within a fixed date window — each call < 1000 rows
async function fetchBucket(dateFilter, lo, hi, byId, depth = 0) {
  let filter = `${dateFilter} And ListPrice Ge ${lo}`;
  if (hi != null) filter += ` And ListPrice Lt ${hi}`;
  const data = await sparkFetch({ _filter: filter, _limit: PAGE_SIZE, _pagination: 1 });
  const results = data?.D?.Results || [];
  const total = data?.D?.Pagination?.TotalRows ?? results.length;
  if (total > results.length) {
    const span = (hi ?? lo * 4) - lo;
    if (depth < 8 && span > 1000) {
      const mid = hi == null ? lo * 2 : lo + Math.floor(span / 2);
      await fetchBucket(dateFilter, lo, mid, byId, depth + 1);
      await fetchBucket(dateFilter, mid, hi, byId, depth + 1);
      return;
    }
    console.warn(`    ⚠️  [${lo}-${hi ?? '∞'}] ${total} rows, only ${results.length} fetched (${total - results.length} dropped)`);
  }
  for (const r of results) if (r.Id) byId.set(r.Id, r);
}

async function fetchMonthClosings(monthStart, monthEnd) {
  const dateFilter = `MlsStatus Eq 'Closed' And CloseDate Ge ${monthStart} And CloseDate Lt ${monthEnd}`;
  const byId = new Map();
  for (let i = 0; i < PRICE_EDGES.length; i++) {
    await fetchBucket(dateFilter, PRICE_EDGES[i], PRICE_EDGES[i + 1] ?? null, byId);
  }
  return [...byId.values()];
}

// ── NORMALIZE ─────────────────────────────────────────────────────────────────
const mask = v => v == null || String(v).includes('*');
const sInt = v => { if (mask(v)) return null; const n = parseInt(v); return isNaN(n) ? null : n; };
const sDec = v => { if (mask(v)) return null; const n = parseFloat(v); return isNaN(n) ? null : n; };
const clean = v => mask(v) ? null : v;
const county = city => MONMOUTH.has(city) ? 'Monmouth' : OCEAN.has(city) ? 'Ocean' : 'Unknown';
const daysBetween = (a, b) => (a && b) ? Math.max(0, Math.floor((new Date(b) - new Date(a)) / 86400000)) : 0;

// Deliberately OMITS original_price / photo_url / tags / description so this
// backfill never overwrites richer data captured while a listing was active.
function normalizeClosed(raw) {
  const sf = raw.StandardFields || {};
  const id = clean(raw.Id) || clean(raw.ListingId);
  if (!id || String(id).length < 6) return null;
  const closePrice = sInt(sf.ClosePrice);
  const listPrice  = sInt(sf.ListPrice);
  if (!closePrice || closePrice < 50000) return null;
  const label = sf.PropertyTypeLabel;
  if (label && !mask(label) && !SALE_CLASSES.has(label)) return null; // drop commercial/rental
  const city = sf.City || '';
  const listDate = clean(sf.ListingContractDate);
  const closeDate = clean(sf.CloseDate);
  return {
    id,
    mls_number:     clean(raw.MlsId),
    address:        sf.UnparsedAddress || 'Unknown Address',
    city,
    county:         county(city),
    zip:            sf.PostalCode || '',
    property_type:  clean(sf.PropertySubType) || label || 'Residential',
    bedrooms:       sInt(sf.BedsTotal),
    bathrooms:      sDec(sf.BathsTotal),
    sqft:           sInt(sf.BuildingAreaTotal),
    year_built:     sInt(sf.YearBuilt),
    current_price:  listPrice || closePrice,   // final asking (for sold_vs_list_pct)
    close_price:    closePrice,
    close_date:     closeDate,
    pending_date:   clean(sf.PurchaseContractDate),
    list_date:      listDate,
    days_on_market: daysBetween(listDate, closeDate),
    status:         'Closed',
    latitude:       sDec(sf.Latitude),
    longitude:      sDec(sf.Longitude),
    last_seen_at:   new Date().toISOString(),
    updated_at:     new Date().toISOString(),
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
function monthWindows(n) {
  const wins = [];
  const now = new Date();
  // Start at the first of the month, n months back; walk forward to current month.
  for (let i = n; i >= 0; i--) {
    const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    const fmt = d => d.toISOString().slice(0, 10);
    wins.push({ start: fmt(s), end: fmt(e), label: fmt(s).slice(0, 7) });
  }
  return wins;
}

async function upsertAll(rows) {
  let ok = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase.from('listings').upsert(chunk, { onConflict: 'id', ignoreDuplicates: false });
    if (error) console.error(`    upsert error: ${error.message}`);
    else ok += chunk.length;
  }
  return ok;
}

async function main() {
  const months = Math.min(36, Math.max(1, parseInt(process.argv[2]) || 12));
  console.log(`\n🏠 Backfilling closed sales — last ${months} month(s)\n`);
  const windows = monthWindows(months);
  let grandTotal = 0, grandKept = 0;
  const byCounty = { Monmouth: 0, Ocean: 0, Unknown: 0 };

  for (const w of windows) {
    let raw;
    try {
      raw = await fetchMonthClosings(w.start, w.end);
    } catch (e) {
      console.error(`  ${w.label}: fetch failed — ${e.message}`);
      continue;
    }
    const rows = raw.map(normalizeClosed).filter(Boolean);
    for (const r of rows) byCounty[r.county] = (byCounty[r.county] || 0) + 1;
    const saved = await upsertAll(rows);
    grandTotal += raw.length;
    grandKept += saved;
    console.log(`  ${w.label}: ${raw.length} closed → ${saved} saved`);
  }

  // Rebuild the precomputed frontend views — this backfill just changed listings
  const { error: refreshErr } = await supabase.rpc('refresh_frontend_views');
  if (refreshErr) console.warn(`  ⚠️  View refresh failed (run refresh_frontend_views manually): ${refreshErr.message}`);

  console.log(`\n✅ Backfill complete: ${grandKept} closed sales saved (${grandTotal} fetched)`);
  console.log(`   By county — Monmouth: ${byCounty.Monmouth}, Ocean: ${byCounty.Ocean}, Unknown: ${byCounty.Unknown}`);
  console.log(`   Query listing_outcomes (status=Closed) to see days_to_close & sold_vs_list_pct.\n`);
}

main().then(() => process.exit(0)).catch(e => { console.error('\n❌ Backfill failed:', e); process.exit(1); });

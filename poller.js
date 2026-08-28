/**
 * Panic Selling NJ — Spark API Poller
 * ====================================
 * Polls the Spark API (FlexMLS / MORMLS) for active listings,
 * stores price snapshots in Supabase, and detects price drops.
 *
 * SETUP:
 *   npm install @supabase/supabase-js node-cron dotenv
 *   node poller.js          ← runs once immediately
 *   node poller.js --watch  ← runs on cron schedule (default: 6am + 8pm daily)
 *
 * ENV VARS NEEDED (.env file):
 *   SPARK_ACCESS_TOKEN     ← static Bearer token from MORMLS
 *   SUPABASE_URL           ← from supabase.com project settings
 *   SUPABASE_SERVICE_KEY   ← service_role key (NOT anon key — needs write access)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import { Resend } from 'resend';

// ── CONFIG ────────────────────────────────────────────────────────────────────

const SPARK_BASE_URL    = 'https://replication.sparkapi.com/v1';
const SPARK_TOKEN_URL   = 'https://sparkplatform.com/openid/token';
const TARGET_CITIES     = [
  // Monmouth County
  'Long Branch', 'Asbury Park', 'Red Bank', 'Rumson', 'Sea Bright',
  'Manasquan', 'Spring Lake', 'Belmar', 'Bradley Beach', 'Avon-by-the-Sea',
  'Keyport', 'Keansburg', 'Hazlet', 'Middletown', 'Fair Haven',
  'Shrewsbury', 'Tinton Falls', 'Eatontown', 'Neptune', 'Wall',
  // Ocean County
  'Toms River', 'Brick', 'Lavallette', 'Point Pleasant', 'Bay Head',
  'Seaside Heights', 'Seaside Park', 'Island Beach', 'Barnegat',
  'Stafford', 'Manahawkin', 'Ship Bottom', 'Beach Haven', 'Harvey Cedars',
  'Surf City', 'Long Beach Township', 'Lacey', 'Jackson', 'Howell',
];
const MIN_PRICE         = 25000;    // fetch floor — low enough to include land parcels
                                    // and sub-$200k homes; junk (mislabeled rentals,
                                    // commercial) is excluded by PropertyTypeLabel class,
                                    // not by price
const MAX_PRICE         = 10000000;
const PAGE_SIZE         = 1000;
const DROP_MIN_DOLLARS  = 5000;     // don't surface tiny rounding drops
const DROP_MIN_PCT      = 1.0;      // minimum % drop to surface

// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── RESEND CLIENT (email) ─────────────────────────────────────────────────────

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const RESEND_FROM = process.env.RESEND_FROM || 'MOMLS Alerts <alerts@momls.app>';
const SITE_URL    = process.env.SITE_URL    || 'https://momls.netlify.app';

// ── SPARK ACCESS TOKEN (direct — no OAuth exchange needed) ───────────────────
// MORMLS issues a static Access Token directly. Use it as Bearer on every request.

function getSparkToken() {
  const token = process.env.SPARK_ACCESS_TOKEN;
  if (!token) throw new Error('SPARK_ACCESS_TOKEN is not set in .env');
  return token;
}

// ── SPARK API FETCH ───────────────────────────────────────────────────────────

async function sparkFetch(endpoint, params = {}) {
  const token = await getSparkToken();
  const url = new URL(`${SPARK_BASE_URL}${endpoint}`);

  // Default params
  const defaultParams = {
    _limit:  PAGE_SIZE,
    _fields: [
      'ListingId', 'MlsId', 'StandardFields.UnparsedAddress',
      'StandardFields.City', 'StandardFields.PostalCode',
      'StandardFields.SubdivisionName', 'StandardFields.PropertyType',
      'StandardFields.PropertySubType', 'StandardFields.PropertyTypeLabel',
      'StandardFields.ZoningDescription', 'StandardFields.LotSizeAcres',
      'StandardFields.SeniorCommunityYN', 'StandardFields.WaterfrontYN',
      'StandardFields.PoolPrivateYN', 'StandardFields.NewConstructionYN',
      'StandardFields.BedsTotal', 'StandardFields.BathsTotal',
      'StandardFields.BedroomsTotal', 'StandardFields.BathroomsTotalDecimal',
      'StandardFields.BuildingAreaTotal', 'StandardFields.LotSizeArea',
      'StandardFields.YearBuilt', 'StandardFields.GarageSpaces',
      'StandardFields.ListPrice', 'StandardFields.OriginalListPrice',
      'StandardFields.ClosePrice', 'StandardFields.CloseDate',
      'StandardFields.PurchaseContractDate',
      'StandardFields.ListingContractDate', 'StandardFields.OnMarketDate',
      'StandardFields.DaysOnMarket',
      'StandardFields.MlsStatus', 'StandardFields.Latitude',
      'StandardFields.Longitude', 'StandardFields.PublicRemarks',
      'StandardFields.ListAgentFullName', 'StandardFields.ListAgentMlsId',
      'StandardFields.ListAgentFirstName', 'StandardFields.ListAgentLastName',
      'StandardFields.ListOfficeName', 'StandardFields.ListOfficeMlsId',
      'StandardFields.BuyerAgentMlsId', 'StandardFields.BuyerAgentFirstName',
      'StandardFields.BuyerAgentLastName', 'StandardFields.BuyerOfficeName',
      'StandardFields.BuyerOfficeMlsId', 'StandardFields.CoListAgentMlsId',
      'StandardFields.CoBuyerAgentMlsId',
      'Photos',
    ].join(','),
    ...params,
  };

  Object.entries(defaultParams).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent':  'PanicSellingNJ/1.0 (+https://panicsellingnj.com)',
    },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Spark API error ${resp.status} on ${endpoint}: ${err}`);
  }

  return resp.json();
}

// ── FETCH LISTINGS (price-bucketed) ───────────────────────────────────────────
// The Spark replication API's _skiptoken/_startat cursor is unreliable under heavy
// _fields payloads (it silently truncates and dead-ends), so we cannot page a large
// result set safely. Instead we split the query into ListPrice buckets that each
// return < 1000 rows in a single call — deterministic, complete, no cursor. Any
// bucket that still overflows is recursively halved, so it can never silently cap.

const PRICE_EDGES = [MIN_PRICE, 200000, 300000, 400000, 500000, 650000, 850000, 1200000, 2000000]; // last edge → open top

async function fetchPriceBucket(baseFilter, lo, hi, byId, depth = 0) {
  let filter = `${baseFilter} And ListPrice Ge ${lo}`;
  if (hi != null) filter += ` And ListPrice Lt ${hi}`;
  const data = await sparkFetch('/listings', { _filter: filter, _limit: PAGE_SIZE, _pagination: 1 });
  const results = data?.D?.Results || [];
  const total = data?.D?.Pagination?.TotalRows ?? results.length;

  if (total > results.length) {
    // Bucket truncated — split in half and recurse (guard against pathological
    // price clustering so we never recurse forever on identical prices).
    const span = (hi ?? lo * 4) - lo;
    if (depth < 8 && span > 1000) {
      const mid = hi == null ? lo * 2 : lo + Math.floor(span / 2);
      await fetchPriceBucket(baseFilter, lo, mid, byId, depth + 1);
      await fetchPriceBucket(baseFilter, mid, hi, byId, depth + 1);
      return;
    }
    console.warn(`  ⚠️  Bucket [${lo}-${hi ?? '∞'}] has ${total} rows but only ${results.length} fetched (price-clustered; ${total - results.length} dropped)`);
  }
  for (const r of results) if (r.Id) byId.set(r.Id, r);
}

async function fetchByPrice(baseFilter) {
  const byId = new Map();
  for (let i = 0; i < PRICE_EDGES.length; i++) {
    const lo = PRICE_EDGES[i];
    const hi = PRICE_EDGES[i + 1] ?? null; // last edge → open-ended top
    await fetchPriceBucket(baseFilter, lo, hi, byId);
  }
  return [...byId.values()];
}

async function fetchAllActiveListings() {
  const active = await fetchByPrice(`MlsStatus Eq 'Active'`);
  console.log(`  Fetched ${active.length} active listings (≥ $${MIN_PRICE.toLocaleString()}) from MORMLS`);

  // Outcome Engine: also fetch recently-changed Pending/Closed listings so we can
  // record status transitions and sale prices. Feed may not expose these — fail soft.
  let changed = [];
  try {
    changed = await fetchByPrice(`(MlsStatus Eq 'Pending' Or MlsStatus Eq 'Closed') And ModificationTimestamp Gt days(-3)`);
    console.log(`  Fetched ${changed.length} recently pending/closed listings`);
  } catch (e) {
    console.warn(`  ⚠️  Pending/Closed fetch failed (feed may not include sold data): ${e.message}`);
  }
  return [...active, ...changed];
}




// ── NORMALIZE SPARK LISTING → DB ROW ─────────────────────────────────────────

function safeInt(v) { if(!v || String(v).includes('*')) return null; const n=parseInt(v); return isNaN(n)?null:n; }
function safeDec(v) { if(!v || String(v).includes('*')) return null; const n=parseFloat(v); return isNaN(n)?null:n; }
function clean_(v) { return (typeof v === 'string' && v && !v.includes('*')) ? v : null; }
function joinName(full, first, last) {
  if (clean_(full)) return full;
  const parts = [clean_(first), clean_(last)].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}
// This feed tier doesn't provide DaysOnMarket/CumulativeDaysOnMarket — derive it
// from OnMarketDate (falling back to ListingContractDate), both 100% populated.
function computeDom(sf) {
  const raw = safeInt(sf.DaysOnMarket);
  if (raw != null) return raw;
  const d = sf.OnMarketDate || sf.ListingContractDate;
  if (!d || String(d).includes('*')) return 0;
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return (isNaN(days) || days < 0) ? 0 : days;
}
function normalizeListing(raw) {
  const sf = raw.StandardFields || {};
  const photos = raw.Photos || [];

  return {
    id:            (raw.Id && raw.Id !== "********") ? raw.Id : ((raw.ListingId && raw.ListingId !== "********") ? raw.ListingId : null),
    mls_number:    (raw.MlsId && raw.MlsId !== "********") ? raw.MlsId : null,
    address:       sf.UnparsedAddress || 'Unknown Address',
    city:          sf.City || '',
    county:        TARGET_CITIES.includes(sf.City)
                     ? (isMonmouth(sf.City) ? 'Monmouth' : 'Ocean')
                     : 'Unknown',
    zip:           sf.PostalCode || '',
    neighborhood:  sf.SubdivisionName || '',
    // Feed quirk: PropertyType is a code ("A"); the readable type is PropertySubType
    property_type: (sf.PropertySubType && !String(sf.PropertySubType).includes('*'))
                     ? sf.PropertySubType : (sf.PropertyTypeLabel || 'Residential'),
    property_class: (typeof sf.PropertyTypeLabel === 'string' && !sf.PropertyTypeLabel.includes('*'))
                     ? sf.PropertyTypeLabel : null,
    // ZoningDescription is occasionally a dict — only store clean strings
    zoning:        (typeof sf.ZoningDescription === 'string' && !sf.ZoningDescription.includes('*'))
                     ? sf.ZoningDescription : null,
    lot_acres:     safeDec(sf.LotSizeAcres),
    senior_community: sf.SeniorCommunityYN === true || sf.PropertySubType === 'Adult Community',
    bedrooms:      safeInt(sf.BedsTotal) ?? safeInt(sf.BedroomsTotal),
    bathrooms:     safeDec(sf.BathsTotal) ?? safeDec(sf.BathroomsTotalDecimal),
    sqft:          safeInt(sf.BuildingAreaTotal),
    lot_size:      sf.LotSizeArea ? `${sf.LotSizeArea} acres` : null,
    year_built:    safeInt(sf.YearBuilt),
    garage:        sf.GarageSpaces ? `${sf.GarageSpaces} car` : null,
    current_price: safeInt(sf.ListPrice) || 0,
    original_price: safeInt(sf.OriginalListPrice) || safeInt(sf.ListPrice) || null,
    close_price:   safeInt(sf.ClosePrice),
    close_date:    (sf.CloseDate && !String(sf.CloseDate).includes('*')) ? sf.CloseDate : null,
    pending_date:  (sf.PurchaseContractDate && !String(sf.PurchaseContractDate).includes('*')) ? sf.PurchaseContractDate : null,
    list_date:     sf.ListingContractDate || null,
    days_on_market: computeDom(sf),
    status:        sf.MlsStatus || 'Active',
    latitude:      safeDec(sf.Latitude),
    longitude:     safeDec(sf.Longitude),
    photo_url:     photos[0]?.Uri800 || photos[0]?.UriThumb || null,
    listing_url:   (raw.ListingId && !String(raw.ListingId).includes('*'))
                     ? `https://www.flexmls.com/share/listing/${raw.ListingId}` : null,
    // ListAgentFullName is EMPTY in this feed — build from First+Last
    agent_name:    joinName(sf.ListAgentFullName, sf.ListAgentFirstName, sf.ListAgentLastName),
    agent_id:      clean_(sf.ListAgentMlsId),
    office_name:   clean_(sf.ListOfficeName),
    list_office_id:   clean_(sf.ListOfficeMlsId),
    co_list_agent_id: clean_(sf.CoListAgentMlsId),
    buyer_agent_id:   clean_(sf.BuyerAgentMlsId),
    buyer_agent_name: joinName(null, sf.BuyerAgentFirstName, sf.BuyerAgentLastName),
    buyer_office_name: clean_(sf.BuyerOfficeName),
    buyer_office_id:   clean_(sf.BuyerOfficeMlsId),
    co_buyer_agent_id: clean_(sf.CoBuyerAgentMlsId),
    description:   sf.PublicRemarks || null,
    tags:          buildTags(sf),
    last_seen_at:  new Date().toISOString(),
    updated_at:    new Date().toISOString(),
  };
}

function isMonmouth(city) {
  const monmouth = [
    'Long Branch','Asbury Park','Red Bank','Rumson','Sea Bright','Manasquan',
    'Spring Lake','Belmar','Bradley Beach','Avon-by-the-Sea','Keyport',
    'Keansburg','Hazlet','Middletown','Fair Haven','Shrewsbury','Tinton Falls',
    'Eatontown','Neptune','Wall',
  ];
  return monmouth.includes(city);
}

function buildTags(sf) {
  const tags = [];
  const dom = computeDom(sf);
  if (sf.WaterfrontYN)                    tags.push('WATERFRONT');
  if (sf.WaterBodyName?.toLowerCase().includes('ocean')) tags.push('OCEAN VIEWS');
  if (sf.PoolPrivateYN)                   tags.push('POOL');
  if (sf.NewConstructionYN)               tags.push('NEW CONSTRUCTION');
  if (dom > 60)                           tags.push('LONG DOM');
  if (dom <= 3)                           tags.push('JUST LISTED');
  if (sf.PropertyType === 'Land')         tags.push('LAND');
  return tags;
}

// ── PROCESS LISTINGS: upsert + detect drops ───────────────────────────────────

async function processListings(rawListings) {
  let dropsDetected = 0;
  let newListings = 0;
  const detectedDropsForEmail = [];
  const BATCH = 100;

  // Sales only — exclude rentals and leases (PropertyTypeLabel 'Residential Rental',
  // 'Commercial Lease'). Commercial SALES are real investment inventory and stay in.
  // Fail-open if masked/missing.
  const SALE_CLASSES = new Set(['Residential', 'Multi-Family', 'Land/Lots', 'Commercial']);
  const saleListings = rawListings.filter(r => {
    const label = r.StandardFields?.PropertyTypeLabel;
    return !label || String(label).includes('*') || SALE_CLASSES.has(label);
  });
  if (saleListings.length < rawListings.length)
    console.log(`  Filtered out ${rawListings.length - saleListings.length} rental/commercial listings`);

  for (let i = 0; i < saleListings.length; i += BATCH) {
    const batch = saleListings.slice(i, i + BATCH);
    const normalized = batch.map(normalizeListing).filter(l => l.current_price > 0 && l.id && !String(l.id).includes('*') && String(l.id).length > 5);

    // Get existing prices + statuses for this batch
    const ids = normalized.map(l => l.id);
    const { data: existing } = await supabase
      .from('listings')
      .select('id, current_price, status')
      .in('id', ids);

    const existingMap = Object.fromEntries((existing || []).map(e => [e.id, e.current_price]));
    const statusMap   = Object.fromEntries((existing || []).map(e => [e.id, e.status]));

    // Upsert listings
    const { error: upsertErr } = await supabase
      .from('listings')
      .upsert(normalized, { onConflict: 'id', ignoreDuplicates: false });

    if (upsertErr) {
      console.error('Upsert error:', upsertErr.message, JSON.stringify(upsertErr.details||'').slice(0,100));
      continue;
    }
    // Insert price snapshots (active listings only — closed prices are captured in close_price)
    const snapshots = normalized.filter(l => l.status === 'Active').map(l => ({
      listing_id:  l.id,
      price:       l.current_price,
      recorded_at: new Date().toISOString(),
    }));

    if (snapshots.length) {
      const {error:snapErr} = await supabase.from('price_snapshots').insert(snapshots);
      if(snapErr) console.error('Snapshot error:', snapErr.message);
    }

    // Outcome Engine: record status transitions (Active→Pending→Closed etc.)
    const transitions = normalized
      .filter(l => statusMap[l.id] && statusMap[l.id] !== l.status)
      .map(l => ({
        listing_id:      l.id,
        old_status:      statusMap[l.id],
        new_status:      l.status,
        price_at_change: l.close_price || l.current_price,
      }));
    if (transitions.length) {
      const { error: evtErr } = await supabase.from('listing_status_events').insert(transitions);
      if (evtErr) console.error('Status event error:', evtErr.message);
      // Listings leaving the market take their drops off the board
      const goneIds = transitions.filter(t => t.new_status !== 'Active').map(t => t.listing_id);
      if (goneIds.length) {
        const { error: offErr } = await supabase
          .from('price_drops').update({ is_active: false })
          .in('listing_id', goneIds).eq('is_active', true);
        if (offErr) console.error('Drop deactivate error:', offErr.message);
        transitions.filter(t => t.new_status !== 'Active')
          .forEach(t => console.log(`  🔁 ${t.listing_id}: ${t.old_status} → ${t.new_status}`));
      }
    }

    // Detect drops (active listings only)
    for (const listing of normalized) {
      if (listing.status !== 'Active') continue;
      const prevPrice = existingMap[listing.id];

      if (!prevPrice) {
        newListings++;
        continue; // First time we've seen this listing
      }

      const dropDollar = prevPrice - listing.current_price;
      const dropPct = (dropDollar / prevPrice) * 100;

      if (dropDollar >= DROP_MIN_DOLLARS && dropPct >= DROP_MIN_PCT) {
        // Mark any old active drops for this listing as inactive
        const { error: deactivateErr } = await supabase
          .from('price_drops')
          .update({ is_active: false })
          .eq('listing_id', listing.id)
          .eq('is_active', true);
        if (deactivateErr) console.error('Deactivate drop error:', deactivateErr.message);

        // Insert new drop
        const { error: insertDropErr } = await supabase.from('price_drops').insert({
          listing_id:   listing.id,
          price_before: prevPrice,
          price_after:  listing.current_price,
          detected_at:  new Date().toISOString(),
          is_active:    true,
        });
        if (insertDropErr) { console.error('Insert drop error:', insertDropErr.message); continue; }

        dropsDetected++;
        detectedDropsForEmail.push({
          address:       listing.address,
          city:          listing.city,
          county:        listing.county,
          property_type: listing.property_type,
          bedrooms:      listing.bedrooms,
          bathrooms:     listing.bathrooms,
          sqft:          listing.sqft,
          days_on_market: listing.days_on_market,
          price_before:  prevPrice,
          price_after:   listing.current_price,
          drop_dollar:   dropDollar,
          drop_pct:      dropPct,
          listing_url:   listing.listing_url,
          tags:          listing.tags || [],
        });
        console.log(`  📉 DROP: ${listing.address} — $${prevPrice.toLocaleString()} → $${listing.current_price.toLocaleString()} (-$${dropDollar.toLocaleString()})`);
      }
    }

    process.stdout.write(`  Processed ${Math.min(i + BATCH, saleListings.length)}/${saleListings.length} listings\r`);
  }

  // Mark listings as non-active if we haven't seen them recently (went Pending/Sold)
  await supabase
    .from('price_drops')
    .update({ is_active: false })
    .lt('detected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .eq('is_active', true);

  // Listings that vanished from the feed for 3+ days (withdrawn, or rentals/commercial
  // that no longer pass the sale filter) leave the active pool
  const { error: staleErr } = await supabase
    .from('listings')
    .update({ status: 'Off Market' })
    .lt('last_seen_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
    .eq('status', 'Active');
  if (staleErr) console.error('Stale listing cleanup error:', staleErr.message);

  return { dropsDetected, newListings, detectedDropsForEmail };
}

// ── DEAL SCREENER: capitulation scores + bid guidance ─────────────────────────
// Empirical, not modeled: expected close = ask × (1 − cohort slide), where the
// slide distribution is measured from closed listings that were at the same cut
// count. Every (listing, ask) prediction is stored and later graded against the
// actual close via the prediction_outcomes view — the TickerDesk loop for bids.

const MOTIVATION_WORDS = [
  'motivated', 'bring all offers', 'all offers', 'priced to sell', 'quick close',
  'relocat', 'estate sale', 'as-is', 'as is', 'vacant', 'must sell', 'make an offer',
  'below market', 'investor', 'handyman', 'tlc', 'cash only', 'short sale', 'probate',
];

function pctile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function pageAll(table, select, filters = q => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filters(
      supabase.from(table).select(select).range(from, from + 999)
    );
    if (error) { console.error(`${table} page error:`, error.message); break; }
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function computeDealScores() {
  console.log('\n💎 Computing deal scores...');
  // All cut history, grouped per listing (ordered by time)
  const dropRows = await pageAll('price_drops', 'listing_id, price_after, detected_at',
    q => q.order('detected_at', { ascending: true }));
  const cutsByListing = new Map();
  for (const r of dropRows) {
    if (!cutsByListing.has(r.listing_id)) cutsByListing.set(r.listing_id, []);
    cutsByListing.get(r.listing_id).push(r);
  }
  const cutIds = [...cutsByListing.keys()];

  // Listing rows for every cutter (closed → training, active → targets)
  const fields = 'id,status,close_price,current_price,days_on_market,description,city,county,address,photo_url,listing_url,bedrooms,bathrooms,sqft,property_type,property_class,zoning,lot_acres,senior_community,year_built';
  const listings = [];
  for (let i = 0; i < cutIds.length; i += 200) {
    const { data } = await supabase.from('listings').select(fields).in('id', cutIds.slice(i, i + 200));
    listings.push(...(data || []));
  }

  // 1. TRAINING: slide from the k-th cut price → close, for k = 1, 2, 3(+)
  const slides = { 1: [], 2: [], 3: [] };
  const reachedK = { 1: 0, 2: 0, 3: 0 };
  const cutAgain = { 1: 0, 2: 0, 3: 0 };
  for (const l of listings) {
    if (l.status !== 'Closed' || !l.close_price) continue;
    const cuts = cutsByListing.get(l.id) || [];
    for (const k of [1, 2, 3]) {
      if (cuts.length >= k) {
        reachedK[k]++;
        if (cuts.length > k) cutAgain[k]++;
        const pk = cuts[k - 1].price_after;
        if (pk > 0) slides[k].push(((pk - l.close_price) / pk) * 100);
      }
    }
  }
  for (const k of [1, 2, 3]) slides[k].sort((a, b) => a - b);
  const cohort = k => {
    const kk = Math.min(3, k);
    return {
      n: slides[kk].length,
      p25: pctile(slides[kk], 0.25), p50: pctile(slides[kk], 0.50), p75: pctile(slides[kk], 0.75),
      cutAgainPct: reachedK[kk] ? Math.round(100 * cutAgain[kk] / reachedK[kk]) : null,
    };
  };
  console.log(`  Training cohorts: 1-cut n=${slides[1].length} (med ${pctile(slides[1],.5)?.toFixed(1)}%), 2-cut n=${slides[2].length} (med ${pctile(slides[2],.5)?.toFixed(1)}%), 3+-cut n=${slides[3].length} (med ${pctile(slides[3],.5)?.toFixed(1)}%)`);

  // Town context for softness + pricing gap
  const { data: townOut } = await supabase.from('town_outcomes').select('city,pct_at_or_over_ask');
  const softMap = new Map((townOut || []).map(t => [t.city, 100 - t.pct_at_or_over_ask]));
  const { data: townStats } = await supabase.from('town_stats').select('city,median_dom');
  const domMap = new Map((townStats || []).map(t => [t.city, t.median_dom]));
  const { data: ppsqftRows } = await supabase.from('all_active_listings').select('listing_id,ppsqft,town_avg_ppsqft').in('listing_id', cutIds.slice(0, 1000));
  const ppMap = new Map((ppsqftRows || []).map(r => [r.listing_id, r]));

  // 2. SCORE every ACTIVE cutter
  const now = Date.now();
  const rows = [];
  for (const l of listings) {
    if (l.status !== 'Active' || !l.current_price) continue;
    const cuts = cutsByListing.get(l.id) || [];
    if (!cuts.length) continue;
    const k = cuts.length;
    const co = cohort(k);
    if (!co.n || co.n < 20) continue; // never guide off a thin cohort

    const lastCutAt = new Date(cuts[cuts.length - 1].detected_at).getTime();
    const daysSinceCut = Math.floor((now - lastCutAt) / 86400000);
    let cutInterval = null;
    if (cuts.length >= 2) {
      const gaps = [];
      for (let i = 1; i < cuts.length; i++)
        gaps.push((new Date(cuts[i].detected_at) - new Date(cuts[i - 1].detected_at)) / 86400000);
      cutInterval = Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]);
    }
    const pp = ppMap.get(l.id) || {};
    const townSoft = softMap.get(l.city) ?? 45;         // % selling under ask
    const townDom = domMap.get(l.city) ?? 35;
    const desc = (l.description || '').toLowerCase();
    const tags = MOTIVATION_WORDS.filter(w => desc.includes(w))
      .map(w => w === 'relocat' ? 'relocating' : w.replace(/ /g, '-').toUpperCase());

    // Editorial component weights (v1) — the grading loop earns the right to tune these
    const fatigue = Math.min(100, (k === 1 ? 30 : k === 2 ? 55 : 75)
      + Math.min(25, Math.max(0, (l.days_on_market || 0) - townDom) / 3));
    const softness = Math.min(100, townSoft * 1.6);
    const premium = (pp.ppsqft > 0 && pp.town_avg_ppsqft > 0)
      ? ((pp.ppsqft - pp.town_avg_ppsqft) / pp.town_avg_ppsqft) * 100 : 0;
    const pricingPressure = Math.min(100, Math.max(0, premium * 4));
    const motivation = Math.min(100, tags.length * 35);
    const velocity = cutInterval ? Math.min(100, Math.max(0, (45 - cutInterval) * 3)) : (daysSinceCut < 21 ? 40 : 15);
    const score = Math.round(fatigue * 0.35 + softness * 0.20 + pricingPressure * 0.15 + motivation * 0.20 + velocity * 0.10);
    const grade = score >= 80 ? 'A+' : score >= 68 ? 'A' : score >= 56 ? 'B+' : score >= 44 ? 'B' : 'C';

    const ask = l.current_price;
    const expClose = Math.round(ask * (1 - co.p50 / 100));
    const reasons = [
      `${k} price cut${k > 1 ? 's' : ''}`,
      `${l.days_on_market || 0} DOM (town median ${townDom})`,
      co.cutAgainPct != null ? `${co.cutAgainPct}% of ${Math.min(3, k)}-cutters cut again` : null,
      cutInterval ? `cuts every ~${cutInterval}d, last ${daysSinceCut}d ago` : `last cut ${daysSinceCut}d ago`,
      premium > 5 ? `$${pp.ppsqft}/sf is ${Math.round(premium)}% above town avg` : (premium < -5 ? `$${pp.ppsqft}/sf is ${Math.round(-premium)}% below town avg` : null),
      townSoft ? `${townSoft}% of ${l.city} homes sell under ask` : null,
    ].filter(Boolean);

    rows.push({
      listing_id: l.id, score, grade, ask,
      expected_close: expClose,
      expected_low: Math.round(ask * (1 - co.p75 / 100)),
      expected_high: Math.round(ask * (1 - co.p25 / 100)),
      expected_slide_pct: Math.round(co.p50 * 100) / 100,
      est_savings: ask - expClose,
      cohort_n: co.n, cut_count: k, dom: l.days_on_market || 0,
      days_since_cut: daysSinceCut, cut_interval: cutInterval,
      cut_again_pct: co.cutAgainPct,
      ppsqft: pp.ppsqft || null, town_avg_ppsqft: pp.town_avg_ppsqft || null,
      motivation_tags: tags, reasons,
      address: l.address, city: l.city, county: l.county, property_type: l.property_type,
      property_class: l.property_class, zoning: l.zoning, lot_acres: l.lot_acres,
      senior_community: l.senior_community || false, year_built: l.year_built,
      bedrooms: l.bedrooms, bathrooms: l.bathrooms, sqft: l.sqft,
      photo_url: l.photo_url, listing_url: l.listing_url,
      computed_at: new Date().toISOString(),
    });
  }

  // Rebuild deal_scores
  const { error: delErr } = await supabase.from('deal_scores').delete().neq('listing_id', '');
  if (delErr) { console.error('deal_scores clear error:', delErr.message); return; }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('deal_scores').insert(rows.slice(i, i + 200));
    if (error) console.error('deal_scores insert error:', error.message);
  }

  // Append predictions (one per listing+ask — duplicates ignored)
  const preds = rows.map(r => ({
    listing_id: r.listing_id, ask: r.ask, expected_close: r.expected_close,
    expected_low: r.expected_low, expected_high: r.expected_high,
    score: r.score, cut_count: r.cut_count,
  }));
  for (let i = 0; i < preds.length; i += 200) {
    const { error } = await supabase.from('deal_predictions')
      .upsert(preds.slice(i, i + 200), { onConflict: 'listing_id,ask', ignoreDuplicates: true });
    if (error) console.error('deal_predictions error:', error.message);
  }
  console.log(`💎 Deal scores: ${rows.length} active cutters scored & predictions stored`);
}

// ── MAIN POLL FUNCTION ────────────────────────────────────────────────────────

async function poll() {
  console.log(`\n🔄 [${new Date().toISOString()}] Starting poll...`);

  // Log start
  const { data: logRow } = await supabase
    .from('poll_log')
    .insert({ status: 'running' })
    .select('id')
    .single();

  const logId = logRow?.id;

  try {
    const rawListings = await fetchAllActiveListings();
    const { dropsDetected, newListings, detectedDropsForEmail } = await processListings(rawListings);

    // Rebuild the precomputed frontend views (active_drops / all_active_listings
    // are materialized — they only change when this poll changes the data)
    const { error: refreshErr } = await supabase.rpc('refresh_frontend_views');
    if (refreshErr) console.error('View refresh error:', refreshErr.message);
    else console.log('🔄 Frontend views refreshed');

    // Deal Screener: rescore active cutters + store predictions (fail-soft:
    // scoring must never break the poll)
    try { await computeDealScores(); }
    catch (e) { console.error('Deal score error:', e.message); }

    if (detectedDropsForEmail.length > 0) await notifySubscribers(detectedDropsForEmail);

    // Update poll log
    if (logId) {
      await supabase.from('poll_log').update({
        finished_at:      new Date().toISOString(),
        listings_fetched: rawListings.length,
        drops_detected:   dropsDetected,
        new_listings:     newListings,
        status:           'success',
      }).eq('id', logId);
    }

    console.log(`\n✅ Poll complete: ${rawListings.length} listings, ${dropsDetected} drops detected, ${newListings} new listings`);

  } catch (err) {
    console.error('\n❌ Poll failed:', err.message);
    if (logId) {
      await supabase.from('poll_log').update({
        finished_at:   new Date().toISOString(),
        status:        'error',
        error_message: err.message,
      }).eq('id', logId);
    }
  }
}

// ── EMAIL NOTIFICATIONS ───────────────────────────────────────────────────────

function matchesSub(drop, sub) {
  if (sub.counties?.length && !sub.counties.includes(drop.county)) return false;
  if (sub.towns?.length    && !sub.towns.includes(drop.city))      return false;
  if (sub.property_types?.length) {
    const pt = (drop.property_type || '').toLowerCase();
    const ok = sub.property_types.some(t => pt.includes(t.toLowerCase()) || t.toLowerCase().includes(pt));
    if (!ok) return false;
  }
  if (sub.min_beds  && (drop.bedrooms  || 0) < sub.min_beds)  return false;
  if (sub.min_baths && (drop.bathrooms || 0) < sub.min_baths) return false;
  if (sub.min_price && drop.price_after < sub.min_price)       return false;
  if (sub.max_price && drop.price_after > sub.max_price)       return false;
  if (sub.min_sqft  && (drop.sqft || 0) < sub.min_sqft)        return false;
  if (sub.max_sqft  && drop.sqft && drop.sqft > sub.max_sqft)  return false;
  if (sub.min_drop_pct && drop.drop_pct < sub.min_drop_pct)    return false;
  if (sub.max_dom   && (drop.days_on_market || 0) > sub.max_dom) return false;
  if (sub.features?.length) {
    const hasFeature = sub.features.some(f => (drop.tags || []).includes(f));
    if (!hasFeature) return false;
  }
  return true;
}

// Load per-town sold-outcome stats (city → heat) so alert emails can tell buyers
// whether they're walking into a buyer's or seller's market. Fail-open to empty map.
async function fetchTownHeat() {
  try {
    const { data } = await supabase
      .from('town_outcomes')
      .select('city, pct_at_or_over_ask, median_days_to_close, sold_count');
    const map = new Map();
    for (const r of (data || [])) map.set(r.city, r);
    return map;
  } catch { return new Map(); }
}

// Load the learned cut-edge (county grain) so alert emails can tell a buyer what a
// price cut is actually worth in that market. Fail-open to empty map.
async function fetchCutEdge() {
  try {
    const { data } = await supabase
      .from('cut_edge').select('area, cut_over_ask_pct, cut_sold_vs_list_pct, baseline_over_ask_pct, cut_n')
      .eq('grain', 'county');
    const map = new Map();
    for (const r of (data || [])) map.set(r.area, r);
    return map;
  } catch { return new Map(); }
}

// The learned edge, buyer-framed: a cut home sells below ask more often than the market.
function cutEdgeLine(ce) {
  if (!ce || ce.cut_n < 30 || ce.cut_over_ask_pct == null) return '';
  const belowAsk = 100 - ce.cut_over_ask_pct;
  return `<div style="font-size:9px;color:#34d399;font-family:monospace;margin-top:6px">📉 Homes that cut price in ${ce.area} County sell <strong>below ask ${belowAsk}%</strong> of the time (vs ${100 - ce.baseline_over_ask_pct}% market-wide) — you likely have room to negotiate.</div>`;
}

// Buyer-facing market-context badge for a drop's town. Subscribers are BUYERS, so a
// buyer's market is good news (green), a seller's market is a caution (amber).
function heatBadge(h) {
  if (!h || h.sold_count < 25 || h.pct_at_or_over_ask == null) return '';
  const p = h.pct_at_or_over_ask;
  const [label, color] = p >= 55 ? ["Seller's market — expect competition", '#f59e0b']
    : p <= 45 ? ["Buyer's market — room to negotiate", '#34d399']
    : ['Balanced market', '#7a90b0'];
  const dtc = h.median_days_to_close ? ` · ~${h.median_days_to_close}d to close` : '';
  return `<div style="font-size:9px;color:${color};font-family:monospace;margin-top:10px;padding-top:8px;border-top:1px solid #1e2d45">📊 ${h.city}: ${p}% of homes sell at/over ask${dtc} · ${label}</div>`;
}

function buildAlertEmail(drops, sub, isWeekly = false, heat = new Map(), cutEdge = new Map()) {
  const greeting  = sub.name ? `Hi ${sub.name},` : 'Hi there,';
  const watchArea = sub.towns?.length
    ? sub.towns.slice(0,3).join(', ') + (sub.towns.length > 3 ? ' & more' : '')
    : (sub.counties?.join(' & ') || 'Monmouth & Ocean County') + ' County';
  const unsubUrl  = `${SITE_URL}/?unsub=${sub.unsubscribe_token}`;
  const headerLine = isWeekly
    ? `This week's top price drops for <strong style="color:#7a90b0">${watchArea}</strong>`
    : (drops.length === 1 ? 'A home on your watchlist just dropped in price.' : `${drops.length} homes on your watchlist just dropped in price.`);

  const cards = drops.map(d => {
    const url    = d.listing_url || `https://www.google.com/search?q=${encodeURIComponent((d.address||'') + ' NJ Zillow')}`;
    const beds   = d.bedrooms   ? ` · ${d.bedrooms} BD`   : '';
    const baths  = d.bathrooms  ? ` · ${d.bathrooms} BA`  : '';
    const sf     = d.sqft       ? ` · ${d.sqft.toLocaleString()} SF` : '';
    const dom    = d.days_on_market ? ` · ${d.days_on_market}d on market` : '';
    return `<div style="background:#111827;border:1px solid #1e2d45;border-left:3px solid #ff3b5c;padding:16px;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:3px;">${d.address || ''}</div>
      <div style="font-size:10px;color:#7a90b0;font-family:monospace;margin-bottom:12px;">${d.city || ''}, NJ${beds}${baths}${sf}${dom}</div>
      <table style="width:100%;border-collapse:collapse;font-family:monospace;">
        <tr><td style="font-size:10px;color:#7a90b0;padding:3px 0">Was</td><td style="font-size:11px;color:#7a90b0;text-align:right;text-decoration:line-through">$${(d.price_before||0).toLocaleString()}</td></tr>
        <tr><td style="font-size:10px;color:#fff;padding:3px 0;font-weight:600">Now</td><td style="font-size:15px;color:#fff;text-align:right;font-weight:600">$${(d.price_after||0).toLocaleString()}</td></tr>
        <tr><td style="font-size:10px;color:#ff3b5c;padding:3px 0;font-weight:600">Drop</td><td style="font-size:11px;color:#ff3b5c;text-align:right;font-weight:600">-$${Math.round(d.drop_dollar||0).toLocaleString()} (-${parseFloat(d.drop_pct||0).toFixed(1)}%)</td></tr>
      </table>
      <a href="${url}" style="display:inline-block;margin-top:12px;padding:7px 14px;background:#0ea5e9;color:#fff;text-decoration:none;font-family:monospace;font-size:10px;font-weight:600;letter-spacing:.04em">View Listing →</a>
      ${heatBadge(heat.get(d.city))}
      ${cutEdgeLine(cutEdge.get(d.county))}
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><body style="background:#0b0f1a;color:#e2e8f0;font-family:monospace;margin:0;padding:0">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e2d45;padding-bottom:14px;margin-bottom:20px">
    <span style="color:#0ea5e9;font-weight:700;font-size:13px;letter-spacing:.05em">MOMLS PRICING DASHBOARD</span>
    <span style="color:#3d5470;font-size:10px">Monmouth &amp; Ocean County, NJ</span>
  </div>
  <div style="color:#7a90b0;font-size:9px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">${isWeekly ? 'Weekly Digest' : 'Price Drop Alert'}</div>
  <div style="font-size:15px;font-weight:400;color:#e2e8f0;margin-bottom:6px">${greeting}</div>
  <div style="font-size:11px;color:#7a90b0;margin-bottom:20px">${headerLine}</div>
  ${cards}
  <div style="text-align:center;margin:20px 0">
    <a href="${SITE_URL}" style="display:inline-block;padding:8px 20px;background:none;border:1px solid #1e2d45;color:#7a90b0;text-decoration:none;font-size:10px;letter-spacing:.06em">View All on MOMLS →</a>
  </div>
  <div style="font-size:9px;color:#3d5470;border-top:1px solid #1e2d45;padding-top:14px;line-height:1.6">
    You're receiving this because you set up price drop alerts for <strong style="color:#7a90b0">${watchArea}</strong>.<br>
    <a href="${unsubUrl}" style="color:#7a90b0">Unsubscribe</a> &nbsp;·&nbsp; <a href="${SITE_URL}" style="color:#7a90b0;text-decoration:none">momls.netlify.app</a>
  </div>
</div></body></html>`;
}

async function notifySubscribers(drops) {
  if (!resend || !drops.length) return;
  try {
    const { data: subs, error } = await supabase
      .from('subscribers').select('*').eq('is_active', true).eq('frequency', 'instant');
    if (error || !subs?.length) return;

    console.log(`\n📧 Matching ${drops.length} drop(s) against ${subs.length} subscriber(s)...`);
    const [heat, cutEdge] = await Promise.all([fetchTownHeat(), fetchCutEdge()]);
    let sent = 0;
    for (const sub of subs) {
      // Rate limit: skip if emailed within last hour
      if (sub.last_emailed_at && Date.now() - new Date(sub.last_emailed_at).getTime() < 3600000) continue;
      const matches = drops.filter(d => matchesSub(d, sub));
      if (!matches.length) continue;
      try {
        await resend.emails.send({
          from: RESEND_FROM,
          to:   sub.email,
          subject: matches.length === 1
            ? `🏠 Price drop in ${matches[0].city} — down $${Math.round(matches[0].drop_dollar/1000)}K`
            : `🏠 ${matches.length} price drops in your areas`,
          html: buildAlertEmail(matches, sub, false, heat, cutEdge),
        });
        await supabase.from('subscribers').update({ last_emailed_at: new Date().toISOString() }).eq('id', sub.id);
        sent++;
        console.log(`  ✉️  Alert → ${sub.email} (${matches.length} drop${matches.length > 1 ? 's' : ''})`);
      } catch (e) { console.error(`  ⚠️  Failed ${sub.email}:`, e.message); }
    }
    console.log(`📧 Done — notified ${sent} subscriber${sent !== 1 ? 's' : ''}`);
  } catch (e) { console.error('notifySubscribers error:', e.message); }
}

async function sendWeeklyDigest() {
  if (!resend) return;
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: drops } = await supabase
      .from('active_drops').select('*').gte('detected_at', since).order('drop_dollar', { ascending: false }).limit(100);
    if (!drops?.length) return;

    const { data: subs } = await supabase
      .from('subscribers').select('*').eq('is_active', true).eq('frequency', 'weekly');
    if (!subs?.length) return;

    console.log(`\n📰 Sending weekly digest to ${subs.length} subscriber(s)...`);
    const [heat, cutEdge] = await Promise.all([fetchTownHeat(), fetchCutEdge()]);
    for (const sub of subs) {
      const matches = drops.filter(d => matchesSub(d, sub));
      if (!matches.length) continue;
      try {
        await resend.emails.send({
          from: RESEND_FROM,
          to:   sub.email,
          subject: `🏠 This week's price drops in your area — ${matches.length} new`,
          html: buildAlertEmail(matches.slice(0, 10), sub, true, heat, cutEdge),
        });
        await supabase.from('subscribers').update({ last_emailed_at: new Date().toISOString() }).eq('id', sub.id);
        console.log(`  ✉️  Weekly → ${sub.email}`);
      } catch (e) { console.error(`  ⚠️  Weekly failed ${sub.email}:`, e.message); }
    }
  } catch (e) { console.error('sendWeeklyDigest error:', e.message); }
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────

const watchMode = process.argv.includes('--watch');

async function cleanOldSnapshots() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabase
    .from('price_snapshots')
    .delete({ count: 'exact' })
    .lt('recorded_at', cutoff);
  if (error) console.error('Snapshot cleanup error:', error.message);
  else console.log(`🗑️  Pruned ${count ?? '?'} old price snapshots (>30 days)`);
}

// Only run the poller when executed directly (node poller.js). Guarding this lets
// other scripts/tests import the helpers (buildAlertEmail, fetchTownHeat, …) without
// kicking off a poll.
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/poller.js');

if (isMain) {
  if (watchMode) {
    console.log('👀 Watch mode: polling at 6:00 AM and 8:00 PM daily (Eastern)');
    console.log('📰 Weekly digest: Sundays at 8:00 AM (Eastern)');
    poll(); // Run immediately on start
    cron.schedule('0 6  * * *',   poll,             { timezone: 'America/New_York' });
    cron.schedule('0 20 * * *',   poll,             { timezone: 'America/New_York' });
    cron.schedule('0 8  * * 0',   sendWeeklyDigest, { timezone: 'America/New_York' });
    cron.schedule('0 3  * * 0',   cleanOldSnapshots,{ timezone: 'America/New_York' }); // Sundays 3 AM
  } else {
    poll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  }
}

export { buildAlertEmail, heatBadge, cutEdgeLine, fetchTownHeat, fetchCutEdge, matchesSub, normalizeListing, computeDealScores };

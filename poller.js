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
 *   SPARK_CLIENT_ID        ← from sparkplatform.com developer portal
 *   SPARK_CLIENT_SECRET    ← from sparkplatform.com developer portal
 *   SUPABASE_URL           ← from supabase.com project settings
 *   SUPABASE_SERVICE_KEY   ← service_role key (NOT anon key — needs write access)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';

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
const MIN_PRICE         = 200000;   // ignore listings below this
const MAX_PRICE         = 10000000;
const PAGE_SIZE         = 1000;
const DROP_MIN_DOLLARS  = 5000;     // don't surface tiny rounding drops
const DROP_MIN_PCT      = 1.0;      // minimum % drop to surface

// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
      'StandardFields.BedroomsTotal', 'StandardFields.BathroomsTotalDecimal',
      'StandardFields.BuildingAreaTotal', 'StandardFields.LotSizeArea',
      'StandardFields.YearBuilt', 'StandardFields.GarageSpaces',
      'StandardFields.ListPrice', 'StandardFields.OriginalListPrice',
      'StandardFields.ListingContractDate', 'StandardFields.DaysOnMarket',
      'StandardFields.MlsStatus', 'StandardFields.Latitude',
      'StandardFields.Longitude', 'StandardFields.PublicRemarks',
      'StandardFields.ListAgentFullName', 'StandardFields.ListAgentMlsId',
      'StandardFields.ListOfficeName',
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

// ── FETCH ALL ACTIVE LISTINGS (paginated) ─────────────────────────────────────

﻿async function fetchAllActiveListings() {
  const filter = `MlsStatus Eq 'Active'`;
  let allListings = [];
  const data1 = await sparkFetch('/listings', {_filter:filter,_limit:PAGE_SIZE,_pagination:1,_startat:1});
  const data2 = await sparkFetch('/listings', {_filter:filter,_limit:PAGE_SIZE,_pagination:1,_startat:1001});
  allListings = [...(data1?.D?.Results||[]), ...(data2?.D?.Results||[])];
  console.log(`  Fetched ${allListings.length} active listings from MORMLS`);
  return allListings;
}




// ── NORMALIZE SPARK LISTING → DB ROW ─────────────────────────────────────────

function safeInt(v) { if(!v || String(v).includes('*')) return null; const n=parseInt(v); return isNaN(n)?null:n; }
function safeDec(v) { if(!v || String(v).includes('*')) return null; const n=parseFloat(v); return isNaN(n)?null:n; }
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
    property_type: sf.PropertyType || 'Residential',
    bedrooms:      safeInt(sf.BedroomsTotal),
    bathrooms:     safeDec(sf.BathroomsTotalDecimal),
    sqft:          safeInt(sf.BuildingAreaTotal),
    lot_size:      sf.LotSizeArea ? `${sf.LotSizeArea} acres` : null,
    year_built:    safeInt(sf.YearBuilt),
    garage:        sf.GarageSpaces ? `${sf.GarageSpaces} car` : null,
    current_price: safeInt(sf.ListPrice) || 0,
    original_price: safeInt(sf.OriginalListPrice) || safeInt(sf.ListPrice) || null,
    list_date:     sf.ListingContractDate || null,
    days_on_market: safeInt(sf.DaysOnMarket) || 0,
    status:        sf.MlsStatus || 'Active',
    latitude:      safeDec(sf.Latitude),
    longitude:     safeDec(sf.Longitude),
    photo_url:     photos[0]?.Uri800 || photos[0]?.UriThumb || null,
    listing_url:   `https://www.flexmls.com/share/listing/${raw.ListingId}`,
    agent_name:    sf.ListAgentFullName || null,
    agent_id:      sf.ListAgentMlsId || null,
    office_name:   sf.ListOfficeName || null,
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
  if (sf.WaterfrontYN)                    tags.push('WATERFRONT');
  if (sf.WaterBodyName?.toLowerCase().includes('ocean')) tags.push('OCEAN VIEWS');
  if (sf.PoolPrivateYN)                   tags.push('POOL');
  if (sf.NewConstructionYN)               tags.push('NEW CONSTRUCTION');
  if ((sf.DaysOnMarket || 0) > 60)        tags.push('LONG DOM');
  if ((sf.DaysOnMarket || 0) <= 3)        tags.push('JUST LISTED');
  if (sf.PropertyType === 'Land')         tags.push('LAND');
  return tags;
}

// ── PROCESS LISTINGS: upsert + detect drops ───────────────────────────────────

async function processListings(rawListings) {
  let dropsDetected = 0;
  let newListings = 0;
  const BATCH = 100;

  for (let i = 0; i < rawListings.length; i += BATCH) {
    const batch = rawListings.slice(i, i + BATCH);
    const normalized = batch.map(normalizeListing).filter(l => l.current_price > 0 && l.id && !String(l.id).includes('*') && String(l.id).length > 5);

    // Get existing prices for this batch
    const ids = normalized.map(l => l.id);
    const { data: existing } = await supabase
      .from('listings')
      .select('id, current_price')
      .in('id', ids);

    const existingMap = Object.fromEntries((existing || []).map(e => [e.id, e.current_price]));

    // Upsert listings
    const { error: upsertErr } = await supabase
      .from('listings')
      .upsert(normalized, { onConflict: 'id', ignoreDuplicates: false });

    if (upsertErr) {
      console.error('Upsert error:', upsertErr.message, JSON.stringify(upsertErr.details||'').slice(0,100));
      continue;
    }
    // Insert price snapshots for all
    const snapshots = normalized.map(l => ({
      listing_id:  l.id,
      price:       l.current_price,
      recorded_at: new Date().toISOString(),
    }));

    const {error:snapErr} = await supabase.from('price_snapshots').insert(snapshots);
    if(snapErr) console.error('Snapshot error:', snapErr.message);

    // Detect drops
    for (const listing of normalized) {
      const prevPrice = existingMap[listing.id];

      if (!prevPrice) {
        newListings++;
        continue; // First time we've seen this listing
      }

      const dropDollar = prevPrice - listing.current_price;
      const dropPct = (dropDollar / prevPrice) * 100;

      if (dropDollar >= DROP_MIN_DOLLARS && dropPct >= DROP_MIN_PCT) {
        // Mark any old active drops for this listing as inactive
        await supabase
          .from('price_drops')
          .update({ is_active: false })
          .eq('listing_id', listing.id)
          .eq('is_active', true);

        // Insert new drop
        await supabase.from('price_drops').insert({
          listing_id:   listing.id,
          price_before: prevPrice,
          price_after:  listing.current_price,
          detected_at:  new Date().toISOString(),
          is_active:    true,
        });

        dropsDetected++;
        console.log(`  📉 DROP: ${listing.address} — $${prevPrice.toLocaleString()} → $${listing.current_price.toLocaleString()} (-$${dropDollar.toLocaleString()})`);
      }
    }

    process.stdout.write(`  Processed ${Math.min(i + BATCH, rawListings.length)}/${rawListings.length} listings\r`);
  }

  // Mark listings as non-active if we haven't seen them recently (went Pending/Sold)
  await supabase
    .from('price_drops')
    .update({ is_active: false })
    .lt('detected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .eq('is_active', true);

  return { dropsDetected, newListings };
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
    const { dropsDetected, newListings } = await processListings(rawListings);

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

// ── ENTRY POINT ───────────────────────────────────────────────────────────────

const watchMode = process.argv.includes('--watch');

if (watchMode) {
  console.log('👀 Watch mode: polling at 6:00 AM and 8:00 PM daily (Eastern)');
  poll(); // Run immediately on start
  cron.schedule('0 6 * * *',  poll, { timezone: 'America/New_York' });
  cron.schedule('0 20 * * *', poll, { timezone: 'America/New_York' });
} else {
  poll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

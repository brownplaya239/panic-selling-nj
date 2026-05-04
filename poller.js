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
  const detectedDropsForEmail = [];
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

    process.stdout.write(`  Processed ${Math.min(i + BATCH, rawListings.length)}/${rawListings.length} listings\r`);
  }

  // Mark listings as non-active if we haven't seen them recently (went Pending/Sold)
  await supabase
    .from('price_drops')
    .update({ is_active: false })
    .lt('detected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .eq('is_active', true);

  return { dropsDetected, newListings, detectedDropsForEmail };
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

function buildAlertEmail(drops, sub, isWeekly = false) {
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
          html: buildAlertEmail(matches, sub),
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
    for (const sub of subs) {
      const matches = drops.filter(d => matchesSub(d, sub));
      if (!matches.length) continue;
      try {
        await resend.emails.send({
          from: RESEND_FROM,
          to:   sub.email,
          subject: `🏠 This week's price drops in your area — ${matches.length} new`,
          html: buildAlertEmail(matches.slice(0, 10), sub, true),
        });
        await supabase.from('subscribers').update({ last_emailed_at: new Date().toISOString() }).eq('id', sub.id);
        console.log(`  ✉️  Weekly → ${sub.email}`);
      } catch (e) { console.error(`  ⚠️  Weekly failed ${sub.email}:`, e.message); }
    }
  } catch (e) { console.error('sendWeeklyDigest error:', e.message); }
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────

const watchMode = process.argv.includes('--watch');

if (watchMode) {
  console.log('👀 Watch mode: polling at 6:00 AM and 8:00 PM daily (Eastern)');
  console.log('📰 Weekly digest: Sundays at 8:00 AM (Eastern)');
  poll(); // Run immediately on start
  cron.schedule('0 6  * * *',   poll,             { timezone: 'America/New_York' });
  cron.schedule('0 20 * * *',   poll,             { timezone: 'America/New_York' });
  cron.schedule('0 8  * * 0',   sendWeeklyDigest, { timezone: 'America/New_York' });
} else {
  poll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

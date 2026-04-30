import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const DROP_MIN_DOLLARS = 5000;
const DROP_MIN_PCT = 1.0;
const BATCH = 500;
async function backfill() {
  console.log('Starting backfill...');
  let offset = 0, totalProcessed = 0, totalDrops = 0, hasMore = true;
  while (hasMore) {
    const { data: listings, error } = await supabase.from('listings').select('id, address, city, current_price, original_price').eq('status', 'Active').not('original_price', 'is', null).not('current_price', 'is', null).range(offset, offset + BATCH - 1);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!listings || listings.length === 0) { hasMore = false; break; }
    const ids = listings.map(l => l.id);
    const { data: existingDrops } = await supabase.from('price_drops').select('listing_id').in('listing_id', ids).eq('is_active', true);
    const alreadyHasDrop = new Set((existingDrops || []).map(d => d.listing_id));
    const newDrops = [];
    for (const listing of listings) {
      const { current_price, original_price } = listing;
      if (!original_price || !current_price) continue;
      if (original_price <= current_price) continue;
      const dropDollar = original_price - current_price;
      const dropPct = (dropDollar / original_price) * 100;
      if (dropDollar < DROP_MIN_DOLLARS || dropPct < DROP_MIN_PCT) continue;
      if (alreadyHasDrop.has(listing.id)) continue;
      newDrops.push({ listing_id: listing.id, price_before: original_price, price_after: current_price, detected_at: new Date().toISOString(), is_active: true });
      console.log('DROP: ' + listing.address + ', ' + listing.city + ' $' + original_price + ' -> $' + current_price);
    }
    if (newDrops.length > 0) {
      const { error: insertErr } = await supabase.from('price_drops').insert(newDrops);
      if (insertErr) console.error('Insert error:', insertErr.message);
      else totalDrops += newDrops.length;
    }
    totalProcessed += listings.length;
    offset += BATCH;
    hasMore = listings.length === BATCH;
  }
  console.log('Done! Processed: ' + totalProcessed + ' listings, Drops found: ' + totalDrops);
}
backfill().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
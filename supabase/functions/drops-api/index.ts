/**
 * Panic Selling NJ — Supabase Edge Function
 * ==========================================
 * Deploy to Supabase as: supabase functions deploy drops-api
 *
 * Endpoints (all GET, no auth required):
 *   /drops-api                → all active drops (default sort: drop_dollar desc)
 *   /drops-api?sort=pct       → sorted by % drop
 *   /drops-api?sort=recent    → sorted by detected_at desc
 *   /drops-api?sort=low       → sorted by price asc
 *   /drops-api?city=Long+Branch
 *   /drops-api?county=Monmouth
 *   /drops-api?type=Single+Family
 *   /drops-api?beds=3
 *   /drops-api?min_pct=10     → only 10%+ drops
 *   /drops-api?new_today=1
 *   /drops-api?stats=1        → returns summary stats only
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url    = new URL(req.url);
  const params = url.searchParams;

  try {
    // ── STATS ENDPOINT ──────────────────────────────────────────────────────
    if (params.get('stats') === '1') {
      const { data, error } = await supabase
        .from('active_drops')
        .select('drop_dollar, drop_pct, price_after, city, county');

      if (error) throw error;

      const stats = {
        total_drops:   data.length,
        avg_drop_pct:  avg(data.map((d: any) => d.drop_pct)),
        avg_drop_dollar: avg(data.map((d: any) => d.drop_dollar)),
        median_price:  median(data.map((d: any) => d.price_after)),
        by_county: {
          Monmouth: data.filter((d: any) => d.county === 'Monmouth').length,
          Ocean:    data.filter((d: any) => d.county === 'Ocean').length,
        },
      };

      return new Response(JSON.stringify({ success: true, stats }), { headers: CORS });
    }

    // ── MAIN DROPS QUERY ────────────────────────────────────────────────────
    let query = supabase.from('active_drops').select('*');

    // Filters
    if (params.get('city'))     query = query.ilike('city', params.get('city')!);
    if (params.get('county'))   query = query.eq('county', params.get('county')!);
    if (params.get('type'))     query = query.ilike('property_type', `%${params.get('type')}%`);
    if (params.get('beds'))     query = query.eq('bedrooms', parseInt(params.get('beds')!));
    if (params.get('beds_min')) query = query.gte('bedrooms', parseInt(params.get('beds_min')!));
    if (params.get('min_pct'))  query = query.gte('drop_pct', parseFloat(params.get('min_pct')!));
    if (params.get('new_today') === '1') query = query.eq('is_new_today', true);

    // Sort
    switch (params.get('sort')) {
      case 'pct':    query = query.order('drop_pct',    { ascending: false }); break;
      case 'recent': query = query.order('detected_at', { ascending: false }); break;
      case 'low':    query = query.order('price_after', { ascending: true });  break;
      default:       query = query.order('drop_dollar', { ascending: false }); break;
    }

    query = query.limit(100);

    const { data, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, count: data.length, drops: data }), { headers: CORS });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: CORS,
    });
  }
});

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;
}

function median(arr: number[]) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

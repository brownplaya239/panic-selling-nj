/**
 * MOMLS Comps API — Netlify Function
 * ===================================
 * GET /api/comps?address=123 Main St, Toms River NJ
 * Optional: &sqft=1800  &beds=3  &months=12  &radius=1
 *
 * Geocodes the address (US Census, free), then queries the Spark API for
 * Closed sales inside a bounding box, ranks by similarity, and returns the
 * best comps + market stats. SPARK_ACCESS_TOKEN must be set in Netlify env.
 */

const SPARK_BASE = 'https://replication.sparkapi.com/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

export const config = { path: '/api/comps' };

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const params  = new URL(req.url).searchParams;
  const address = (params.get('address') || '').trim();
  const sqft    = parseInt(params.get('sqft')) || null;
  const beds    = parseInt(params.get('beds')) || null;
  const months  = Math.min(24, parseInt(params.get('months')) || 12);
  const radius  = Math.min(5, parseFloat(params.get('radius')) || 1);

  const token = process.env.SPARK_ACCESS_TOKEN;
  if (!token)   return json({ success: false, error: 'Server not configured (missing Spark token)' }, 500);
  if (!address) return json({ success: false, error: 'address parameter is required' }, 400);

  try {
    // 1. Geocode via US Census (free, no key)
    const geoUrl = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
    geoUrl.searchParams.set('address', address);
    geoUrl.searchParams.set('benchmark', 'Public_AR_Current');
    geoUrl.searchParams.set('format', 'json');
    const geoResp = await fetch(geoUrl);
    const geo     = await geoResp.json();
    const match   = geo?.result?.addressMatches?.[0];
    if (!match) return json({ success: false, error: 'Address not found — try adding town and NJ, e.g. "123 Main St, Toms River NJ"' }, 404);

    const lat = match.coordinates.y;
    const lon = match.coordinates.x;
    const matchedAddress = match.matchedAddress;

    // 2. Bounding box for the radius (miles)
    const dLat = radius / 69;
    const dLon = radius / (69 * Math.cos(lat * Math.PI / 180));
    const since = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const filter = `MlsStatus Eq 'Closed' And CloseDate Ge ${since}`
      + ` And Latitude Gt ${(lat - dLat).toFixed(6)} And Latitude Lt ${(lat + dLat).toFixed(6)}`
      + ` And Longitude Gt ${(lon - dLon).toFixed(6)} And Longitude Lt ${(lon + dLon).toFixed(6)}`;

    const sparkUrl = new URL(`${SPARK_BASE}/listings`);
    sparkUrl.searchParams.set('_filter', filter);
    sparkUrl.searchParams.set('_limit', '500');
    sparkUrl.searchParams.set('_fields', [
      'ListingId', 'StandardFields.UnparsedAddress', 'StandardFields.City',
      'StandardFields.ClosePrice', 'StandardFields.CloseDate', 'StandardFields.ListPrice',
      'StandardFields.OriginalListPrice', 'StandardFields.BedsTotal', 'StandardFields.BathsTotal',
      'StandardFields.BuildingAreaTotal', 'StandardFields.YearBuilt', 'StandardFields.DaysOnMarket',
      'StandardFields.Latitude', 'StandardFields.Longitude',
      'StandardFields.PropertySubType', 'StandardFields.PropertyTypeLabel',
    ].join(','));

    const sparkResp = await fetch(sparkUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!sparkResp.ok) throw new Error(`MLS query failed (${sparkResp.status})`);
    const sparkBody = await sparkResp.json();
    const raw = sparkBody?.D?.Results || [];

    // 3. Clean, score, rank
    const num = v => (v == null || String(v).includes('*')) ? null : (isNaN(+v) ? null : +v);
    const comps = raw.map(l => {
      const sf = l.StandardFields || {};
      const cLat = num(sf.Latitude), cLon = num(sf.Longitude);
      const closePrice = num(sf.ClosePrice);
      return {
        address:     sf.UnparsedAddress || 'Address withheld',
        city:        sf.City || '',
        close_price: closePrice,
        close_date:  sf.CloseDate || null,
        list_price:  num(sf.ListPrice),
        original_price: num(sf.OriginalListPrice),
        beds:        num(sf.BedsTotal),
        baths:       num(sf.BathsTotal),
        sqft:        num(sf.BuildingAreaTotal),
        year_built:  num(sf.YearBuilt),
        dom:         num(sf.DaysOnMarket),
        type:        sf.PropertySubType || null,
        class:       sf.PropertyTypeLabel || null,
        distance_mi: (cLat != null && cLon != null) ? haversineMi(lat, lon, cLat, cLon) : null,
      };
    })
    // Real sales only: residential class, plausible sale price, inside the true radius
    .filter(c => c.close_price && c.close_price >= 50000
      && (!c.class || c.class === 'Residential' || c.class === 'Multi-Family')
      && (c.distance_mi == null || c.distance_mi <= radius))
    .map(c => {
      c.ppsqft = (c.sqft > 0) ? Math.round(c.close_price / c.sqft) : null;
      c.sale_vs_list_pct = (c.list_price > 0)
        ? Math.round(((c.close_price - c.list_price) / c.list_price) * 1000) / 10 : null;
      // Similarity: distance dominates, then sqft & beds closeness, then recency
      let score = (c.distance_mi ?? radius) / radius;
      if (sqft && c.sqft) score += Math.min(1, Math.abs(c.sqft - sqft) / sqft);
      if (beds && c.beds != null) score += Math.abs(c.beds - beds) * 0.25;
      if (c.close_date) score += Math.min(1, (Date.now() - new Date(c.close_date)) / (365 * 24 * 60 * 60 * 1000)) * 0.5;
      c._score = Math.round(score * 100) / 100;
      return c;
    })
    .sort((a, b) => a._score - b._score);

    // 4. Stats across all qualifying sales in the area
    const prices  = comps.map(c => c.close_price).sort((a, b) => a - b);
    const ppsqfts = comps.map(c => c.ppsqft).filter(Boolean).sort((a, b) => a - b);
    const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null;

    const stats = {
      sale_count:       comps.length,
      median_price:     pct(prices, 0.5),
      median_ppsqft:    pct(ppsqfts, 0.5),
      ppsqft_p25:       pct(ppsqfts, 0.25),
      ppsqft_p75:       pct(ppsqfts, 0.75),
      months, radius_mi: radius,
    };
    // Implied value range if the user told us the subject's sqft
    if (sqft && stats.median_ppsqft) {
      stats.implied_value     = stats.median_ppsqft * sqft;
      stats.implied_value_low = (stats.ppsqft_p25 || stats.median_ppsqft) * sqft;
      stats.implied_value_high = (stats.ppsqft_p75 || stats.median_ppsqft) * sqft;
    }

    return json({
      success: true,
      subject: { address: matchedAddress, lat, lon, sqft, beds },
      stats,
      comps: comps.slice(0, 15).map(({ _score, ...c }) => c),
    });

  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
};

function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

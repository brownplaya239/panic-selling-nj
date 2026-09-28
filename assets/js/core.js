/* NJREindex core: config, utilities, data layer, listing model, workspace store,
   router (with route-level lazy loading), shell, global search. */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  App.VERSION = '2026.09.28a';
  App.cfg = {
    SUPABASE_URL: 'https://ynndoetrygfukebjumuv.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlubmRvZXRyeWdmdWtlYmp1bXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2Nzc1NjIsImV4cCI6MjA4OTI1MzU2Mn0.27ysWyqqZ0Dk5PdN8vYFkUBpb_8w4KlvPqNeQu_CbPw',
    MLS_NAME: 'Monmouth Ocean Regional REALTORS® MLS',
    MLS_SHORT: 'MORMLS',
    REGION: 'MOMLS region (Monmouth & Ocean)',
  };
  App.sb = window.supabase.createClient(App.cfg.SUPABASE_URL, App.cfg.SUPABASE_ANON_KEY);

  /* ------------------------------------------------------------------ utils */
  const U = (App.u = {});
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  U.esc = (s) => (s == null ? '' : String(s).replace(/[&<>"']/g, (c) => ESC[c]));
  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  U.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  U.icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
  U.median = (arr) => {
    const s = arr.filter((x) => x != null && !isNaN(x)).sort((a, b) => a - b);
    if (!s.length) return null;
    return s[Math.floor(s.length / 2)];
  };
  U.money = (n) => (n == null || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US'));
  U.moneyShort = (n) => {
    if (n == null || isNaN(n)) return '—';
    const a = Math.abs(n), sign = n < 0 ? '−' : '';
    if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e3) return sign + '$' + Math.round(a / 1e3) + 'K';
    return sign + '$' + Math.round(a);
  };
  U.int = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('en-US'));
  U.pct = (n, d = 1, signed = false) => {
    if (n == null || isNaN(n)) return '—';
    const v = (+n).toFixed(d);
    return (signed && n > 0 ? '+' : n < 0 ? '−' : '') + v.replace('-', '') + '%';
  };
  U.signedMoney = (n) => (n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + U.money(Math.abs(n)));
  const DT = (iso) => {
    if (!iso) return null;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(iso);
    return isNaN(d) ? null : d;
  };
  U.date = (iso, style = 'medium') => {
    const d = DT(iso); if (!d) return '—';
    const o = style === 'short' ? { month: 'short', day: 'numeric' }
      : style === 'long' ? { month: 'long', day: 'numeric', year: 'numeric' }
      : style === 'month' ? { month: 'short', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleDateString('en-US', o);
  };
  U.dateTime = (iso) => { const d = DT(iso); return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; };
  U.daysSince = (iso) => { const d = DT(iso); return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null; };
  U.timeAgo = (iso) => {
    const d = DT(iso); if (!d) return '—';
    const m = Math.floor((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    const dd = Math.floor(h / 24); if (dd < 30) return dd + 'd ago';
    return U.date(iso);
  };
  U.plural = (n, w, p) => (n === 1 ? w : p || w + 's');
  U.norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  U.qs = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => { if (v != null && v !== '' && v !== 'all' && v !== false) p.set(k, v); });
    const s = p.toString(); return s ? '?' + s : '?';
  };
  U.csv = (rows, cols, filename) => {
    const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const body = [cols.map((c) => q(c.label)).join(',')].concat(rows.map((r) => cols.map((c) => q(c.csv ? c.csv(r) : r[c.key])).join(','))).join('\n');
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.loadScript = (src) => {
    App._scripts = App._scripts || {};
    if (!App._scripts[src]) {
      App._scripts[src] = new Promise((res, rej) => {
        const s = document.createElement('script'); s.src = src; s.async = true;
        s.onload = res; s.onerror = () => { delete App._scripts[src]; rej(new Error('Failed to load ' + src)); };
        document.head.appendChild(s);
      });
    }
    return App._scripts[src];
  };
  U.loadCss = (href) => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  };
  U.gradeCls = (g) => (g === 'A+' ? 'g-aplus' : g === 'A' ? 'g-a' : g === 'B+' ? 'g-bplus' : g === 'B' ? 'g-b' : 'g-c');

  /* ------------------------------------------------------------ store (local) */
  const S = (App.store = {
    get(k, d) { try { const v = localStorage.getItem('njre.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('njre.' + k, JSON.stringify(v)); } catch (e) { /* quota / private mode */ } },
    raw(k, v) { try { if (v === undefined) return localStorage.getItem('njre.' + k); localStorage.setItem('njre.' + k, v); } catch (e) { return null; } },
  });

  /* ------------------------------------------------------------- data layer */
  // Memory cache with in-flight de-duplication: the same query issued by two
  // views at once shares one network request.
  const _cache = new Map();
  App.cached = function (key, fn, ttlMs = 10 * 60 * 1000) {
    const hit = _cache.get(key);
    if (hit && (hit.pending || Date.now() - hit.at < ttlMs)) return hit.promise;
    const entry = { at: Date.now(), pending: true };
    entry.promise = Promise.resolve().then(fn).then(
      (v) => { entry.pending = false; entry.at = Date.now(); return v; },
      (e) => { _cache.delete(key); throw e; }
    );
    _cache.set(key, entry);
    return entry.promise;
  };
  App.invalidate = (prefix) => { for (const k of _cache.keys()) if (k.startsWith(prefix)) _cache.delete(k); };

  // Page through a table/view: first page returns the exact count, remaining pages
  // are fetched in parallel (the legacy UI fetched them one after another).
  App.fetchAll = async function (table, select, { order, asc = false, tiebreak, filter, pageSize = 1000, max = 20000 } = {}) {
    const build = (withCount) => {
      let q = App.sb.from(table).select(select, withCount ? { count: 'exact' } : undefined);
      if (filter) q = filter(q);
      if (order) q = q.order(order, { ascending: asc, nullsFirst: false });
      if (tiebreak) q = q.order(tiebreak, { ascending: true });
      return q;
    };
    const first = await build(true).range(0, pageSize - 1);
    if (first.error) throw first.error;
    const total = Math.min(first.count ?? (first.data || []).length, max);
    const rest = [];
    for (let s = pageSize; s < total; s += pageSize) rest.push(build(false).range(s, Math.min(s + pageSize, total) - 1));
    const pages = await Promise.all(rest);
    const out = (first.data || []).slice();
    for (const p of pages) { if (p.error) throw p.error; out.push(...(p.data || [])); }
    return out;
  };

  App.count = async function (table, filter) {
    let q = App.sb.from(table).select('*', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) throw error;
    return count;
  };

  // MLS freshness: the poller rebuilds deal_scores on every run, so its
  // computed_at stamp is the last successful poll (instant lookup, unlike a
  // sort over the full listings table).
  App.mlsFreshness = () => App.cached('mls-fresh', async () => {
    const { data } = await App.sb.from('deal_scores').select('computed_at').order('computed_at', { ascending: false }).limit(1);
    if (data?.[0]?.computed_at) return data[0].computed_at;
    const r = await App.sb.from('listings').select('last_seen_at').order('last_seen_at', { ascending: false }).limit(1);
    return r.data?.[0]?.last_seen_at || null;
  });

  // Exact median of a column without downloading it: count the non-null
  // values, then read the single row at the middle offset (same index rule as
  // U.median).
  App.medianOf = async function (table, col) {
    const n = await App.count(table, (q) => q.not(col, 'is', null));
    if (!n) return null;
    const { data, error } = await App.sb.from(table).select(col).not(col, 'is', null)
      .order(col, { ascending: true }).range(Math.floor(n / 2), Math.floor(n / 2));
    if (error) throw error;
    return data?.[0]?.[col] ?? null;
  };

  // Public-records window stats (state/county/muni × w12/ytd26/sp25) — shared by
  // home, records, markets, property pages, and search.
  App.prWindows = () => App.cached('pr-windows', () => App.fetchAll('pr_window_stats', '*', { order: 'id', asc: true }), 60 * 60 * 1000);
  App.prNewestDeed = () => App.cached('pr-newest', async () => {
    const { data } = await App.sb.from('pr_recent_sales').select('deed_date').order('deed_date', { ascending: false }).limit(1);
    return data?.[0]?.deed_date || null;
  }, 60 * 60 * 1000);

  // Municipality name matching between MLS "city" (postal/common names) and the
  // State's municipality labels ("Howell Twp", "Red Bank Boro"). Only exact
  // normalized matches within a county are accepted; ambiguous names are not guessed.
  const MUNI_SUFFIX = /\b(twp|township|boro|borough|city|town|village|vlg)\b/g;
  U.muniKey = (s) => U.norm(s).replace(MUNI_SUFFIX, '').replace(/\s+/g, ' ').trim();
  // The feed's county is sometimes wrong (e.g. Howell listings tagged Ocean),
  // so a same-county match is tried first, then a statewide match that is
  // accepted only when the name is unique in New Jersey.
  App.matchMuni = async function (city, county) {
    const rows = await App.prWindows();
    const k = U.muniKey(city);
    const find = (cty) => {
      const cands = new Map();
      for (const r of rows) {
        if (r.scope_type !== 'muni' || (cty && r.county !== cty)) continue;
        if (U.muniKey(r.scope_label) === k) cands.set(r.scope_id, r);
      }
      return cands;
    };
    if (county && county !== 'Unknown') { const c = find(county); if (c.size === 1) return [...c.values()][0]; if (c.size > 1) return null; }
    const s = find(null);
    return s.size === 1 ? [...s.values()][0] : null;
  };
  App.muniWindows = async function (muniId) {
    const rows = await App.prWindows();
    const w = {};
    for (const r of rows) if (r.scope_type === 'muni' && r.scope_id === muniId) w[r.win] = r;
    return w;
  };

  /* ---------------------------------------------------------- listing model */
  const TYPE_GROUPS = [
    { key: 'sf', label: 'Single family', alert: ['Single Family'], test: (t) => /single family/i.test(t) },
    { key: 'adult', label: 'Adult community (55+)', alert: ['Adult Community'], test: (t) => /adult community/i.test(t) },
    { key: 'condo', label: 'Condo / townhouse', alert: ['Condo'], test: (t) => /condo|townhouse/i.test(t) },
    { key: 'multi', label: 'Multi-family', alert: ['Multi Family', 'Duplex', 'Three Family', 'Four Family', 'Five Family', '7+ Family'], test: (t) => /multi|duplex|three family|four family|five family|\d\+? family|multiple buildings/i.test(t) },
    { key: 'land', label: 'Land', alert: ['Land'], test: (t) => /land|lot/i.test(t) },
    { key: 'commercial', label: 'Commercial', alert: ['Commercial', 'Business', 'Mixed Use', 'Office', 'Retail', 'Industrial', 'Warehouse'], test: (t) => /commercial|business|mixed use|office|retail|industrial|warehouse/i.test(t) },
  ];
  const L = (App.listings = { TYPE_GROUPS });
  L.typeGroup = (pt) => { const t = pt || ''; const g = TYPE_GROUPS.find((x) => x.test(t)); return g ? g.key : 'other'; };
  L.typeLabel = (key) => (TYPE_GROUPS.find((g) => g.key === key) || { label: 'Other' }).label;

  const LISTING_COLS = 'listing_id,price_after,price_before,drop_dollar,drop_pct,address,city,county,neighborhood,zip,property_type,bedrooms,bathrooms,sqft,lot_size,year_built,days_on_market,list_date,tags,latitude,longitude,ppsqft,town_avg_ppsqft,is_new_today';
  const DROP_COLS = 'listing_id,price_before,price_after,drop_dollar,drop_pct,detected_at,drop_count,address,city,county,neighborhood,zip,property_type,bedrooms,bathrooms,sqft,lot_size,year_built,days_on_market,list_date,tags,latitude,longitude,ppsqft,town_avg_ppsqft,is_new_today';

  function normalize(a, d) {
    const src = a || d;
    const price = a ? a.price_after : d.price_after;
    // The feed's OriginalListPrice is sometimes reset to the current price after
    // a cut, so "was" is the highest asking price known from either source.
    const orig = Math.max(a && a.price_before > 0 ? a.price_before : 0, d && d.price_before > 0 ? d.price_before : 0) || price;
    const cum = orig > price ? orig - price : 0;
    return {
      id: src.listing_id,
      address: src.address || '',
      street: (src.address || '').split(',')[0],
      city: src.city || '',
      county: src.county && src.county !== 'Unknown' ? src.county : null,
      countySrc: src.county && src.county !== 'Unknown' ? 'mls' : null,
      countyInferred: false,
      zip: src.zip || '',
      neighborhood: src.neighborhood && !/^(none|null)$/i.test(src.neighborhood) ? src.neighborhood : '',
      ptype: src.property_type || '',
      tg: L.typeGroup(src.property_type),
      beds: src.bedrooms, baths: src.bathrooms != null ? +src.bathrooms : null, sqft: src.sqft,
      lot: src.lot_size, year: src.year_built,
      dom: src.days_on_market ?? null,
      listDate: src.list_date,
      price, orig: orig || null, cum, cumPct: cum && orig ? (cum / orig) * 100 : 0,
      lastCut: d ? { amt: +d.drop_dollar, pct: +d.drop_pct, date: d.detected_at, before: d.price_before, after: d.price_after } : null,
      cuts: d ? d.drop_count || 1 : 0,
      ppsf: src.ppsqft || null, townPpsf: src.town_avg_ppsqft || null,
      ppsfGap: src.ppsqft && src.town_avg_ppsqft ? ((src.ppsqft - src.town_avg_ppsqft) / src.town_avg_ppsqft) * 100 : null,
      isNew: !!src.is_new_today,
      tags: src.tags || [],
      lat: U.num(src.latitude), lng: U.num(src.longitude),
    };
  }

  // Loads both materialized views once (in parallel) and joins them client-side:
  // every active listing carries its tracked price-cut history, and the
  // "Price drops" segment is a filter instead of a second full download.
  L.normalize = normalize;
  // Small targeted fetch (compare tray, notifications, workspace) without
  // downloading the full active-listing set.
  L.fetchByIds = async (ids) => {
    if (!ids.length) return [];
    const list = ids.map((i) => '"' + String(i).replace(/"/g, '') + '"').join(',');
    const [a, d, pr] = await Promise.all([
      App.sb.from('all_active_listings').select(LISTING_COLS).filter('listing_id', 'in', '(' + list + ')'),
      App.sb.from('active_drops').select(DROP_COLS).filter('listing_id', 'in', '(' + list + ')'),
      App.prWindows().catch(() => []),
    ]);
    const dm = new Map((d.data || []).map((x) => [x.listing_id, x]));
    const out = (a.data || []).map((x) => normalize(x, dm.get(x.listing_id)));
    for (const x of d.data || []) if (!out.some((o) => o.id === x.listing_id)) out.push(normalize(null, x));
    applyOfficial(out, pr);
    for (const r of out) {
      const full = L._data?.byId.get(r.id);
      if (full && full.county) { r.county = full.county; r.countySrc = full.countySrc; r.countyInferred = full.countyInferred; }
    }
    return out;
  };

  L.load = (force) => {
    if (force) App.invalidate('listings:');
    return App.cached('listings:all', async () => {
      const [all, drops, pr] = await Promise.all([
        App.fetchAll('all_active_listings', LISTING_COLS, { order: 'days_on_market', tiebreak: 'listing_id' }),
        App.fetchAll('active_drops', DROP_COLS, { order: 'drop_dollar', tiebreak: 'listing_id' }),
        App.prWindows().catch(() => []),
      ]);
      const dById = new Map(drops.map((d) => [d.listing_id, d]));
      const rows = [], byId = new Map();
      for (const a of all) {
        if (byId.has(a.listing_id)) continue;
        const r = normalize(a, dById.get(a.listing_id));
        rows.push(r); byId.set(r.id, r);
      }
      for (const d of drops) if (!byId.has(d.listing_id)) { const r = normalize(null, d); rows.push(r); byId.set(r.id, r); }
      resolveCounties(rows, pr);
      L._data = { rows, byId, fetchedAt: new Date().toISOString(), drops: drops.length };
      return L._data;
    }, 15 * 60 * 1000);
  };

  // County resolution. The feed omits county on about half of listings — whole
  // towns at a time — and misreports it for some towns (every Howell listing
  // says Ocean). Each listing's county comes from the first source that can
  // answer, and countySrc records which one ('mls' = as reported):
  //   1. the official municipality record, when the town name is unique in NJ
  //      (this also corrects the feed where the two disagree)
  //   2. the ZIP code, when every listing with a known county in it agrees
  //   3. the 5 nearest listings with a known county, if all agree within 3 km
  const COUNTY_SRC = { mls: 'MLS feed', municipality: 'official municipality record', zip: 'ZIP code', nearby: 'nearby listings' };
  L.countySrcLabel = (s) => COUNTY_SRC[s] || COUNTY_SRC.mls;
  function applyOfficial(rows, pr) {
    const m = new Map();
    for (const x of pr) if (x.scope_type === 'muni') { const k = U.muniKey(x.scope_label); if (!m.has(k)) m.set(k, new Set()); m.get(k).add(x.county); }
    for (const r of rows) {
      const s = r.city ? m.get(U.muniKey(r.city)) : null;
      const o = s && s.size === 1 ? [...s][0] : null;
      if (o && r.county !== o) { r.county = o; r.countySrc = 'municipality'; r.countyInferred = true; }
    }
  }
  function resolveCounties(rows, pr) {
    applyOfficial(rows, pr);
    const zips = new Map();
    for (const r of rows) if (r.county && r.zip) { if (!zips.has(r.zip)) zips.set(r.zip, new Set()); zips.get(r.zip).add(r.county); }
    for (const r of rows) {
      if (r.county || !r.zip) continue;
      const s = zips.get(r.zip);
      if (s && s.size === 1) { r.county = [...s][0]; r.countySrc = 'zip'; r.countyInferred = true; }
    }
    const refs = rows.filter((r) => r.county && r.lat != null && r.lng != null);
    const K = 5, MAX_KM2 = 3 * 3;
    for (const r of rows) {
      if (r.county || r.lat == null || r.lng == null) continue;
      const kx = 111.32 * Math.cos((r.lat * Math.PI) / 180), ky = 110.57;
      const near = [];
      for (const f of refs) {
        const dx = (f.lng - r.lng) * kx, dy = (f.lat - r.lat) * ky, d2 = dx * dx + dy * dy;
        if (near.length < K || d2 < near[near.length - 1][0]) {
          near.push([d2, f.county]); near.sort((x, y) => x[0] - y[0]);
          if (near.length > K) near.pop();
        }
      }
      if (near.length === K && near[K - 1][0] <= MAX_KM2 && near.every((n) => n[1] === near[0][1])) {
        r.county = near[0][1]; r.countySrc = 'nearby'; r.countyInferred = true;
      }
    }
  }

  // Filter params (all URL-serializable strings)
  L.DEFAULTS = { seg: 'all', q: '', type: 'all', beds: 'any', minp: '', maxp: '', dom: 'any', county: 'all', town: 'all', zip: '', sort: '', reduced: '' };
  L.SORTS = {
    dom: { label: 'Days on market (longest)', fn: (a, b) => (b.dom || 0) - (a.dom || 0) },
    newest: { label: 'Newest listings', fn: (a, b) => (b.listDate || '').localeCompare(a.listDate || '') },
    cut: { label: 'Latest cut ($)', fn: (a, b) => (b.lastCut?.amt || 0) - (a.lastCut?.amt || 0) },
    cutpct: { label: 'Latest cut (%)', fn: (a, b) => (b.lastCut?.pct || 0) - (a.lastCut?.pct || 0) },
    cum: { label: 'Total reduction ($)', fn: (a, b) => (b.cum || 0) - (a.cum || 0) },
    recent: { label: 'Most recently cut', fn: (a, b) => (b.lastCut?.date || '').localeCompare(a.lastCut?.date || '') },
    plow: { label: 'Price (low to high)', fn: (a, b) => a.price - b.price },
    phigh: { label: 'Price (high to low)', fn: (a, b) => b.price - a.price },
    ppsf: { label: '$/sq ft vs town (lowest)', fn: (a, b) => (a.ppsfGap ?? 999) - (b.ppsfGap ?? 999) },
  };
  L.defaultSort = (seg) => (seg === 'drops' ? 'cut' : 'dom');
  const DOMS = { today: [null, null, 'New today'], new7: [0, 7, 'Listed ≤ 7 days'], d30: [30, 59, '30–59 days'], d60: [60, 89, '60–89 days'], d90: [90, 179, '90–179 days'], d180: [180, 1e9, '180+ days'] };
  L.DOMS = DOMS;

  L.filter = (rows, p) => {
    const q = U.norm(p.q);
    const minp = +p.minp || 0, maxp = +p.maxp || 0;
    const beds = p.beds === 'any' || !p.beds ? 0 : parseInt(p.beds, 10);
    const dom = DOMS[p.dom];
    return rows.filter((r) =>
      (p.seg !== 'drops' || r.lastCut)
      && (p.type === 'all' || !p.type || r.tg === p.type)
      && (!beds || (r.beds || 0) >= beds)
      && (!minp || r.price >= minp)
      && (!maxp || r.price <= maxp)
      && (!dom || (p.dom === 'today' ? r.isNew : (r.dom ?? -1) >= dom[0] && (r.dom ?? -1) <= dom[1]))
      && (p.county === 'all' || !p.county || (p.county === 'none' ? !r.county : r.county === p.county))
      && (p.town === 'all' || !p.town || r.city === p.town)
      && (!p.zip || r.zip === p.zip)
      && (!p.reduced || r.cum > 0 || r.lastCut)
      && (!q || U.norm(r.address + ' ' + r.city + ' ' + r.zip).includes(q)));
  };
  L.sort = (rows, key) => rows.sort((L.SORTS[key] || L.SORTS.dom).fn);

  // Human-readable criteria (chips, saved-search names, alert summaries)
  L.chips = (p) => {
    const c = [];
    if (p.seg === 'drops') c.push({ k: 'seg', v: 'Tracked price drops' });
    if (p.q) c.push({ k: 'q', v: '“' + p.q + '”' });
    if (p.town && p.town !== 'all') c.push({ k: 'town', v: p.town });
    if (p.county && p.county !== 'all') c.push({ k: 'county', v: p.county === 'none' ? 'County not reported' : p.county + ' County' });
    if (p.zip) c.push({ k: 'zip', v: 'ZIP ' + p.zip });
    if (p.type && p.type !== 'all') c.push({ k: 'type', v: L.typeLabel(p.type) });
    if (p.beds && p.beds !== 'any') c.push({ k: 'beds', v: p.beds + '+ beds' });
    if (p.minp || p.maxp) c.push({ k: 'price', v: (p.minp ? U.moneyShort(+p.minp) : 'Any') + ' – ' + (p.maxp ? U.moneyShort(+p.maxp) : 'Any') });
    if (p.dom && p.dom !== 'any' && DOMS[p.dom]) c.push({ k: 'dom', v: DOMS[p.dom][2] });
    if (p.reduced) c.push({ k: 'reduced', v: 'Reduced from original' });
    return c;
  };
  L.paramsFrom = (sp) => {
    const p = { ...L.DEFAULTS };
    for (const k of Object.keys(p)) { const v = sp.get(k); if (v != null) p[k] = v; }
    if (!p.sort) p.sort = L.defaultSort(p.seg);
    return p;
  };
  L.urlFor = (p) => {
    const o = { view: 'listings' };
    for (const [k, v] of Object.entries(p)) {
      if (k === 'sort' && v === L.defaultSort(p.seg)) continue;
      if (v != null && v !== '' && v !== L.DEFAULTS[k]) o[k] = v;
    }
    return U.qs(o);
  };

  // Human-readable "why this listing appears" for the active screen
  L.reasons = (r, p) => {
    const out = [];
    if (r.lastCut) out.push(`${r.cuts > 1 ? r.cuts + ' tracked cuts' : 'Price cut'} · latest −${U.moneyShort(r.lastCut.amt)} (${U.pct(r.lastCut.pct)}) on ${U.date(r.lastCut.date, 'short')}`);
    else if (r.cum > 0) out.push(`Reduced ${U.moneyShort(r.cum)} (${U.pct(r.cumPct)}) from original list price`);
    if (p && p.dom && DOMS[p.dom] && r.dom != null) out.push(`${r.dom} days on market`);
    if (r.ppsfGap != null && r.ppsfGap <= -10) out.push(`$/sq ft ${Math.round(-r.ppsfGap)}% below ${r.city} average`);
    if (r.isNew) out.push('New listing');
    return out;
  };

  /* ---------------------------------------------------------- workspace */
  const WS = (App.ws = {
    _emit() { document.dispatchEvent(new CustomEvent('ws:change')); },
    saved() { return S.get('savedProps', []); },
    isSaved(id) { return WS.saved().some((x) => x.id === id); },
    toggleSave(r) {
      let list = WS.saved();
      if (list.some((x) => x.id === r.id)) { list = list.filter((x) => x.id !== r.id); App.toast('Removed from saved properties'); }
      else {
        list.unshift({ id: r.id, address: r.address, city: r.city, price: r.price, savedAt: new Date().toISOString(), seenPrice: r.price });
        App.toast('Saved — find it in My Workspace');
      }
      S.set('savedProps', list.slice(0, 200)); WS._emit();
    },
    searches() { return S.get('savedSearches', []); },
    saveSearch(params, name) {
      const list = WS.searches();
      const url = L.urlFor(params);
      if (list.some((s) => s.url === url)) { App.toast('This search is already saved'); return; }
      list.unshift({ id: 's' + Date.now().toString(36), name: name || (L.chips(params).map((c) => c.v).join(' · ') || 'All active listings'), url, params, createdAt: new Date().toISOString(), checkedAt: new Date().toISOString() });
      S.set('savedSearches', list.slice(0, 50)); WS._emit();
      App.toast('Search saved to My Workspace');
    },
    removeSearch(id) { S.set('savedSearches', WS.searches().filter((s) => s.id !== id)); WS._emit(); },
    touchSearch(id) { S.set('savedSearches', WS.searches().map((s) => (s.id === id ? { ...s, checkedAt: new Date().toISOString() } : s))); },
    compare() { return S.get('compare', []); },
    inCompare(id) { return WS.compare().some((x) => x.id === id); },
    toggleCompare(r) {
      let list = WS.compare();
      if (list.some((x) => x.id === r.id)) list = list.filter((x) => x.id !== r.id);
      else {
        if (list.length >= 4) { App.toast('Compare holds up to 4 properties'); return; }
        list.push({ id: r.id, address: r.street || r.address, city: r.city });
      }
      S.set('compare', list); WS._emit();
    },
    clearCompare() { S.set('compare', []); WS._emit(); },
    recent() { return S.get('recent', []); },
    pushRecent(r) {
      const list = WS.recent().filter((x) => x.id !== r.id);
      list.unshift({ id: r.id, address: r.address, city: r.city, price: r.price, at: new Date().toISOString() });
      S.set('recent', list.slice(0, 20));
    },
    note(id, v) { const n = S.get('notes', {}); if (v === undefined) return n[id] || ''; if (v) n[id] = v; else delete n[id]; S.set('notes', n); },
    alerts() { return S.get('alertsLog', []); },
    logAlert(a) { const l = WS.alerts(); l.unshift(a); S.set('alertsLog', l.slice(0, 50)); WS._emit(); },
  });

  /* ------------------------------------------------------------- toasts, tips */
  App.toast = (msg, ms = 2600) => {
    const wrap = U.$('#toasts'); if (!wrap) return;
    const t = U.h(`<div class="toast">${U.icon('check', 'icon-sm')}<span>${U.esc(msg)}</span></div>`);
    wrap.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms);
  };

  let tipEl = null;
  function showTip(target) {
    const text = target.getAttribute('data-tip'); if (!text) return;
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.id = 'njre-tip'; document.body.appendChild(tipEl); }
    tipEl.textContent = text; tipEl.hidden = false;
    target.setAttribute('aria-describedby', 'njre-tip');
    const r = target.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
    let x = r.left + r.width / 2 - tr.width / 2, y = r.top - tr.height - 8;
    if (y < 8) y = r.bottom + 8;
    x = Math.max(8, Math.min(x, innerWidth - tr.width - 8));
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function hideTip(target) { if (tipEl) tipEl.hidden = true; if (target) target.removeAttribute('aria-describedby'); }
  document.addEventListener('mouseover', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) showTip(t); });
  document.addEventListener('mouseout', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) hideTip(t); });
  document.addEventListener('focusin', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) showTip(t); });
  document.addEventListener('focusout', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) hideTip(t); });
  document.addEventListener('scroll', () => hideTip(), true);

  U.info = (text) => `<button type="button" class="info-btn" data-tip="${U.esc(text)}" aria-label="More information">${U.icon('info')}</button>`;

  /* ---------------------------------------------------------------- router */
  const ROUTES = {
    home: { title: 'Dashboard', script: 'home' },
    listings: { title: 'Listings & Price Drops', script: 'listings' },
    property: { title: 'Property Intelligence', script: 'property' },
    comps: { title: 'Comparables', script: 'comps' },
    deals: { title: 'Deal Screener', script: 'deals' },
    sales: { title: 'Sales Tape', script: 'sales' },
    markets: { title: 'Town & County Analytics', script: 'markets' },
    records: { title: 'NJ Public Records', script: 'records' },
    rankings: { title: 'Agent & Brokerage Rankings', script: 'rankings' },
    saved: { title: 'Saved', script: 'workspace' },
    alerts: { title: 'Alerts', script: 'workspace' },
    reports: { title: 'Reports', script: 'workspace' },
  };
  App.views = {};
  App.registerView = (key, def) => { App.views[key] = def; };
  const _scroll = {};
  let _current = null, _first = true;

  App.params = () => new URLSearchParams(location.search);
  App.routeKey = (sp = App.params()) => {
    let v = sp.get('view');
    if (!v && sp.get('lb')) v = 'rankings';
    if (v === 'boards') v = 'rankings';
    if (v === 'towns') v = 'markets';
    return ROUTES[v] ? v : 'home';
  };
  App.go = (url, { replace = false, keepScroll = false } = {}) => {
    const target = new URL(url, location.href);
    if (target.search === location.search && !replace) return;
    if (_current && !keepScroll) _scroll[_current + location.search] = scrollY;
    history[replace ? 'replaceState' : 'pushState']({}, '', target.pathname + target.search + target.hash);
    App.render({ keepScroll });
  };
  App.replaceParams = (url) => history.replaceState({}, '', url);

  let _renderSeq = 0;
  App.render = async function ({ keepScroll = false } = {}) {
    const seq = ++_renderSeq;
    const wasFirst = _first; _first = false;
    const sp = App.params();
    const key = App.routeKey(sp);
    const route = ROUTES[key];
    closeMenus();
    document.documentElement.removeAttribute('data-nav');
    U.$$('.sb-link').forEach((a) => a.toggleAttribute('aria-current', false));
    const nav = U.$(`.sb-link[data-nav="${key}"]`); if (nav) nav.setAttribute('aria-current', 'page');

    let host = U.$('#view-' + key);
    if (!host) {
      host = U.h(`<section class="view" id="view-${key}" aria-label="${U.esc(route.title)}"></section>`);
      U.$('#views').appendChild(host);
    }
    const prev = _current;
    U.$$('#views > .view').forEach((v) => v.classList.toggle('is-active', v === host));
    _current = key;
    document.documentElement.setAttribute('data-route', key);
    document.title = route.title + ' — NJREindex';
    const savedY = prev !== key ? _scroll[key + location.search] : null;
    if (!keepScroll && savedY == null) window.scrollTo(0, 0);

    try {
      if (!App.views[key]) {
        host.innerHTML = `<div class="page"><div class="skel skel-line" style="width:220px;height:22px"></div><div class="skel skel-block" style="margin-top:20px"></div></div>`;
        await U.loadScript('assets/js/views/' + route.script + '.js?v=' + App.VERSION);
      }
      const view = App.views[key];
      if (!view) throw new Error('View failed to register: ' + key);
      if (!host.dataset.mounted) { host.innerHTML = ''; view.mount(host); host.dataset.mounted = '1'; }
      await view.show(host, sp);
      // A newer navigation happened while this view was loading its data.
      if (seq !== _renderSeq) return;
      if (view.title) {
        const t = typeof view.title === 'function' ? view.title(sp) : view.title;
        document.title = /NJREindex/.test(t) ? t : t + ' — NJREindex';
      }
    } catch (e) {
      console.error(e);
      host.innerHTML = `<div class="page"><div class="state state-err">${U.icon('alert')}<h3>This page could not load</h3><p>${U.esc(e.message || 'Unexpected error')}. Check your connection and try again.</p></div></div>`;
    }
    if (seq !== _renderSeq) return;
    if (!keepScroll && savedY != null) window.scrollTo(0, savedY);
    if (!wasFirst) {
      const h1 = host.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
  };

  // In-app links: plain <a href="?…"> elements are real links (open-in-new-tab,
  // copy link, crawlable) and are intercepted for client-side navigation.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || !(href.startsWith('?') || a.hasAttribute('data-link'))) return;
    e.preventDefault();
    App.go(href);
  });
  window.addEventListener('popstate', () => App.render());

  /* ------------------------------------------------------------------ shell */
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    S.raw('theme', t);
    U.$$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
    document.dispatchEvent(new CustomEvent('theme:change'));
  }
  function setDensity(d) {
    document.documentElement.setAttribute('data-density', d);
    S.raw('density', d);
    U.$$('[data-density-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.densitySet === d)));
    document.dispatchEvent(new CustomEvent('density:change'));
  }
  App.setTheme = setTheme; App.setDensity = setDensity;

  function closeMenus(except) {
    for (const [btn, menu] of [['#acctBtn', '#acctMenu'], ['#notifBtn', '#notifMenu']]) {
      if (menu === except) continue;
      const m = U.$(menu), b = U.$(btn);
      if (m && !m.hidden) { m.hidden = true; b?.setAttribute('aria-expanded', 'false'); }
    }
  }
  App.closeMenus = closeMenus;
  function toggleMenu(btnSel, menuSel, onOpen) {
    const b = U.$(btnSel), m = U.$(menuSel);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = m.hidden;
      closeMenus(menuSel);
      m.hidden = !open; b.setAttribute('aria-expanded', String(open));
      if (open && onOpen) onOpen(m);
    });
  }

  function initShell() {
    U.$('#yr').textContent = new Date().getFullYear();
    const t = S.raw('theme') || 'light';
    U.$$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === (t === 'dark' ? 'dark' : 'light'))));
    const d = S.raw('density') || 'comfortable';
    U.$$('[data-density-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.densitySet === d)));
    document.addEventListener('click', (e) => {
      const th = e.target.closest('[data-theme-set]'); if (th) setTheme(th.dataset.themeSet);
      const de = e.target.closest('[data-density-set]'); if (de) setDensity(de.dataset.densitySet);
      const al = e.target.closest('[data-action="alerts"]'); if (al) { closeMenus(); App.alertsDialog?.open(); }
    });
    toggleMenu('#acctBtn', '#acctMenu');
    toggleMenu('#notifBtn', '#notifMenu', (m) => App.notifications?.render(m));
    // Clicks inside a menu keep it open (theme/density toggles); links inside
    // menus navigate, and the router closes all menus on navigation.
    document.addEventListener('click', (e) => { if (!e.target.closest('.topbar .pop-wrap')) closeMenus(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeMenus(); document.documentElement.removeAttribute('data-nav'); }
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) {
        e.preventDefault(); U.$('#topSearch input').focus();
      }
    });

    const root = document.documentElement;
    U.$('#sbCollapse').addEventListener('click', () => {
      const c = root.getAttribute('data-sidebar') === 'collapsed';
      if (c) root.removeAttribute('data-sidebar'); else root.setAttribute('data-sidebar', 'collapsed');
      S.raw('sidebar', c ? 'open' : 'collapsed');
      U.$('#sbCollapse').setAttribute('aria-label', c ? 'Collapse sidebar' : 'Expand sidebar');
      window.dispatchEvent(new Event('resize'));
    });
    const navBtn = U.$('#navToggle');
    navBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = root.getAttribute('data-nav') !== 'open';
      if (open) root.setAttribute('data-nav', 'open'); else root.removeAttribute('data-nav');
      navBtn.setAttribute('aria-expanded', String(open));
      let scrim = U.$('#navScrim');
      if (open && !scrim) {
        scrim = U.h('<div class="scrim" id="navScrim"></div>');
        scrim.addEventListener('click', () => { root.removeAttribute('data-nav'); navBtn.setAttribute('aria-expanded', 'false'); scrim.remove(); });
        document.body.appendChild(scrim);
      } else if (!open && scrim) scrim.remove();
    });
    new MutationObserver(() => { if (root.getAttribute('data-nav') !== 'open') U.$('#navScrim')?.remove(); })
      .observe(root, { attributes: true, attributeFilter: ['data-nav'] });

    App.search.attach(U.$('#topSearch'));
    updateCounts();
    document.addEventListener('ws:change', updateCounts);
  }

  async function updateCounts() {
    const saved = WS.saved().length + WS.searches().length;
    const sc = U.$('#sbCountSaved'); if (sc) { sc.hidden = !saved; sc.textContent = saved; }
    try {
      const n = await App.cached('count:actives', () => App.count('all_active_listings'));
      const el = U.$('#sbCountListings'); if (el) { el.hidden = false; el.textContent = U.int(n); }
    } catch (e) { /* counts are decorative */ }
  }

  /* ---------------------------------------------------------- global search */
  const COUNTIES = ['Atlantic', 'Bergen', 'Burlington', 'Camden', 'Cape May', 'Cumberland', 'Essex', 'Gloucester', 'Hudson', 'Hunterdon', 'Mercer', 'Middlesex', 'Monmouth', 'Morris', 'Ocean', 'Passaic', 'Salem', 'Somerset', 'Sussex', 'Union', 'Warren'];
  App.COUNTIES = COUNTIES;
  const MLS_COUNTIES = ['Monmouth', 'Ocean'];
  App.MLS_COUNTIES = MLS_COUNTIES;

  const townIndex = () => App.cached('search:towns', async () => {
    const [ts, pr] = await Promise.all([
      App.sb.from('town_stats').select('city,active_count').then((r) => r.data || [], () => []),
      App.prWindows().catch(() => []),
    ]);
    const mls = ts.filter((t) => t.city).map((t) => ({ kind: 'town', name: t.city, n: t.active_count, key: U.norm(t.city) }));
    const munis = pr.filter((r) => r.scope_type === 'muni' && r.win === 'w12')
      .map((r) => ({ kind: 'muni', name: r.scope_label, county: r.county, id: r.scope_id, n: r.res_n, key: U.norm(r.scope_label) }));
    return { mls, munis };
  }, 60 * 60 * 1000);

  App.search = {
    attach(wrap, { onPick } = {}) {
      const input = wrap.querySelector('input');
      const listId = 'gs-' + Math.random().toString(36).slice(2, 8);
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', 'false');
      input.setAttribute('aria-controls', listId);
      const panel = U.h(`<div class="gs-panel" id="${listId}" role="listbox" aria-label="Search suggestions" hidden></div>`);
      wrap.appendChild(panel);
      let opts = [], active = -1, seq = 0;

      const close = () => { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
      const pick = (o) => {
        close(); input.blur();
        if (onPick && onPick(o) === false) return;
        App.go(o.url);
      };
      const setActive = (i) => {
        active = i;
        U.$$('.gs-opt', panel).forEach((el, j) => el.setAttribute('aria-selected', String(j === i)));
        const el = panel.querySelector(`#${listId}-o${i}`);
        if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
      };
      const renderOpts = (groups, q) => {
        opts = []; let html = '';
        for (const g of groups) {
          if (!g.items.length) continue;
          html += `<div class="gs-group" role="presentation">${U.esc(g.label)}</div>`;
          for (const it of g.items) {
            const i = opts.push(it) - 1;
            html += `<div class="gs-opt" role="option" id="${listId}-o${i}" data-i="${i}" aria-selected="false">${U.icon(it.icon)}
              <div class="gs-main"><div class="gs-title">${U.esc(it.title)}</div>${it.sub ? `<div class="gs-sub">${U.esc(it.sub)}</div>` : ''}</div>
              ${it.right ? `<div class="gs-right">${U.esc(it.right)}</div>` : ''}</div>`;
          }
        }
        if (!opts.length) html = `<div class="gs-empty">No matches for “${U.esc(q)}”. Try a street address with town, a municipality, county, or 5-digit ZIP.</div>`;
        html += `<div class="gs-foot">Properties: active MLS listings (${U.esc(App.cfg.REGION)}). Towns &amp; counties: statewide public records.</div>`;
        panel.innerHTML = html; panel.hidden = false; input.setAttribute('aria-expanded', 'true');
      };

      const run = U.debounce(async () => {
        const q = input.value.trim();
        const my = ++seq;
        if (q.length < 2) { close(); return; }
        const nq = U.norm(q);
        const groups = [];
        const zip = /^\d{5}$/.test(q) ? q : null;
        const looksAddr = /\d/.test(q) && !zip;

        let idx = { mls: [], munis: [] };
        try { idx = await townIndex(); } catch (e) { /* offline */ }
        if (my !== seq) return;

        const towns = idx.mls.filter((t) => t.key.startsWith(nq) || t.key.includes(' ' + nq)).sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 5)
          .map((t) => ({ icon: 'pin', title: t.name, sub: 'MLS town · ' + U.int(t.n) + ' active listings', url: U.qs({ view: 'markets', town: t.name }), right: '' }));
        const munis = idx.munis.filter((m) => m.key.startsWith(nq) || m.key.includes(' ' + nq)).sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 5)
          .map((m) => ({ icon: 'landmark', title: m.name, sub: m.county + ' County · ' + U.int(m.n) + ' recorded sales (12 mo)', url: U.qs({ view: 'records', tab: 'towns', county: m.county, muni: m.id }) }));
        const counties = COUNTIES.filter((c) => U.norm(c).startsWith(nq) || U.norm(c + ' county').startsWith(nq)).slice(0, 3)
          .map((c) => ({ icon: 'layers', title: c + ' County', sub: MLS_COUNTIES.includes(c) ? 'Public records + MLS listings' : 'Public records (statewide SR-1A)', url: U.qs({ view: 'records', tab: 'towns', county: c }) }));

        let props = [];
        if (q.length >= 3 && !zip) {
          try {
            const term = q.split(',')[0].replace(/[%_*(),.]/g, ' ').replace(/\s+/g, ' ').trim();
            if (term.length >= 3) {
              const { data } = await App.cached('search:addr:' + term.toLowerCase(), () =>
                App.sb.from('all_active_listings').select('listing_id,address,city,price_after,bedrooms,property_type').ilike('address', '%' + term + '%').limit(6), 60 * 1000);
              props = (data || []).map((d) => ({ icon: 'home', title: d.address.split(',')[0], sub: d.city + (d.property_type ? ' · ' + d.property_type : ''), right: U.moneyShort(d.price_after), url: U.qs({ view: 'property', id: d.listing_id }) }));
            }
          } catch (e) { /* network */ }
        }
        if (my !== seq) return;

        // Queries with a house number are addresses; anything else is most likely
        // a place name, so places rank first and street-name matches are trimmed.
        const places = [
          { label: 'Towns (MLS region)', items: towns },
          { label: 'Municipalities (public records)', items: munis },
          { label: 'Counties', items: counties },
        ];
        if (zip) groups.push({ label: 'ZIP code', items: [{ icon: 'pin', title: 'Active listings in ZIP ' + zip, sub: 'MLS listings · ' + App.cfg.REGION, url: U.qs({ view: 'listings', zip }) }] });
        if (looksAddr) {
          groups.push({ label: 'Properties', items: props });
          groups.push({ label: 'Research an address', items: [{ icon: 'scale', title: 'Comparable sales near “' + q + '”', sub: 'Closed MLS sales within 1 mile · any address', url: U.qs({ view: 'comps', address: q }) }] });
          groups.push(...places);
        } else {
          groups.push(...places);
          groups.push({ label: 'Properties', items: props.slice(0, 3) });
        }
        renderOpts(groups, q);
      }, 160);

      input.addEventListener('input', run);
      input.addEventListener('focus', () => { if (input.value.trim().length >= 2) run(); });
      input.addEventListener('keydown', (e) => {
        if (panel.hidden && e.key === 'ArrowDown') { run(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); if (opts.length) setActive((active + 1) % opts.length); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (opts.length) setActive((active - 1 + opts.length) % opts.length); }
        else if (e.key === 'Enter') { e.preventDefault(); const o = opts[active >= 0 ? active : 0]; if (o) pick(o); }
        else if (e.key === 'Escape') { close(); }
      });
      panel.addEventListener('mousedown', (e) => e.preventDefault());
      panel.addEventListener('click', (e) => { const el = e.target.closest('.gs-opt'); if (el) pick(opts[+el.dataset.i]); });
      input.addEventListener('blur', () => setTimeout(close, 120));
      return { input, close };
    },
  };

  /* ------------------------------------------------------------ unsubscribe */
  async function handleUnsubscribe(token) {
    const { error } = await App.sb.rpc('unsubscribe', { token });
    const sp = App.params(); sp.delete('unsub');
    history.replaceState({}, '', location.pathname + (sp.toString() ? '?' + sp : ''));
    App.toast(error ? 'Could not process the unsubscribe request — please try again.' : 'You have been unsubscribed. No more alerts will be sent to this address.', 8000);
  }

  /* ------------------------------------------------------------------- boot */
  let booted = false;
  function boot() {
    if (booted) return; booted = true;
    initShell();
    const token = App.params().get('unsub');
    if (token) handleUnsubscribe(token);
    App.render();
    App.notifications?.refresh();
  }
  // Deferred scripts execute before DOMContentLoaded, so ui.js is guaranteed to
  // have run by the time this fires.
  if (document.readyState === 'complete') boot();
  else { document.addEventListener('DOMContentLoaded', boot); window.addEventListener('load', boot); }
})();

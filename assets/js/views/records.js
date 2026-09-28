/* NJ Public Records: statewide SR-1A recorded deed sales (independent of MLS). */
(function () {
  'use strict';
  const App = window.App, U = App.u, UI = App.ui;
  let el, rows = null, newest = null, mlsTowns = null;
  const st = { tab: 'counties', county: 'all', muni: '' };

  const yoyOf = (w) => (w.ytd26 && w.sp25 && w.sp25.res_median > 0 ? ((w.ytd26.res_median - w.sp25.res_median) / w.sp25.res_median) * 100 : null);
  const vol = (v) => U.moneyShort(v);

  App.registerView('records', {
    title: 'NJ Public Records',
    mount(host) {
      el = host;
      el.innerHTML = `<div class="page">
        <div class="page-head"><div><div class="eyebrow">${U.icon('landmark', 'icon-sm')}Market intelligence · statewide</div><h1 class="page-title">NJ public records — recorded home sales</h1>
          <p class="page-sub">Every recorded, arm's-length residential deed in New Jersey — all 21 counties and 500+ municipalities — from the State's official SR-1A sales records. Independent of any MLS.</p></div></div>
        <div class="metrics" id="prPulse"></div>
        <div class="section"><div class="tabs" role="tablist" aria-label="Public records views">
          <button type="button" role="tab" data-tab="counties" aria-selected="true">Counties</button>
          <button type="button" role="tab" data-tab="towns" aria-selected="false">Municipalities</button>
          <button type="button" role="tab" data-tab="deeds" aria-selected="false">Recent deeds</button></div>
          <div class="row" style="margin-bottom:12px" id="prCtl"><label class="small muted" for="prCounty">County</label><select class="select" id="prCounty" style="max-width:220px"><option value="all">All counties</option></select><span class="small muted" id="prPeriod"></span></div>
          <div id="prTable">${UI.skeletonRows(8)}</div></div>
        <details class="disclosure" style="margin-top:16px"><summary>${U.icon('info', 'icon-sm')}Source &amp; methodology</summary><div class="disclosure-b">
          <p><b>Source.</b> NJ Division of Taxation SR-1A deed records (official state data, refreshed periodically). Recording typically lags closing by 1–3 months.</p>
          <p><b>Included sales.</b> Only deeds the State classifies as usable, arm's-length transactions — family transfers, sheriff's deeds, and other non-market conveyances are excluded by the State's own coding. "Residential" means property class 2 (1–4 family). Prices under $1,000 are excluded.</p>
          <p><b>Calculations.</b> Medians are computed from individual deeds for each window (never averaged across towns). YoY compares 2026 year-to-date with the same months of 2025. Municipalities with fewer than 10 sales are flagged as low sample.</p>
          <p>This data is independent of, and unaffiliated with, any MLS. Owner names are not displayed.</p></div></details>
      </div>`;
      el.addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { st.tab = t.dataset.tab; st.muni = ''; sync(); } });
      U.$('#prCounty', el).addEventListener('change', (e) => { st.county = e.target.value; sync(); });
    },
    async show(host, sp) {
      st.tab = sp.get('tab') || 'counties'; st.county = sp.get('county') || 'all'; st.muni = sp.get('muni') || '';
      if (!rows) {
        try {
          [rows, newest] = await Promise.all([App.prWindows(), App.prNewestDeed()]);
          if (!rows.length) throw new Error('empty');
          U.$('#prCounty', el).innerHTML = '<option value="all">All counties</option>' + App.COUNTIES.map((c) => `<option>${c}</option>`).join('');
          pulse();
        } catch (e) {
          rows = null;
          U.$('#prTable', el).innerHTML = UI.state('Public-records data unavailable', 'Please try again.', 'alert', true);
          return;
        }
      }
      sync(true);
      if (st.muni) openMuni(st.muni);
    },
  });

  function pulse() {
    const g = (w) => rows.find((r) => r.scope_type === 'state' && r.win === w);
    const s = g('w12'), y = yoyOf({ ytd26: g('ytd26'), sp25: g('sp25') });
    U.$('#prPulse', el).innerHTML = s ? [
      UI.metric({ label: 'Recorded sales, 12 months', value: U.int(s.res_n), meta: 'Statewide · usable 1–4 family', src: UI.src('pr') }),
      UI.metric({ label: 'Median sale price', value: U.moneyShort(s.res_median), delta: y != null ? { v: y, label: 'YTD vs. 2025' } : null }),
      UI.metric({ label: 'Median $ per sq ft', value: '$' + U.int(s.res_med_ppsf) }),
      UI.metric({ label: 'Dollar volume', value: vol(s.res_volume) }),
      UI.metric({ label: 'Recorded through', value: newest ? U.date(newest, 'short') : '—', meta: newest ? U.date(newest, 'long') + ' (latest deed date on file)' : '' }),
    ].join('') : '';
  }

  function sync(noUrl) {
    U.$$('[data-tab]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === st.tab)));
    U.$('#prCounty', el).value = st.county;
    U.$('#prCtl', el).hidden = st.tab === 'counties';
    if (!noUrl) {
      const q = { view: 'records' };
      if (st.tab !== 'counties') q.tab = st.tab;
      if (st.county !== 'all') q.county = st.county;
      if (st.muni) q.muni = st.muni;
      App.replaceParams(U.qs(q));
    }
    if (st.tab === 'deeds') return deeds();
    table();
  }

  function grouped(scope) {
    const by = {};
    for (const r of rows) {
      if (r.scope_type !== scope) continue;
      if (scope === 'muni' && st.county !== 'all' && r.county !== st.county) continue;
      (by[r.scope_id] ??= {})[r.win] = r;
    }
    return Object.entries(by).map(([id, w]) => {
      const b = w.w12 || w.ytd26; if (!b) return null;
      return { id, label: b.scope_label, county: b.county, n: b.res_n, median: b.res_median, ppsf: b.res_med_ppsf, volume: b.res_volume, yoy: yoyOf(w) };
    }).filter(Boolean);
  }

  function table() {
    const scope = st.tab === 'counties' ? 'county' : 'muni';
    const data = grouped(scope);
    U.$('#prPeriod', el).textContent = scope === 'muni' ? `${U.int(data.length)} municipalities with recorded sales` : '';
    const yoyFmt = (r) => (r.yoy == null ? '—' : `<span class="${r.yoy >= 0 ? 'pos' : 'neg'}">${U.pct(r.yoy, 1, true)}</span>`);
    UI.table(U.$('#prTable', el), {
      id: 'pr-' + scope, caption: scope === 'county' ? 'Recorded sales by county' : 'Recorded sales by municipality', unit: scope === 'county' ? 'counties' : 'municipalities',
      pageSize: scope === 'county' ? 25 : 50, search: (r) => r.label + ' ' + (r.county || ''), searchPlaceholder: scope === 'county' ? 'Search counties' : 'Search municipalities',
      sort: { key: 'n', dir: 'desc' }, exportName: 'njreindex-recorded-sales-' + (scope === 'county' ? 'counties' : 'municipalities'),
      onRowClick: (r) => { if (scope === 'county') { st.tab = 'towns'; st.county = r.id; sync(); window.scrollTo({ top: U.$('.tabs', el).offsetTop - 80 }); } else openMuni(r.id); },
      columns: [
        { key: 'label', label: scope === 'county' ? 'County' : 'Municipality', strong: true, mobile: 'title',
          fmt: (r) => U.esc(r.label) + (scope === 'county' && App.MLS_COUNTIES.includes(r.id) ? ' <span class="badge badge-teal" style="height:18px;font-size:10.5px" data-tip="MLS listings and sales are also available for this county.">MLS</span>' : '') + (r.n < 10 ? ' <span class="badge" style="height:18px;font-size:10.5px" data-tip="Fewer than 10 sales — treat medians with caution.">Low n</span>' : '') },
        ...(scope === 'muni' ? [{ key: 'county', label: 'County' }] : []),
        { key: 'n', label: 'Sales (12 mo)', num: true, fmt: (r) => U.int(r.n) },
        { key: 'median', label: 'Median sale', num: true, strong: true, mobile: 'right', fmt: (r) => U.money(r.median), csv: (r) => r.median },
        { key: 'ppsf', label: 'Median $/sq ft', num: true, fmt: (r) => (r.ppsf ? '$' + U.int(r.ppsf) : '—') },
        { key: 'yoy', label: 'Median YoY (YTD)', num: true, fmt: yoyFmt, csv: (r) => (r.yoy == null ? '' : r.yoy.toFixed(1)) },
        { key: 'volume', label: '$ volume', num: true, fmt: (r) => vol(r.volume), csv: (r) => r.volume },
      ],
      rows: data,
    });
  }

  async function deeds() {
    U.$('#prTable', el).innerHTML = UI.skeletonRows(8);
    U.$('#prPeriod', el).textContent = 'Newest 300 recorded deeds' + (st.county !== 'all' ? ' in ' + st.county + ' County' : ' statewide');
    try {
      const data = await App.cached('deeds:' + st.county, async () => {
        let q = App.sb.from('pr_recent_sales').select('deed_date,recorded_date,address,municipality,county,price,ppsf,sqft,year_built').order('deed_date', { ascending: false }).limit(300);
        if (st.county !== 'all') q = q.eq('county', st.county);
        const { data, error } = await q; if (error) throw error; return data || [];
      });
      if (st.tab !== 'deeds') return;
      UI.table(U.$('#prTable', el), {
        id: 'pr-deeds', caption: 'Recent recorded deeds', unit: 'deeds', pageSize: 50, search: (r) => (r.address || '') + ' ' + r.municipality, searchPlaceholder: 'Search address or municipality',
        sort: { key: 'deed_date', dir: 'desc' }, exportName: 'njreindex-recent-deeds',
        columns: [
          { key: 'deed_date', label: 'Deed date', fmt: (r) => U.esc(U.date(r.deed_date)), sort: (r) => r.deed_date },
          { key: 'address', label: 'Address', strong: true, mobile: 'title', fmt: (r) => U.esc(r.address || '—') },
          { key: 'municipality', label: 'Municipality' },
          { key: 'county', label: 'County' },
          { key: 'price', label: 'Price', num: true, strong: true, mobile: 'right', fmt: (r) => U.money(r.price) },
          { key: 'ppsf', label: '$/sq ft', num: true, fmt: (r) => (r.ppsf ? '$' + U.int(r.ppsf) : '—') },
          { key: 'sqft', label: 'Sq ft', num: true, fmt: (r) => (r.sqft ? U.int(r.sqft) : '—') },
          { key: 'year_built', label: 'Built', num: true, fmt: (r) => r.year_built || '—' },
          { key: 'recorded_date', label: 'Recorded', hide: true, fmt: (r) => U.esc(U.date(r.recorded_date)) },
        ],
        rows: data,
      });
    } catch (e) { U.$('#prTable', el).innerHTML = UI.state('Could not load deeds', 'Please try again.', 'alert', true); }
  }

  async function openMuni(id) {
    const w = await App.muniWindows(id);
    const b = w.w12 || w.ytd26;
    if (!b) return;
    st.muni = id;
    const q = { view: 'records', tab: st.tab === 'counties' ? 'towns' : st.tab }; if (st.county !== 'all') q.county = st.county; q.muni = id;
    App.replaceParams(U.qs(q));
    const y = yoyOf(w);
    if (!mlsTowns) mlsTowns = await App.cached('mk:ts', () => App.sb.from('town_stats').select('*').then((r) => r.data || [])).catch(() => []);
    const k = U.muniKey(b.scope_label);
    const mls = mlsTowns.filter((t) => t.city && U.muniKey(t.city) === k);
    UI.drawer.open({
      title: 'Municipality', label: b.scope_label,
      body: `<div class="stack">
        <div><div class="pv-addr" style="font-size:20px">${U.esc(b.scope_label)}</div><div class="pv-loc">${U.esc(b.county)} County · NJ SR-1A recorded sales ${UI.src('pr')}</div></div>
        <div class="metrics" style="grid-template-columns:1fr 1fr">
          ${UI.metric({ label: 'Sales, 12 months', value: U.int(b.res_n), meta: b.res_n < 10 ? 'Low sample' : '' })}
          ${UI.metric({ label: 'Median sale', value: U.moneyShort(b.res_median), delta: y != null ? { v: y, label: 'YTD YoY' } : null })}
          ${UI.metric({ label: 'Median $/sq ft', value: b.res_med_ppsf ? '$' + U.int(b.res_med_ppsf) : '—' })}
          ${UI.metric({ label: 'Dollar volume', value: vol(b.res_volume) })}
        </div>
        <div><h3 style="font-size:14px;margin-bottom:8px">Recorded sales by month</h3><div id="muniChart">${UI.skeletonRows(1)}</div></div>
        ${mls.length === 1 ? `<div class="notice notice-info small">${U.icon('info', 'icon-sm')}<span>MLS data is also available for ${U.esc(mls[0].city)}. <a href="${U.qs({ view: 'markets', town: mls[0].city })}">Open the town scorecard</a></span></div>` : ''}
      </div>`,
    });
    const { data } = await App.cached('prm:' + id, () => App.sb.from('pr_town_stats').select('ym,res_n,res_median').eq('muni_code', id).order('ym'));
    const ms = (data || []).slice(-18);
    const host = U.$('#muniChart', UI.drawer.el());
    if (host) UI.chart(host, { title: 'Recorded sales by month, ' + b.scope_label, labels: ms.map((x) => U.date(x.ym + '-15', 'month')), bars: ms.map((x) => x.res_n),
      line: ms.map((x) => (x.res_n >= 3 ? x.res_median : null)), barName: 'Sales', lineName: 'Median (3+ sales)', height: 200 });
  }
  document.addEventListener('drawer:close', () => {
    if (!st.muni || App.routeKey() !== 'records') return;
    st.muni = '';
    const q = { view: 'records' }; if (st.tab !== 'counties') q.tab = st.tab; if (st.county !== 'all') q.county = st.county;
    App.replaceParams(U.qs(q));
  });
})();

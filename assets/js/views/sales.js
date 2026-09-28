/* Sales Tape: recorded MLS closings (last 90 days) + town rollup. */
(function () {
  'use strict';
  const App = window.App, U = App.u, UI = App.ui;
  let el, rows = null, table = null;
  const st = { tab: 'tape', win: '30', county: 'all', town: 'all', cls: 'all', minp: '0' };
  const DEF = { ...st };

  App.registerView('sales', {
    title: 'Sales Tape',
    mount(host) {
      el = host;
      el.innerHTML = `<div class="page">
        <div class="page-head"><div><div class="eyebrow">${U.icon('file', 'icon-sm')}Explore</div><h1 class="page-title">Sales tape</h1>
          <p class="page-sub">Every recorded MLS closing in the ${U.esc(App.cfg.REGION)} over the last 90 days — what actually traded, and for how much versus asking.</p></div></div>
        <div class="metrics" id="slPulse">${UI.skeletonMetrics(5).replace(/^<div class="metrics">|<\/div>$/g, '')}</div>
        <div class="filterbar section" id="slBar" style="margin-top:16px" role="group" aria-label="Sales filters">
          <div class="seg" role="tablist" aria-label="View"><button type="button" role="tab" data-tab="tape" aria-selected="true">Transactions</button><button type="button" role="tab" data-tab="towns" aria-selected="false">By town</button></div>
          <select class="select" id="slWin" aria-label="Time window"><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select>
          <select class="select" id="slCounty" aria-label="County"><option value="all">All counties</option></select>
          <select class="select" id="slTown" aria-label="Town"><option value="all">All towns</option></select>
          <select class="select" id="slCls" aria-label="Property class"><option value="all">All classes</option><option value="Residential">Residential</option><option value="Multi-Family">Multi-family</option><option value="Land/Lots">Land</option><option value="Commercial">Commercial</option></select>
          <select class="select" id="slMin" aria-label="Minimum sale price"><option value="0">Any price</option><option value="200000">$200K+</option><option value="500000">$500K+</option><option value="1000000">$1M+</option></select>
          <button type="button" class="btn btn-ghost btn-sm" id="slReset">Reset</button>
        </div>
        <div id="slTable" style="margin-top:16px">${UI.skeletonRows(8)}</div>
        <p class="small muted" style="margin-top:12px">${UI.src('mls')} Closings from the ${U.esc(App.cfg.MLS_SHORT)} feed. "vs ask" compares the recorded sale price with the final asking price; "Days" is list date to close date. New closings appear as the MLS records them, typically within days of settlement. For recorded deed transactions statewide, see <a href="?view=records">NJ Public Records</a>.</p>
      </div>`;
      const bar = U.$('#slBar', el);
      bar.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab]'); if (t) { st.tab = t.dataset.tab; sync(); }
        if (e.target.closest('#slReset')) { Object.assign(st, DEF); sync(); }
      });
      const map = { slWin: 'win', slCounty: 'county', slTown: 'town', slCls: 'cls', slMin: 'minp' };
      bar.addEventListener('change', (e) => { const k = map[e.target.id]; if (k) { st[k] = e.target.value; if (k === 'county') st.town = 'all'; sync(); } });
    },
    async show(host, sp) {
      for (const k of Object.keys(DEF)) st[k] = sp.get(k) || DEF[k];
      if (!rows) {
        try {
          const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
          rows = await App.cached('sales:90', () => App.fetchAll('listings',
            'id,address,city,county,property_type,property_class,bedrooms,bathrooms,sqft,current_price,close_price,close_date,list_date',
            { order: 'close_date', tiebreak: 'id', max: 8000, filter: (q) => q.eq('status', 'Closed').gt('close_price', 0).gte('close_date', since) }));
          for (const r of rows) {
            r._svl = r.current_price > 0 ? ((r.close_price - r.current_price) / r.current_price) * 100 : null;
            r._dtc = r.list_date && r.close_date ? Math.round((new Date(r.close_date) - new Date(r.list_date)) / 86400000) : null;
            if (r._dtc != null && (r._dtc < 0 || r._dtc > 1825)) r._dtc = null;
            r._ppsf = r.sqft > 0 ? Math.round(r.close_price / r.sqft) : null;
            r._street = (r.address || '').split(',')[0];
          }
          U.$('#slCounty', el).innerHTML = '<option value="all">All counties</option>' + [...new Set(rows.map((r) => r.county).filter((c) => c && c !== 'Unknown'))].sort().map((c) => `<option>${U.esc(c)}</option>`).join('');
        } catch (e) {
          rows = null;
          U.$('#slTable', el).innerHTML = UI.state('Sales could not load', 'Please try again.', 'alert', true);
          return;
        }
      }
      sync(true);
    },
  });

  function sync(noUrl) {
    U.$$('[data-tab]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === st.tab)));
    const townSel = U.$('#slTown', el);
    const towns = [...new Set(rows.filter((r) => st.county === 'all' || r.county === st.county).map((r) => r.city).filter(Boolean))].sort();
    if (st.town !== 'all' && !towns.includes(st.town)) towns.unshift(st.town);
    townSel.innerHTML = '<option value="all">All towns</option>' + towns.map((t) => `<option>${U.esc(t)}</option>`).join('');
    const set = (id, v) => { const s = U.$('#' + id, el); if ([...s.options].some((o) => o.value === v)) s.value = v; };
    set('slWin', st.win); set('slCounty', st.county); set('slTown', st.town); set('slCls', st.cls); set('slMin', st.minp);
    if (!noUrl) {
      const q = { view: 'sales' }; for (const k of Object.keys(DEF)) if (st[k] !== DEF[k]) q[k] = st[k];
      App.replaceParams(U.qs(q));
    }
    render();
  }

  function render() {
    const days = +st.win, cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), minP = +st.minp;
    const f = rows.filter((r) => r.close_date >= cutoff && (st.county === 'all' || r.county === st.county) && (st.town === 'all' || r.city === st.town)
      && (st.cls === 'all' || r.property_class === st.cls) && (!minP || r.close_price >= minP));
    const svls = f.map((r) => r._svl).filter((x) => x != null);
    const over = svls.filter((x) => x >= 0).length;
    const medSvl = U.median(svls);
    const scope = (st.town !== 'all' ? st.town : st.county !== 'all' ? st.county + ' County' : App.cfg.REGION) + ` · last ${days} days`;
    U.$('#slPulse', el).innerHTML = [
      UI.metric({ label: 'Closings', value: U.int(f.length), meta: scope }),
      UI.metric({ label: 'Median sale price', value: U.moneyShort(U.median(f.map((r) => r.close_price))), meta: `n = ${U.int(f.length)}` }),
      UI.metric({ label: 'Median sale vs. ask', value: medSvl == null ? '—' : `<span class="${medSvl >= 0 ? 'pos' : 'neg'}">${U.pct(medSvl, 1, true)}</span>`, meta: `n = ${U.int(svls.length)} with a final asking price`, tip: 'Recorded sale price compared with the final asking price.' }),
      UI.metric({ label: 'Sold at or over ask', value: svls.length ? Math.round((100 * over) / svls.length) + '%' : '—', meta: svls.length ? (over / svls.length >= 0.5 ? 'Seller-leaning' : 'Buyer-leaning') + ' by this measure' : '' }),
      UI.metric({ label: 'Median list-to-close', value: (U.median(f.map((r) => r._dtc)) ?? '—') + ' days', meta: 'Days from list date to close date' }),
    ].join('');
    if (st.tab === 'towns') return renderTowns(f);
    const fresh = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
    table = UI.table(U.$('#slTable', el), {
      id: 'salesTape', caption: 'Recorded MLS closings', unit: 'closings', pageSize: 50, search: (r) => r.address + ' ' + r.city, searchPlaceholder: 'Search address or town',
      sort: { key: 'close_date', dir: 'desc' }, onRowClick: (r) => App.go(U.qs({ view: 'property', id: r.id })),
      columns: [
        { key: 'close_date', label: 'Closed', fmt: (r) => U.esc(U.date(r.close_date, 'short')) + (r.close_date >= fresh ? ' <span class="badge badge-teal" style="height:18px;font-size:10.5px">New</span>' : ''), sort: (r) => r.close_date },
        { key: 'address', label: 'Address', mobile: 'title', strong: true, fmt: (r) => `<a href="${U.qs({ view: 'property', id: r.id })}">${U.esc(r._street)}</a>`, sort: (r) => r._street },
        { key: 'city', label: 'Town' },
        { key: 'property_type', label: 'Type', hide: true },
        { key: 'beds', label: 'Bd / Ba', num: true, fmt: (r) => (r.bedrooms ?? '—') + ' / ' + (r.bathrooms ?? '—'), sort: (r) => r.bedrooms },
        { key: 'sqft', label: 'Sq ft', num: true, fmt: (r) => (r.sqft ? U.int(r.sqft) : '—') },
        { key: 'close_price', label: 'Sold', num: true, strong: true, mobile: 'right', fmt: (r) => U.money(r.close_price) },
        { key: '_svl', label: 'vs ask', num: true, fmt: (r) => (r._svl == null ? '—' : `<span class="${r._svl > 0.05 ? 'pos' : r._svl < -0.05 ? 'neg' : ''}">${U.pct(r._svl, 1, true)}</span>`) },
        { key: '_ppsf', label: '$/sq ft', num: true, fmt: (r) => (r._ppsf ? '$' + U.int(r._ppsf) : '—') },
        { key: '_dtc', label: 'Days', num: true, fmt: (r) => (r._dtc == null ? '—' : U.int(r._dtc)) },
      ],
      rows: f,
      empty: 'No closings match these filters. Try a longer time window.',
    });
  }

  function renderTowns(f) {
    const by = {};
    for (const r of f) (by[r.city] ??= []).push(r);
    const towns = Object.entries(by).map(([city, g]) => {
      const svls = g.map((r) => r._svl).filter((x) => x != null);
      return { city, county: g.find((r) => r.county && r.county !== 'Unknown')?.county || '—', n: g.length, med: U.median(g.map((r) => r.close_price)), svl: U.median(svls),
        over: svls.length ? Math.round((100 * svls.filter((x) => x >= 0).length) / svls.length) : null, ppsf: U.median(g.map((r) => r._ppsf)), dtc: U.median(g.map((r) => r._dtc)) };
    });
    UI.table(U.$('#slTable', el), {
      id: 'salesTowns', caption: 'Closings by town', unit: 'towns', pageSize: 50, search: (t) => t.city, searchPlaceholder: 'Search towns',
      sort: { key: 'n', dir: 'desc' }, onRowClick: (t) => { st.town = t.city; st.tab = 'tape'; sync(); },
      columns: [
        { key: 'city', label: 'Town', strong: true, mobile: 'title', fmt: (t) => `<a href="${U.qs({ view: 'markets', town: t.city })}">${U.esc(t.city)}</a>` },
        { key: 'county', label: 'County' },
        { key: 'n', label: 'Closings', num: true, fmt: (t) => U.int(t.n) + (t.n < 5 ? ' <span class="muted xsmall">low n</span>' : '') },
        { key: 'med', label: 'Median sold', num: true, strong: true, mobile: 'right', fmt: (t) => U.money(t.med) },
        { key: 'svl', label: 'Median vs ask', num: true, fmt: (t) => (t.svl == null ? '—' : `<span class="${t.svl > 0.05 ? 'pos' : t.svl < -0.05 ? 'neg' : ''}">${U.pct(t.svl, 1, true)}</span>`) },
        { key: 'over', label: 'At/over ask', num: true, fmt: (t) => (t.over == null ? '—' : t.over + '%') },
        { key: 'ppsf', label: 'Median $/sq ft', num: true, fmt: (t) => (t.ppsf ? '$' + U.int(t.ppsf) : '—') },
        { key: 'dtc', label: 'Median days', num: true, fmt: (t) => (t.dtc == null ? '—' : U.int(t.dtc)) },
      ],
      rows: towns,
    });
  }
})();

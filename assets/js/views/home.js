/* Home: product discovery + Market Pulse (real data only, with coverage and dates). */
(function () {
  'use strict';
  const App = window.App, U = App.u, UI = App.ui;

  const DISCOVER = [
    { icon: 'chart', title: 'Explore NJ markets', text: 'Town scorecards, side-by-side comparisons, and recorded sales for all 21 counties.', href: '?view=markets', go: 'Open market analytics' },
    { icon: 'target', title: 'Find opportunities', text: 'Tracked price cuts, long days-on-market, and seller-capitulation scores with the factors shown.', href: '?view=deals', go: 'Open Deal Screener' },
    { icon: 'building', title: 'Research a property', text: 'Price history, comparable sales, public records, market context, and an underwriting calculator.', href: '?view=property', go: 'Start property research' },
    { icon: 'ranks', title: 'Professional rankings', text: 'Brokerage and agent rankings computed from MLS-recorded closings, with the method published.', href: '?view=rankings', go: 'View rankings' },
  ];

  App.registerView('home', {
    title: 'NJREindex — New Jersey Real Estate Intelligence',
    mount(el) {
      el.innerHTML = `
        <section class="hero" aria-labelledby="homeH1">
          <div class="hero-in">
            <div class="eyebrow">New Jersey real estate intelligence</div>
            <h1 id="homeH1">The New Jersey real estate market, decoded.</h1>
            <p class="lede">Search properties, discover opportunities, analyze comparable sales, and research New Jersey markets using actual transaction data.</p>
            <div class="hero-search">
              <div class="gsearch" id="heroSearch" role="search">
                <svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>
                <input class="input" type="search" placeholder="Enter an address, town, county, or ZIP code" aria-label="Search by address, town, county, or ZIP code" autocomplete="off" spellcheck="false">
                <kbd aria-hidden="true">Enter</kbd>
              </div>
              <div class="hero-hints"><span>Try</span>
                <button type="button" data-try="Toms River">Toms River</button>
                <button type="button" data-try="07731">07731</button>
                <button type="button" data-try="Monmouth">Monmouth County</button>
                <button type="button" data-try="Hoboken">Hoboken</button>
              </div>
            </div>
            <div class="hero-cov">
              <span><i></i>MLS listings &amp; sales — ${U.esc(App.cfg.REGION)}</span>
              <span><i class="pr"></i>Recorded deed sales — all 21 NJ counties</span>
            </div>
          </div>
        </section>
        <div class="page" style="padding-top:0">
          <div class="disc-grid">${DISCOVER.map((d) => `<a class="disc-card" href="${d.href}">
            <span class="disc-ico">${U.icon(d.icon)}</span><h3>${U.esc(d.title)}</h3><p>${U.esc(d.text)}</p>
            <span class="go">${U.esc(d.go)}${U.icon('arrow-r', 'icon-sm')}</span></a>`).join('')}</div>

          <section class="section" aria-labelledby="pulseH">
            <div class="section-h"><h2 id="pulseH">Market Pulse</h2><span class="meta" id="pulseMeta"></span></div>
            <div class="pulse-grid">
              <div class="card"><div class="card-h"><div><h3>MLS activity</h3><div class="small muted">${U.esc(App.cfg.REGION)} · ${U.esc(App.cfg.MLS_SHORT)} feed</div></div>${UI.src('mls')}</div>
                <div class="card-b" id="pulseMls">${UI.skeletonMetrics(5)}</div>
                <div class="card-f" id="pulseMlsFoot">Loading…</div></div>
              <div class="card"><div class="card-h"><div><h3>Recorded home sales</h3><div class="small muted">Statewide · all 21 counties · residential 1–4 family</div></div>${UI.src('pr')}</div>
                <div class="card-b" id="pulsePr">${UI.skeletonMetrics(4)}</div>
                <div class="card-f" id="pulsePrFoot">Loading…</div></div>
            </div>
          </section>

          <section class="section" aria-labelledby="ctyH">
            <div class="section-h"><h2 id="ctyH">Explore by county</h2><span class="meta">Median recorded sale price, trailing 12 months · select a county to see its municipalities</span></div>
            <div class="county-grid" id="countyGrid">${Array.from({ length: 12 }, () => '<div class="county-tile"><div class="skel skel-line" style="width:60%"></div><div class="skel" style="height:20px;width:50%"></div><div class="skel skel-line" style="width:80%"></div></div>').join('')}</div>
          </section>

          <section class="section" aria-labelledby="featH">
            <div class="section-h"><h2 id="featH">What you can do</h2></div>
            <div class="feat-grid">
              ${[
                ['list', 'Listings & price drops', 'Every active listing on a map, with original price, cumulative reduction, and the date of the latest cut.', '?view=listings'],
                ['scale', 'Comparable sales', 'Enter any address to pull closed MLS sales within a mile, with $/sq ft and sale-to-list ratios.', '?view=comps'],
                ['file', 'Sales tape', 'Every recorded MLS closing, with sold-versus-ask and days from list to close.', '?view=sales'],
                ['chart', 'Town scorecards', 'Buyer-leverage scores for each town — with the formula and sample sizes shown — and 2–4 town comparisons.', '?view=markets'],
                ['landmark', 'NJ public records', 'Recorded arm’s-length sales for 500+ municipalities, independent of any MLS.', '?view=records'],
                ['bookmark', 'Your workspace', 'Save properties and searches, keep research notes, compare up to four homes, and print reports.', '?view=saved'],
              ].map(([i, t, d, h]) => `<div class="card feat"><h3>${U.icon(i)}${U.esc(t)}</h3><p>${U.esc(d)}</p><a href="${h}">Open${U.icon('arrow-r', 'icon-sm')}</a></div>`).join('')}
            </div>
          </section>

          <section class="section" aria-labelledby="methH">
            <div class="section-h"><h2 id="methH">Data sources &amp; methodology</h2><span class="meta">We label every number by where it comes from</span></div>
            <div class="src-grid">
              <div class="card src-card">${UI.src('mls', 'MLS data')}<h3>${U.esc(App.cfg.MLS_NAME)}</h3>
                <p>Active, pending, and closed listings from the ${U.esc(App.cfg.MLS_SHORT)} IDX feed, refreshed twice daily. Coverage is the Monmouth &amp; Ocean county region — we do not claim statewide MLS listing coverage.</p></div>
              <div class="card src-card">${UI.src('pr', 'Public records')}<h3>NJ Division of Taxation SR-1A</h3>
                <p>Every recorded deed the State classifies as a usable, arm's-length sale. Statewide, independent of any MLS. Recording lags closing by 1–3 months.</p></div>
              <div class="card src-card">${UI.src('calc', 'NJREindex analytics')}<h3>Calculations &amp; estimates</h3>
                <ul><li>Medians are computed from individual records, never averaged medians.</li><li>Thin samples are gated out rather than shown as noise.</li><li>Scores and expected-close ranges are ${UI.src('est', 'estimates')}, graded against actual closings over time.</li></ul></div>
            </div>
          </section>

          <section class="section">
            <div class="cta-band"><div><h2>Know the moment a price drops</h2><p>Free email alerts for homes that match your criteria — instant or weekly.</p></div>
              <button type="button" class="btn btn-primary btn-lg" data-action="alerts">${U.icon('bell')}Create an alert</button></div>
          </section>
        </div>`;
      App.search.attach(U.$('#heroSearch', el));
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-try]');
        if (t) { const i = U.$('#heroSearch input', el); i.value = t.dataset.try; i.focus(); i.dispatchEvent(new Event('input')); }
        const c = e.target.closest('[data-county]');
        if (c) App.go(U.qs({ view: 'records', tab: 'towns', county: c.dataset.county }));
      });
      this.load(el);
    },
    show() {},

    async load(el) {
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      // MLS pulse — each metric renders as soon as its own query returns, so a
      // slow count never holds the others back.
      const slots = [
        ['act', 'Active listings', 'Listings with Active status in the MLS feed at the latest poll.'],
        ['drops', 'Tracked price reductions', 'Active listings where NJREindex detected a price cut between polls and the listing is still active.'],
        ['closed', 'Closings, last 30 days', 'MLS listings that moved to Closed with a close date in the last 30 days.'],
        ['dom', 'Median days on market', 'Median of MLS days-on-market across all active listings.'],
        ['price', 'Median asking price', 'Median current asking price across every active listing, including land and commercial.'],
      ];
      U.$('#pulseMls', el).innerHTML = '<div class="metrics">' + slots.map(([k, l, t]) =>
        `<div data-slot="${k}">${UI.metric({ label: l, tip: t, value: '<span class="skel" style="display:inline-block;height:24px;width:90px;vertical-align:middle"></span>', meta: '&nbsp;' })}</div>`).join('') + '</div>';
      const fill = (k, value, meta) => {
        const s = slots.find((x) => x[0] === k), host = U.$(`[data-slot="${k}"]`, el);
        if (host) host.innerHTML = UI.metric({ label: s[1], tip: s[2], value, meta });
      };
      const fail = (k) => () => fill(k, '—', 'Temporarily unavailable');
      const actP = App.cached('count:actives', () => App.count('all_active_listings'));
      actP.then((n) => fill('act', U.int(n), 'For sale now'), fail('act'));
      Promise.all([App.cached('count:drops', () => App.count('active_drops')), actP])
        .then(([d, n]) => fill('drops', U.int(d), `${U.pct((d / n) * 100, 1)} of active listings`), fail('drops'));
      App.cached('count:closed30', () => App.count('listings', (q) => q.eq('status', 'Closed').gt('close_price', 0).gte('close_date', since30)))
        .then((n) => fill('closed', U.int(n), 'Recorded MLS closings since ' + U.date(since30, 'short')), fail('closed'));
      App.cached('median:dom', () => App.medianOf('all_active_listings', 'days_on_market'))
        .then((v) => fill('dom', U.int(v), 'All active listings'), fail('dom'));
      App.cached('median:price', () => App.medianOf('all_active_listings', 'price_after'))
        .then((v) => fill('price', U.moneyShort(v), 'All active listings, all types'), fail('price'));
      App.mlsFreshness().catch(() => null).then((fresh) => {
        U.$('#pulseMlsFoot', el).innerHTML = UI.provenance([
          { icon: 'clock', text: fresh ? 'Last MLS refresh ' + U.dateTime(fresh) : 'Refreshed twice daily' },
          { icon: 'database', text: 'Source: ' + App.cfg.MLS_SHORT + ' IDX feed' },
          { html: `<a href="?view=listings">Browse listings${U.icon('arrow-r', 'icon-sm')}</a>` },
        ]);
        U.$('#pulseMeta', el).textContent = fresh ? 'MLS data as of ' + U.dateTime(fresh) : '';
      });

      // Public-records pulse + county tiles
      Promise.all([App.prWindows(), App.prNewestDeed()]).then(([rows, newest]) => {
        const st = rows.find((r) => r.scope_type === 'state' && r.win === 'w12');
        const y = rows.find((r) => r.scope_type === 'state' && r.win === 'ytd26');
        const p = rows.find((r) => r.scope_type === 'state' && r.win === 'sp25');
        const yoy = y && p && p.res_median ? ((y.res_median - p.res_median) / p.res_median) * 100 : null;
        U.$('#pulsePr', el).innerHTML = st ? `<div class="metrics">
          ${UI.metric({ label: 'Recorded sales, 12 months', value: U.int(st.res_n), meta: 'Usable arm’s-length deeds', tip: 'Residential (class 2, 1–4 family) deeds the State classifies as usable market sales, trailing 12 months of recording data.' })}
          ${UI.metric({ label: 'Median sale price', value: U.moneyShort(st.res_median), delta: yoy != null ? { v: yoy, label: 'YTD vs. same months 2025' } : null, meta: 'Statewide, trailing 12 months', tip: 'Median computed from every individual qualifying deed. Year-over-year compares 2026 year-to-date with the same months of 2025.' })}
          ${UI.metric({ label: 'Median $ per sq ft', value: '$' + U.int(st.res_med_ppsf), meta: 'Where living area is recorded' })}
          ${UI.metric({ label: 'Dollar volume', value: U.moneyShort(st.res_volume), meta: 'Sum of qualifying sale prices' })}
        </div>` : UI.state('Public-records data not loaded', '', 'database');
        U.$('#pulsePrFoot', el).innerHTML = UI.provenance([
          { icon: 'calendar', text: newest ? 'Recorded through ' + U.date(newest, 'long') : 'Recording date unavailable' },
          { icon: 'database', text: 'Source: NJ Division of Taxation SR-1A' },
          { html: `<a href="?view=records">Open public records${U.icon('arrow-r', 'icon-sm')}</a>` },
        ]);

        const byCounty = {};
        for (const r of rows) if (r.scope_type === 'county') (byCounty[r.scope_id] ??= {})[r.win] = r;
        const tiles = App.COUNTIES.map((c) => {
          const w = byCounty[c] || {};
          const b = w.w12;
          const cy = w.ytd26 && w.sp25 && w.sp25.res_median ? ((w.ytd26.res_median - w.sp25.res_median) / w.sp25.res_median) * 100 : null;
          const mls = App.MLS_COUNTIES.includes(c);
          return `<button type="button" class="county-tile${mls ? ' has-mls' : ''}" data-county="${c}" aria-label="${c} County: median sale ${b ? U.moneyShort(b.res_median) : 'unavailable'}${mls ? ', MLS listings available' : ''}">
            <span class="ct-n">${c}${mls ? '<span class="badge badge-teal" style="height:18px;font-size:10.5px">MLS</span>' : ''}</span>
            <span class="ct-v">${b ? U.moneyShort(b.res_median) : '—'}</span>
            <span class="ct-m">${b ? U.int(b.res_n) + ' sales' : 'No data'}${cy != null ? ` · <span class="${cy >= 0 ? 'pos' : 'neg'}">${U.pct(cy, 1, true)}</span> YoY` : ''}</span></button>`;
        });
        U.$('#countyGrid', el).innerHTML = tiles.join('');
      }).catch(() => {
        U.$('#pulsePr', el).innerHTML = UI.state('Public-records statistics unavailable', 'Please refresh in a moment.', 'alert', true);
        U.$('#countyGrid', el).innerHTML = '';
      });
    },
  });
})();

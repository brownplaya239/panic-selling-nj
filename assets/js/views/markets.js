/* Town & County Analytics: buyer-leverage scorecards (Best Towns formula,
   unchanged), per-town scorecard pages, and 2–4 town comparisons. */
(function () {
  'use strict';
  const App = window.App, U = App.u, UI = App.ui;
  let el;

  const q = (key, fn) => App.cached(key, fn, 15 * 60 * 1000);
  const townStats = () => q('mk:ts', () => App.sb.from('town_stats').select('*').then((r) => r.data || []));
  const townOut = () => q('mk:to', () => App.sb.from('town_outcomes').select('*').then((r) => r.data || [], () => []));
  const cutEdge = () => q('mk:ce', () => App.sb.from('cut_edge').select('*').then((r) => r.data || [], () => []));

  // Best Towns buyer-leverage score — identical to the legacy formula.
  function scoreTowns(edges, O, S) {
    return edges.map((e) => {
      const o = O[e.area] || {}, s = S[e.area] || {};
      const softness = 100 - (o.pct_at_or_over_ask ?? 50);
      const slowness = Math.min(100, o.median_days_to_close ?? 70);
      const cutPress = s.pct_with_cut ?? 0;
      const cutterDisc = -(parseFloat(e.cut_sold_vs_list_pct) || 0);
      const score = Math.round(softness * 0.9 + slowness * 0.35 + cutPress * 0.8 + cutterDisc * 4);
      return { ...e, o, s, softness, slowness, cutPress, cutterDisc, score };
    }).sort((a, b) => b.score - a.score);
  }
  async function scored() {
    const [ce, to, ts] = await Promise.all([cutEdge(), townOut(), townStats()]);
    const O = Object.fromEntries(to.map((o) => [o.city, o])), S = Object.fromEntries(ts.map((s) => [s.city, s]));
    return { rows: scoreTowns(ce.filter((e) => e.grain === 'town'), O, S), counties: ce.filter((e) => e.grain === 'county'), O, S };
  }
  const METHOD = `<p><b>Buyer-leverage score</b> = 0.9 × (% of closed sales under ask) + 0.35 × (median days from list to close, capped at 100) + 0.8 × (% of active listings with a tracked price cut) + 4 × (how far below ask homes that cut their price ultimately sold).</p>
    <p>Only towns with <b>10+ closed sales that had a price cut</b> and 30+ total closings in the last 12 months appear. Cut-home outcomes are shrunk toward the county average (weight of 20 sales) so a small town can't post a false edge. The score is an editorial blend of measured statistics — not a prediction.</p>`;

  App.registerView('markets', {
    title: (sp) => (sp.get('town') ? sp.get('town') + ' — Town Scorecard' : sp.get('compare') ? 'Compare Towns' : 'Town & County Analytics'),
    mount(host) { el = host; },
    async show(host, sp) {
      const town = sp.get('town'), compare = sp.get('compare');
      if (town) return renderTown(town);
      if (compare != null || sp.get('tab') === 'compare') return renderCompare((compare || '').split('|').filter(Boolean));
      return renderList();
    },
  });

  function header(active) {
    return `<div class="page-head"><div><div class="eyebrow">${U.icon('chart', 'icon-sm')}Market intelligence</div><h1 class="page-title">Town &amp; county analytics</h1>
      <p class="page-sub">Where buyers have leverage, measured from 12 months of MLS closings in the ${U.esc(App.cfg.REGION)}. Statewide municipality and county data is in <a href="?view=records">NJ Public Records</a>.</p></div></div>
      <div class="tabs" role="tablist"><a href="?view=markets" role="tab" aria-selected="${active === 'list'}">Town scorecards</a><a href="?view=markets&compare=" role="tab" aria-selected="${active === 'compare'}">Compare towns</a><a href="?view=records&tab=counties" role="tab" aria-selected="false">Counties (statewide)</a></div>`;
  }

  /* ------------------------------------------------------------ scorecards */
  async function renderList() {
    el.innerHTML = `<div class="page">${header('list')}<div id="mkBanner"></div><div class="card" id="mkList">${UI.skeletonRows(6)}</div>
      <details class="disclosure" style="margin-top:16px"><summary>${U.icon('info', 'icon-sm')}How the buyer-leverage score works</summary><div class="disclosure-b">${METHOD}</div></details></div>`;
    try {
      const { rows, counties } = await scored();
      const cmp = App.store.get('cmpTowns', []);
      if (!rows.length) { U.$('#mkList', el).innerHTML = UI.state('Not enough data yet', 'Scorecards appear once towns have enough closed sales with a price cut.', 'chart'); return; }
      const c = counties.slice().sort((a, b) => a.edge_over_ask_pp - b.edge_over_ask_pp)[0];
      if (c) U.$('#mkBanner', el).innerHTML = `<div class="notice notice-info" style="margin-bottom:16px">${U.icon('trend-down')}<span><b>The price-cut signal:</b> in ${U.esc(c.area)} County, homes that cut their price sold at or over ask <b>${c.cut_over_ask_pct}%</b> of the time, versus <b>${c.baseline_over_ask_pct}%</b> for homes that didn't (n = ${U.int(c.cut_n)} cut sales, 12 months).</span></div>`;
      const bestSample = rows.reduce((a, b) => (b.cut_n > a.cut_n ? b : a), rows[0]);
      const biggest = rows.reduce((a, b) => (b.edge_over_ask_pp < a.edge_over_ask_pp ? b : a), rows[0]);
      const bar = (label, pct, val, tip) => `<div class="sc-bar"><span>${U.esc(label)}${tip ? ' ' + U.info(tip) : ''}</span><span class="bar-meter" role="img" aria-label="${U.esc(label)} ${U.esc(val)}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span><span class="v">${U.esc(val)}</span></div>`;
      U.$('#mkList', el).innerHTML = rows.map((r, i) => {
        const inCmp = cmp.includes(r.area);
        return `<article class="score-card" aria-labelledby="sc-${i}">
          <div class="sc-rank">${i + 1}</div>
          <div style="min-width:0">
            <div class="sc-name" id="sc-${i}"><a href="${U.qs({ view: 'markets', town: r.area })}" style="color:var(--text)">${U.esc(r.area)}</a><span class="small muted" style="font-weight:500">${U.esc(r.county)} County</span>
              ${r === bestSample ? '<span class="badge badge-teal">Largest sample</span>' : ''}${r === biggest && r !== bestSample ? '<span class="badge badge-amber">Biggest cut penalty</span>' : ''}</div>
            <div class="sc-bars">
              ${bar('Sold under ask', r.softness, r.softness + '%', 'Share of closed sales (12 months) below the final asking price.')}
              ${bar('Days to close', r.slowness, (r.o.median_days_to_close ?? '—') + ' d', 'Median days from list date to close date (bar capped at 100 days).')}
              ${bar('Listings cutting', r.cutPress, r.cutPress + '%', 'Share of active residential listings with at least one tracked price cut.')}
            </div>
            <div class="sc-edge">Homes that cut price: <b>${r.cut_over_ask_pct}%</b> sold at/over ask vs. <b>${r.baseline_over_ask_pct}%</b> baseline (<span class="${r.edge_over_ask_pp < 0 ? 'neg' : 'pos'}">${r.edge_over_ask_pp > 0 ? '+' : ''}${r.edge_over_ask_pp} pts</span>) · cutters closed <b>${U.pct(parseFloat(r.cut_sold_vs_list_pct), 1, true)}</b> vs. ask · <span class="muted">n = ${U.int(r.cut_n)} cut sales</span></div>
          </div>
          <div class="sc-right">
            <div><div class="sc-score num">${r.score}</div><div class="xsmall muted" style="text-align:right">Leverage score</div></div>
            <div class="small muted">${r.o.median_close ? U.moneyShort(r.o.median_close) + ' median sale' : ''}</div>
            <div class="row" style="justify-content:flex-end">
              <a class="btn btn-secondary btn-sm" href="${U.qs({ view: 'markets', town: r.area })}">Scorecard</a>
              <button type="button" class="btn btn-ghost btn-sm" data-cmp="${U.esc(r.area)}" aria-pressed="${inCmp}">${U.icon(inCmp ? 'check' : 'plus', 'icon-sm')}Compare</button>
            </div>
          </div></article>`;
      }).join('');
      el.onclick = (e) => {
        const b = e.target.closest('[data-cmp]'); if (!b) return;
        let list = App.store.get('cmpTowns', []);
        const t = b.dataset.cmp;
        if (list.includes(t)) list = list.filter((x) => x !== t);
        else { if (list.length >= 4) { App.toast('Compare up to 4 towns'); return; } list.push(t); }
        App.store.set('cmpTowns', list);
        b.setAttribute('aria-pressed', String(list.includes(t)));
        b.innerHTML = U.icon(list.includes(t) ? 'check' : 'plus', 'icon-sm') + 'Compare';
        showCmpBar(list);
      };
      showCmpBar(App.store.get('cmpTowns', []));
    } catch (e) {
      U.$('#mkList', el).innerHTML = UI.state('Town rankings unavailable', 'Please try again.', 'alert', true);
    }
  }
  function showCmpBar(list) {
    let b = U.$('#mkCmpBar', el);
    if (!list.length) { b?.remove(); return; }
    if (!b) { b = U.h('<div id="mkCmpBar" class="notice" style="position:sticky;bottom:16px;margin-top:16px;justify-content:space-between;align-items:center;box-shadow:var(--shadow-md);background:var(--surface)"></div>'); U.$('.page', el).appendChild(b); }
    b.innerHTML = `<span>${U.icon('compare', 'icon-sm')} <b>${list.length}</b> ${U.plural(list.length, 'town')} selected: ${list.map(U.esc).join(', ')}</span><a class="btn btn-primary btn-sm" href="${U.qs({ view: 'markets', compare: list.join('|') })}" ${list.length < 2 ? 'aria-disabled="true"' : ''}>Compare ${list.length < 2 ? '(add 1 more)' : ''}</a>`;
  }

  /* --------------------------------------------------------- town details */
  async function townData(town) {
    const [ts, to, ce, lst] = await Promise.all([
      townStats().then((a) => a.find((x) => x.city === town) || null),
      townOut().then((a) => a.find((x) => x.city === town) || null),
      cutEdge().then((a) => a.find((x) => x.grain === 'town' && x.area === town) || null),
      q('mk:cty:' + town, () => App.sb.from('listings').select('county').eq('city', town).neq('county', 'Unknown').limit(1).then((r) => r.data?.[0]?.county || null, () => null)),
    ]);
    const mlsCounty = ce?.county || lst || null;
    const muni = await App.matchMuni(town, mlsCounty).catch(() => null);
    const pw = muni ? await App.muniWindows(muni.scope_id) : {};
    // The State's municipality record is authoritative for county; the MLS feed
    // occasionally tags a town with a neighboring county.
    return { town, ts, to, ce, county: muni?.county || mlsCounty, muni, pw };
  }

  async function renderTown(town) {
    el.innerHTML = `<div class="page">
      <nav class="small muted" aria-label="Breadcrumb" style="margin-bottom:12px"><a href="?view=markets">Town &amp; county analytics</a> › <span aria-current="page">${U.esc(town)}</span></nav>
      <div class="page-head"><div><div class="eyebrow">${U.icon('pin', 'icon-sm')}Town scorecard</div><h1 class="page-title">${U.esc(town)}</h1><p class="page-sub" id="twSub">&nbsp;</p></div>
        <div class="row no-print">
          <a class="btn btn-secondary btn-sm" href="${U.qs({ view: 'listings', town })}">${U.icon('list', 'icon-sm')}Listings</a>
          <a class="btn btn-secondary btn-sm" href="${U.qs({ view: 'deals', town })}">${U.icon('target', 'icon-sm')}Deals</a>
          <a class="btn btn-secondary btn-sm" href="${U.qs({ view: 'sales', town })}">${U.icon('file', 'icon-sm')}Sales</a>
          <button type="button" class="btn btn-secondary btn-sm" id="twCmp">${U.icon('compare', 'icon-sm')}Compare</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.print()">${U.icon('print', 'icon-sm')}Print</button>
          <button type="button" class="btn btn-primary btn-sm" id="twAlert">${U.icon('bell', 'icon-sm')}Alerts</button>
        </div></div>
      <div id="twBody">${UI.skeletonMetrics(8)}</div></div>`;
    U.$('#twAlert', el).addEventListener('click', () => App.alertsDialog.open({ town, params: { ...App.listings.DEFAULTS, town } }));
    U.$('#twCmp', el).addEventListener('click', () => {
      const list = App.store.get('cmpTowns', []).filter((t) => t !== town); list.unshift(town);
      App.store.set('cmpTowns', list.slice(0, 4));
      App.go(U.qs({ view: 'markets', compare: list.slice(0, 4).join('|') }));
    });
    let d;
    try { d = await townData(town); } catch (e) { U.$('#twBody', el).innerHTML = UI.state('Town data unavailable', 'Please try again.', 'alert', true); return; }
    const { ts, to, ce, county, muni, pw } = d;
    U.$('#twSub', el).textContent = (county ? county + ' County · ' : '') + 'MLS town' + (muni ? ' · public-records municipality: ' + muni.scope_label : '');
    if (!ts && !to && !muni) { U.$('#twBody', el).innerHTML = UI.state('No data for ' + town, 'This town has no active MLS listings, closed sales, or matching municipality in the public records.', 'search'); return; }
    let sc = null;
    try { const s = await scored(); const i = s.rows.findIndex((r) => r.area === town); if (i >= 0) sc = { ...s.rows[i], rank: i + 1, of: s.rows.length }; } catch (e) { /* optional */ }
    const yoy = pw.ytd26 && pw.sp25 && pw.sp25.res_median ? ((pw.ytd26.res_median - pw.sp25.res_median) / pw.sp25.res_median) * 100 : null;
    U.$('#twBody', el).innerHTML = `
      ${sc ? `<div class="card card-pad" style="margin-bottom:16px"><div class="row-between"><div><div class="eyebrow">Buyer-leverage scorecard ${UI.src('calc')}</div>
        <div class="row"><span class="sc-score num">${sc.score}</span><span class="muted">Rank ${sc.rank} of ${sc.of} scored towns</span></div></div>
        <div style="flex:1;min-width:260px;max-width:520px" class="sc-bars">
          ${[['Sold under ask', sc.softness, sc.softness + '%', 0.9], ['Days to close', sc.slowness, (sc.o.median_days_to_close ?? '—') + ' d', 0.35], ['Listings cutting', sc.cutPress, sc.cutPress + '%', 0.8]].map(([l, p, v, w]) => `<div class="sc-bar"><span>${l} <span class="muted xsmall">×${w}</span></span><span class="bar-meter"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></span><span class="v">${v}</span></div>`).join('')}
          <div class="sc-bar"><span>Cutter discount <span class="muted xsmall">×4</span></span><span class="bar-meter"><i style="width:${Math.max(0, Math.min(100, sc.cutterDisc * 10))}%"></i></span><span class="v">${U.pct(sc.cutterDisc, 1)}</span></div>
        </div></div>
        <details class="disclosure" style="margin-top:12px"><summary>How this score is calculated</summary><div class="disclosure-b">${METHOD}</div></details></div>`
      : `<div class="notice" style="margin-bottom:16px">${U.icon('info', 'icon-sm')}<span>${U.esc(town)} doesn't have a buyer-leverage score: scores require 10+ closed sales with a price cut and 30+ total closings in 12 months.</span></div>`}
      <section class="section" style="margin-top:0"><div class="section-h"><h2>Active market</h2><span class="meta">${UI.src('mls')} Residential listings right now</span></div>
        ${ts ? `<div class="metrics">
          ${UI.metric({ label: 'Active listings', value: U.int(ts.active_count), meta: 'Residential (non-commercial)' })}
          ${UI.metric({ label: 'Median asking price', value: U.moneyShort(ts.median_price), meta: `n = ${U.int(ts.active_count)}` })}
          ${UI.metric({ label: 'Median days on market', value: U.int(ts.median_dom) })}
          ${UI.metric({ label: 'Listings with a price cut', value: ts.pct_with_cut + '%', meta: 'Tracked cuts since tracking began' })}
          ${ts.cut_again_30_pct != null ? UI.metric({ label: 'Cut again within 30 days', value: ts.cut_again_30_pct + '%', meta: 'Share of cutters with a 2nd cut ≤ 30 days', tip: 'Of listings that cut once, the share that cut again within 30 days.' }) : ''}
        </div>` : UI.state('No active listings tracked', '', 'list')}</section>
      <section class="section"><div class="section-h"><h2>Closed sales — last 12 months</h2><span class="meta">${UI.src('mls')} $200K+, non-commercial</span></div>
        ${to ? `<div class="metrics">
          ${UI.metric({ label: 'Closed sales', value: U.int(to.sold_count) })}
          ${UI.metric({ label: 'Median sale price', value: U.moneyShort(to.median_close), meta: `n = ${U.int(to.sold_count)}` })}
          ${UI.metric({ label: 'Median list-to-close', value: U.int(to.median_days_to_close) + ' days' })}
          ${UI.metric({ label: 'Sold at or over ask', value: to.pct_at_or_over_ask + '%', meta: to.pct_at_or_over_ask >= 55 ? 'Seller-leaning market' : to.pct_at_or_over_ask <= 45 ? 'Buyer-leaning market' : 'Balanced market' })}
          ${UI.metric({ label: 'Median sale vs. ask', value: U.pct(to.median_sold_vs_list, 1, true) })}
          ${ce ? UI.metric({ label: 'Cut homes at/over ask', value: ce.cut_over_ask_pct + '%', delta: { v: ce.edge_over_ask_pp, text: (ce.edge_over_ask_pp > 0 ? '+' : '') + ce.edge_over_ask_pp + ' pts', label: 'vs. homes without a cut', invert: true }, meta: `n = ${U.int(ce.cut_n)} cut sales (shrunk toward county)` }) : ''}
        </div><div class="card card-pad" style="margin-top:12px"><h3 style="font-size:14px;margin-bottom:8px">MLS closings by month</h3><div id="twMlsChart">${UI.skeletonRows(1)}</div></div>`
        : UI.state('Fewer than 10 closed sales in 12 months', 'Sold-market statistics are hidden below that sample size.', 'file')}</section>
      <section class="section"><div class="section-h"><h2>Recorded deed sales</h2><span class="meta">${UI.src('pr')} ${muni ? U.esc(muni.scope_label) + ' · NJ SR-1A' : 'No matching municipality'}</span></div>
        ${muni && pw.w12 ? `<div class="metrics">
          ${UI.metric({ label: 'Recorded sales, 12 months', value: U.int(pw.w12.res_n), meta: 'Usable arm’s-length, 1–4 family' })}
          ${UI.metric({ label: 'Median recorded price', value: U.moneyShort(pw.w12.res_median), delta: yoy != null ? { v: yoy, label: 'YTD vs. 2025' } : null })}
          ${UI.metric({ label: 'Median $ per sq ft', value: pw.w12.res_med_ppsf ? '$' + U.int(pw.w12.res_med_ppsf) : '—' })}
          ${UI.metric({ label: 'Dollar volume', value: U.moneyShort(pw.w12.res_volume) })}
        </div><div class="card card-pad" style="margin-top:12px"><h3 style="font-size:14px;margin-bottom:8px">Recorded sales by month</h3><div id="twPrChart"></div></div>`
        : `<p class="small muted">MLS town names are often postal names that don't map one-to-one to official municipalities, so recorded-sale statistics aren't shown for "${U.esc(town)}". <a href="${U.qs({ view: 'records', tab: 'towns', county: county || '' })}">Browse municipalities${county ? ' in ' + U.esc(county) + ' County' : ''}</a>.</p>`}</section>`;

    // Monthly charts
    if (to) {
      const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      q('mk:mlsm:' + town, () => App.fetchAll('listings', 'close_date,close_price', { order: 'close_date', asc: true, tiebreak: 'id', max: 6000,
        filter: (x) => x.eq('status', 'Closed').eq('city', town).gte('close_price', 50000).gte('close_date', since) }))
        .then((rows) => {
          const by = {};
          for (const r of rows) (by[r.close_date.slice(0, 7)] ??= []).push(r.close_price);
          const keys = Object.keys(by).sort();
          UI.chart(U.$('#twMlsChart', el), { title: 'MLS closings by month, ' + town, labels: keys.map((k) => U.date(k + '-15', 'month')), bars: keys.map((k) => by[k].length),
            line: keys.map((k) => (by[k].length >= 3 ? U.median(by[k]) : null)), barName: 'Closings', lineName: 'Median sale (months with 3+ sales)', height: 220 });
        }).catch(() => { U.$('#twMlsChart', el).innerHTML = UI.state('Chart unavailable', '', 'chart'); });
    }
    if (muni && pw.w12) {
      q('prm:' + muni.scope_id, () => App.sb.from('pr_town_stats').select('ym,res_n,res_median').eq('muni_code', muni.scope_id).order('ym')).then(({ data }) => {
        const ms = (data || []).slice(-18);
        UI.chart(U.$('#twPrChart', el), { title: 'Recorded sales by month, ' + muni.scope_label, labels: ms.map((x) => U.date(x.ym + '-15', 'month')), bars: ms.map((x) => x.res_n),
          line: ms.map((x) => (x.res_n >= 3 ? x.res_median : null)), barName: 'Recorded sales', lineName: 'Median price (months with 3+ sales)', height: 220 });
      }).catch(() => {});
    }
  }

  /* -------------------------------------------------------------- compare */
  async function renderCompare(towns) {
    towns = [...new Set(towns)].slice(0, 4);
    App.store.set('cmpTowns', towns);
    el.innerHTML = `<div class="page">${header('compare')}
      <div class="card card-pad"><div class="row" style="align-items:flex-end">
        <div class="field" style="flex:1;min-width:220px"><label for="cpTown">Add a town (up to 4)</label><input class="input" id="cpTown" list="cpTownList" placeholder="Start typing a town name" ${towns.length >= 4 ? 'disabled' : ''}><datalist id="cpTownList"></datalist></div>
        <button type="button" class="btn btn-primary" id="cpAdd" ${towns.length >= 4 ? 'disabled' : ''}>${U.icon('plus', 'icon-sm')}Add</button></div>
        <div class="chips" style="margin-top:12px">${towns.map((t) => `<span class="chip">${U.esc(t)}<button type="button" data-rm="${U.esc(t)}" aria-label="Remove ${U.esc(t)}">${U.icon('x', 'icon-sm')}</button></span>`).join('') || '<span class="muted small">Pick two to four towns to compare them side by side on the same metrics and time periods.</span>'}</div>
        <div class="field-err" id="cpErr" role="alert"></div></div>
      <div class="section" id="cpTable">${towns.length >= 2 ? UI.skeletonRows(6) : ''}</div></div>`;
    const ts = await townStats().catch(() => []);
    U.$('#cpTownList', el).innerHTML = ts.filter((t) => t.city).sort((a, b) => a.city.localeCompare(b.city)).map((t) => `<option value="${U.esc(t.city)}">`).join('');
    const add = () => {
      const v = U.$('#cpTown', el).value.trim();
      const m = ts.find((t) => t.city.toLowerCase() === v.toLowerCase());
      if (!m) { U.$('#cpErr', el).textContent = 'Choose a town from the list.'; return; }
      if (towns.includes(m.city)) { U.$('#cpErr', el).textContent = m.city + ' is already in the comparison.'; return; }
      App.go(U.qs({ view: 'markets', compare: towns.concat(m.city).join('|') }));
    };
    U.$('#cpAdd', el).addEventListener('click', add);
    U.$('#cpTown', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    el.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) App.go(U.qs({ view: 'markets', compare: towns.filter((t) => t !== b.dataset.rm).join('|') })); };
    if (towns.length < 2) return;

    const [data, s] = await Promise.all([Promise.all(towns.map(townData)), scored().catch(() => ({ rows: [] }))]);
    const scoreOf = (t) => { const i = s.rows.findIndex((r) => r.area === t); return i >= 0 ? s.rows[i] : null; };
    const best = (vals, dir) => { const v = vals.filter((x) => x != null && !isNaN(x)); if (v.length < 2 || !dir) return null; return dir === 'min' ? Math.min(...v) : Math.max(...v); };
    const row = (label, get, fmt, dir, tip) => {
      const vals = data.map(get), b = best(vals, dir);
      return `<tr><th scope="row">${U.esc(label)}${tip ? ' ' + U.info(tip) : ''}</th>${vals.map((v) => `<td class="${b != null && v === b ? 'best' : ''}">${v == null || (typeof v === 'number' && isNaN(v)) ? '<span class="muted">—</span>' : fmt(v)}</td>`).join('')}</tr>`;
    };
    const grp = (t) => `<tr class="grp"><td colspan="${data.length + 1}">${t}</td></tr>`;
    const yoy = (d) => (d.pw.ytd26 && d.pw.sp25 && d.pw.sp25.res_median ? ((d.pw.ytd26.res_median - d.pw.sp25.res_median) / d.pw.sp25.res_median) * 100 : null);
    U.$('#cpTable', el).innerHTML = `<div class="card" style="overflow-x:auto"><table class="cmp-table" style="width:100%;min-width:${200 + data.length * 150}px">
      <caption class="sr-only">Town comparison</caption>
      <thead><tr><th scope="col">Metric</th>${data.map((d) => `<th scope="col"><a href="${U.qs({ view: 'markets', town: d.town })}">${U.esc(d.town)}</a><div class="small muted" style="font-weight:500">${U.esc(d.county || '')}</div></th>`).join('')}</tr></thead><tbody>
      ${grp('Buyer leverage ' + UI.src('calc'))}
      ${row('Leverage score', (d) => scoreOf(d.town)?.score ?? null, (v) => U.int(v), 'max', 'Higher means more buyer leverage. Only towns meeting the sample gates are scored.')}
      ${grp('Active market (MLS, now) ' + UI.src('mls'))}
      ${row('Active listings', (d) => d.ts?.active_count ?? null, U.int)}
      ${row('Median asking price', (d) => d.ts?.median_price ?? null, U.money)}
      ${row('Median days on market', (d) => d.ts?.median_dom ?? null, U.int, 'max')}
      ${row('Listings with a price cut', (d) => d.ts?.pct_with_cut ?? null, (v) => v + '%', 'max')}
      ${row('Cut again within 30 days', (d) => d.ts?.cut_again_30_pct ?? null, (v) => v + '%', 'max')}
      ${grp('Closed sales, 12 months (MLS) ' + UI.src('mls'))}
      ${row('Closed sales', (d) => d.to?.sold_count ?? null, U.int)}
      ${row('Median sale price', (d) => d.to?.median_close ?? null, U.money)}
      ${row('Median list-to-close (days)', (d) => d.to?.median_days_to_close ?? null, U.int, 'max')}
      ${row('Sold at or over ask', (d) => d.to?.pct_at_or_over_ask ?? null, (v) => v + '%', 'min')}
      ${row('Median sale vs. ask', (d) => (d.to ? +d.to.median_sold_vs_list : null), (v) => U.pct(v, 1, true), 'min')}
      ${row('Cut homes: at/over ask', (d) => d.ce?.cut_over_ask_pct ?? null, (v) => v + '%', 'min')}
      ${row('Cut-home gap vs. baseline', (d) => d.ce?.edge_over_ask_pp ?? null, (v) => (v > 0 ? '+' : '') + v + ' pts', 'min')}
      ${grp('Recorded deed sales, 12 months (NJ SR-1A) ' + UI.src('pr'))}
      ${row('Matched municipality', (d) => d.muni?.scope_label || null, U.esc)}
      ${row('Recorded sales', (d) => d.pw.w12?.res_n ?? null, U.int)}
      ${row('Median recorded price', (d) => d.pw.w12?.res_median ?? null, U.money)}
      ${row('Median $ per sq ft', (d) => d.pw.w12?.res_med_ppsf ?? null, (v) => '$' + U.int(v))}
      ${row('Median price YoY (YTD)', yoy, (v) => U.pct(v, 1, true))}
      </tbody></table></div>
      <p class="small muted" style="margin-top:10px">● marks the value most favorable to a <b>buyer</b> where one applies. All MLS metrics use the same 12-month window; "—" means the town is below the sample threshold or has no matching municipality.</p>`;
  }
})();

/* Deal Screener: capitulation scores + empirical bid guidance (deal_scores).
   Scoring is computed by the poller and unchanged; this view exposes the
   factors behind each score instead of a bare number. */
(function () {
  'use strict';
  const App = window.App, U = App.u, UI = App.ui, WS = App.ws;
  let el, rows = null;
  const st = { cls: 'all', county: 'all', town: 'all', subtype: 'all', grade: 'all', minp: '0', maxp: '0', acres: '0', senior: 'any', zoning: '', sort: 'score' };
  const DEF = { ...st };
  const GRADES = [['all', 'Any grade'], ['80', 'A+ only'], ['68', 'A or better'], ['56', 'B+ or better'], ['44', 'B or better']];
  const SORTS = [['score', 'Score'], ['savings', 'Estimated $ savings'], ['slide', 'Expected discount %'], ['price', 'Price (low to high)'], ['dom', 'Days on market']];
  const CLASSES = [['all', 'All'], ['Residential', 'Residential'], ['Multi-Family', 'Multi-family'], ['Land/Lots', 'Land'], ['Commercial', 'Commercial']];

  App.registerView('deals', {
    title: 'Deal Screener',
    mount(host) {
      el = host;
      const sel = (id, label, opts, v) => `<select class="select" id="${id}" aria-label="${label}">${opts.map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${U.esc(t)}</option>`).join('')}</select>`;
      el.innerHTML = `<div class="page">
        <div class="page-head"><div><div class="eyebrow">${U.icon('target', 'icon-sm')}Analyze <span class="badge badge-beta">Beta</span></div><h1 class="page-title">Deal Screener</h1>
          <p class="page-sub">Active listings where the seller is measurably capitulating. Each score shows the factors behind it, and bid guidance is the <b>actual close range</b> of past sellers in the same situation — not an appraisal.</p></div></div>
        <details class="disclosure" style="margin-bottom:16px"><summary>${U.icon('info', 'icon-sm')}How scores and bid guidance are calculated</summary><div class="disclosure-b">
          ${App.dealMethod()}
          <p><b>Expected close</b> = current ask × the discount that past sellers with the same number of cuts actually accepted, shown as the middle half (25th–75th percentile) of outcomes with the cohort size. Guidance appears only when the cohort has 20+ graded closings. Every expected-close figure is stored and graded against the actual sale price as listings close.</p>
          <p>Estimates only — not an appraisal, offer, or financial advice.</p></div></details>
        <div class="filterbar" id="dfBar" role="group" aria-label="Deal filters">
          <div class="seg" role="group" aria-label="Property class">${CLASSES.map(([k, t]) => `<button type="button" data-cls="${k}" aria-pressed="${k === 'all'}">${U.esc(t)}</button>`).join('')}</div>
          ${sel('dfCounty', 'County', [['all', 'All counties']], 'all')}
          ${sel('dfTown', 'Town', [['all', 'All towns']], 'all')}
          ${sel('dfSubtype', 'Property type', [['all', 'All types']], 'all')}
          ${sel('dfGrade', 'Minimum grade', GRADES, 'all')}
          ${sel('dfMinP', 'Minimum price', [['0', 'Min price'], ['100000', '$100K'], ['200000', '$200K'], ['400000', '$400K'], ['700000', '$700K'], ['1000000', '$1M']], '0')}
          ${sel('dfMaxP', 'Maximum price', [['0', 'Max price'], ['200000', '$200K'], ['400000', '$400K'], ['700000', '$700K'], ['1000000', '$1M'], ['2000000', '$2M']], '0')}
          ${sel('dfAcres', 'Lot size', [['0', 'Any lot'], ['0.25', '0.25+ acres'], ['0.5', '0.5+ acres'], ['1', '1+ acres'], ['2', '2+ acres'], ['5', '5+ acres']], '0')}
          ${sel('dfSenior', '55+ communities', [['any', '55+: include'], ['exclude', 'Exclude 55+'], ['only', 'Only 55+']], 'any')}
          <input class="input" id="dfZoning" placeholder="Zoning contains…" aria-label="Zoning contains" style="width:170px">
          ${sel('dfSort', 'Sort by', SORTS.map(([k, t]) => [k, 'Sort: ' + t]), 'score')}
          <button type="button" class="btn btn-ghost btn-sm" id="dfReset">Reset</button>
          <span class="count" id="dfCount" aria-live="polite"></span>
        </div>
        <div class="card section" id="dfList" style="margin-top:16px">${UI.skeletonRows(6)}</div>
        <p class="small muted" style="margin-top:12px" id="dfFoot"></p>
      </div>`;
      const bar = U.$('#dfBar', el);
      bar.addEventListener('click', (e) => {
        const c = e.target.closest('[data-cls]'); if (c) { st.cls = c.dataset.cls; sync(); }
        if (e.target.closest('#dfReset')) { Object.assign(st, DEF); pushControls(); sync(); }
      });
      const map = { dfCounty: 'county', dfTown: 'town', dfSubtype: 'subtype', dfGrade: 'grade', dfMinP: 'minp', dfMaxP: 'maxp', dfAcres: 'acres', dfSenior: 'senior', dfSort: 'sort' };
      bar.addEventListener('change', (e) => { const k = map[e.target.id]; if (k) { st[k] = e.target.value; sync(); } });
      U.$('#dfZoning', el).addEventListener('input', U.debounce((e) => { st.zoning = e.target.value.trim(); sync(); }, 200));
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-dact]'); if (!b) return;
        const r = rows.find((x) => x.listing_id === b.dataset.id); if (!r) return;
        const obj = { id: r.listing_id, address: r.address, street: (r.address || '').split(',')[0], city: r.city, price: r.ask };
        if (b.dataset.dact === 'save') WS.toggleSave(obj); else WS.toggleCompare(obj);
        apply();
      });
    },
    async show(host, sp) {
      Object.assign(st, DEF);
      for (const k of Object.keys(DEF)) if (sp.get(k) != null) st[k] = sp.get(k);
      if (!rows) {
        try {
          rows = await App.cached('deals:all', () => App.fetchAll('deal_scores', '*', { order: 'score', tiebreak: 'listing_id', max: 4000 }));
          const opts = (id, vals, label) => { U.$('#' + id, el).innerHTML = `<option value="all">${label}</option>` + vals.map((v) => `<option value="${U.esc(v)}">${U.esc(v)}</option>`).join(''); };
          opts('dfCounty', [...new Set(rows.map((d) => d.county).filter((c) => c && c !== 'Unknown'))].sort(), 'All counties');
          opts('dfTown', [...new Set(rows.map((d) => d.city).filter(Boolean))].sort(), 'All towns');
          opts('dfSubtype', [...new Set(rows.map((d) => d.property_type).filter(Boolean))].sort(), 'All types');
          const fresh = rows.reduce((m, r) => (r.computed_at > m ? r.computed_at : m), '');
          U.$('#dfFoot', el).innerHTML = `${UI.src('est')} Scores recomputed with every MLS refresh${fresh ? ' · last ' + U.esc(U.dateTime(fresh)) : ''}. ${U.int(rows.length)} scored listings (active listings with at least one tracked price cut).`;
        } catch (e) {
          U.$('#dfList', el).innerHTML = UI.state('Deal scores unavailable', 'Check back after the next data refresh.', 'alert', true);
          return;
        }
      }
      pushControls();
      apply();
    },
  });

  function pushControls() {
    U.$$('[data-cls]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cls === st.cls)));
    const set = (id, v) => { const s = U.$('#' + id, el); if ([...s.options].some((o) => o.value === v)) s.value = v; };
    set('dfCounty', st.county); set('dfTown', st.town); set('dfSubtype', st.subtype); set('dfGrade', st.grade);
    set('dfMinP', st.minp); set('dfMaxP', st.maxp); set('dfAcres', st.acres); set('dfSenior', st.senior); set('dfSort', st.sort);
    if (document.activeElement !== U.$('#dfZoning', el)) U.$('#dfZoning', el).value = st.zoning;
  }
  function sync() {
    pushControls();
    const q = { view: 'deals' };
    for (const k of Object.keys(DEF)) if (st[k] !== DEF[k]) q[k] = st[k];
    App.replaceParams(U.qs(q));
    apply();
  }

  function apply() {
    if (!rows) return;
    const minScore = st.grade === 'all' ? 0 : +st.grade, minP = +st.minp, maxP = +st.maxp, minAc = +st.acres, z = st.zoning.toLowerCase();
    const out = rows.filter((d) =>
      (st.cls === 'all' || d.property_class === st.cls)
      && (st.county === 'all' || d.county === st.county)
      && (st.town === 'all' || d.city === st.town)
      && (st.subtype === 'all' || d.property_type === st.subtype)
      && d.score >= minScore && (!minP || d.ask >= minP) && (!maxP || d.ask <= maxP)
      && (!minAc || (d.lot_acres != null && +d.lot_acres >= minAc))
      && (st.senior === 'any' || (st.senior === 'only' ? d.senior_community === true : d.senior_community !== true))
      && (!z || (d.zoning || '').toLowerCase().includes(z)));
    const s = st.sort;
    out.sort((a, b) => s === 'savings' ? (b.est_savings || 0) - (a.est_savings || 0)
      : s === 'slide' ? (b.expected_slide_pct || 0) - (a.expected_slide_pct || 0)
      : s === 'price' ? a.ask - b.ask : s === 'dom' ? (b.dom || 0) - (a.dom || 0) : b.score - a.score);
    U.$('#dfCount', el).textContent = U.int(out.length) + ' ' + U.plural(out.length, 'deal') + (out.length > 100 ? ' · showing top 100' : '');
    const list = U.$('#dfList', el);
    if (!out.length) { list.innerHTML = UI.state('No deals match these filters', 'Loosen the grade or price filters, or reset.', 'search'); return; }
    list.innerHTML = out.slice(0, 100).map(card).join('');
  }

  function card(d) {
    const street = (d.address || '').split(',')[0];
    const specs = [d.city + (d.county && d.county !== 'Unknown' ? ' · ' + d.county : ''), d.bedrooms ? d.bedrooms + ' bd' : '', d.bathrooms ? d.bathrooms + ' ba' : '',
      d.sqft ? U.int(d.sqft) + ' sq ft' : '', d.lot_acres > 0 ? (+d.lot_acres).toFixed(2) + ' ac' : '', d.property_type || '', d.senior_community ? '55+' : '', d.zoning ? 'Zoning (listing): ' + d.zoning : ''].filter(Boolean).join(' · ');
    const saved = WS.isSaved(d.listing_id), cmp = WS.inCompare(d.listing_id);
    const href = U.qs({ view: 'property', id: d.listing_id });
    return `<article class="dcard" aria-labelledby="dt-${U.esc(d.listing_id)}">
      <div><div class="grade ${U.gradeCls(d.grade)}" aria-label="Grade ${U.esc(d.grade)}">${U.esc(d.grade)}</div><div class="small muted num" style="text-align:center;margin-top:4px">${U.int(d.score)}/100</div></div>
      <div style="min-width:0">
        <div class="dcard-t" id="dt-${U.esc(d.listing_id)}"><a href="${href}">${U.esc(street)}</a></div>
        <div class="dcard-s">${U.esc(specs)}</div>
        <div class="factor-list" aria-label="Score factors">${(d.reasons || []).map((r) => `<span class="badge">${U.icon('check')}${U.esc(r)}</span>`).join('')}${(d.motivation_tags || []).map((t) => `<span class="badge badge-amber">${U.esc(t)}</span>`).join('')}</div>
        <div class="row small" style="margin-top:10px;gap:14px">
          <a href="${href}">${U.icon('building', 'icon-sm')} Property report</a>
          <a href="${U.qs({ view: 'comps', address: d.address, sqft: d.sqft || '', beds: d.bedrooms || '' })}">${U.icon('scale', 'icon-sm')} Comparables</a>
          <a href="${U.qs({ view: 'sales', town: d.city })}">${U.icon('file', 'icon-sm')} ${U.esc(d.city)} sales</a>
          <button type="button" class="link-btn" data-dact="save" data-id="${U.esc(d.listing_id)}" aria-pressed="${saved}">${U.icon('bookmark', 'icon-sm')} ${saved ? 'Saved' : 'Save'}</button>
          <button type="button" class="link-btn" data-dact="cmp" data-id="${U.esc(d.listing_id)}" aria-pressed="${cmp}">${U.icon('compare', 'icon-sm')} ${cmp ? 'In compare' : 'Compare'}</button>
        </div>
      </div>
      <div class="dcard-r">
        <div class="ask">Ask <b>${U.money(d.ask)}</b></div>
        ${d.expected_close ? `<div class="exp">Expected close <b>${U.money(d.expected_close)}</b></div>
          <div class="small muted">Range ${U.money(d.expected_low)} – ${U.money(d.expected_high)}</div>
          ${d.est_savings > 0 ? `<div class="small pos">${U.icon('trend-down', 'icon-sm')} ${U.money(d.est_savings)} below ask (${U.pct(d.expected_slide_pct)})</div>` : ''}
          <div class="xsmall muted" style="margin-top:4px">Based on ${U.int(d.cohort_n)} closed ${Math.min(3, d.cut_count)}${d.cut_count >= 3 ? '+' : ''}-cut sellers${d.cut_again_pct != null ? ' · ' + d.cut_again_pct + '% cut again' : ''}</div>`
        : '<div class="small muted">Not enough comparable outcomes for bid guidance</div>'}
        <div class="xsmall muted">${d.dom != null ? U.int(d.dom) + ' days on market' : ''}${d.days_since_cut != null ? ' · last cut ' + U.int(d.days_since_cut) + 'd ago' : ''}</div>
      </div></article>`;
  }
})();

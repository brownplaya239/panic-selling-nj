/* Listings & Price Drops: map-first split view, virtualized results, URL-synced
   filters with removable chips, quick-preview drawer, contextual save/alerts. */
(function () {
  'use strict';
  const App = window.App, U = App.u, UI = App.ui, L = App.listings, WS = App.ws;
  const PRICES = [100000, 200000, 300000, 400000, 500000, 600000, 750000, 1000000, 1500000, 2000000, 3000000];

  let el, data = null, p = { ...L.DEFAULTS, sort: 'dom' }, lastKey = '';
  let filtered = [], shown = [];
  let map = null, cluster = null, markers = new Map(), boundsOn = false, hoverId = null, activeId = null;
  let rt = null;
  const mobile = () => matchMedia('(max-width: 1100px)').matches;
  let mode = App.store.raw('lvMode') || 'split';
  let mobileMode = 'list';

  const cardH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lcard-h')) || 120;

  App.registerView('listings', {
    title: (sp) => (sp.get('seg') === 'drops' ? 'Price Drops' : 'Active Listings') + (sp.get('town') ? ' in ' + sp.get('town') : ''),
    mount(host) {
      el = host;
      el.innerHTML = `
      <div class="lv">
        <div class="lv-toolbar">
          <div class="lv-row">
            <h1 class="lv-title">Listings &amp; Price Drops</h1>
            <div class="seg" role="group" aria-label="Listing segment">
              <button type="button" data-seg="all" aria-pressed="true">All active <span class="seg-n" id="nAll"></span></button>
              <button type="button" data-seg="drops" aria-pressed="false">Price drops <span class="seg-n" id="nDrops"></span></button>
            </div>
            <span class="grow"></span>
            <button type="button" class="btn btn-secondary btn-sm lv-filter-toggle" id="lvFiltBtn" aria-expanded="false" aria-controls="lvFilters">${U.icon('sliders', 'icon-sm')}Filters</button>
            <button type="button" class="btn btn-secondary btn-sm" id="lvSave">${U.icon('bookmark', 'icon-sm')}<span class="hide-sm">Save search</span></button>
            <button type="button" class="btn btn-primary btn-sm" id="lvAlert">${U.icon('bell', 'icon-sm')}<span class="hide-sm">Get alerts</span></button>
            <div class="seg lv-desktop-mode" role="group" aria-label="Layout">
              <button type="button" data-mode="list" aria-pressed="false" aria-label="List only">${U.icon('list', 'icon-sm')}</button>
              <button type="button" data-mode="split" aria-pressed="true" aria-label="List and map">${U.icon('split', 'icon-sm')}</button>
              <button type="button" data-mode="map" aria-pressed="false" aria-label="Map only">${U.icon('map', 'icon-sm')}</button>
            </div>
            <div class="seg lv-mobile-toggle" role="group" aria-label="Show list or map">
              <button type="button" data-mmode="list" aria-pressed="true">${U.icon('list', 'icon-sm')}List</button>
              <button type="button" data-mmode="map" aria-pressed="false">${U.icon('map', 'icon-sm')}Map</button>
            </div>
          </div>
          <div class="lv-filters" id="lvFilters" role="group" aria-label="Filters">
            <div class="input-group" style="min-width:210px"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-search"/></svg><input class="input" id="fQ" type="search" placeholder="Address, town, or ZIP" aria-label="Filter by address, town, or ZIP"></div>
            <select class="select w-type" id="fType" aria-label="Property type"><option value="all">All types</option>${L.TYPE_GROUPS.map((g) => `<option value="${g.key}">${U.esc(g.label)}</option>`).join('')}</select>
            <select class="select w-beds" id="fBeds" aria-label="Minimum bedrooms"><option value="any">Any beds</option>${[1, 2, 3, 4, 5, 6].map((b) => `<option value="${b}">${b}+ beds</option>`).join('')}</select>
            <span class="lv-price"><select class="select w-price" id="fMinP" aria-label="Minimum price"><option value="">Min price</option>${PRICES.map((v) => `<option value="${v}">${U.moneyShort(v)}</option>`).join('')}</select>
              <span class="muted" aria-hidden="true">–</span>
              <select class="select w-price" id="fMaxP" aria-label="Maximum price"><option value="">Max price</option>${PRICES.map((v) => `<option value="${v}">${U.moneyShort(v)}</option>`).join('')}</select></span>
            <select class="select w-town" id="fTown" aria-label="Town"><option value="all">All towns</option></select>
            <div class="pop-wrap">
              <button type="button" class="btn btn-secondary btn-sm" id="fMoreBtn" aria-haspopup="true" aria-expanded="false" aria-controls="fMore" style="height:34px">${U.icon('sliders', 'icon-sm')}More <span class="badge badge-teal" id="fMoreN" hidden style="height:18px"></span></button>
              <div class="menu" id="fMore" hidden style="min-width:280px;padding:14px;left:0;right:auto">
                <div class="stack" style="gap:12px">
                  <div class="field"><label for="fCounty">County</label><select class="select" id="fCounty"><option value="all">All counties</option></select></div>
                  <div class="field"><label for="fDom">Days on market</label><select class="select" id="fDom"><option value="any">Any</option>${Object.entries(L.DOMS).map(([k, v]) => `<option value="${k}">${v[2]}</option>`).join('')}</select></div>
                  <label class="check small"><input type="checkbox" id="fReduced"> Reduced from original list price</label>
                </div>
              </div>
            </div>
            <select class="select w-sort" id="fSort" aria-label="Sort by">${Object.entries(L.SORTS).map(([k, s]) => `<option value="${k}">Sort: ${U.esc(s.label)}</option>`).join('')}</select>
          </div>
          <div class="lv-chipbar" id="lvChips"></div>
        </div>
        <div class="lv-body mode-split" id="lvBody">
          <div class="lv-listcol">
            <div class="lv-meta" id="lvMeta" aria-live="polite"><span class="skel skel-line" style="width:260px;margin:0"></span></div>
            <div class="lv-townbar" id="lvTown" hidden></div>
            <div class="lv-scroll" id="lvScroll">
              <div class="lv-vwrap" id="lvV"><div class="lv-vrows" id="lvRows" role="list" aria-label="Listing results"></div></div>
            </div>
          </div>
          <div class="lv-map" aria-label="Map of results">
            <div id="lvMap"></div>
            <div class="lv-map-ctl"><label class="map-pill"><input type="checkbox" id="lvBounds"> Search as I move the map</label></div>
            <div class="lv-legend" aria-hidden="true"><span><i style="background:var(--map-marker)"></i>Active listing</span><span><i style="background:var(--map-marker-cut)"></i>Tracked price cut</span></div>
          </div>
        </div>
      </div>`;
      bind();
    },

    async show(host, sp) {
      p = L.paramsFrom(sp);
      syncControls();
      applyMode();
      if (!data) {
        renderSkeleton();
        try {
          data = await L.load();
          buildGeoOptions();
          syncControls();
          subscribeRealtime();
        } catch (e) {
          U.$('#lvRows', el).innerHTML = UI.state('Listings could not load', U.esc(e.message || 'Database error') + '. Please refresh.', 'alert', true);
          U.$('#lvMeta', el).textContent = '';
          return;
        }
      }
      const key = JSON.stringify(p);
      if (key !== lastKey) { lastKey = key; apply(true); }
      else if (map) setTimeout(() => map.invalidateSize(), 50);
      renderTownBar();
    },
  });

  /* -------------------------------------------------------------- binding */
  function bind() {
    const $ = (s) => U.$(s, el);
    $('.lv-toolbar').addEventListener('click', (e) => {
      const s = e.target.closest('[data-seg]');
      if (s && s.dataset.seg !== p.seg) {
        const wasDefault = p.sort === L.defaultSort(p.seg);
        p.seg = s.dataset.seg;
        if (wasDefault) p.sort = L.defaultSort(p.seg);
        commit();
      }
      const m = e.target.closest('[data-mode]');
      if (m) { mode = m.dataset.mode; App.store.raw('lvMode', mode); applyMode(); }
      const mm = e.target.closest('[data-mmode]');
      if (mm) { mobileMode = mm.dataset.mmode; applyMode(); }
      const rm = e.target.closest('[data-rmchip]');
      if (rm) {
        const k = rm.dataset.rmchip;
        if (k === 'price') { p.minp = ''; p.maxp = ''; }
        else if (k === 'seg') { p.seg = 'all'; p.sort = L.defaultSort('all'); }
        else p[k] = L.DEFAULTS[k];
        if (k === 'county') p.town = 'all';
        commit();
      }
      if (e.target.closest('[data-clearall]')) { p = { ...L.DEFAULTS, seg: p.seg, sort: L.defaultSort(p.seg) }; commit(); }
    });
    const mb = $('#fMoreBtn'), mm = $('#fMore');
    mb.addEventListener('click', (e) => { e.stopPropagation(); mm.hidden = !mm.hidden; mb.setAttribute('aria-expanded', String(!mm.hidden)); });
    mm.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { if (!mm.hidden) { mm.hidden = true; mb.setAttribute('aria-expanded', 'false'); } });
    mm.addEventListener('keydown', (e) => { if (e.key === 'Escape') { mm.hidden = true; mb.setAttribute('aria-expanded', 'false'); mb.focus(); } });
    $('#lvFiltBtn').addEventListener('click', () => {
      const f = $('#lvFilters'); const open = !f.classList.contains('is-open');
      f.classList.toggle('is-open', open); $('#lvFiltBtn').setAttribute('aria-expanded', String(open));
    });
    const on = (id, key, ev = 'change') => $(id).addEventListener(ev, (e) => {
      p[key] = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value;
      if (key === 'county') { p.town = 'all'; buildTownOptions(); }
      commit();
    });
    on('#fType', 'type'); on('#fBeds', 'beds'); on('#fMinP', 'minp'); on('#fMaxP', 'maxp'); on('#fDom', 'dom');
    on('#fCounty', 'county'); on('#fTown', 'town'); on('#fSort', 'sort'); on('#fReduced', 'reduced');
    $('#fQ').addEventListener('input', U.debounce((e) => { p.q = e.target.value.trim(); commit(); }, 220));
    $('#lvSave').addEventListener('click', () => WS.saveSearch({ ...p }));
    $('#lvAlert').addEventListener('click', () => App.alertsDialog.open({ params: { ...p } }));

    const sc = $('#lvScroll');
    let raf = false;
    sc.addEventListener('scroll', () => { if (raf) return; raf = true; requestAnimationFrame(() => { raf = false; renderRows(); }); }, { passive: true });
    window.addEventListener('resize', U.debounce(() => { if (isActive()) { renderRows(); map?.invalidateSize(); applyMode(); } }, 120));
    document.addEventListener('density:change', () => { if (data) { sizeList(); renderRows(); } });

    const rows = $('#lvRows');
    rows.addEventListener('click', (e) => {
      if (e.target.closest('[data-clearall]')) { p = { ...L.DEFAULTS, seg: p.seg, sort: L.defaultSort(p.seg) }; commit(); return; }
      const card = e.target.closest('.lcard'); if (!card) return;
      const r = data.byId.get(card.dataset.id); if (!r) return;
      const act = e.target.closest('[data-act]');
      if (act) {
        e.preventDefault(); e.stopPropagation();
        if (act.dataset.act === 'save') WS.toggleSave(r);
        if (act.dataset.act === 'cmp') WS.toggleCompare(r);
        renderRows();
        return;
      }
      if (e.target.closest('a')) return;
      preview(r);
    });
    rows.addEventListener('keydown', (e) => {
      const card = e.target.closest('.lcard'); if (!card || e.target !== card) return;
      const i = +card.dataset.idx;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); preview(data.byId.get(card.dataset.id)); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); focusIdx(i + (e.key === 'ArrowDown' ? 1 : -1)); }
    });
    rows.addEventListener('mouseover', (e) => { const c = e.target.closest('.lcard'); if (c && c.dataset.id !== hoverId) hover(c.dataset.id); });
    rows.addEventListener('mouseleave', () => hover(null));
    $('#lvBounds').addEventListener('change', (e) => { boundsOn = e.target.checked; apply(false); });
    document.addEventListener('ws:change', () => { if (data && isActive()) renderRows(); });
    document.addEventListener('drawer:close', () => { activeId = null; U.$$('.lcard.is-active', el).forEach((c) => c.classList.remove('is-active')); });
  }
  const isActive = () => el && el.classList.contains('is-active');

  function commit() {
    App.replaceParams(L.urlFor(p));
    lastKey = JSON.stringify(p);
    syncControls();
    apply(true);
    renderTownBar();
  }

  /* ------------------------------------------------------------ controls */
  function buildGeoOptions() {
    const counts = {};
    let none = 0;
    for (const r of data.rows) { if (r.county) counts[r.county] = (counts[r.county] || 0) + 1; else none++; }
    const order = Object.keys(counts).sort((a, b) => (App.MLS_COUNTIES.includes(b) - App.MLS_COUNTIES.includes(a)) || counts[b] - counts[a]);
    U.$('#fCounty', el).innerHTML = '<option value="all">All counties</option>'
      + order.map((c) => `<option value="${U.esc(c)}">${U.esc(c)} (${U.int(counts[c])})</option>`).join('')
      + (none ? `<option value="none">County not reported (${U.int(none)})</option>` : '');
    buildTownOptions();
  }
  function buildTownOptions() {
    if (!data) return;
    const counts = {};
    for (const r of data.rows) {
      if (p.county !== 'all' && (p.county === 'none' ? r.county : r.county !== p.county)) continue;
      if (r.city) counts[r.city] = (counts[r.city] || 0) + 1;
    }
    const towns = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    if (p.town !== 'all' && !counts[p.town]) towns.unshift(p.town);
    U.$('#fTown', el).innerHTML = '<option value="all">All towns</option>' + towns.map((t) => `<option value="${U.esc(t)}">${U.esc(t)}${counts[t] ? ' (' + counts[t] + ')' : ''}</option>`).join('');
  }
  function syncControls() {
    const $ = (s) => U.$(s, el);
    U.$$('[data-seg]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seg === p.seg)));
    $('#fQ').value = p.q || '';
    $('#fType').value = p.type; $('#fBeds').value = p.beds; $('#fMinP').value = p.minp || ''; $('#fMaxP').value = p.maxp || '';
    $('#fDom').value = p.dom; $('#fSort').value = p.sort; $('#fReduced').checked = !!p.reduced;
    if (data) { $('#fCounty').value = p.county; buildTownOptions(); $('#fTown').value = p.town; }
    const more = (p.county !== 'all' ? 1 : 0) + (p.dom !== 'any' ? 1 : 0) + (p.reduced ? 1 : 0);
    $('#fMoreN').hidden = !more; $('#fMoreN').textContent = more;
    const chips = L.chips(p);
    $('#lvChips').innerHTML = chips.length
      ? chips.map((c) => `<span class="chip">${U.esc(c.v)}<button type="button" data-rmchip="${c.k}" aria-label="Remove filter ${U.esc(c.v)}">${U.icon('x', 'icon-sm')}</button></span>`).join('')
        + `<button type="button" class="link-btn small" data-clearall>Clear all</button>`
      : '';
    $('#lvChips').hidden = !chips.length;
  }
  function applyMode() {
    const body = U.$('#lvBody', el);
    const m = mobile() ? mobileMode : mode;
    body.className = 'lv-body mode-' + m;
    U.$$('[data-mode]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    U.$$('[data-mmode]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mmode === mobileMode)));
    if (m !== 'list') ensureMap().then(() => setTimeout(() => { map.invalidateSize(); }, 30));
    if (m !== 'map') setTimeout(renderRows, 0);
  }

  /* --------------------------------------------------------------- apply */
  function apply(resetScroll) {
    if (!data) return;
    const base = L.filter(data.rows, { ...p, seg: 'all' });
    const nd = base.filter((r) => r.lastCut).length;
    U.$('#nAll', el).textContent = U.int(base.length);
    U.$('#nDrops', el).textContent = U.int(nd);
    filtered = p.seg === 'drops' ? base.filter((r) => r.lastCut) : base;
    L.sort(filtered, p.sort);
    shown = boundsOn && map ? filtered.filter((r) => r.lat != null && map.getBounds().contains([r.lat, r.lng])) : filtered;
    if (resetScroll) U.$('#lvScroll', el).scrollTop = 0;
    sizeList();
    renderRows();
    renderMeta();
    if (map && !boundsOn) syncMarkers();
    if (map && boundsOn && resetScroll) syncMarkers();
  }
  function sizeList() { U.$('#lvV', el).style.height = Math.max(shown.length * cardH(), 1) + 'px'; }

  function renderMeta() {
    const inferred = shown.filter((r) => r.countyInferred).length;
    App.mlsFreshness().catch(() => null).then((fresh) => {
      U.$('#lvMeta', el).innerHTML = `<span><b>${U.int(shown.length)}</b> ${p.seg === 'drops' ? 'listings with tracked price cuts' : 'active listings'}${boundsOn ? ' in map area' : ''} · ${U.esc(L.SORTS[p.sort]?.label || '')}</span>
        <span class="row" style="gap:10px">${UI.src('mls')}<span>${fresh ? 'Updated ' + U.esc(U.timeAgo(fresh)) : ''}</span>${inferred ? `<span data-tip="The MLS feed omits county on many listings. For ${U.int(inferred)} results shown, county was inferred from other listings in the same town." tabindex="0">${U.icon('info', 'icon-sm')} County inferred for ${U.int(inferred)}</span>` : ''}</span>`;
    });
  }

  function renderSkeleton() {
    U.$('#lvRows', el).innerHTML = Array.from({ length: 8 }, () => `<div class="lcard" aria-hidden="true"><div class="lc-main"><div class="skel skel-line" style="width:70%"></div><div class="skel skel-line" style="width:50%"></div><div class="skel skel-line" style="width:40%"></div></div><div class="lc-price"><div class="skel" style="height:18px;width:80px"></div></div></div>`).join('');
  }

  function cardHTML(r, i) {
    const specs = [
      r.beds != null ? `<b>${r.beds}</b> bd` : '', r.baths != null ? `<b>${r.baths}</b> ba` : '',
      r.sqft ? `<b>${U.int(r.sqft)}</b> sq ft` : '', U.esc(L.typeLabel(r.tg) === 'Other' ? r.ptype : L.typeLabel(r.tg)),
    ].filter(Boolean).join(' · ');
    const tags = [];
    if (r.dom != null) tags.push(`<span class="badge ${r.dom >= 180 ? 'badge-amber' : ''}">${U.icon('clock')}${U.int(r.dom)} days</span>`);
    if (r.lastCut) tags.push(`<span class="badge badge-amber">${U.icon('trend-down')}${r.cuts > 1 ? r.cuts + ' cuts' : 'Cut'} ${U.esc(U.date(r.lastCut.date, 'short'))}</span>`);
    if (r.ppsfGap != null && r.ppsfGap <= -10) tags.push(`<span class="badge badge-green">${Math.round(-r.ppsfGap)}% below town $/sq ft</span>`);
    else if (r.ppsfGap != null && r.ppsfGap >= 10) tags.push(`<span class="badge">${Math.round(r.ppsfGap)}% above town $/sq ft</span>`);
    if (r.isNew) tags.push('<span class="badge badge-teal">New</span>');
    const why = L.reasons(r, p)[0];
    const saved = WS.isSaved(r.id), cmp = WS.inCompare(r.id);
    const wasLine = r.orig && r.orig > r.price
      ? `<span class="lc-was">was <s>${U.moneyShort(r.orig)}</s></span><span class="lc-cut">${U.icon('trend-down', 'icon-sm')}−${U.moneyShort(r.cum)} (${U.pct(r.cumPct)})</span>`
      : r.lastCut ? `<span class="lc-cut">${U.icon('trend-down', 'icon-sm')}−${U.moneyShort(r.lastCut.amt)} latest</span>` : `<span class="lc-was">${r.listDate ? 'Listed ' + U.esc(U.date(r.listDate, 'short')) : ''}</span>`;
    return `<div class="lcard${r.id === activeId ? ' is-active' : ''}" role="listitem" tabindex="0" data-id="${U.esc(r.id)}" data-idx="${i}" style="position:absolute;left:0;right:0;top:${i * cardH()}px"
        aria-label="${U.esc(r.street)}, ${U.esc(r.city)}. ${U.money(r.price)}.${r.lastCut ? ' Price cut.' : ''}">
      <div class="lc-main">
        <a class="lc-addr" href="${U.qs({ view: 'property', id: r.id })}" tabindex="-1">${U.esc(r.street)}</a>
        <div class="lc-spec">${U.esc(r.city)}${r.county ? ' · ' + U.esc(r.county) : ''} · ${specs}</div>
        ${why && (p.seg === 'drops' || p.dom !== 'any' || p.reduced) ? `<div class="lc-why">${U.icon('check')} ${U.esc(why)}</div>` : `<div class="lc-tags">${tags.slice(0, 3).join('')}</div>`}
      </div>
      <div class="lc-price">
        <span class="lc-p">${U.money(r.price)}</span>${wasLine}
        <span class="lc-actions">
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="save" aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved' : 'Save property'}" data-tip="${saved ? 'Saved' : 'Save'}">${U.icon('bookmark', 'icon-sm')}</button>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="cmp" aria-pressed="${cmp}" aria-label="${cmp ? 'Remove from compare' : 'Add to compare'}" data-tip="${cmp ? 'In compare' : 'Compare'}">${U.icon('compare', 'icon-sm')}</button>
        </span>
      </div></div>`;
  }

  function renderRows() {
    if (!data || !isActive()) return;
    const sc = U.$('#lvScroll', el), rows = U.$('#lvRows', el);
    if (!shown.length) {
      rows.innerHTML = UI.state('No listings match these filters', L.chips(p).length ? 'Remove a filter above or <button type="button" class="link-btn" data-clearall>clear all filters</button>.' : 'No active listings are available right now.', 'search');
      U.$('#lvV', el).style.height = 'auto';
      return;
    }
    const h = cardH();
    const start = Math.max(0, Math.floor(sc.scrollTop / h) - 6);
    const end = Math.min(shown.length, Math.ceil((sc.scrollTop + sc.clientHeight) / h) + 6);
    let html = '';
    for (let i = start; i < end; i++) html += cardHTML(shown[i], i);
    const focused = document.activeElement?.closest?.('.lcard')?.dataset.idx;
    rows.innerHTML = html;
    if (focused != null) rows.querySelector(`.lcard[data-idx="${focused}"]`)?.focus({ preventScroll: true });
  }
  function focusIdx(i) {
    if (i < 0 || i >= shown.length) return;
    const sc = U.$('#lvScroll', el), h = cardH();
    if (i * h < sc.scrollTop) sc.scrollTop = i * h;
    else if ((i + 1) * h > sc.scrollTop + sc.clientHeight) sc.scrollTop = (i + 1) * h - sc.clientHeight;
    renderRows();
    U.$(`.lcard[data-idx="${i}"]`, el)?.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------ town bar */
  async function renderTownBar() {
    const bar = U.$('#lvTown', el);
    const town = p.town !== 'all' ? p.town : null;
    if (!town) { bar.hidden = true; return; }
    const [ts, to, ce] = await Promise.all([
      App.cached('ts:' + town, () => App.sb.from('town_stats').select('*').eq('city', town).maybeSingle().then((r) => r.data)),
      App.cached('to:' + town, () => App.sb.from('town_outcomes').select('*').eq('city', town).maybeSingle().then((r) => r.data, () => null)),
      App.cached('ce:' + town, () => App.sb.from('cut_edge').select('*').eq('grain', 'town').eq('area', town).maybeSingle().then((r) => r.data, () => null)),
    ]).catch(() => [null, null, null]);
    if (p.town !== town) return;
    const parts = [`<b>${U.esc(town)}</b>`];
    if (ts) parts.push(`<span>Median ask <b>${U.moneyShort(ts.median_price)}</b></span>`, `<span><b>${ts.median_dom}</b> median days</span>`, `<span><b>${ts.pct_with_cut}%</b> have cut</span>`);
    if (to && to.sold_count >= 25) parts.push(`<span><b>${to.pct_at_or_over_ask}%</b> sold at/over ask (12 mo, n=${U.int(to.sold_count)})</span>`);
    if (ce && ce.cut_n >= 10) parts.push(`<span>Cut homes: <b>${ce.cut_over_ask_pct}%</b> at/over ask (${U.pct(ce.edge_over_ask_pp, 0, true).replace('%', 'pp')} vs town)</span>`);
    parts.push(`<a href="${U.qs({ view: 'markets', town })}">Town scorecard${U.icon('arrow-r', 'icon-sm')}</a>`);
    bar.innerHTML = parts.join('');
    bar.hidden = false;
  }

  /* ------------------------------------------------------------------ map */
  async function ensureMap() {
    if (map) return map;
    const Lf = await UI.leaflet(true);
    if (map) return map;
    map = Lf.map(U.$('#lvMap', el), { preferCanvas: true, zoomControl: true, scrollWheelZoom: true }).setView([40.08, -74.2], 10);
    UI.tiles(map);
    cluster = Lf.markerClusterGroup({
      chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 48, disableClusteringAtZoom: 16, spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) => Lf.divIcon({ html: `<div>${c.getChildCount()}</div>`, className: 'mk-cluster', iconSize: Lf.point(40, 40) }),
    });
    map.addLayer(cluster);
    map.on('moveend', () => { if (boundsOn) apply(false); });
    document.addEventListener('theme:change', () => { markers.forEach((m, id) => { const r = data?.byId.get(id); if (r) m.setStyle({ fillColor: UI.markerColor(r), color: '#fff' }); }); });
    if (data) syncMarkers(true);
    return map;
  }
  function markerFor(r) {
    let m = markers.get(r.id);
    if (!m) {
      m = window.L.circleMarker([r.lat, r.lng], { radius: 6, weight: 1.5, color: '#fff', fillColor: UI.markerColor(r), fillOpacity: 0.95 });
      m.bindTooltip(`${U.esc(r.street)}<br><b>${U.money(r.price)}</b>${r.lastCut ? ' · cut ' + U.esc(U.date(r.lastCut.date, 'short')) : ''}`, { direction: 'top', offset: [0, -6] });
      m.on('click', () => { preview(r); scrollToCard(r.id); });
      markers.set(r.id, m);
    }
    return m;
  }
  function syncMarkers(fit) {
    if (!map || !data) return;
    const withGeo = filtered.filter((r) => r.lat != null && r.lng != null);
    cluster.clearLayers();
    cluster.addLayers(withGeo.map(markerFor));
    if ((fit || !boundsOn) && withGeo.length && (p.town !== 'all' || p.zip || p.q || fit)) {
      const b = window.L.latLngBounds(withGeo.map((r) => [r.lat, r.lng]));
      if (b.isValid()) map.fitBounds(b.pad(0.08), { maxZoom: 15 });
    }
  }
  function hover(id) {
    if (hoverId && markers.get(hoverId)) markers.get(hoverId).setStyle({ radius: 6, weight: 1.5 });
    hoverId = id;
    const m = id && markers.get(id);
    if (m && map && map.hasLayer(m)) { m.setStyle({ radius: 10, weight: 3 }); m.bringToFront(); }
  }
  function scrollToCard(id) {
    const i = shown.findIndex((r) => r.id === id);
    if (i < 0) return;
    const sc = U.$('#lvScroll', el), h = cardH();
    sc.scrollTop = Math.max(0, i * h - sc.clientHeight / 2 + h / 2);
    renderRows();
  }

  /* -------------------------------------------------------------- preview */
  async function preview(r) {
    activeId = r.id;
    U.$$('.lcard', el).forEach((c) => c.classList.toggle('is-active', c.dataset.id === r.id));
    const m = markers.get(r.id);
    if (m && map && !mobile()) { cluster.zoomToShowLayer(m, () => m.openTooltip()); }
    const reasons = L.reasons(r, p);
    const kv = (label, v, src) => `<div><dt>${U.esc(label)}${src || ''}</dt><dd class="${v == null || v === '—' ? 'na' : ''}">${v == null ? 'Not reported' : v}</dd></div>`;
    const body = `
      <div class="stack">
        <div>
          <div class="pv-price">${U.money(r.price)}</div>
          ${r.orig && r.orig > r.price ? `<div class="small"><span class="muted">Was ${U.money(r.orig)}</span> · <span class="warn strong">−${U.money(r.cum)} (${U.pct(r.cumPct)})</span></div>` : ''}
          <div class="pv-addr">${U.esc(r.street)}</div>
          <div class="pv-loc">${U.esc(r.city)}, NJ ${U.esc(r.zip)}${r.county ? ' · ' + U.esc(r.county) + ' County' + (r.countyInferred ? ' (inferred)' : '') : ''}</div>
        </div>
        ${reasons.length ? `<div><div class="eyebrow">Why it's here</div><ul class="reason-list">${reasons.map((x) => `<li>${U.icon('check')}${U.esc(x)}</li>`).join('')}</ul></div>` : ''}
        <dl class="kv" style="margin:0">
          ${kv('Type', U.esc(r.ptype || '—'))}
          ${kv('Days on market', r.dom != null ? U.int(r.dom) : null)}
          ${kv('Beds / baths', r.beds != null || r.baths != null ? (r.beds ?? '—') + ' / ' + (r.baths ?? '—') : null)}
          ${kv('Living area', r.sqft ? U.int(r.sqft) + ' sq ft' : null)}
          ${kv('$ per sq ft', r.ppsf ? '$' + U.int(r.ppsf) : null, UI.src('calc', 'Calc'))}
          ${kv('Town average $/sq ft', r.townPpsf ? '$' + U.int(r.townPpsf) + (r.ppsfGap != null ? ` <span class="small ${r.ppsfGap < 0 ? 'pos' : 'muted'}">(${U.pct(r.ppsfGap, 0, true)})</span>` : '') : null, UI.src('calc', 'Calc'))}
          ${kv('Lot', r.lot ? U.esc(r.lot) : null)}
          ${kv('Year built', r.year || null)}
        </dl>
        <div id="pvHist"><div class="skel skel-line" style="width:60%"></div></div>
        <div class="small muted" id="pvCourtesy"></div>
      </div>`;
    const saved = WS.isSaved(r.id);
    UI.drawer.open({
      title: 'Property preview', label: 'Preview of ' + r.street, body,
      foot: `<a class="btn btn-primary" href="${U.qs({ view: 'property', id: r.id })}">Full property report${U.icon('arrow-r', 'icon-sm')}</a>
        <button type="button" class="btn btn-secondary" data-pv="save" aria-pressed="${saved}">${U.icon('bookmark', 'icon-sm')}${saved ? 'Saved' : 'Save'}</button>
        <button type="button" class="btn btn-secondary" data-pv="cmp">${U.icon('compare', 'icon-sm')}Compare</button>`,
    });
    const d = UI.drawer.el();
    d.onclick = (e) => {
      const b = e.target.closest('[data-pv]');
      if (b) { if (b.dataset.pv === 'save') { WS.toggleSave(r); b.innerHTML = U.icon('bookmark', 'icon-sm') + (WS.isSaved(r.id) ? 'Saved' : 'Save'); b.setAttribute('aria-pressed', String(WS.isSaved(r.id))); } else WS.toggleCompare(r); }
      if (e.target.closest('a[href^="?"]')) UI.drawer.close();
    };
    // Tracked cut history + IDX listing-brokerage attribution
    const [hist, lrow] = await Promise.all([
      App.cached('drops:' + r.id, () => App.sb.from('price_drops').select('price_before,price_after,drop_dollar,drop_pct,detected_at').eq('listing_id', r.id).order('detected_at', { ascending: false }).then((x) => x.data || [])).catch(() => []),
      App.cached('lrow:' + r.id, () => App.sb.from('listings').select('office_name,agent_name').eq('id', r.id).maybeSingle().then((x) => x.data)).catch(() => null),
    ]);
    if (activeId !== r.id) return;
    U.$('#pvHist', d).innerHTML = hist.length
      ? `<div class="eyebrow">Tracked price changes</div><ul class="timeline">${hist.map((h) => `<li><span class="tl-dot amber"></span><div class="tl-date">${U.esc(U.date(h.detected_at))}</div><div class="tl-d">${U.money(h.price_before)} → <b>${U.money(h.price_after)}</b> <span class="warn">(−${U.money(h.drop_dollar)}, ${U.pct(h.drop_pct)})</span></div></li>`).join('')}</ul>`
      : `<div class="small muted">No price changes detected since NJREindex began tracking this listing.</div>`;
    U.$('#pvCourtesy', d).innerHTML = lrow?.office_name ? `Listing courtesy of ${U.esc(lrow.office_name)}. ${UI.src('mls')}` : UI.src('mls');
  }

  /* ------------------------------------------------------------ realtime */
  function subscribeRealtime() {
    if (rt) return;
    try {
      rt = App.sb.channel('price_drops_lv').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'price_drops' },
        U.debounce(async () => {
          data = await L.load(true); buildGeoOptions(); syncControls(); markers.clear(); apply(false);
          App.toast('New price changes loaded');
        }, 4000)).subscribe();
    } catch (e) { /* realtime is optional */ }
  }
})();

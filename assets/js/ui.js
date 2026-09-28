/* NJREindex shared UI components: metric cards, data table, charts, dialog,
   drawer, alerts dialog, compare tray, notifications. */
(function () {
  'use strict';
  const App = window.App, U = App.u, L = App.listings, WS = App.ws;
  const UI = (App.ui = {});

  /* ------------------------------------------------------------- metrics */
  // meta: provenance line (source · window · n · updated) — every metric states
  // what it measures, where, and over what period.
  UI.metric = ({ label, value, delta, meta, tip, emph, src }) => {
    let d = '';
    if (delta && delta.v != null && !isNaN(delta.v)) {
      const dir = delta.v > 0.05 ? 'up' : delta.v < -0.05 ? 'down' : 'flat';
      const good = delta.invert ? (dir === 'down' ? 'up' : dir === 'up' ? 'down' : 'flat') : dir;
      d = `<div class="metric-d ${good}">${U.icon(dir === 'down' ? 'trend-down' : dir === 'up' ? 'trend-up' : 'arrow-r', 'icon-sm')}${U.esc(delta.text || U.pct(delta.v, 1, true))}${delta.label ? ` <span class="muted" style="font-weight:500">${U.esc(delta.label)}</span>` : ''}</div>`;
    }
    return `<div class="metric${emph ? ' is-emph' : ''}">
      <div class="metric-l">${U.esc(label)}${tip ? U.info(tip) : ''}${src ? `<span style="margin-left:auto">${src}</span>` : ''}</div>
      <div class="metric-v">${value}</div>${d}
      ${meta ? `<div class="metric-m">${meta}</div>` : ''}</div>`;
  };
  UI.src = (kind, text) => {
    const labels = { mls: 'MLS', pr: 'Public record', calc: 'Calculated', est: 'Estimate', user: 'Your input', na: 'Unavailable' };
    const tips = {
      mls: 'Reported by the MLS listing feed (' + App.cfg.MLS_SHORT + ').',
      pr: 'Official NJ public record (Division of Taxation SR-1A deed data).',
      calc: 'Calculated by NJREindex from source data — the method is shown nearby.',
      est: 'Statistical estimate. Not an appraisal or guarantee.',
      user: 'Based on assumptions you entered.',
      na: 'This data is not available from our current sources.',
    };
    return `<span class="src src-${kind}" data-tip="${U.esc(tips[kind])}" tabindex="0">${U.esc(text || labels[kind])}</span>`;
  };
  UI.skeletonMetrics = (n = 4) => `<div class="metrics">${Array.from({ length: n }, () => '<div class="metric"><div class="skel skel-line" style="width:60%"></div><div class="skel" style="height:26px;width:70%;margin-top:8px"></div><div class="skel skel-line" style="width:90%"></div></div>').join('')}</div>`;
  UI.skeletonRows = (n = 6) => `<div class="card">${Array.from({ length: n }, () => '<div style="padding:14px 20px;border-bottom:1px solid var(--border)"><div class="skel skel-line" style="width:45%"></div><div class="skel skel-line" style="width:75%"></div></div>').join('')}</div>`;
  UI.state = (title, text, icon = 'info', err = false) => `<div class="state${err ? ' state-err' : ''}">${U.icon(icon)}<h3>${U.esc(title)}</h3>${text ? `<p>${text}</p>` : ''}</div>`;
  UI.provenance = (items) => `<div class="provenance">${items.filter(Boolean).map((i) => `<span>${U.icon(i.icon || 'database')}${i.html || U.esc(i.text)}</span>`).join('')}</div>`;

  /* ------------------------------------------------------------ data table */
  UI.table = (host, cfg) => {
    const id = cfg.id || 'dt';
    const cols = cfg.columns;
    const hidden = new Set(App.store.get('cols.' + id, cols.filter((c) => c.hide).map((c) => c.key)));
    let rows = cfg.rows || [], view = [], page = 0, q = '';
    let sort = cfg.sort ? { ...cfg.sort } : null;
    const pageSize = cfg.pageSize || 50;
    host.innerHTML = `<div class="dt" data-mobile="cards" style="${cfg.maxHeight ? '--dt-max-h:' + cfg.maxHeight : ''}">
      <div class="dt-toolbar">
        ${cfg.search ? `<div class="input-group">${U.icon('search', 'icon-sm')}<input class="input" type="search" placeholder="${U.esc(cfg.searchPlaceholder || 'Search')}" aria-label="${U.esc(cfg.searchPlaceholder || 'Search table')}" style="height:32px"></div>` : ''}
        ${cfg.toolbarExtra || ''}
        <span class="dt-count" aria-live="polite"></span>
        <div class="pop-wrap"><button type="button" class="btn btn-ghost btn-sm dt-colbtn" aria-haspopup="true" aria-expanded="false">${U.icon('columns', 'icon-sm')}Columns</button>
          <div class="menu colmenu" hidden>${cols.filter((c) => !c.fixed).map((c) => `<label><input type="checkbox" data-col="${c.key}" ${hidden.has(c.key) ? '' : 'checked'}> ${U.esc(c.label)}</label>`).join('')}</div></div>
        ${cfg.exportName ? `<button type="button" class="btn btn-ghost btn-sm dt-export">${U.icon('download', 'icon-sm')}CSV</button>` : ''}
      </div>
      <div class="dt-scroll"><table>${cfg.caption ? `<caption class="sr-only">${U.esc(cfg.caption)}</caption>` : ''}<thead></thead><tbody></tbody></table></div>
      <div class="dt-cards"></div>
      <div class="dt-pager"></div>
    </div>`;
    const el = host.firstElementChild;
    const thead = U.$('thead', el), tbody = U.$('tbody', el), cards = U.$('.dt-cards', el), pager = U.$('.dt-pager', el), count = U.$('.dt-count', el);
    const vis = () => cols.filter((c) => !hidden.has(c.key));
    const val = (c, r) => (c.sort ? c.sort(r) : r[c.key]);
    const cell = (c, r) => (c.fmt ? c.fmt(r) : U.esc(r[c.key] ?? '—'));

    function apply() {
      const nq = U.norm(q);
      view = nq && cfg.search ? rows.filter((r) => U.norm(cfg.search(r)).includes(nq)) : rows.slice();
      if (sort) {
        const c = cols.find((x) => x.key === sort.key);
        if (c) {
          const m = sort.dir === 'asc' ? 1 : -1;
          view.sort((a, b) => {
            const x = val(c, a), y = val(c, b);
            if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
            return (typeof x === 'string' ? x.localeCompare(y) : x - y) * m;
          });
        }
      }
      page = Math.min(page, Math.max(0, Math.ceil(view.length / pageSize) - 1));
      draw();
    }
    function draw() {
      const v = vis();
      thead.innerHTML = '<tr>' + v.map((c) => {
        const s = sort && sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
        const ind = s === 'ascending' ? 'sort-asc' : s === 'descending' ? 'sort-desc' : 'sort';
        return `<th scope="col" class="${c.num ? 'num' : ''}" aria-sort="${s}">${c.nosort ? `<span class="th-static">${U.esc(c.label)}</span>` : `<button type="button" class="th-btn" data-sort="${c.key}">${U.esc(c.label)}${U.icon(ind, 'sort-ind')}</button>`}</th>`;
      }).join('') + '</tr>';
      const slice = view.slice(page * pageSize, page * pageSize + pageSize);
      if (!slice.length) {
        tbody.innerHTML = `<tr><td colspan="${v.length}">${UI.state(cfg.emptyTitle || 'No results', cfg.empty || 'Try adjusting your filters.', 'search')}</td></tr>`;
        cards.innerHTML = UI.state(cfg.emptyTitle || 'No results', cfg.empty || 'Try adjusting your filters.', 'search');
      } else {
        tbody.innerHTML = slice.map((r, i) => `<tr${cfg.onRowClick ? ' class="is-click"' : ''} data-i="${i}">` + v.map((c) =>
          `<td class="${c.num ? 'num ' : ''}${c.strong ? 'strong ' : ''}${c.cls ? c.cls(r) : ''}">${cell(c, r)}</td>`).join('') + '</tr>').join('');
        const tcol = cols.find((c) => c.mobile === 'title') || cols[0];
        const rcol = cols.find((c) => c.mobile === 'right');
        cards.innerHTML = slice.map((r, i) => `<div class="dt-card${cfg.onRowClick ? ' is-click' : ''}" data-i="${i}">
          <div class="dt-card-t"><span>${cell(tcol, r)}</span>${rcol ? `<span class="num">${cell(rcol, r)}</span>` : ''}</div>
          <dl class="dt-card-g">${v.filter((c) => c !== tcol && c !== rcol && c.mobile !== false).slice(0, 6).map((c) => `<div><dt>${U.esc(c.label)}</dt><dd>${cell(c, r)}</dd></div>`).join('')}</dl></div>`).join('');
      }
      const pages = Math.ceil(view.length / pageSize);
      count.textContent = U.int(view.length) + ' ' + (cfg.unit || 'rows') + (q ? ' matching' : '');
      pager.hidden = pages <= 1;
      pager.innerHTML = pages > 1 ? `<span>Showing ${U.int(page * pageSize + 1)}–${U.int(Math.min(view.length, (page + 1) * pageSize))} of ${U.int(view.length)}</span>
        <span class="pg-btns"><button type="button" class="btn btn-secondary btn-sm" data-pg="-1" ${page === 0 ? 'disabled' : ''}>${U.icon('chev-l', 'icon-sm')}Prev</button>
        <span class="num">Page ${page + 1} / ${pages}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-pg="1" ${page >= pages - 1 ? 'disabled' : ''}>Next${U.icon('chev-r', 'icon-sm')}</button></span>` : '';
    }
    thead.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sort]'); if (!b) return;
      const c = cols.find((x) => x.key === b.dataset.sort);
      if (sort && sort.key === c.key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
      else sort = { key: c.key, dir: c.num ? 'desc' : 'asc' };
      apply();
    });
    const rowAt = (i) => view[page * pageSize + +i];
    const onClick = (e) => {
      if (!cfg.onRowClick || e.target.closest('a,button,input')) return;
      const tr = e.target.closest('[data-i]'); if (tr) cfg.onRowClick(rowAt(tr.dataset.i), e);
    };
    tbody.addEventListener('click', onClick); cards.addEventListener('click', onClick);
    pager.addEventListener('click', (e) => { const b = e.target.closest('[data-pg]'); if (!b) return; page += +b.dataset.pg; draw(); U.$('.dt-scroll', el).scrollTop = 0; el.scrollIntoView({ block: 'nearest' }); });
    const si = U.$('.dt-toolbar input[type=search]', el);
    if (si) si.addEventListener('input', U.debounce(() => { q = si.value; page = 0; apply(); }, 150));
    const cb = U.$('.dt-colbtn', el), cm = U.$('.colmenu', el);
    cb.addEventListener('click', (e) => { e.stopPropagation(); cm.hidden = !cm.hidden; cb.setAttribute('aria-expanded', String(!cm.hidden)); });
    cm.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { cm.hidden = true; cb.setAttribute('aria-expanded', 'false'); });
    cm.addEventListener('change', (e) => {
      const k = e.target.dataset.col; if (!k) return;
      if (e.target.checked) hidden.delete(k); else hidden.add(k);
      App.store.set('cols.' + id, [...hidden]); draw();
    });
    const ex = U.$('.dt-export', el);
    if (ex) ex.addEventListener('click', () => U.csv(view, vis().map((c) => ({ label: c.label, key: c.key, csv: c.csv || ((r) => val(c, r)) })), cfg.exportName + '.csv'));
    apply();
    return { el, setRows(r) { rows = r || []; page = 0; apply(); }, rows: () => view };
  };

  /* --------------------------------------------------------------- charts */
  // Combined bar (left axis) + line (right axis) time-series chart in SVG, with
  // hover tooltips and a data-table alternative for screen readers.
  UI.chart = (host, { labels, bars, line, line2, barFmt = U.int, lineFmt = U.moneyShort, title, barName = 'Sales', lineName = 'Median price', line2Name, height = 240 }) => {
    const W = 720, H = height, P = { l: 48, r: 60, t: 12, b: 28 };
    const iw = W - P.l - P.r, ih = H - P.t - P.b, n = labels.length;
    if (!n) { host.innerHTML = UI.state('No data for this period', '', 'chart'); return; }
    const bmax = bars ? Math.max(1, ...bars.filter((v) => v != null)) : 1;
    const lv = [...(line || []), ...(line2 || [])].filter((v) => v != null);
    const lmin = lv.length ? Math.min(...lv) : 0, lmax = lv.length ? Math.max(...lv) : 1;
    const pad = (lmax - lmin) * 0.12 || lmax * 0.1 || 1;
    const lo = Math.max(0, lmin - pad), hi = lmax + pad;
    const x = (i) => P.l + (n === 1 ? iw / 2 : (i + 0.5) * (iw / n));
    const yb = (v) => P.t + ih - (v / bmax) * ih;
    const yl = (v) => P.t + ih - ((v - lo) / (hi - lo)) * ih;
    const bw = Math.max(3, (iw / n) * 0.62);
    const ticks = 4;
    let grid = '', axL = '', axR = '';
    for (let i = 0; i <= ticks; i++) {
      const yy = P.t + (ih / ticks) * i;
      grid += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}"/>`;
      if (bars) axL += `<text x="${P.l - 8}" y="${yy + 4}" text-anchor="end">${U.esc(barFmt(bmax * (1 - i / ticks)))}</text>`;
      if (lv.length) axR += `<text x="${W - P.r + 8}" y="${yy + 4}">${U.esc(lineFmt(hi - (hi - lo) * (i / ticks)))}</text>`;
    }
    const step = Math.ceil(n / 8);
    const axX = labels.map((l, i) => (i % step === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${U.esc(l)}</text>` : '')).join('');
    const barsSvg = bars ? bars.map((v, i) => (v == null ? '' : `<rect class="bar" x="${x(i) - bw / 2}" y="${yb(v)}" width="${bw}" height="${P.t + ih - yb(v)}" rx="2"/>`)).join('') : '';
    const path = (arr) => { let d = '', pen = false; arr.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yl(v).toFixed(1); pen = true; }); return d; };
    const lineSvg = line ? `<path class="ln" d="${path(line)}"/>` + line.map((v, i) => (v == null ? '' : `<circle class="dot" cx="${x(i)}" cy="${yl(v)}" r="${n > 24 ? 0 : 2.5}"/>`)).join('') : '';
    const line2Svg = line2 ? `<path class="ln-2" d="${path(line2)}"/>` : '';
    const hits = labels.map((_, i) => `<rect data-i="${i}" x="${P.l + i * (iw / n)}" y="${P.t}" width="${iw / n}" height="${ih}" fill="transparent"/>`).join('');
    const summary = `${title || 'Chart'}: ${n} periods from ${labels[0]} to ${labels[n - 1]}.`;
    host.innerHTML = `<div class="chart-wrap"><div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(summary)}" preserveAspectRatio="xMidYMid meet">
      <g class="grid">${grid}</g><g class="ax">${axL}${axR}${axX}</g>${barsSvg}${line2Svg}${lineSvg}
      <line class="hover-line" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" visibility="hidden"/><g class="hits">${hits}</g></svg></div>
      <div class="chart-tip" hidden></div></div>
      <div class="chart-legend">${bars ? `<span><i class="bar"></i>${U.esc(barName)} (left axis)</span>` : ''}${line ? `<span><i></i>${U.esc(lineName)} (right axis)</span>` : ''}${line2 ? `<span><i class="l2"></i>${U.esc(line2Name)}</span>` : ''}</div>
      <details class="disclosure" style="margin-top:10px"><summary>View chart data as a table</summary><div class="disclosure-b" style="overflow-x:auto">
      <table class="cmp-table" style="width:100%"><thead><tr><th>Period</th>${bars ? `<th>${U.esc(barName)}</th>` : ''}${line ? `<th>${U.esc(lineName)}</th>` : ''}${line2 ? `<th>${U.esc(line2Name)}</th>` : ''}</tr></thead>
      <tbody>${labels.map((l, i) => `<tr><td>${U.esc(l)}</td>${bars ? `<td>${bars[i] == null ? '—' : U.esc(barFmt(bars[i]))}</td>` : ''}${line ? `<td>${line[i] == null ? '—' : U.esc(lineFmt(line[i]))}</td>` : ''}${line2 ? `<td>${line2[i] == null ? '—' : U.esc(lineFmt(line2[i]))}</td>` : ''}</tr>`).join('')}</tbody></table></div></details>`;
    const svg = U.$('svg', host), tip = U.$('.chart-tip', host), hl = U.$('.hover-line', host), wrap = U.$('.chart-wrap', host);
    svg.addEventListener('mousemove', (e) => {
      const r = e.target.closest('[data-i]'); if (!r) return;
      const i = +r.dataset.i;
      hl.setAttribute('x1', x(i)); hl.setAttribute('x2', x(i)); hl.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${U.esc(labels[i])}</b>${bars ? `<br>${U.esc(barName)}: ${bars[i] == null ? '—' : U.esc(barFmt(bars[i]))}` : ''}${line ? `<br>${U.esc(lineName)}: ${line[i] == null ? '—' : U.esc(lineFmt(line[i]))}` : ''}${line2 ? `<br>${U.esc(line2Name)}: ${line2[i] == null ? '—' : U.esc(lineFmt(line2[i]))}` : ''}`;
      tip.hidden = false;
      const bb = wrap.getBoundingClientRect(), sb = svg.getBoundingClientRect();
      const px = (x(i) / W) * sb.width + (sb.left - bb.left);
      tip.style.left = Math.min(Math.max(0, px + 12), bb.width - tip.offsetWidth) + 'px';
      tip.style.top = '8px';
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; hl.setAttribute('visibility', 'hidden'); });
  };

  /* --------------------------------------------------------------- dialog */
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function trap(container, e) {
    if (e.key !== 'Tab') return;
    const f = U.$$(FOCUSABLE, container).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  UI.dialog = ({ title, sub, body, foot, size, onClose, label }) => {
    const opener = document.activeElement;
    const wrap = U.h(`<div class="dialog-wrap"><div class="dialog ${size === 'lg' ? 'dialog-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
      <div class="dialog-h"><div><h2 id="dlg-t">${U.esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close dialog">${U.icon('x')}</button></div>
      <div class="dialog-b">${body || ''}</div>${foot ? `<div class="dialog-f">${foot}</div>` : ''}</div></div>`);
    if (label) wrap.firstElementChild.setAttribute('aria-label', label);
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    const close = () => {
      wrap.remove(); document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
      if (opener && opener.focus) opener.focus();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); else trap(wrap, e); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    setTimeout(() => (U.$('[autofocus]', wrap) || U.$(FOCUSABLE, U.$('.dialog-b', wrap)) || U.$('[data-close]', wrap))?.focus(), 30);
    return { el: wrap, close };
  };

  /* --------------------------------------------------------------- drawer */
  let drawerEl = null, drawerOpener = null;
  UI.drawer = {
    open({ title, body, foot, label }) {
      drawerOpener = document.activeElement;
      if (!drawerEl) {
        drawerEl = U.h(`<aside class="drawer" role="dialog" aria-modal="false" aria-labelledby="drawer-t">
          <div class="drawer-h"><h2 id="drawer-t" style="font-size:14px;font-weight:600;color:var(--text-2)"></h2>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-dclose aria-label="Close preview">${U.icon('x')}</button></div>
          <div class="drawer-b"></div><div class="drawer-f"></div></aside>`);
        document.body.appendChild(drawerEl);
        drawerEl.addEventListener('click', (e) => { if (e.target.closest('[data-dclose]')) UI.drawer.close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerEl.classList.contains('is-open')) UI.drawer.close(); });
      }
      U.$('#drawer-t', drawerEl).textContent = title || 'Preview';
      if (label) drawerEl.setAttribute('aria-label', label);
      U.$('.drawer-b', drawerEl).innerHTML = body || '';
      const f = U.$('.drawer-f', drawerEl); f.innerHTML = foot || ''; f.hidden = !foot;
      drawerEl.classList.add('is-open');
      U.$('.drawer-b', drawerEl).scrollTop = 0;
      setTimeout(() => U.$('[data-dclose]', drawerEl).focus(), 50);
      return drawerEl;
    },
    close() {
      if (!drawerEl) return;
      drawerEl.classList.remove('is-open');
      document.dispatchEvent(new CustomEvent('drawer:close'));
      if (drawerOpener && document.contains(drawerOpener)) drawerOpener.focus();
    },
    el: () => drawerEl,
    isOpen: () => !!drawerEl && drawerEl.classList.contains('is-open'),
  };

  /* ---------------------------------------------------------- alerts dialog */
  // One step: criteria carried over from the current screen, email, frequency.
  // Advanced criteria stay one click away. Writes the same `subscribers` row
  // shape the poller matches against (null = any).
  const PRICE_OPTS = [0, 100000, 200000, 300000, 400000, 500000, 600000, 750000, 1000000, 1500000, 2000000, 3000000];
  const SQFT_OPTS = [0, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000];
  App.alertsDialog = {
    async open(ctx) {
      const p = ctx?.params || (App.routeKey() === 'listings' ? L.paramsFrom(App.params()) : { ...L.DEFAULTS });
      const s = {
        counties: p.county && p.county !== 'all' && p.county !== 'none' ? [p.county] : [],
        towns: ctx?.town ? [ctx.town] : p.town && p.town !== 'all' ? [p.town] : [],
        type: p.type && p.type !== 'all' ? p.type : 'any',
        minBeds: p.beds && p.beds !== 'any' ? parseInt(p.beds, 10) : null,
        minBaths: null,
        minPrice: +p.minp || null, maxPrice: +p.maxp || null,
        minSqft: null, maxSqft: null,
        minDropPct: 1, maxDom: null, features: [], frequency: 'instant',
      };
      if (ctx?.county && !s.counties.length) s.counties = [ctx.county];
      // The dialog opens immediately; the town list fills in when it arrives.
      let townList = [];
      const townCounty = new Map();
      const townsReady = App.cached('alerts:towns', () => App.sb.from('town_stats').select('city,active_count').order('city'))
        .then(({ data }) => { townList = (data || []).map((t) => t.city).filter(Boolean); }, () => {});
      const countiesReady = () => L.load().then((ds) => { for (const r of ds.rows) if (r.county) townCounty.set(r.city, r.county); }, () => {});

      const opt = (arr, cur, fmt, none) => arr.map((v) => `<option value="${v}" ${(+cur || 0) === v ? 'selected' : ''}>${v ? fmt(v) : none}</option>`).join('');
      const summary = () => {
        const c = [];
        if (s.towns.length) c.push(s.towns.length > 3 ? s.towns.slice(0, 3).join(', ') + ' +' + (s.towns.length - 3) : s.towns.join(', '));
        else if (s.counties.length) c.push(s.counties.join(' & ') + ' County');
        else c.push('All towns');
        if (s.type !== 'any') c.push(L.typeLabel(s.type));
        if (s.minBeds) c.push(s.minBeds + '+ beds');
        if (s.minBaths) c.push(s.minBaths + '+ baths');
        if (s.minPrice || s.maxPrice) c.push((s.minPrice ? U.moneyShort(s.minPrice) : 'Any') + '–' + (s.maxPrice ? U.moneyShort(s.maxPrice) : 'Any'));
        if (s.minSqft || s.maxSqft) c.push((s.minSqft || 'Any') + '–' + (s.maxSqft || 'Any') + ' sq ft');
        if (s.minDropPct > 1) c.push(s.minDropPct + '%+ drops');
        if (s.maxDom) c.push('≤ ' + s.maxDom + ' days on market');
        if (s.features.length) c.push(s.features.join(', '));
        return c.map((x) => `<span class="chip chip-plain">${U.esc(x)}</span>`).join('');
      };
      const body = `
        <div class="field"><span class="field-label">You'll be alerted when a matching home drops its price</span>
          <div class="chips" id="alSummary">${summary()}</div>
          <span class="field-hint">Criteria are carried over from what you were viewing. <button type="button" class="link-btn" id="alEdit">Edit criteria</button></span></div>
        <div id="alAdv" hidden class="stack">
          <div class="field"><label for="alTownFilter">Towns <span class="muted" style="font-weight:400">(optional — leave empty for all)</span></label>
            <input class="input" id="alTownFilter" placeholder="Filter towns…" autocomplete="off">
            <div id="alTowns" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:6px 8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:2px"></div>
            <div class="row small"><span class="muted">County:</span>${App.MLS_COUNTIES.map((c) => `<label class="check"><input type="checkbox" name="alCounty" value="${c}" ${s.counties.includes(c) ? 'checked' : ''}> ${c}</label>`).join('')}</div>
            <div class="notice notice-warn small" id="alCountyNote" hidden>${U.icon('alert', 'icon-sm')}<span>About half of MLS listings don't report a county, so county-only alerts can miss matches. <button type="button" class="link-btn" id="alUseTowns">Use every town in the selected county instead</button></span></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="alType">Property type</label><select class="select" id="alType"><option value="any">Any type</option>${L.TYPE_GROUPS.map((g) => `<option value="${g.key}" ${s.type === g.key ? 'selected' : ''}>${U.esc(g.label)}</option>`).join('')}</select></div>
            <div class="grid-2">
              <div class="field"><label for="alBeds">Min beds</label><select class="select" id="alBeds"><option value="">Any</option>${[1, 2, 3, 4, 5].map((b) => `<option value="${b}" ${s.minBeds === b ? 'selected' : ''}>${b}+</option>`).join('')}</select></div>
              <div class="field"><label for="alBaths">Min baths</label><select class="select" id="alBaths"><option value="">Any</option>${[1, 1.5, 2, 2.5, 3].map((b) => `<option value="${b}">${b}+</option>`).join('')}</select></div>
            </div>
            <div class="grid-2">
              <div class="field"><label for="alMinP">Min price</label><select class="select" id="alMinP">${opt(PRICE_OPTS.slice(0, -1), s.minPrice, U.moneyShort, 'No min')}</select></div>
              <div class="field"><label for="alMaxP">Max price</label><select class="select" id="alMaxP">${opt([0].concat(PRICE_OPTS.slice(2)), s.maxPrice, U.moneyShort, 'No max')}</select></div>
            </div>
            <div class="grid-2">
              <div class="field"><label for="alMinS">Min sq ft</label><select class="select" id="alMinS">${opt(SQFT_OPTS.slice(0, -2), null, U.int, 'No min')}</select></div>
              <div class="field"><label for="alMaxS">Max sq ft</label><select class="select" id="alMaxS">${opt([0].concat(SQFT_OPTS.slice(3)), null, U.int, 'No max')}</select></div>
            </div>
            <div class="field"><label for="alDrop">Minimum drop size</label><select class="select" id="alDrop"><option value="1">Any drop</option><option value="2">2% or more</option><option value="5">5% or more</option><option value="10">10% or more</option></select></div>
            <div class="field"><label for="alDom">Max days on market</label><select class="select" id="alDom"><option value="">Any</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option><option value="180">180 days</option></select></div>
          </div>
          <div class="field"><span class="field-label">Listing features <span class="muted" style="font-weight:400">(optional)</span></span>
            <div class="row">${['JUST LISTED', 'NEW CONSTRUCTION', 'LONG DOM'].map((f) => `<label class="check"><input type="checkbox" name="alFeat" value="${f}"> ${f.charAt(0) + f.slice(1).toLowerCase()}</label>`).join('')}</div></div>
          <div class="field-err" id="alRangeErr"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label for="alEmail">Email address</label><input class="input" id="alEmail" type="email" autocomplete="email" placeholder="you@example.com" required autofocus></div>
          <div class="field"><label for="alName">First name <span class="muted" style="font-weight:400">(optional)</span></label><input class="input" id="alName" autocomplete="given-name"></div>
        </div>
        <div class="field-err" id="alEmailErr" role="alert"></div>
        <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="field-label" style="margin-bottom:6px">Frequency</legend>
          <div class="seg" role="radiogroup" aria-label="Alert frequency">
            <button type="button" role="radio" aria-checked="true" data-freq="instant">Instant</button>
            <button type="button" role="radio" aria-checked="false" data-freq="weekly">Weekly digest</button>
          </div></fieldset>
        <label class="check" style="align-items:flex-start"><input type="checkbox" id="alConsent" style="margin-top:3px"> <span>I agree to receive price-drop alert emails from NJREindex. Every email has a one-click unsubscribe.</span></label>
        <div class="field-err" id="alConsentErr" role="alert"></div>`;
      const dlg = UI.dialog({
        title: 'Get price-drop alerts', sub: 'Free. Matches are checked twice daily against MLS price changes in the ' + U.esc(App.cfg.REGION) + '.',
        body,
        foot: `<span class="grow">We never share your email. Alerts are for MLS price drops only.</span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-primary" id="alSubmit">Create alert</button>`,
      });
      const root = dlg.el;
      const $ = (sel) => U.$(sel, root);
      const renderTowns = () => {
        const f = U.norm($('#alTownFilter').value);
        const list = [...new Set(townList.concat(s.towns))].filter((t) => !f || U.norm(t).includes(f)).sort();
        $('#alTowns').innerHTML = list.slice(0, 250).map((t) => `<label class="check small"><input type="checkbox" value="${U.esc(t)}" ${s.towns.includes(t) ? 'checked' : ''}> ${U.esc(t)}</label>`).join('') || '<span class="muted small">No towns match.</span>';
      };
      const countyNote = () => { $('#alCountyNote').hidden = !(s.counties.length && !s.towns.length); };
      const refresh = () => { $('#alSummary').innerHTML = summary(); countyNote(); };
      renderTowns(); countyNote();
      townsReady.then(() => { if (document.contains(root)) renderTowns(); });
      $('#alEdit').addEventListener('click', () => { const a = $('#alAdv'); a.hidden = !a.hidden; $('#alEdit').textContent = a.hidden ? 'Edit criteria' : 'Hide criteria'; });
      $('#alTownFilter').addEventListener('input', renderTowns);
      $('#alTowns').addEventListener('change', (e) => { const v = e.target.value; if (e.target.checked) s.towns.push(v); else s.towns = s.towns.filter((t) => t !== v); refresh(); });
      U.$$('input[name=alCounty]', root).forEach((c) => c.addEventListener('change', () => { s.counties = U.$$('input[name=alCounty]:checked', root).map((x) => x.value); refresh(); }));
      $('#alUseTowns').addEventListener('click', async () => {
        await countiesReady();
        const ts = [...townCounty.entries()].filter(([, c]) => s.counties.includes(c)).map(([t]) => t);
        if (!ts.length) { App.toast('Town list unavailable — pick towns individually'); return; }
        s.towns = [...new Set(ts)].sort(); s.counties = [];
        U.$$('input[name=alCounty]', root).forEach((c) => (c.checked = false));
        renderTowns(); refresh();
      });
      const bindSel = (sel, key, parse) => $(sel).addEventListener('change', (e) => { s[key] = parse(e.target.value); refresh(); });
      bindSel('#alType', 'type', (v) => v);
      bindSel('#alBeds', 'minBeds', (v) => (v ? parseInt(v, 10) : null));
      bindSel('#alBaths', 'minBaths', (v) => (v ? parseFloat(v) : null));
      bindSel('#alMinP', 'minPrice', (v) => +v || null);
      bindSel('#alMaxP', 'maxPrice', (v) => +v || null);
      bindSel('#alMinS', 'minSqft', (v) => +v || null);
      bindSel('#alMaxS', 'maxSqft', (v) => +v || null);
      bindSel('#alDrop', 'minDropPct', (v) => parseFloat(v) || 1);
      bindSel('#alDom', 'maxDom', (v) => (v ? parseInt(v, 10) : null));
      U.$$('input[name=alFeat]', root).forEach((c) => c.addEventListener('change', () => { s.features = U.$$('input[name=alFeat]:checked', root).map((x) => x.value); refresh(); }));
      U.$$('[data-freq]', root).forEach((b) => b.addEventListener('click', () => {
        s.frequency = b.dataset.freq;
        U.$$('[data-freq]', root).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      }));
      $('#alSubmit').addEventListener('click', async () => {
        const email = $('#alEmail').value.trim();
        $('#alEmailErr').textContent = ''; $('#alConsentErr').textContent = ''; $('#alRangeErr').textContent = '';
        if (s.minPrice && s.maxPrice && s.minPrice > s.maxPrice) { $('#alAdv').hidden = false; $('#alRangeErr').textContent = 'Minimum price cannot exceed maximum price.'; return; }
        if (s.minSqft && s.maxSqft && s.minSqft > s.maxSqft) { $('#alAdv').hidden = false; $('#alRangeErr').textContent = 'Minimum square footage cannot exceed maximum.'; return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('#alEmailErr').textContent = 'Enter a valid email address.'; $('#alEmail').focus(); return; }
        if (!$('#alConsent').checked) { $('#alConsentErr').textContent = 'Please confirm you agree to receive alert emails.'; $('#alConsent').focus(); return; }
        const btn = $('#alSubmit'); btn.disabled = true; btn.textContent = 'Creating…';
        const tg = L.TYPE_GROUPS.find((g) => g.key === s.type);
        const payload = {
          email, name: $('#alName').value.trim() || null,
          counties: s.counties.length ? s.counties : null,
          towns: s.towns.length ? s.towns : null,
          property_types: tg ? tg.alert : null,
          min_beds: s.minBeds || null, min_baths: s.minBaths || null,
          min_price: s.minPrice || null, max_price: s.maxPrice || null,
          min_sqft: s.minSqft || null, max_sqft: s.maxSqft || null,
          min_drop_pct: s.minDropPct, features: s.features.length ? s.features : null,
          max_dom: s.maxDom || null, alert_on: 'drops', frequency: s.frequency,
        };
        const { error } = await App.sb.from('subscribers').insert(payload);
        if (error) {
          btn.disabled = false; btn.textContent = 'Create alert';
          $('#alEmailErr').textContent = error.code === '23505' ? 'This email already has an alert — check your inbox.' : 'Something went wrong — please try again.';
          return;
        }
        const masked = email.replace(/^(.).*(@.*)$/, '$1•••$2');
        WS.logAlert({ at: new Date().toISOString(), email: masked, summary: U.$$('#alSummary .chip', root).map((c) => c.textContent).join(' · '), frequency: s.frequency });
        dlg.el.querySelector('.dialog').innerHTML = `<div class="dialog-h"><div><h2 id="dlg-t">Alert created</h2><p>We'll email ${U.esc(email)} ${s.frequency === 'weekly' ? 'every Sunday with' : 'as soon as we detect'} matching price drops.</p></div>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close dialog">${U.icon('x')}</button></div>
          <div class="dialog-b"><div class="notice notice-info">${U.icon('check')}<span>To change or stop this alert later, use the unsubscribe link in any alert email and create a new one.</span></div></div>
          <div class="dialog-f">${ctx?.params ? '<button type="button" class="btn btn-secondary" id="alSaveSearch">Also save this search</button>' : ''}<button type="button" class="btn btn-primary" data-close>Done</button></div>`;
        U.$('#alSaveSearch', dlg.el)?.addEventListener('click', () => { WS.saveSearch(ctx.params); dlg.close(); });
        U.$('[data-close]', dlg.el).focus();
      });
    },
  };

  /* ---------------------------------------------------------- compare tray */
  function renderTray() {
    const root = U.$('#tray-root'); if (!root) return;
    const list = WS.compare();
    if (!list.length) { root.innerHTML = ''; return; }
    root.innerHTML = `<div class="tray" role="region" aria-label="Compare properties">
      <span class="small" style="white-space:nowrap;color:#C9D3E3">${U.icon('compare', 'icon-sm')}</span>
      <div class="tray-items">${list.map((x) => `<span class="tray-item"><span title="${U.esc(x.address)}">${U.esc(x.address)}</span><button type="button" data-rm="${U.esc(x.id)}" aria-label="Remove ${U.esc(x.address)} from compare">${U.icon('x', 'icon-sm')}</button></span>`).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-clear style="color:#C9D3E3">Clear</button>
      <button type="button" class="btn btn-primary btn-sm" data-cmp ${list.length < 2 ? 'disabled title="Add at least 2 properties"' : ''}>Compare ${list.length}</button></div>`;
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('#tray-root [data-rm], #tray-root [data-clear], #tray-root [data-cmp]'); if (!t) return;
    if (t.dataset.rm) { WS.toggleCompare({ id: t.dataset.rm }); }
    else if (t.hasAttribute('data-clear')) WS.clearCompare();
    else UI.openCompare();
  });
  document.addEventListener('ws:change', renderTray);
  document.addEventListener('DOMContentLoaded', renderTray);

  UI.openCompare = async () => {
    const ids = WS.compare().map((x) => x.id);
    const dlg = UI.dialog({ title: 'Compare properties', sub: 'Side-by-side facts from the MLS feed plus NJREindex calculations. The ● marks the most favorable value for a buyer where one exists.', size: 'lg', body: UI.skeletonRows(4) });
    try {
      const [rows, deals] = await Promise.all([
        L.fetchByIds(ids),
        App.sb.from('deal_scores').select('listing_id,grade,score,expected_close').filter('listing_id', 'in', '(' + ids.map((i) => '"' + i + '"').join(',') + ')').then((r) => r.data || [], () => []),
      ]);
      const cities = [...new Set(rows.map((r) => r.city))];
      const outs = cities.length ? (await App.sb.from('town_outcomes').select('city,median_close,pct_at_or_over_ask,median_days_to_close').in('city', cities)).data || [] : [];
      const O = Object.fromEntries(outs.map((o) => [o.city, o]));
      const D = Object.fromEntries(deals.map((d) => [d.listing_id, d]));
      const ordered = ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
      const missing = ids.filter((id) => !rows.some((r) => r.id === id));
      if (!ordered.length) { U.$('.dialog-b', dlg.el).innerHTML = UI.state('These properties are no longer active', 'They may have gone under contract or been withdrawn.'); return; }
      const best = (vals, dir) => { const v = vals.filter((x) => x != null); if (v.length < 2) return null; return dir === 'min' ? Math.min(...v) : Math.max(...v); };
      const row = (label, get, fmt, dir) => {
        const vals = ordered.map(get); const b = dir ? best(vals, dir) : null;
        return `<tr><td>${U.esc(label)}</td>${vals.map((v) => `<td class="${b != null && v === b ? 'best' : ''}">${v == null ? '<span class="muted">—</span>' : fmt(v)}</td>`).join('')}</tr>`;
      };
      const grp = (t) => `<tr class="grp"><td colspan="${ordered.length + 1}">${U.esc(t)}</td></tr>`;
      U.$('.dialog-b', dlg.el).innerHTML = `<div style="overflow-x:auto"><table class="cmp-table" style="width:100%">
        <thead><tr><th scope="col">Property</th>${ordered.map((r) => `<th scope="col"><a href="${U.qs({ view: 'property', id: r.id })}" data-close-link>${U.esc(r.street)}</a><div class="muted small" style="font-weight:500">${U.esc(r.city)}</div></th>`).join('')}</tr></thead><tbody>
        ${grp('Price')}
        ${row('Asking price', (r) => r.price, U.money, 'min')}
        ${row('Highest known asking price', (r) => r.orig, U.money)}
        ${row('Total reduction', (r) => (r.cum || null), (v) => U.money(v), 'max')}
        ${row('Tracked price cuts', (r) => r.cuts || null, U.int, 'max')}
        ${row('$ per sq ft', (r) => r.ppsf, (v) => '$' + v, 'min')}
        ${row('vs. town $/sq ft', (r) => (r.ppsfGap != null ? Math.round(r.ppsfGap) : null), (v) => U.pct(v, 0, true), 'min')}
        ${grp('Property')}
        ${row('Type', (r) => r.ptype, U.esc)}
        ${row('Bedrooms', (r) => r.beds, U.int, 'max')}
        ${row('Bathrooms', (r) => r.baths, (v) => v, 'max')}
        ${row('Living area (sq ft)', (r) => r.sqft, U.int, 'max')}
        ${row('Lot', (r) => r.lot, U.esc)}
        ${row('Year built', (r) => r.year, (v) => v, 'max')}
        ${grp('Market')}
        ${row('Days on market', (r) => r.dom, U.int, 'max')}
        ${row('Deal grade (NJREindex)', (r) => D[r.id]?.grade || null, (v) => U.esc(v))}
        ${row('Expected close (estimate)', (r) => D[r.id]?.expected_close || null, U.money)}
        ${row('Town median sale (12 mo)', (r) => O[r.city]?.median_close || null, U.money)}
        ${row('Town: sold at/over ask', (r) => O[r.city]?.pct_at_or_over_ask ?? null, (v) => v + '%', 'min')}
        </tbody></table></div>
        ${missing.length ? `<div class="notice small">${U.icon('info', 'icon-sm')}<span>${missing.length} saved ${U.plural(missing.length, 'property is', 'properties are')} no longer in the active listing feed and ${U.plural(missing.length, 'was', 'were')} left out.</span></div>` : ''}
        <div class="legend-row">${UI.src('mls')} Listing facts ${UI.src('calc')} $/sq ft &amp; town comparisons ${UI.src('est')} Deal grade &amp; expected close</div>`;
      U.$$('[data-close-link]', dlg.el).forEach((a) => a.addEventListener('click', () => dlg.close()));
    } catch (e) {
      U.$('.dialog-b', dlg.el).innerHTML = UI.state('Comparison unavailable', 'Please try again.', 'alert', true);
    }
  };

  // The deal-score formula as implemented in poller.js (published verbatim so
  // the score is never an unexplained number).
  App.dealMethod = () => `<p><b>Score (0–100)</b> is a weighted blend of five measured components, each scaled 0–100:</p>
    <ul style="margin:6px 0 0;padding-left:18px">
      <li><b>Seller fatigue — 35%.</b> Tracked price cuts (1 cut = 30, 2 = 55, 3+ = 75) plus up to 25 points for days on market beyond the town median.</li>
      <li><b>Market softness — 20%.</b> Share of the town's closed sales that sold under asking, × 1.6.</li>
      <li><b>Pricing pressure — 15%.</b> How far the listing's $/sq ft sits above the town average (premium × 4) — overpriced homes face more pressure to cut.</li>
      <li><b>Motivation language — 20%.</b> 35 points per motivation phrase found in the listing description (for example "motivated" or "relocating").</li>
      <li><b>Cut velocity — 10%.</b> Faster successive cuts score higher; with a single cut, a cut in the last 21 days scores 40, otherwise 15.</li>
    </ul>
    <p style="margin-top:8px">Grades: A+ ≥ 80 · A ≥ 68 · B+ ≥ 56 · B ≥ 44 · C below 44. Weights are editorial (version 1) and are being validated against actual closing outcomes.</p>`;

  /* ------------------------------------------------------------ comparables */
  // Wraps the existing /api/comps Netlify function (unchanged contract).
  App.comps = {
    async fetch({ address, sqft, beds }) {
      const qs = new URLSearchParams({ address });
      if (sqft) qs.set('sqft', sqft);
      if (beds) qs.set('beds', beds);
      let resp;
      try { resp = await fetch('/api/comps?' + qs.toString()); } catch (e) { throw new Error('Comparables service is unreachable — check your connection.'); }
      const body = await resp.json().catch(() => null);
      if (!body) throw new Error('Comparables service unavailable — try again in a minute.');
      if (!body.success) throw new Error(body.error || 'Comparable-sales lookup failed.');
      return body;
    },
    render(host, r, { title = true } = {}) {
      const s = r.stats;
      if (!s.sale_count) {
        host.innerHTML = UI.state('No closed sales found nearby', `No residential MLS closings within ${U.esc(s.radius_mi)} mile in the last ${U.esc(s.months)} months. Try a nearby address.`, 'search');
        return;
      }
      const metrics = [
        UI.metric({ label: 'Closed sales', value: U.int(s.sale_count), meta: `Within ${s.radius_mi} mi · last ${s.months} months`, src: UI.src('mls') }),
        UI.metric({ label: 'Median sold price', value: U.moneyShort(s.median_price), meta: 'All qualifying nearby sales', src: UI.src('calc', 'Calc') }),
        s.median_ppsqft ? UI.metric({ label: 'Median $ per sq ft', value: '$' + U.int(s.median_ppsqft), meta: s.ppsqft_p25 ? `Middle half: $${U.int(s.ppsqft_p25)}–$${U.int(s.ppsqft_p75)}` : '', src: UI.src('calc', 'Calc') }) : '',
        s.implied_value ? UI.metric({ label: 'Implied value range', value: U.moneyShort(s.implied_value_low) + '–' + U.moneyShort(s.implied_value_high), meta: `At ${U.int(r.subject.sqft)} sq ft × middle-half $/sq ft. Not an appraisal.`, emph: true, src: UI.src('est') }) : '',
      ].join('');
      host.innerHTML = `${title ? `<div class="small muted" style="margin-bottom:10px">${U.icon('pin', 'icon-sm')} ${U.esc(r.subject.address)} — residential closings within ${U.esc(s.radius_mi)} mi, last ${U.esc(s.months)} months, ranked by distance, similarity, and recency.</div>` : ''}
        <div class="metrics" style="margin-bottom:14px">${metrics}</div><div class="comps-tbl"></div>
        <p class="small muted" style="margin-top:10px">Closed-sale data from ${U.esc(App.cfg.MLS_SHORT)}. "vs list" compares the sold price with the final asking price. Market data, not an appraisal.</p>`;
      UI.table(U.$('.comps-tbl', host), {
        id: 'comps', caption: 'Comparable closed sales', unit: 'comparable sales', pageSize: 15, exportName: null,
        sort: null,
        columns: [
          { key: 'address', label: 'Address', mobile: 'title', strong: true, fmt: (c) => U.esc(c.address) },
          { key: 'distance_mi', label: 'Distance', num: true, fmt: (c) => (c.distance_mi != null ? c.distance_mi + ' mi' : '—') },
          { key: 'close_date', label: 'Sold', fmt: (c) => U.esc(U.date(c.close_date)), sort: (c) => c.close_date || '' },
          { key: 'close_price', label: 'Price', num: true, strong: true, mobile: 'right', fmt: (c) => U.money(c.close_price) },
          { key: 'sale_vs_list_pct', label: 'vs list', num: true, fmt: (c) => (c.sale_vs_list_pct == null ? '—' : `<span class="${c.sale_vs_list_pct > 0 ? 'pos' : c.sale_vs_list_pct < 0 ? 'neg' : ''}">${U.pct(c.sale_vs_list_pct, 1, true)}</span>`) },
          { key: 'beds', label: 'Bd / Ba', num: true, fmt: (c) => (c.beds ?? '—') + ' / ' + (c.baths ?? '—') },
          { key: 'sqft', label: 'Sq ft', num: true, fmt: (c) => (c.sqft ? U.int(c.sqft) : '—') },
          { key: 'ppsqft', label: '$/sq ft', num: true, fmt: (c) => (c.ppsqft ? '$' + U.int(c.ppsqft) : '—') },
          { key: 'year_built', label: 'Built', num: true, hide: true, fmt: (c) => c.year_built || '—' },
          { key: 'dom', label: 'DOM', num: true, hide: true, fmt: (c) => (c.dom != null ? U.int(c.dom) : '—') },
          { key: 'type', label: 'Type', fmt: (c) => U.esc(c.type || '—') },
        ],
        rows: r.comps,
      });
    },
  };

  /* ------------------------------------------------------------------ maps */
  // Leaflet + clustering load on first use only (never on the homepage).
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  const CLUSTER = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/';
  UI.leaflet = (withCluster) => App.cached('leaflet:' + (withCluster ? 'c' : 'b'), async () => {
    U.loadCss(LEAFLET + 'leaflet.min.css');
    await U.loadScript(LEAFLET + 'leaflet.min.js');
    if (withCluster) {
      U.loadCss(CLUSTER + 'MarkerCluster.min.css');
      await U.loadScript(CLUSTER + 'leaflet.markercluster.min.js');
    }
    return window.L;
  }, 1e12);
  // Basemap tiles. OSM's public tile server is fine for development and light
  // traffic; production volume should move to a keyed provider by changing
  // App.cfg.TILES (the muted/dark look is applied with CSS filters).
  App.cfg.TILES = App.cfg.TILES || {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19,
  };
  UI.tiles = (map) => {
    const t = App.cfg.TILES;
    return window.L.tileLayer(t.url, { maxZoom: t.maxZoom, attribution: t.attribution, className: 'njre-tiles' }).addTo(map);
  };
  UI.markerColor = (r) => (r.lastCut ? getComputedStyle(document.documentElement).getPropertyValue('--map-marker-cut').trim() || '#D99A31'
    : getComputedStyle(document.documentElement).getPropertyValue('--map-marker').trim() || '#087F8C');

  /* ---------------------------------------------------------- notifications */
  // Changes on watched properties since the user last looked: price moves and
  // listings that left the active feed. Computed from live data, stored locally.
  App.notifications = {
    items: [],
    async refresh() {
      const saved = WS.saved();
      const dot = U.$('#notifDot');
      if (!saved.length) { this.items = []; if (dot) dot.hidden = true; return; }
      try {
        const cur = await L.fetchByIds(saved.map((s) => s.id));
        const byId = new Map(cur.map((r) => [r.id, r]));
        this.items = [];
        for (const s of saved) {
          const r = byId.get(s.id);
          if (!r) { if (!s.goneSeen) this.items.push({ id: s.id, kind: 'gone', address: s.address, city: s.city }); }
          else if (r.price !== s.seenPrice) this.items.push({ id: s.id, kind: 'price', address: s.address, city: s.city, from: s.seenPrice, to: r.price, at: r.lastCut?.date });
        }
        if (dot) { dot.hidden = !this.items.length; dot.textContent = this.items.length; }
      } catch (e) { /* offline */ }
    },
    render(menu) {
      const it = this.items;
      menu.innerHTML = `<div class="menu-label">Watched property changes</div>
        ${it.length ? it.map((n) => `<a class="menu-item notif-item" href="${U.qs({ view: 'property', id: n.id })}" style="display:block">
          <b>${U.esc(n.address.split(',')[0])}</b> <span class="muted small">${U.esc(n.city)}</span><br>
          ${n.kind === 'gone' ? '<span class="small">No longer in the active listing feed (may be under contract, sold, or withdrawn)</span>'
            : `<span class="small ${n.to < n.from ? 'pos' : 'neg'}">Price ${n.to < n.from ? 'reduced' : 'increased'} ${U.money(n.from)} → ${U.money(n.to)}</span>`}
        </a>`).join('') + '<div class="menu-sep"></div><button type="button" class="menu-item" id="notifSeen">' + U.icon('check') + 'Mark all as seen</button>'
        : `<div class="menu-note">${WS.saved().length ? 'No changes on your saved properties since you last checked.' : 'Save properties to get notified here when their price changes or they leave the market.'}</div>`}
        <a class="menu-item" href="?view=saved" data-link>${U.icon('bookmark')}Open saved properties</a>`;
      U.$('#notifSeen', menu)?.addEventListener('click', () => this.markSeen());
    },
    async markSeen() {
      const cur = await L.fetchByIds(WS.saved().map((s) => s.id));
      const byId = new Map(cur.map((r) => [r.id, r]));
      App.store.set('savedProps', WS.saved().map((s) => (byId.has(s.id) ? { ...s, seenPrice: byId.get(s.id).price, goneSeen: false } : { ...s, goneSeen: true })));
      await this.refresh(); App.closeMenus();
      App.toast('Marked as seen');
    },
  };
  document.addEventListener('ws:change', () => App.notifications.refresh());
})();

/* My Workspace: saved properties & searches, alerts, reports. Stored in this
   browser (no accounts exist); live prices come from the MLS views. */
(function () {
  'use strict';
  const App = window.App, U = App.u, UI = App.ui, L = App.listings, WS = App.ws;

  const head = (icon, title, sub) => `<div class="page-head"><div><div class="eyebrow">${U.icon(icon, 'icon-sm')}My workspace</div><h1 class="page-title">${title}</h1><p class="page-sub">${sub}</p></div></div>`;
  const localNote = `<div class="notice small" style="margin-bottom:16px">${U.icon('info', 'icon-sm')}<span>Your workspace is stored in this browser — no account needed. It won't follow you to another device or browser, and clearing site data removes it.</span></div>`;

  /* ----------------------------------------------------------------- saved */
  App.registerView('saved', {
    title: 'Saved',
    mount(el) { this.el = el; document.addEventListener('ws:change', () => { if (App.routeKey() === 'saved') this.render(); }); },
    show() { return this.render(); },
    async render() {
      const el = this.el;
      const props = WS.saved(), searches = WS.searches(), recent = WS.recent(), cmp = WS.compare();
      el.innerHTML = `<div class="page">${head('bookmark', 'Saved properties &amp; searches', 'Track price moves on homes you’re watching and see what’s new for the searches you care about.')}${localNote}
        <section><div class="section-h"><h2>Saved properties <span class="muted" style="font-weight:500">(${props.length})</span></h2>${props.length ? '<button type="button" class="btn btn-ghost btn-sm" id="wsSeen">' + U.icon('check', 'icon-sm') + 'Mark changes as seen</button>' : ''}</div>
          <div id="wsProps">${props.length ? UI.skeletonRows(Math.min(props.length, 4)) : `<div class="card">${UI.state('No saved properties yet', 'Use the bookmark on any listing or property page. We’ll show price changes here and in the notifications bell.', 'bookmark')}</div>`}</div></section>
        <section class="section"><div class="section-h"><h2>Saved searches <span class="muted" style="font-weight:500">(${searches.length})</span></h2><a class="btn btn-secondary btn-sm" href="?view=listings">${U.icon('plus', 'icon-sm')}New search</a></div>
          <div id="wsSearches">${searches.length ? '' : `<div class="card">${UI.state('No saved searches yet', 'Set filters on the Listings page, then choose “Save search.”', 'search')}</div>`}</div></section>
        ${cmp.length ? `<section class="section"><div class="section-h"><h2>Compare list <span class="muted" style="font-weight:500">(${cmp.length}/4)</span></h2><button type="button" class="btn btn-primary btn-sm" id="wsCmp" ${cmp.length < 2 ? 'disabled' : ''}>${U.icon('compare', 'icon-sm')}Compare</button></div>
          <div class="chips">${cmp.map((c) => `<span class="chip chip-plain"><a href="${U.qs({ view: 'property', id: c.id })}">${U.esc(c.address)}</a></span>`).join('')}</div></section>` : ''}
        ${recent.length ? `<section class="section"><div class="section-h"><h2>Recently viewed</h2><button type="button" class="btn btn-ghost btn-sm" id="wsClearRecent">Clear</button></div>
          <div class="card">${recent.slice(0, 10).map((r) => `<a class="rank-row is-click" href="${U.qs({ view: 'property', id: r.id })}" style="color:inherit;text-decoration:none"><div class="rank-n" style="font-size:13px">${U.icon('history', 'icon-sm')}</div><div><div class="rank-name">${U.esc(r.address.split(',')[0])}</div><div class="rank-sub">${U.esc(r.city)} · viewed ${U.esc(U.timeAgo(r.at))}</div></div><div class="rank-stats"><div class="v" style="font-size:14px">${U.moneyShort(r.price)}</div></div></a>`).join('')}</div></section>` : ''}
      </div>`;
      U.$('#wsSeen', el)?.addEventListener('click', () => App.notifications.markSeen().then(() => this.render()));
      U.$('#wsCmp', el)?.addEventListener('click', () => UI.openCompare());
      U.$('#wsClearRecent', el)?.addEventListener('click', () => { App.store.set('recent', []); this.render(); });
      if (props.length) this.renderProps(props);
      if (searches.length) this.renderSearches(searches);
    },
    async renderProps(props) {
      const host = U.$('#wsProps', this.el);
      let cur = [];
      try { cur = await L.fetchByIds(props.map((p) => p.id)); } catch (e) { /* show saved values */ }
      const by = new Map(cur.map((r) => [r.id, r]));
      host.innerHTML = `<div class="ws-grid">${props.map((s) => {
        const r = by.get(s.id);
        const delta = r ? r.price - s.price : null;
        const unseen = r && r.price !== s.seenPrice;
        return `<div class="card ws-item">
          <div class="ws-item-t"><a href="${U.qs({ view: 'property', id: s.id })}">${U.esc(s.address.split(',')[0])}</a>${unseen ? '<span class="badge badge-amber">Changed</span>' : ''}</div>
          <div class="small muted">${U.esc(s.city)} · saved ${U.esc(U.date(s.savedAt))}</div>
          ${r ? `<div class="row-between"><span class="strong num" style="font-size:17px">${U.money(r.price)}</span>
              ${delta ? `<span class="ws-change ${delta < 0 ? 'pos' : 'neg'}">${U.icon(delta < 0 ? 'trend-down' : 'trend-up', 'icon-sm')}${U.signedMoney(delta)} since saved</span>` : '<span class="small muted">No change since saved</span>'}</div>
              <div class="small muted">${r.dom != null ? U.int(r.dom) + ' days on market' : ''}${r.lastCut ? ' · last cut ' + U.esc(U.date(r.lastCut.date, 'short')) : ''}</div>`
            : `<div class="notice small">${U.icon('info', 'icon-sm')}<span>No longer in the active listing feed — it may be under contract, sold, or withdrawn. Saved at ${U.money(s.price)}.</span></div>`}
          <div class="row small"><a href="${U.qs({ view: 'property', id: s.id })}">Open report</a>
            ${r ? `<button type="button" class="link-btn" data-cmp="${U.esc(s.id)}">${WS.inCompare(s.id) ? 'In compare' : 'Compare'}</button>` : ''}
            <button type="button" class="link-btn" style="color:var(--neg);margin-left:auto" data-rm="${U.esc(s.id)}">${U.icon('trash', 'icon-sm')}Remove</button></div></div>`;
      }).join('')}</div>`;
      host.onclick = (e) => {
        const rm = e.target.closest('[data-rm]'); if (rm) { const s = props.find((x) => x.id === rm.dataset.rm); WS.toggleSave({ id: s.id }); }
        const c = e.target.closest('[data-cmp]'); if (c) { const r = by.get(c.dataset.cmp); if (r) WS.toggleCompare(r); }
      };
    },
    async renderSearches(searches) {
      const host = U.$('#wsSearches', this.el);
      const card = (s, stats) => `<div class="card ws-item">
        <div class="ws-item-t"><a href="${U.esc(s.url)}" data-open="${s.id}">${U.esc(s.name)}</a>${stats && (stats.newL || stats.newC) ? `<span class="badge badge-teal">${stats.newL + stats.newC} new</span>` : ''}</div>
        <div class="chips">${L.chips(s.params).map((c) => `<span class="chip chip-plain" style="height:24px;font-size:12px">${U.esc(c.v)}</span>`).join('') || '<span class="small muted">All active listings</span>'}</div>
        <div class="small muted">${stats ? `<b class="num" style="color:var(--text)">${U.int(stats.total)}</b> matching now · ${U.int(stats.newL)} new ${U.plural(stats.newL, 'listing')} and ${U.int(stats.newC)} new price ${U.plural(stats.newC, 'cut')} since ${U.esc(U.date(s.checkedAt, 'short'))}` : '<span class="skel skel-line" style="display:inline-block;width:220px;margin:0"></span>'}</div>
        <div class="row small"><a href="${U.esc(s.url)}" data-open="${s.id}">Open results</a><button type="button" class="link-btn" data-alert="${s.id}">${U.icon('bell', 'icon-sm')}Get alerts</button>
          <button type="button" class="link-btn" style="color:var(--neg);margin-left:auto" data-rmq="${s.id}">${U.icon('trash', 'icon-sm')}Delete</button></div></div>`;
      host.innerHTML = `<div class="ws-grid">${searches.map((s) => card(s, null)).join('')}</div>`;
      host.onclick = (e) => {
        const o = e.target.closest('[data-open]'); if (o) WS.touchSearch(o.dataset.open);
        const a = e.target.closest('[data-alert]'); if (a) { const s = searches.find((x) => x.id === a.dataset.alert); App.alertsDialog.open({ params: s.params }); }
        const d = e.target.closest('[data-rmq]'); if (d) WS.removeSearch(d.dataset.rmq);
      };
      try {
        const data = await L.load();
        if (App.routeKey() !== 'saved') return;
        host.innerHTML = `<div class="ws-grid">${searches.map((s) => {
          const p = { ...L.DEFAULTS, ...s.params };
          const m = L.filter(data.rows, p);
          const since = (s.checkedAt || s.createdAt).slice(0, 10);
          return card(s, { total: m.length, newL: m.filter((r) => r.listDate && r.listDate > since).length, newC: m.filter((r) => r.lastCut && r.lastCut.date.slice(0, 10) > since).length });
        }).join('')}</div>`;
      } catch (e) { /* counts are optional */ }
    },
  });

  /* ---------------------------------------------------------------- alerts */
  App.registerView('alerts', {
    title: 'Alerts',
    mount(el) { this.el = el; document.addEventListener('ws:change', () => { if (App.routeKey() === 'alerts') this.show(); }); },
    show() {
      const log = WS.alerts();
      this.el.innerHTML = `<div class="page page-narrow">${head('bell', 'Alerts &amp; subscriptions', 'Free email alerts when homes that match your criteria drop in price.')}
        <div class="cta-band"><div><h2>Create a price-drop alert</h2><p>Takes one step. Criteria carry over from whatever you're viewing — you can edit them in the dialog.</p></div>
          <button type="button" class="btn btn-primary btn-lg" data-action="alerts">${U.icon('bell')}Create alert</button></div>
        <section class="section"><div class="section-h"><h2>Alerts created in this browser</h2></div>
          ${log.length ? `<div class="card">${log.map((a) => `<div class="rank-row" style="grid-template-columns:36px minmax(0,1fr) auto"><div class="disc-ico" style="width:32px;height:32px">${U.icon('mail', 'icon-sm')}</div>
            <div><div class="rank-name">${U.esc(a.summary || 'All towns')}</div><div class="rank-sub">${U.esc(a.email)} · ${a.frequency === 'weekly' ? 'Weekly digest (Sundays)' : 'Instant'} · created ${U.esc(U.date(a.at))}</div></div>
            <span class="badge badge-green">${U.icon('check')}Active</span></div>`).join('')}</div>`
            : `<div class="card">${UI.state('No alerts created from this browser', 'Alerts you create will be listed here for reference.', 'bell')}</div>`}
          <p class="small muted" style="margin-top:10px">The status shown is as of creation. To change or stop an alert, use the one-click unsubscribe link in any alert email, then create a new alert with updated criteria.</p></section>
        <section class="section"><details class="disclosure" open><summary>${U.icon('info', 'icon-sm')}How alerts work</summary><div class="disclosure-b">
          <p><b>What triggers an alert.</b> NJREindex checks the ${U.esc(App.cfg.MLS_SHORT)} feed twice daily. When an active listing's price drops and it matches your criteria, you're notified. Alerts cover MLS price drops in the ${U.esc(App.cfg.REGION)}.</p>
          <p><b>Frequency.</b> Instant alerts arrive after the poll that detects the drop (at most one email per hour). Weekly digests arrive on Sundays with that week's biggest matching drops.</p>
          <p><b>Criteria.</b> Anything left blank means "any." Town choices match the MLS town name. County-only alerts use the county reported by the MLS, which is missing on roughly half of listings — choosing specific towns gives complete coverage.</p>
          <p><b>Privacy.</b> Your email is used only for alerts and is never shared or published.</p></div></details></section>
      </div>`;
    },
  });

  /* --------------------------------------------------------------- reports */
  App.registerView('reports', {
    title: 'Reports',
    mount(el) { this.el = el; },
    show() {
      const props = WS.saved().slice(0, 8);
      this.el.innerHTML = `<div class="page page-narrow">${head('report', 'Reports', 'Print or save to PDF from any research page. Each report carries its data sources, dates, and disclaimers.')}
        <div class="feat-grid">
          ${[
            ['building', 'Property report', 'Price history, comparable sales, public-record context, market context, deal factors, and your underwriting assumptions.', 'Open any property, then choose “Print report.”', '?view=property'],
            ['scale', 'Comparable-sale report', 'Closed MLS sales near an address with $/sq ft, sale-to-list, and an implied value range.', 'Run comparables, then choose “Print report.”', '?view=comps'],
            ['chart', 'Town market report', 'A town scorecard: active market, 12-month closed sales, price-cut signal, and recorded deed trends.', 'Open a town scorecard, then choose “Print.”', '?view=markets'],
          ].map(([i, t, d, how, h]) => `<div class="card feat"><h3>${U.icon(i)}${t}</h3><p>${d}</p><p class="small muted" style="margin-top:8px">${how}</p><a href="${h}">Start${U.icon('arrow-r', 'icon-sm')}</a></div>`).join('')}
        </div>
        <section class="section"><div class="section-h"><h2>Quick property reports</h2><span class="meta">From your saved properties</span></div>
          ${props.length ? `<div class="card">${props.map((p) => `<div class="rank-row" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="rank-name">${U.esc(p.address.split(',')[0])}</div><div class="rank-sub">${U.esc(p.city)}</div></div>
            <a class="btn btn-secondary btn-sm" href="${U.qs({ view: 'property', id: p.id })}">${U.icon('print', 'icon-sm')}Open report</a></div>`).join('')}</div>`
            : `<div class="card">${UI.state('No saved properties', 'Save properties to generate reports from here.', 'bookmark')}</div>`}</section>
        <p class="small muted section">Reports reproduce MLS data under the same IDX display rules as the site and are for personal research. Bulk exports of MLS data aren't offered; public-record tables can be exported as CSV from NJ Public Records.</p>
      </div>`;
    },
  });
})();

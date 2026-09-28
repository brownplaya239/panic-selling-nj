/* Comparables: closed MLS sales near any address (existing /api/comps function). */
(function () {
  'use strict';
  const App = window.App, U = App.u, UI = App.ui;
  let el, lastKey = '';

  App.registerView('comps', {
    title: 'Comparable Sales',
    mount(host) {
      el = host;
      el.innerHTML = `<div class="page page-narrow">
        <div class="page-head"><div><div class="eyebrow">${U.icon('scale', 'icon-sm')}Analyze</div><h1 class="page-title">Comparable sales</h1>
          <p class="page-sub">Enter any address in the ${U.esc(App.cfg.REGION)} to pull closed residential MLS sales within a mile over the last 12 months — sold prices, $/sq ft, and sale-to-list ratios.</p></div>
          <button type="button" class="btn btn-secondary btn-sm no-print" id="cpPrint" hidden>${U.icon('print', 'icon-sm')}Print report</button></div>
        <form class="card card-pad" id="cpForm" novalidate>
          <div class="form-row">
            <div class="field"><label for="cpAddr">Property address</label><input class="input" id="cpAddr" name="address" placeholder="123 Main St, Toms River NJ" autocomplete="street-address" required></div>
            <div class="field"><label for="cpSqft">Living area (sq ft)</label><input class="input num" id="cpSqft" name="sqft" inputmode="numeric" placeholder="Optional"></div>
            <div class="field"><label for="cpBeds">Bedrooms</label><input class="input num" id="cpBeds" name="beds" inputmode="numeric" placeholder="Optional"></div>
            <button class="btn btn-primary" type="submit" id="cpGo">${U.icon('search', 'icon-sm')}Find comparables</button>
          </div>
          <div class="field-err" id="cpErr" role="alert" style="margin-top:8px"></div>
          <p class="field-hint" style="margin-top:4px">Adding square footage enables an implied value range (middle-half $/sq ft × your size). Comparables are ranked by distance, size and bedroom similarity, and recency.</p>
        </form>
        <div class="section" id="cpOut"></div>
      </div>`;
      U.$('#cpForm', el).addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        const q = { view: 'comps', address: f.address.value.trim(), sqft: parseInt(f.sqft.value, 10) || '', beds: parseInt(f.beds.value, 10) || '' };
        if (!q.address) { U.$('#cpErr', el).textContent = 'Enter an address first.'; f.address.focus(); return; }
        App.go(U.qs(q), { keepScroll: true });
      });
      U.$('#cpPrint', el).addEventListener('click', () => window.print());
    },
    async show(host, sp) {
      const address = sp.get('address') || '', sqft = sp.get('sqft') || '', beds = sp.get('beds') || '';
      const f = U.$('#cpForm', el);
      f.address.value = address; f.sqft.value = sqft; f.beds.value = beds;
      const key = [address, sqft, beds].join('|');
      if (!address) { U.$('#cpOut', el).innerHTML = ''; U.$('#cpPrint', el).hidden = true; lastKey = ''; setTimeout(() => f.address.focus(), 50); return; }
      if (key === lastKey) return;
      lastKey = key;
      U.$('#cpErr', el).textContent = '';
      const out = U.$('#cpOut', el), btn = U.$('#cpGo', el);
      btn.disabled = true;
      out.innerHTML = `<div class="card card-pad">${UI.skeletonMetrics(4)}<div class="skel skel-block" style="margin-top:16px"></div><p class="small muted" style="margin-top:10px">Geocoding the address and pulling closed sales…</p></div>`;
      try {
        const body = await App.cached('comps:' + address + '|' + sqft + '|' + beds, () => App.comps.fetch({ address, sqft: +sqft || null, beds: +beds || null }), 30 * 60 * 1000);
        out.innerHTML = '<div class="card card-pad" id="cpRes"></div>';
        App.comps.render(U.$('#cpRes', out), body);
        U.$('#cpPrint', el).hidden = false;
      } catch (e) {
        lastKey = '';
        out.innerHTML = '';
        U.$('#cpErr', el).textContent = e.message || 'Comparable-sales lookup failed — please try again.';
      } finally { btn.disabled = false; }
    },
  });
})();

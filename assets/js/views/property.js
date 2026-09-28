/* Property Intelligence: one page per property that unifies MLS listing data,
   tracked price history, comparables, public records, market context, deal
   factors, an underwriting calculator, and private research notes.
   Every value is labeled MLS / public record / calculated / estimate / unavailable. */
(function () {
  'use strict';
  const App = window.App, U = App.u, UI = App.ui, L = App.listings, WS = App.ws;
  let el, cur = null, pmap = null, compsObs = null;

  const SECTIONS = [
    ['overview', 'Overview'], ['history', 'History'], ['comps', 'Comparables'], ['records', 'Public records'],
    ['taxes', 'Taxes & assessment'], ['market', 'Market context'], ['invest', 'Investment analysis'], ['notes', 'Notes'],
  ];
  const LROW = 'id,address,city,county,zip,neighborhood,property_type,property_class,bedrooms,bathrooms,sqft,lot_size,lot_acres,year_built,garage,current_price,original_price,list_date,days_on_market,status,latitude,longitude,listing_url,agent_name,office_name,description,tags,close_price,close_date,pending_date,zoning,senior_community';

  App.registerView('property', {
    title: () => (cur ? cur.street + ', ' + cur.city : 'Property Intelligence'),
    mount(host) { el = host; },
    async show(host, sp) {
      const id = sp.get('id');
      if (!id) { cur = null; return landing(); }
      if (cur && cur.id === id && el.dataset.pid === id) return;
      el.dataset.pid = id;
      pmap = null;
      el.innerHTML = `<div class="page">${UI.skeletonMetrics(4)}<div class="skel skel-block" style="margin-top:20px;height:260px"></div></div>`;
      try { await load(id); }
      catch (e) {
        el.innerHTML = `<div class="page">${UI.state('Property not found', 'This listing may have been removed from the MLS feed. <a href="?view=listings">Browse active listings</a>.', 'alert')}</div>`;
      }
    },
  });

  /* -------------------------------------------------------------- landing */
  async function landing() {
    el.dataset.pid = '';
    const recent = WS.recent(), saved = WS.saved();
    el.innerHTML = `<div class="page page-narrow">
      <div class="page-head"><div><div class="eyebrow">${U.icon('building', 'icon-sm')}Analyze</div><h1 class="page-title">Property Intelligence</h1>
        <p class="page-sub">One page per property: listing and price history, comparable sales, public records, market context, deal factors, and an underwriting calculator.</p></div></div>
      <div class="card card-pad"><div class="gsearch" id="ppSearch" role="search" style="max-width:none">
        <svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>
        <input class="input" type="search" placeholder="Search an active listing address, or any NJ address for comparables" aria-label="Search for a property" autocomplete="off" style="height:46px;font-size:15px">
      </div><p class="small muted" style="margin-top:10px">Active MLS listings open a full property report. For any other address, you can still run comparable sales.</p></div>
      <div class="grid-2 section">
        <div class="card"><div class="card-h"><h2>Recently viewed</h2></div><div class="card-b" id="ppRecent">${recent.length ? '' : '<p class="muted small">Properties you open will appear here.</p>'}</div></div>
        <div class="card"><div class="card-h"><h2>Saved properties</h2><a class="small" href="?view=saved">View all</a></div><div class="card-b" id="ppSaved">${saved.length ? '' : '<p class="muted small">Use the bookmark on any listing to save it.</p>'}</div></div>
      </div>
      <section class="section"><div class="section-h"><h2>Top-graded deals right now</h2><a class="small" href="?view=deals">Open Deal Screener</a></div><div class="card" id="ppTop">${UI.skeletonRows(4)}</div></section>
    </div>`;
    App.search.attach(U.$('#ppSearch', el));
    const li = (x) => `<a class="menu-item" href="${U.qs({ view: 'property', id: x.id })}" style="padding:8px 0"><span style="flex:1;min-width:0"><span class="strong" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(x.address.split(',')[0])}</span><span class="small muted">${U.esc(x.city)}</span></span><span class="num small">${U.moneyShort(x.price)}</span></a>`;
    if (recent.length) U.$('#ppRecent', el).innerHTML = recent.slice(0, 6).map(li).join('');
    if (saved.length) U.$('#ppSaved', el).innerHTML = saved.slice(0, 6).map(li).join('');
    try {
      const { data } = await App.cached('deals:top', () => App.sb.from('deal_scores').select('listing_id,address,city,grade,score,ask,expected_close,reasons').order('score', { ascending: false }).limit(6));
      U.$('#ppTop', el).innerHTML = (data || []).map((d) => `<div class="rank-row is-click" onclick="App.go('${U.qs({ view: 'property', id: d.listing_id })}')">
        <div class="grade ${U.gradeCls(d.grade)}" style="width:40px;height:40px;font-size:15px">${U.esc(d.grade)}</div>
        <div><a class="rank-name" href="${U.qs({ view: 'property', id: d.listing_id })}">${U.esc((d.address || '').split(',')[0])}</a><div class="rank-sub">${U.esc(d.city)} · ${U.esc((d.reasons || []).slice(0, 2).join(' · '))}</div></div>
        <div class="rank-stats"><div class="v">${U.moneyShort(d.ask)}</div><div class="s">est. close ${U.moneyShort(d.expected_close)}</div></div></div>`).join('') || UI.state('No scored deals yet', '');
    } catch (e) { U.$('#ppTop', el).innerHTML = UI.state('Deals unavailable', '', 'alert'); }
  }

  /* ----------------------------------------------------------------- load */
  async function load(id) {
    const [actives, lrowRes, drops, dealRes] = await Promise.all([
      L.fetchByIds([id]).catch(() => []),
      App.sb.from('listings').select(LROW).eq('id', id).maybeSingle(),
      App.sb.from('price_drops').select('price_before,price_after,drop_dollar,drop_pct,detected_at').eq('listing_id', id).order('detected_at', { ascending: false }).then((r) => r.data || [], () => []),
      App.sb.from('deal_scores').select('*').eq('listing_id', id).maybeSingle().then((r) => r.data, () => null),
    ]);
    const lr = lrowRes.data;
    let r = actives[0];
    if (!r && !lr) throw new Error('not found');
    if (!r) {
      r = L.normalize({
        listing_id: lr.id, price_after: lr.current_price, price_before: lr.original_price, address: lr.address, city: lr.city, county: lr.county,
        neighborhood: lr.neighborhood, zip: lr.zip, property_type: lr.property_type, bedrooms: lr.bedrooms, bathrooms: lr.bathrooms, sqft: lr.sqft,
        lot_size: lr.lot_size, year_built: lr.year_built, days_on_market: lr.days_on_market, list_date: lr.list_date, tags: lr.tags,
        latitude: lr.latitude, longitude: lr.longitude,
        // A closed sale's $/sq ft is based on what it sold for, not the last ask.
        ppsqft: lr.sqft > 0 ? Math.round((lr.status === 'Closed' && lr.close_price > 0 ? lr.close_price : lr.current_price) / lr.sqft) : null,
      }, null);
    }
    r.status = lr?.status || 'Active';
    r.lr = lr || {};
    r.drops = drops;
    r.deal = dealRes;
    cur = r;
    WS.pushRecent(r);
    if (App.routeKey() === 'property') document.title = r.street + ', ' + r.city + ' — NJREindex';
    render(r);
    loadAsync(r);
  }

  /* --------------------------------------------------------------- render */
  function kv(label, value, src, cls = '') {
    const na = value == null || value === '';
    return `<div><dt><span>${U.esc(label)}</span>${na ? '' : src || ''}</dt><dd class="${na ? 'na' : ''} ${cls}">${na ? 'Not reported' : value}</dd></div>`;
  }

  function render(r) {
    const lr = r.lr;
    const closed = r.status === 'Closed' && lr.close_price > 0;
    const statusBadge = closed ? `<span class="badge">${U.icon('check')}Closed ${U.esc(U.date(lr.close_date))}</span>`
      : r.status === 'Pending' ? '<span class="badge badge-amber">Under contract</span>'
      : r.status === 'Active' ? '<span class="badge badge-teal">Active listing</span>' : `<span class="badge">${U.esc(r.status)}</span>`;
    const saved = WS.isSaved(r.id), cmp = WS.inCompare(r.id);
    el.innerHTML = `<div class="page">
      <div class="print-only" style="margin-bottom:12px"><b>NJREindex property report</b> · generated ${U.esc(U.date(new Date().toISOString(), 'long'))} · ${U.esc(location.href)}</div>
      <nav class="small muted no-print" aria-label="Breadcrumb" style="margin-bottom:12px"><a href="?view=listings">Listings</a> › <a href="${U.qs({ view: 'listings', town: r.city })}">${U.esc(r.city)}</a> › <span aria-current="page">${U.esc(r.street)}</span></nav>
      <div class="pp-head">
        <div>
          <div class="row" style="margin-bottom:8px">${statusBadge}<span class="badge">${U.esc(r.ptype || 'Property')}</span>${r.lastCut ? `<span class="badge badge-amber">${U.icon('trend-down')}${r.cuts > 1 ? r.cuts + ' tracked price cuts' : 'Tracked price cut'}</span>` : ''}${r.deal ? `<span class="badge badge-teal">Deal grade ${U.esc(r.deal.grade)}</span>` : ''}</div>
          <h1 class="pp-addr">${U.esc(r.street)}</h1>
          <div class="pp-loc">${U.icon('pin', 'icon-sm')}<span>${U.esc(r.city)}, NJ ${U.esc(r.zip)}</span>${r.county ? `<span>· ${U.esc(r.county)} County${r.countyInferred ? ` <span class="muted small" data-tip="County from the ${U.esc(L.countySrcLabel(r.countySrc))}; the MLS feed doesn't report it correctly for this listing." tabindex="0">(inferred)</span>` : ''}</span>` : ''}${r.neighborhood ? `<span>· ${U.esc(r.neighborhood)}</span>` : ''}</div>
        </div>
        <div class="pp-price">
          <div class="small muted">${closed ? 'Sold price' : 'Asking price'} ${UI.src('mls')}</div>
          <div class="v">${U.money(closed ? lr.close_price : r.price)}</div>
          ${closed && r.price ? `<div class="small muted">Final asking ${U.money(r.price)} · <span class="${lr.close_price >= r.price ? 'pos' : 'neg'}">${U.pct(((lr.close_price - r.price) / r.price) * 100, 1, true)} vs ask</span></div>` : ''}
          ${!closed && r.orig && r.orig > r.price ? `<div class="small"><span class="muted">Was ${U.money(r.orig)}</span> · <span class="warn strong">−${U.money(r.cum)} (${U.pct(r.cumPct)})</span></div>` : ''}
          ${r.ppsf ? `<div class="small muted">$${U.int(r.ppsf)} per sq ft${closed ? ' (sold)' : ''} ${UI.src('calc', 'Calc')}</div>` : ''}
        </div>
      </div>
      <div class="pp-actions no-print">
        <button type="button" class="btn btn-secondary btn-sm" data-pa="save" aria-pressed="${saved}">${U.icon('bookmark', 'icon-sm')}<span>${saved ? 'Saved' : 'Save'}</span></button>
        <button type="button" class="btn btn-secondary btn-sm" data-pa="cmp" aria-pressed="${cmp}">${U.icon('compare', 'icon-sm')}<span>${cmp ? 'In compare' : 'Compare'}</span></button>
        <button type="button" class="btn btn-secondary btn-sm" data-pa="share">${U.icon('share', 'icon-sm')}Share</button>
        <button type="button" class="btn btn-secondary btn-sm" data-pa="print">${U.icon('print', 'icon-sm')}Print report</button>
        <button type="button" class="btn btn-secondary btn-sm" data-pa="alert">${U.icon('bell', 'icon-sm')}Alerts for ${U.esc(r.city)}</button>
        ${lr.listing_url ? `<a class="btn btn-ghost btn-sm" href="${U.esc(lr.listing_url)}" target="_blank" rel="noopener">${U.icon('external', 'icon-sm')}Listing site</a>` : `<a class="btn btn-ghost btn-sm" href="https://www.google.com/search?q=${encodeURIComponent(r.address + ' NJ')}" target="_blank" rel="noopener">${U.icon('external', 'icon-sm')}Search the web</a>`}
      </div>
      <div class="pp-subnav"><div class="tabs" role="tablist" aria-label="Property sections">${SECTIONS.map(([k, t], i) => `<a href="#pp-${k}" role="tab" aria-selected="${i === 0}" data-sec="${k}">${U.esc(t)}</a>`).join('')}</div></div>
      <div class="legend-row" style="margin-top:14px">Data labels: ${UI.src('mls')} ${UI.src('pr')} ${UI.src('calc')} ${UI.src('est')} ${UI.src('user')} ${UI.src('na')}</div>
      <div class="pp-layout">
        <div>
          ${secOverview(r)}
          ${secHistory(r)}
          <section class="pp-sec card" id="pp-comps" aria-labelledby="h-comps"><div class="card-h"><h2 id="h-comps">Comparable sales</h2>${UI.src('mls')}</div><div class="card-b" id="ppComps">${UI.skeletonMetrics(3)}</div></section>
          <section class="pp-sec card" id="pp-records" aria-labelledby="h-rec"><div class="card-h"><h2 id="h-rec">Ownership &amp; public records</h2>${UI.src('pr')}</div><div class="card-b" id="ppRecords">${UI.skeletonMetrics(3)}</div></section>
          <section class="pp-sec card" id="pp-taxes" aria-labelledby="h-tax"><div class="card-h"><h2 id="h-tax">Taxes &amp; assessment</h2>${UI.src('na')}</div><div class="card-b">
            <p class="small">Assessed value, tax amount, and tax history are <b>not yet available</b> in NJREindex. The source for this data is the State's MOD-IV municipal assessment file, which is not currently integrated. NJREindex does not estimate taxes.</p></div></section>
          <section class="pp-sec card" id="pp-market" aria-labelledby="h-mkt"><div class="card-h"><h2 id="h-mkt">Market context — ${U.esc(r.city)}</h2><a class="small no-print" href="${U.qs({ view: 'markets', town: r.city })}">Town scorecard</a></div><div class="card-b" id="ppMarket">${UI.skeletonMetrics(4)}</div></section>
          ${secInvest(r)}
          <section class="pp-sec card" id="pp-notes" aria-labelledby="h-notes"><div class="card-h"><h2 id="h-notes">Research notes</h2>${UI.src('user', 'Private')}</div><div class="card-b">
            <label class="sr-only" for="ppNote">Research notes for this property</label>
            <textarea class="textarea" id="ppNote" placeholder="Showing notes, questions for the listing agent, renovation observations…">${U.esc(WS.note(r.id))}</textarea>
            <div class="small muted" id="ppNoteStatus" style="margin-top:6px" aria-live="polite">Notes are saved in this browser only.</div></div></section>
          <p class="small muted" style="margin-top:20px">${U.esc(listingAttribution(r))} Information is deemed reliable but not guaranteed. Estimates and scores are NJREindex calculations, not appraisals, offers, or financial advice.</p>
        </div>
        <aside class="pp-side">
          <div class="pp-map no-print" id="ppMap" aria-label="Map showing property location"></div>
          ${sideDeal(r)}
          <div class="card"><div class="card-h"><h3>Listing details</h3>${UI.src('mls')}</div><div class="card-b small stack-sm">
            ${lr.office_name ? `<div><span class="muted">Listing courtesy of</span><br><b>${U.esc(lr.office_name)}</b>${lr.agent_name ? `<br><span class="muted">${U.esc(lr.agent_name)}</span>` : ''}</div>` : '<div class="muted">Listing brokerage not reported.</div>'}
            <div><span class="muted">Listed</span> ${U.esc(U.date(r.listDate || lr.list_date))}${r.dom != null ? ` · ${U.int(r.dom)} days on market` : ''}</div>
            ${r.tags.length ? `<div class="row">${r.tags.map((t) => `<span class="badge">${U.esc(t.charAt(0) + t.slice(1).toLowerCase())}</span>`).join('')}</div>` : ''}
          </div></div>
          <div class="card no-print"><div class="card-b stack-sm small">
            <a href="${U.qs({ view: 'listings', town: r.city })}">${U.icon('list', 'icon-sm')} Active listings in ${U.esc(r.city)}</a>
            <a href="${U.qs({ view: 'sales', town: r.city })}">${U.icon('file', 'icon-sm')} Recent sales in ${U.esc(r.city)}</a>
            <a href="${U.qs({ view: 'deals', town: r.city })}">${U.icon('target', 'icon-sm')} Deal Screener: ${U.esc(r.city)}</a>
          </div></div>
        </aside>
      </div></div>`;
    bindPage(r);
  }

  const listingAttribution = (r) => (r.lr.office_name ? `Listing courtesy of ${r.lr.office_name}. ` : '') + `Listing data from the ${App.cfg.MLS_NAME} (${App.cfg.MLS_SHORT}) IDX feed.`;

  function secOverview(r) {
    const lr = r.lr;
    const desc = lr.description ? `<p style="margin-top:14px;line-height:1.65">${U.esc(lr.description)}</p>` : '';
    return `<section class="pp-sec card" id="pp-overview" aria-labelledby="h-ov"><div class="card-h"><h2 id="h-ov">Property overview</h2><span class="small muted">${UI.src('mls')} unless labeled</span></div><div class="card-b">
      <dl class="kv kv-4" style="margin:0">
        ${kv('Bedrooms', r.beds)}
        ${kv('Bathrooms', r.baths)}
        ${kv('Living area', r.sqft ? U.int(r.sqft) + ' sq ft' : null)}
        ${kv('Year built', r.year)}
        ${kv('Lot size', r.lot || (lr.lot_acres ? lr.lot_acres + ' acres' : null))}
        ${kv('Property type', U.esc(r.ptype))}
        ${kv('Garage', lr.garage ? U.esc(lr.garage) : null)}
        ${kv('Zoning (per listing)', lr.zoning ? U.esc(lr.zoning) : null)}
        ${kv('$ per sq ft', r.ppsf ? '$' + U.int(r.ppsf) : null, UI.src('calc', 'Calc'))}
        ${kv('Town avg $/sq ft', r.townPpsf ? '$' + U.int(r.townPpsf) : null, UI.src('calc', 'Calc'))}
        ${kv('vs. town average', r.ppsfGap != null ? U.pct(r.ppsfGap, 0, true) : null, UI.src('calc', 'Calc'), r.ppsfGap != null && r.ppsfGap < 0 ? 'pos' : '')}
        ${kv('55+ community', lr.senior_community ? 'Yes' : (lr.senior_community === false ? 'No' : null))}
      </dl>
      ${lr.zoning ? '<p class="small muted" style="margin-top:8px">Zoning is as described in the listing and has not been verified against municipal records.</p>' : ''}
      ${desc}</div></section>`;
  }

  function secHistory(r) {
    const lr = r.lr;
    const ev = [];
    const firstAsk = Math.max(r.drops.length ? r.drops[r.drops.length - 1].price_before : 0, lr.original_price || 0) || r.orig;
    if (r.listDate || lr.list_date) ev.push({ d: r.listDate || lr.list_date, dot: '', t: 'Listed for sale', x: firstAsk ? `Asking price ${U.money(firstAsk)}${r.drops.length ? '' : ' (as reported by the MLS)'}` : '', src: 'mls' });
    for (const h of r.drops) ev.push({ d: h.detected_at, dot: 'amber', t: 'Price reduced', x: `${U.money(h.price_before)} → <b>${U.money(h.price_after)}</b> <span class="warn">(−${U.money(h.drop_dollar)}, ${U.pct(h.drop_pct)})</span>`, src: 'mls' });
    if (lr.pending_date) ev.push({ d: lr.pending_date, dot: 'slate', t: 'Under contract', x: '', src: 'mls' });
    if (lr.close_date && lr.close_price) ev.push({ d: lr.close_date, dot: 'green', t: 'Closed (MLS)', x: `Sold for <b>${U.money(lr.close_price)}</b>`, src: 'mls' });
    ev.sort((a, b) => String(b.d).localeCompare(String(a.d)));
    return `<section class="pp-sec card" id="pp-history" aria-labelledby="h-hist"><div class="card-h"><h2 id="h-hist">Sales &amp; listing history</h2><span class="small muted">Newest first</span></div><div class="card-b">
      <ul class="timeline" id="ppTimeline">${ev.map((e) => `<li><span class="tl-dot ${e.dot}"></span><div class="tl-date">${U.esc(U.date(e.d))} ${UI.src(e.src)}</div><div class="tl-t">${U.esc(e.t)}</div>${e.x ? `<div class="tl-d">${e.x}</div>` : ''}</li>`).join('')}</ul>
      ${!r.drops.length ? '<p class="small muted" style="margin-top:12px">No price changes detected since NJREindex began tracking this listing. Price changes before tracking began are reflected only in the original-vs-current comparison.</p>' : ''}
      <p class="small muted" style="margin-top:8px" id="ppDeedNote"></p></div></section>`;
  }

  function sideDeal(r) {
    const d = r.deal;
    if (!d) return `<div class="card"><div class="card-b small muted">${U.icon('target', 'icon-sm')} No deal score — scores are computed only for active listings with at least one tracked price cut.</div></div>`;
    return `<div class="card"><div class="card-h"><h3>Deal score</h3>${UI.src('est')}</div><div class="card-b stack-sm">
      <div class="row"><div class="grade ${U.gradeCls(d.grade)}">${U.esc(d.grade)}</div><div><div class="strong num">${U.int(d.score)} / 100</div><div class="small muted">Seller-capitulation score</div></div></div>
      ${d.expected_close ? `<div class="small"><span class="muted">Expected close</span> <b class="num">${U.money(d.expected_close)}</b><br><span class="muted">Range ${U.money(d.expected_low)} – ${U.money(d.expected_high)} · based on ${U.int(d.cohort_n)} closed sellers</span></div>` : ''}
      <a class="small" href="#pp-invest">See the factors${U.icon('arrow-r', 'icon-sm')}</a></div></div>`;
  }

  function secInvest(r) {
    const d = r.deal;
    const buy = d?.expected_close || r.price;
    const factors = d ? `<div class="stack-sm"><div class="row"><div class="grade ${U.gradeCls(d.grade)}">${U.esc(d.grade)}</div><div><div class="strong">Score ${U.int(d.score)} / 100 ${UI.src('est')}</div><div class="small muted">Computed ${U.esc(U.timeAgo(d.computed_at))} from the MLS feed and closed-sale outcomes</div></div></div>
        <div class="eyebrow" style="margin-top:6px">Factors behind this score</div>
        <ul class="reason-list">${(d.reasons || []).map((x) => `<li>${U.icon('check')}${U.esc(x)}</li>`).join('')}</ul>
        ${(d.motivation_tags || []).length ? `<div class="row">${d.motivation_tags.map((t) => `<span class="badge badge-amber">${U.esc(t)}</span>`).join('')}</div>` : ''}
        ${d.expected_close ? `<div class="notice small">${U.icon('info', 'icon-sm')}<span>Expected close <b>${U.money(d.expected_close)}</b> (range ${U.money(d.expected_low)}–${U.money(d.expected_high)}) = current ask × the discount that ${U.int(d.cohort_n)} past sellers with ${Math.min(3, d.cut_count)}${d.cut_count >= 3 ? ' or more' : ''} cut${d.cut_count === 1 ? '' : 's'} actually accepted (middle half of outcomes).${d.cut_again_pct != null ? ` ${d.cut_again_pct}% of those sellers cut again before selling.` : ''}</span></div>` : ''}
        <details class="disclosure"><summary>How the deal score works</summary><div class="disclosure-b">
          ${App.dealMethod()}
          <p>Bid guidance appears only when the comparison group has 20 or more graded closings. Every expected-close number is stored and later graded against the actual sale price. This is market guidance — not an appraisal, offer, or financial advice.</p></div></details></div>`
      : `<p class="small muted">No deal score for this property. Scores are computed for active listings with at least one tracked price cut.</p>`;
    return `<section class="pp-sec card" id="pp-invest" aria-labelledby="h-inv"><div class="card-h"><h2 id="h-inv">Investment analysis</h2></div><div class="card-b stack">
      ${factors}
      <div class="divider"></div>
      <div><h3 style="font-size:15px;display:flex;align-items:center;gap:8px">${U.icon('calc')}Underwriting calculator ${UI.src('user', 'Your assumptions')}</h3>
      <p class="small muted" style="margin-top:4px">Every input is editable. Defaults are starting points, not recommendations${d?.expected_close ? ' — purchase price starts at the estimated expected close' : ''}.</p></div>
      <form class="calc-grid" id="ppCalc" onsubmit="return false">
        ${[['buy', 'Purchase price ($)', Math.round(buy)], ['close', 'Buying closing costs (% of price)', 2], ['reno', 'Renovation budget ($)', 0], ['months', 'Holding period (months)', 6],
          ['hold', 'Monthly holding costs ($) — taxes, insurance, utilities', 0], ['down', 'Down payment (% of price; 100 = cash)', 100], ['rate', 'Loan interest rate (% per year)', 7], ['exit', 'Exit (resale) price ($)', Math.round(r.price)], ['sell', 'Selling costs (% of exit price)', 5]]
          .map(([k, l, v]) => `<div class="field"><label for="calc-${k}">${U.esc(l)}</label><input class="input num" id="calc-${k}" name="${k}" type="number" inputmode="decimal" step="any" value="${v}"></div>`).join('')}
      </form>
      <div class="calc-out" id="ppCalcOut" aria-live="polite"></div>
      <p class="small muted">Interest is simple interest on the loan for the holding period. Results exclude income taxes, financing fees, and rental income. For education only — not financial advice.</p>
    </div></section>`;
  }

  function calc() {
    const f = U.$('#ppCalc', el); if (!f) return;
    const v = (k) => parseFloat(f.elements[k].value) || 0;
    const buy = v('buy'), closeC = buy * v('close') / 100, reno = v('reno'), months = v('months'), hold = v('hold') * months;
    const down = Math.min(100, Math.max(0, v('down'))) / 100, loan = buy * (1 - down), interest = loan * (v('rate') / 100) * (months / 12);
    const exit = v('exit'), sellC = exit * v('sell') / 100;
    const cash = buy * down + closeC + reno + hold + interest;
    const total = buy + closeC + reno + hold + interest;
    const profit = exit - sellC - total;
    const roi = cash > 0 ? (profit / cash) * 100 : null;
    const ann = roi != null && months > 0 ? (Math.pow(1 + profit / cash, 12 / months) - 1) * 100 : null;
    const row = (l, val, cls = '') => `<div class="${cls}"><span>${l}</span><span>${val}</span></div>`;
    U.$('#ppCalcOut', el).innerHTML =
      row('Purchase price', U.money(buy)) + row('Closing costs', U.money(closeC)) + row('Renovation', U.money(reno))
      + row(`Holding costs (${months} mo)`, U.money(hold)) + (loan ? row(`Loan ${U.money(loan)} · interest`, U.money(interest)) : '')
      + row('Total project cost', U.money(total), 'tot') + row('Exit price less selling costs', U.money(exit - sellC))
      + row('Estimated profit', `<span class="${profit >= 0 ? 'pos' : 'neg'}">${U.signedMoney(Math.round(profit))}</span>`, 'tot')
      + row('Cash invested', U.money(cash)) + row('Return on cash', roi == null ? '—' : U.pct(roi, 1, true))
      + row('Annualized return', ann == null || !isFinite(ann) ? '—' : U.pct(ann, 1, true));
  }

  /* ------------------------------------------------------------- behaviors */
  function bindPage(r) {
    el.onclick = (e) => {
      const b = e.target.closest('[data-pa]'); if (!b) return;
      const a = b.dataset.pa;
      if (a === 'save') { WS.toggleSave(r); const s = WS.isSaved(r.id); b.setAttribute('aria-pressed', s); b.querySelector('span').textContent = s ? 'Saved' : 'Save'; }
      if (a === 'cmp') { WS.toggleCompare(r); const c = WS.inCompare(r.id); b.setAttribute('aria-pressed', c); b.querySelector('span').textContent = c ? 'In compare' : 'Compare'; }
      if (a === 'print') window.print();
      if (a === 'alert') App.alertsDialog.open({ town: r.city, county: r.county, params: { ...L.DEFAULTS, town: r.city } });
      if (a === 'share') {
        const url = location.href;
        if (navigator.share) navigator.share({ title: r.street + ' — NJREindex', url }).catch(() => {});
        else navigator.clipboard?.writeText(url).then(() => App.toast('Link copied'));
      }
    };
    // Section nav: smooth scroll + scroll-spy
    const tabs = U.$$('[data-sec]', el);
    tabs.forEach((t) => t.addEventListener('click', (e) => { e.preventDefault(); U.$('#pp-' + t.dataset.sec, el)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    const spy = new IntersectionObserver((ents) => {
      for (const en of ents) if (en.isIntersecting) tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.sec === en.target.id.slice(3))));
    }, { rootMargin: '-35% 0px -60% 0px' });
    SECTIONS.forEach(([k]) => { const s = U.$('#pp-' + k, el); if (s) spy.observe(s); });
    // Calculator
    U.$('#ppCalc', el).addEventListener('input', calc); calc();
    // Notes
    const note = U.$('#ppNote', el);
    note.addEventListener('input', U.debounce(() => { WS.note(r.id, note.value.trim()); U.$('#ppNoteStatus', el).textContent = 'Saved in this browser · ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }, 400));
    // Comparables load when the section approaches the viewport
    compsObs?.disconnect();
    compsObs = new IntersectionObserver((ents) => { if (ents.some((x) => x.isIntersecting)) { compsObs.disconnect(); loadComps(r); } }, { rootMargin: '300px' });
    compsObs.observe(U.$('#pp-comps', el));
  }

  async function loadComps(r) {
    const host = U.$('#ppComps', el); if (!host) return;
    try {
      // The listing's MLS coordinates avoid geocoding failures on lots and
      // new-construction addresses (e.g. "0 Trinity Court … Model").
      const body = await App.cached('comps:' + r.id + '|' + (r.sqft || '') + '|' + (r.beds || ''), () => App.comps.fetch({ address: r.address, sqft: r.sqft, beds: r.beds, lat: r.lat, lon: r.lng }), 30 * 60 * 1000);
      if (cur !== r) return;
      App.comps.render(host, body, { title: true });
      host.insertAdjacentHTML('beforeend', `<a class="btn btn-secondary btn-sm no-print" style="margin-top:10px" href="${U.qs({ view: 'comps', address: r.address, sqft: r.sqft || '', beds: r.beds || '', lat: r.lat ?? '', lon: r.lng ?? '' })}">Open in Comparables${U.icon('arrow-r', 'icon-sm')}</a>`);
    } catch (e) {
      host.innerHTML = UI.state('Comparable sales unavailable', U.esc(e.message) + ` <button type="button" class="link-btn" id="ppCompsRetry">Retry</button>`, 'alert');
      U.$('#ppCompsRetry', host)?.addEventListener('click', () => { App.invalidate('comps:'); host.innerHTML = UI.skeletonMetrics(3); loadComps(r); });
    }
  }

  const SUF = { street: 'st', avenue: 'ave', av: 'ave', drive: 'dr', road: 'rd', court: 'ct', lane: 'ln', place: 'pl', boulevard: 'blvd', terrace: 'ter', circle: 'cir', highway: 'hwy', parkway: 'pkwy', trail: 'trl', east: 'e', west: 'w', north: 'n', south: 's' };
  const streetKey = (s) => String(s || '').toLowerCase().split(',')[0].replace(/(#|\bunit\b|\bapt\b).*$/, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((w) => SUF[w] || w).join(' ');

  async function loadAsync(r) {
    // Map
    if (r.lat != null && r.lng != null) {
      UI.leaflet(false).then((Lf) => {
        const box = U.$('#ppMap', el); if (!box || cur !== r) return;
        pmap = Lf.map(box, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView([r.lat, r.lng], 15);
        UI.tiles(pmap);
        Lf.circleMarker([r.lat, r.lng], { radius: 9, weight: 3, color: '#fff', fillColor: UI.markerColor(r), fillOpacity: 1 }).addTo(pmap);
      }).catch(() => { const b = U.$('#ppMap', el); if (b) b.innerHTML = UI.state('Map unavailable', '', 'map'); });
    } else { const b = U.$('#ppMap', el); if (b) b.innerHTML = UI.state('Location not reported', 'The MLS feed has no coordinates for this listing.', 'map'); }

    // Market context
    const town = r.city;
    const [ts, to, ce] = await Promise.all([
      App.cached('ts:' + town, () => App.sb.from('town_stats').select('*').eq('city', town).maybeSingle().then((x) => x.data)).catch(() => null),
      App.cached('to:' + town, () => App.sb.from('town_outcomes').select('*').eq('city', town).maybeSingle().then((x) => x.data, () => null)).catch(() => null),
      App.cached('ce:' + town, () => App.sb.from('cut_edge').select('*').eq('grain', 'town').eq('area', town).maybeSingle().then((x) => x.data, () => null)).catch(() => null),
    ]);
    if (cur !== r) return;
    const mk = U.$('#ppMarket', el);
    const m = [];
    if (ts) {
      m.push(UI.metric({ label: 'Active listings in town', value: U.int(ts.active_count), meta: 'Residential, MLS, right now' }));
      m.push(UI.metric({ label: 'Town median asking price', value: U.moneyShort(ts.median_price), meta: `This property: ${U.moneyShort(r.price)} (${U.pct(((r.price - ts.median_price) / ts.median_price) * 100, 0, true)})` }));
      m.push(UI.metric({ label: 'Town median days on market', value: U.int(ts.median_dom), meta: r.dom != null ? `This property: ${U.int(r.dom)} days` : '' }));
      m.push(UI.metric({ label: 'Listings with a price cut', value: ts.pct_with_cut + '%', meta: ts.cut_again_30_pct != null ? `${ts.cut_again_30_pct}% of cutters cut again within 30 days` : '' }));
    }
    if (to) {
      m.push(UI.metric({ label: 'Closed sales, 12 months', value: U.int(to.sold_count), meta: `Median ${U.moneyShort(to.median_close)} · ${U.int(to.median_days_to_close)} days list-to-close` }));
      m.push(UI.metric({ label: 'Sold at or over asking', value: to.pct_at_or_over_ask + '%', meta: `Median sale ${U.pct(to.median_sold_vs_list, 1, true)} vs ask · n=${U.int(to.sold_count)}`, tip: 'Share of closed sales (last 12 months, $200K+, non-commercial) whose sale price met or exceeded the final asking price.' }));
    }
    if (ce && ce.cut_n >= 10) m.push(UI.metric({ label: 'Homes that cut price: at/over ask', value: ce.cut_over_ask_pct + '%', delta: { v: ce.edge_over_ask_pp, text: (ce.edge_over_ask_pp > 0 ? '+' : '') + ce.edge_over_ask_pp + 'pp', label: 'vs. town baseline', invert: true }, meta: `n=${U.int(ce.cut_n)} cut sales, shrunk toward county average`, tip: 'How homes that had a price cut sold compared with homes that did not, in this town over 12 months. A negative gap means cutters give buyers more leverage.' }));
    mk.innerHTML = m.length ? `<div class="metrics">${m.join('')}</div><div style="margin-top:12px">${UI.provenance([{ icon: 'database', text: 'MLS listing and closed-sale data (' + App.cfg.MLS_SHORT + ')' }, { icon: 'info', text: 'Towns use MLS city names' }])}</div>`
      : UI.state('Not enough market data for ' + town, 'Town statistics appear once the sample is large enough to be reliable.', 'chart');

    // Public records: municipality match + monthly trend + deed match
    const rec = U.$('#ppRecords', el);
    try {
      const muni = await App.matchMuni(r.city, r.county);
      if (cur !== r) return;
      let html = `<div class="notice small" style="margin-bottom:14px">${U.icon('shield', 'icon-sm')}<span>Owner names are not displayed. NJREindex does not publish owner identities or mortgage details.</span></div>`;
      if (!muni) {
        html += `<p class="small">No unique public-records municipality matches the MLS town name "<b>${U.esc(r.city)}</b>". MLS towns are often postal names (for example "Whiting" or "Forked River") that span or differ from official municipalities. <a href="${U.qs({ view: 'records', tab: 'towns', county: r.county || '' })}">Browse municipalities${r.county ? ' in ' + U.esc(r.county) + ' County' : ''}</a>.</p>`;
        rec.innerHTML = html; return;
      }
      const w = await App.muniWindows(muni.scope_id);
      const yoy = w.ytd26 && w.sp25 && w.sp25.res_median ? ((w.ytd26.res_median - w.sp25.res_median) / w.sp25.res_median) * 100 : null;
      html += `<p class="small" style="margin-bottom:10px">Municipality: <b>${U.esc(muni.scope_label)}</b>, ${U.esc(muni.county)} County · recorded arm's-length residential sales</p>
        <div class="metrics">
          ${w.w12 ? UI.metric({ label: 'Recorded sales, 12 months', value: U.int(w.w12.res_n), meta: 'State SR-1A deed records' }) : ''}
          ${w.w12 ? UI.metric({ label: 'Median recorded price', value: U.moneyShort(w.w12.res_median), delta: yoy != null ? { v: yoy, label: 'YTD YoY' } : null, meta: 'Trailing 12 months' }) : ''}
          ${w.w12 && w.w12.res_med_ppsf ? UI.metric({ label: 'Median $ per sq ft', value: '$' + U.int(w.w12.res_med_ppsf), meta: r.ppsf ? `This listing asks $${U.int(r.ppsf)}/sq ft` : '' }) : ''}
        </div><div id="ppPrChart" style="margin-top:16px"></div>`;
      rec.innerHTML = html;
      const { data: months } = await App.cached('prm:' + muni.scope_id, () => App.sb.from('pr_town_stats').select('ym,res_n,res_median').eq('muni_code', muni.scope_id).order('ym'));
      if (cur !== r) return;
      if (months && months.length) {
        const ms = months.slice(-18);
        UI.chart(U.$('#ppPrChart', rec), {
          title: 'Monthly recorded sales and median price, ' + muni.scope_label,
          labels: ms.map((x) => U.date(x.ym + '-15', 'month')), bars: ms.map((x) => x.res_n), line: ms.map((x) => (x.res_n >= 3 ? x.res_median : null)),
          barName: 'Recorded sales', lineName: 'Median price (months with 3+ sales)', height: 220,
        });
      }
      // Deed match within the recent-deeds window
      const num = (r.street.match(/^\s*(\d+[a-z]?)\b/i) || [])[1];
      if (num) {
        const { data: deeds } = await App.sb.from('pr_recent_sales').select('address,price,deed_date,recorded_date,sqft,year_built').eq('municipality', muni.scope_label).ilike('address', num + ' %').limit(40);
        const k = streetKey(r.street);
        const hit = (deeds || []).find((d) => streetKey(d.address) === k);
        const note = U.$('#ppDeedNote', el);
        if (hit) {
          U.$('#ppTimeline', el)?.insertAdjacentHTML('afterbegin', `<li><span class="tl-dot slate"></span><div class="tl-date">${U.esc(U.date(hit.deed_date))} ${UI.src('pr')}</div><div class="tl-t">Deed recorded (arm's-length sale)</div><div class="tl-d">Recorded price <b>${U.money(hit.price)}</b> · recorded ${U.esc(U.date(hit.recorded_date))}</div></li>`);
          if (note) note.innerHTML = 'A matching recorded deed was found in the State SR-1A file by street address.';
        } else if (note) note.textContent = 'No recorded deed for this address in the State file\'s most recent months of recordings.';
      }
    } catch (e) {
      rec.innerHTML = UI.state('Public records unavailable', 'Please try again later.', 'alert');
    }
  }
})();

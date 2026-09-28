/* Agent & Brokerage Rankings. Ranking logic, windows, rollups, disambiguation,
   profile aggregation, and claim flow are ported unchanged from the legacy UI
   (methodology frozen at be01c62); only presentation and brand text changed. */
(function () {
  'use strict';
  const App = window.App, U = App.u, UI = App.ui;
  let el;
  let _boardType = 'office';
  const _boardRows = { office: null, agent: null };
  let _profileCtx = null;
  const WIN = {
    '1y': { sides: 'sides_1y', vol: 'volume_1y', label: 'Trailing 12 months' },
    'ytd': { sides: 'sides_ytd', vol: 'volume_ytd', label: new Date().getFullYear() + ' year-to-date' },
    '6m': { sides: 'sides_6m', vol: 'volume_6m', label: 'Last 6 months' },
    '1m': { sides: 'sides_1m', vol: 'volume_1m', label: 'Last 30 days' },
  };
  function srcNotice() {
    const d = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return 'Based on information from Monmouth Ocean Regional REALTORS® MLS as of ' + d + '. Not an official MLS ranking; independently computed by NJREindex Market Leaderboards.';
  }

  App.registerView('rankings', {
    title: 'Agent & Brokerage Rankings',
    mount(host) {
      el = host;
      el.innerHTML = `<div class="page page-narrow">
        <div class="page-head"><div><div class="eyebrow">${U.icon('ranks', 'icon-sm')}Market intelligence</div><h1 class="page-title">Agent &amp; brokerage rankings</h1>
          <p class="page-sub">Computed solely from MLS-recorded closed transactions in Monmouth &amp; Ocean County, NJ. Rankings state exactly what they measure — never "best" or "top-performing."</p></div></div>
        <div id="bdMain">
          <div class="filterbar" role="group" aria-label="Ranking options">
            <div class="seg" role="group" aria-label="Ranking type">
              <button type="button" id="bdOffices" aria-pressed="true">${U.icon('building', 'icon-sm')}Brokerages</button>
              <button type="button" id="bdAgents" aria-pressed="false">${U.icon('user', 'icon-sm')}Agents <span class="badge badge-beta" style="margin-left:2px">Beta</span></button>
            </div>
            <select class="select" id="bdWindow" aria-label="Time window"><option value="1y">Trailing 12 months</option><option value="ytd">Year to date</option><option value="6m">Last 6 months</option><option value="1m">Last 30 days</option></select>
            <select class="select" id="bdMetric" aria-label="Rank by"><option value="volume">Rank by $ volume</option><option value="sides">Rank by sides</option></select>
            <select class="select" id="bdEntity" aria-label="Brokerage entity"><option value="office">Office rankings</option><option value="brand">Brand networks</option></select>
            <span class="count" id="bdCount"></span>
          </div>
          <div class="notice notice-warn" id="bdBeta" style="margin-top:12px" hidden>${U.icon('alert', 'icon-sm')}<span>Agent rankings are in <b>verification beta</b> — figures are provisional until agents verify their profiles. Rankings reflect MLS-recorded transaction sides only; co-agented sides are split 50/50.</span></div>
          <div class="row-between" style="margin:16px 0 8px"><span class="small muted" id="bdPeriod"></span>${UI.src('mls')}</div>
          <div class="card" id="bdList">${UI.skeletonRows(8)}</div>
        </div>
        <div id="bdProfile" hidden></div>
        <details class="disclosure" style="margin-top:16px" open><summary>${U.icon('info', 'icon-sm')}Methodology</summary><div class="disclosure-b">
          <p><b>Scope.</b> Rankings are computed solely from MLS-recorded closed transactions in Monmouth &amp; Ocean County, NJ, credited to the listing and buyer agents/offices of record.</p>
          <p><b>Agent credit:</b> each transaction contributes one listing side and one buyer side; an agent recorded on a side receives 1.0 credited side and 100% of that side's volume — unless a co-listing or co-buyer agent is recorded, in which case each co-agent receives 0.5 credited side and 50% of the volume. An agent recorded on both sides of the same transaction is credited both sides ("double-ended").</p>
          <p><b>Brokerage attribution:</b> the canonical brokerage ranking entity is the MLS Office ID (the branch office of record), so independent brokerages are compared against equivalent operating units; same-name branches are shown with their office number. "Brand networks" is a supplemental, name-based rollup and is not the canonical ranking.</p>
          <p><b>Exclusions:</b> recorded closings outside a $50K–$25M sanity band, or closing more than 3× above / 4× below final asking, are excluded as likely data-entry errors; out-of-MLS ("non-member") sides are excluded because the MLS records them under a placeholder identity, not a licensed member of record.</p>
          <p><b>Verification:</b> "Profile verified" means NJREindex matched the claimant to the MLS identity of record; it is not an MLS endorsement, award, or statement of quality.</p>
          <p><b>Terminology:</b> rankings state exactly what they measure — e.g. "#1 by closed volume" — and are never a claim of being the "best" or "top-performing" professional. Rankings are provisional and may change as attribution is corrected, records are normalized, additional transactions are ingested, and claims are verified. No payment affects rankings.</p>
          <p id="bdSrc"></p></div></details>
      </div>`;
      U.$('#bdOffices', el).addEventListener('click', () => setBoardType('office'));
      U.$('#bdAgents', el).addEventListener('click', () => setBoardType('agent'));
      ['bdWindow', 'bdMetric', 'bdEntity'].forEach((id) => U.$('#' + id, el).addEventListener('change', () => { renderBoardRows(); syncUrl(); }));
      U.$('#bdList', el).addEventListener('click', (e) => { const r = e.target.closest('[data-pid]'); if (r) openProfile(r.dataset.ptype, r.dataset.pid, +r.dataset.rank); });
      U.$('#bdList', el).addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const r = e.target.closest('[data-pid]'); if (r) { e.preventDefault(); openProfile(r.dataset.ptype, r.dataset.pid, +r.dataset.rank); } } });
    },
    async show(host, sp) {
      U.$('#bdSrc', el).textContent = srcNotice();
      _boardType = sp.get('type') === 'agent' || (sp.get('lb') || '').startsWith('a:') ? 'agent' : 'office';
      U.$('#bdWindow', el).value = WIN[sp.get('win')] ? sp.get('win') : '1y';
      U.$('#bdMetric', el).value = sp.get('metric') === 'sides' ? 'sides' : 'volume';
      if (!(_boardRows.office && _boardRows.agent)) {
        try {
          const [o, a] = await Promise.all([
            App.sb.from('office_leaderboard').select('*').order('volume_1y', { ascending: false }).limit(500),
            App.sb.from('agent_leaderboard').select('*').order('volume_1y', { ascending: false }).limit(1000),
          ]);
          if (o.error || a.error) throw (o.error || a.error);
          _boardRows.office = o.data || [];
          _boardRows.agent = a.data || [];
        } catch (e) {
          U.$('#bdList', el).innerHTML = UI.state('Rankings unavailable', 'Please try again shortly.', 'alert', true);
          return;
        }
      }
      setBoardType(_boardType, true);
      // Shared profile links: ?lb=a:AGENTID or ?lb=o:OFFICEID
      const lb = sp.get('lb');
      if (lb && /^[ao]:/.test(lb)) {
        const type = lb[0] === 'o' ? 'office' : 'agent';
        const id = decodeURIComponent(lb.slice(2));
        if (type === 'agent') setBoardType('agent', true);
        const key = U.$('#bdMetric', el).value === 'sides' ? WIN['1y'].sides : WIN['1y'].vol;
        const ranked = _boardRows[type].filter((r) => (r[key] || 0) > 0).sort((a, b) => (b[key] || 0) - (a[key] || 0));
        const idx = ranked.findIndex((r) => String(type === 'office' ? r.office_id : r.agent_id) === String(id));
        if (idx >= 0) openProfile(type, id, idx + 1);
        else { App.toast('Profile not found — showing current rankings'); App.replaceParams('?view=rankings'); }
      } else closeProfile(true);
    },
  });

  function syncUrl() {
    const q = { view: 'rankings' };
    if (_boardType === 'agent') q.type = 'agent';
    const w = U.$('#bdWindow', el).value; if (w !== '1y') q.win = w;
    if (U.$('#bdMetric', el).value === 'sides') q.metric = 'sides';
    App.replaceParams(U.qs(q));
  }
  function setBoardType(t, noUrl) {
    _boardType = t;
    U.$('#bdOffices', el).setAttribute('aria-pressed', String(t === 'office'));
    U.$('#bdAgents', el).setAttribute('aria-pressed', String(t === 'agent'));
    U.$('#bdBeta', el).hidden = t !== 'agent';
    U.$('#bdEntity', el).hidden = t !== 'office';
    renderBoardRows();
    if (!noUrl) syncUrl();
  }
  // Brand networks = supplemental name-based rollup of Office-ID rows. The
  // Office-ID board is the canonical ranking; this is informational only.
  function brandRollup(rows) {
    const m = new Map();
    for (const r of rows) {
      const b = m.get(r.office_name) || { office_name: r.office_name, office_id: null, _offices: 0,
        sides_1y: 0, volume_1y: 0, sides_6m: 0, volume_6m: 0, sides_1m: 0, sides_ytd: 0,
        volume_ytd: 0, sides_mtd: 0, sides_wtd: 0, active_count: 0, active_volume: 0, pending_count: 0 };
      b._offices++;
      for (const k of ['sides_1y', 'volume_1y', 'sides_6m', 'volume_6m', 'sides_1m', 'sides_ytd', 'volume_ytd', 'sides_mtd', 'sides_wtd', 'active_count', 'active_volume', 'pending_count'])
        b[k] += (r[k] || 0);
      m.set(r.office_name, b);
    }
    return [...m.values()];
  }
  function renderBoardRows() {
    let rows = _boardRows[_boardType];
    if (!rows) return;
    const isBrand = _boardType === 'office' && U.$('#bdEntity', el).value === 'brand';
    if (isBrand) rows = brandRollup(rows);
    const w = WIN[U.$('#bdWindow', el).value] || WIN['1y'];
    const metric = U.$('#bdMetric', el).value;
    const key = metric === 'sides' ? w.sides : (w.vol || w.sides);
    U.$('#bdPeriod', el).textContent = w.label + ' · Monmouth & Ocean County, NJ' + (isBrand ? ' · supplemental brand rollup' : '');
    const ranked = rows.filter((r) => (r[key] || 0) > 0).sort((x, y) => (y[key] || 0) - (x[key] || 0)).slice(0, 25);
    U.$('#bdCount', el).textContent = 'Top ' + ranked.length;
    const nameCounts = {};
    if (_boardType === 'office' && !isBrand) for (const r of ranked) nameCounts[r.office_name] = (nameCounts[r.office_name] || 0) + 1;
    U.$('#bdList', el).innerHTML = ranked.map((r, i) => {
      const name = _boardType === 'office' ? r.office_name : r.agent_name;
      const id = _boardType === 'office' ? r.office_id : r.agent_id;
      const vol = r[w.vol];
      const disamb = (!isBrand && _boardType === 'office' && nameCounts[name] > 1) ? ` <span class="small muted">· Office #${U.esc(r.office_id)}</span>` : '';
      const clickable = !isBrand;
      return `<div class="rank-row${i < 3 ? ' top3' : ''}${clickable ? ' is-click' : ''}"${clickable ? ` role="link" tabindex="0" data-ptype="${_boardType}" data-pid="${U.esc(String(id))}" data-rank="${i + 1}" aria-label="#${i + 1} ${U.esc(name)} — open profile"` : ''}>
        <div class="rank-n">${i + 1}</div>
        <div style="min-width:0"><div class="rank-name">${U.esc(name)}${disamb}</div>
          <div class="rank-sub">${_boardType === 'agent' ? U.esc(r.office_name || '') + ' · ' : ''}${isBrand ? r._offices + ' office' + (r._offices > 1 ? 's' : '') + ' · ' : ''}${U.int(r.active_count)} active · ${U.int(r.pending_count)} pending</div></div>
        <div class="rank-stats"><div class="v">${vol != null && !(metric === 'sides' && w.vol == null) ? U.moneyShort(vol) : U.int(r[w.sides] || 0) + ' sides'}</div>
          <div class="s">${r[w.sides] || 0} sides${vol != null ? '' : ' (volume n/a this window)'}</div></div></div>`;
    }).join('') || UI.state('No closings recorded in this window yet', '', 'ranks');
  }

  // PROFILE — the shareable landing page for a ranked agent/office
  async function openProfile(type, id, rank) {
    const row = (_boardRows[type] || []).find((r) => String(type === 'office' ? r.office_id : r.agent_id) === String(id));
    if (!row) { App.toast('Profile not found — showing rankings'); return; }
    const w = WIN[U.$('#bdWindow', el).value] || WIN['1y'];
    const name = type === 'office' ? row.office_name : row.agent_name;
    _profileCtx = { type, id, rank, row, w, name };
    App.replaceParams('?lb=' + (type === 'office' ? 'o' : 'a') + ':' + encodeURIComponent(id));
    if (App.routeKey() === 'rankings') document.title = name + ' — NJREindex Rankings';
    U.$('#bdMain', el).hidden = true;
    const pv = U.$('#bdProfile', el); pv.hidden = false;
    const metric = U.$('#bdMetric', el).value === 'sides' ? 'closed sides' : 'closed volume';
    pv.innerHTML = `
      <button type="button" class="btn btn-ghost btn-sm" id="pBack">${U.icon('arrow-l', 'icon-sm')}Back to rankings</button>
      <div class="card card-pad" style="margin-top:12px"><div class="row-between" style="align-items:flex-start">
        <div><h2 style="font-size:22px">${U.esc(name)} <span id="pVerified"></span></h2>
          ${type === 'agent' ? `<div class="muted">${U.esc(row.office_name || '')}</div>` : ''}
          <div class="strong" style="margin-top:8px;color:var(--accent-text)">#${rank} by ${metric} · ${U.esc(w.label)} · Monmouth &amp; Ocean County</div></div>
        <div class="row"><button type="button" class="btn btn-primary btn-sm" id="pCard">${U.icon('download', 'icon-sm')}Social card</button>
          <button type="button" class="btn btn-secondary btn-sm" id="pClaim">${U.icon('shield', 'icon-sm')}Claim this profile</button></div></div></div>
      <div class="metrics" style="margin-top:12px">
        ${UI.metric({ label: '12-month volume', value: row.volume_1y != null ? U.moneyShort(row.volume_1y) : '—' })}
        ${UI.metric({ label: '12-month sides', value: U.int(row.sides_1y || 0) })}
        ${type === 'agent' ? UI.metric({ label: 'List / buy sides', value: (row.list_sides_1y || 0) + ' / ' + (row.buy_sides_1y || 0) }) : ''}
        ${UI.metric({ label: 'YTD volume', value: row.volume_ytd != null ? U.moneyShort(row.volume_ytd) : '—' })}
        ${UI.metric({ label: 'Active now', value: U.int(row.active_count) })}
        ${UI.metric({ label: 'Pending', value: U.int(row.pending_count) })}
      </div>
      <div class="grid-2" style="margin-top:12px">
        <div class="card"><div class="card-h"><h3>Active listings</h3>${UI.src('mls')}</div><div class="card-b" id="pActives"><div class="skel skel-line"></div></div></div>
        <div class="card"><div class="card-h"><h3>Recent activity · trailing 90 days</h3>${UI.src('calc', 'Aggregated')}</div><div class="card-b" id="pActivity"><div class="skel skel-line"></div></div></div>
      </div>
      <p class="small muted" style="margin-top:12px">${U.esc(srcNotice())}</p>`;
    U.$('#pBack', pv).addEventListener('click', () => closeProfile());
    U.$('#pCard', pv).addEventListener('click', downloadCard);
    U.$('#pClaim', pv).addEventListener('click', openClaim);
    window.scrollTo(0, 0);
    // Verified badge — means NJREindex matched the claimant to the MLS identity;
    // it is NOT an MLS endorsement (verified_profiles exposes only type+id)
    try {
      const { data: v } = await App.sb.from('verified_profiles').select('subject_id').eq('subject_type', type).eq('subject_id', String(id)).maybeSingle();
      if (v) U.$('#pVerified', pv).innerHTML = `<span class="badge badge-green" style="vertical-align:middle">${U.icon('shield')}Profile verified</span>`;
    } catch (e) { /* badge is a bonus */ }
    // Actives (public IDX display) + AGGREGATED closed activity — individual
    // closed-transaction records are deliberately not listed on public profiles.
    try {
      const filt = type === 'agent' ? 'agent_id.eq.' + id : 'list_office_id.eq."' + id + '",office_name.eq."' + name + '"';
      const buyFilt = type === 'agent' ? 'buyer_agent_id.eq.' + id : 'buyer_office_id.eq."' + id + '",buyer_office_name.eq."' + name + '"';
      const since90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const [act, listSide, buySide] = await Promise.all([
        App.sb.from('listings').select('id,address,city,current_price').or(filt).eq('status', 'Active').order('current_price', { ascending: false }).limit(6),
        App.sb.from('listings').select('city,close_price').or(filt).eq('status', 'Closed').gt('close_price', 0).gte('close_date', since90).limit(500),
        App.sb.from('listings').select('city,close_price').or(buyFilt).eq('status', 'Closed').gt('close_price', 0).gte('close_date', since90).limit(500),
      ]);
      U.$('#pActives', pv).innerHTML = (act.data || []).map((r) => `<a class="menu-item" href="${U.qs({ view: 'property', id: r.id })}" style="padding:7px 0"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(r.address)}</span><b class="num">${U.money(r.current_price)}</b></a>`).join('') || '<p class="small muted">None on record</p>';
      const ls = listSide.data || [], bs = buySide.data || [], all90 = ls.concat(bs);
      if (!all90.length) U.$('#pActivity', pv).innerHTML = '<p class="small muted">No recorded closings in the last 90 days</p>';
      else {
        const vol = all90.reduce((s, r) => s + r.close_price, 0);
        const towns = {};
        for (const r of all90) if (r.city) towns[r.city] = (towns[r.city] || 0) + 1;
        const topTowns = Object.entries(towns).sort((a, b) => b[1] - a[1]).slice(0, 3).map((t) => t[0]).join(', ');
        const arow = (k, v) => `<div class="row-between small" style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="muted">${U.esc(k)}</span><b class="num">${U.esc(v)}</b></div>`;
        U.$('#pActivity', pv).innerHTML = arow('Closed sides', String(all90.length)) + arow('Closed volume', U.moneyShort(vol))
          + arow('Listing-side share', Math.round((100 * ls.length) / all90.length) + '%') + (topTowns ? arow('Most active in', topTowns) : '')
          + arow('Median sale', U.moneyShort(all90.map((r) => r.close_price).sort((a, b) => a - b)[Math.floor(all90.length / 2)]));
      }
    } catch (e) { /* profile lists are a bonus */ }
  }
  function closeProfile(noUrl) {
    _profileCtx = null;
    U.$('#bdProfile', el).hidden = true;
    U.$('#bdMain', el).hidden = false;
    if (App.routeKey() === 'rankings') document.title = 'Agent & Brokerage Rankings — NJREindex';
    if (!noUrl) syncUrl();
  }

  // SOCIAL CARD — canvas-rendered PNG with period + source notice baked in
  function downloadCard() {
    const p = _profileCtx; if (!p) return;
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1080;
    const x = c.getContext('2d');
    x.fillStyle = '#101D34'; x.fillRect(0, 0, 1080, 1080);
    x.strokeStyle = '#087F8C'; x.lineWidth = 6; x.strokeRect(40, 40, 1000, 1000);
    x.fillStyle = '#5FC4CE'; x.font = '600 34px Inter, Arial, sans-serif'; x.textAlign = 'center';
    x.fillText('NJREINDEX MARKET LEADERBOARDS', 540, 150);
    x.fillStyle = '#9FB0C8'; x.font = '26px Inter, Arial, sans-serif';
    x.fillText('MONMOUTH & OCEAN COUNTY, NJ', 540, 195);
    x.fillStyle = '#FFFFFF'; x.font = '700 150px Inter, Arial, sans-serif';
    x.fillText('#' + p.rank, 540, 400);
    const metric = U.$('#bdMetric', el).value === 'sides' ? 'BY CLOSED SIDES' : 'BY CLOSED VOLUME';
    x.fillStyle = '#E8EDF5'; x.font = '600 34px Inter, Arial, sans-serif';
    x.fillText((p.type === 'office' ? 'BROKERAGE ' : 'AGENT ') + metric, 540, 460);
    x.font = '700 44px Inter, Arial, sans-serif';
    x.fillText(p.name.length > 38 ? p.name.slice(0, 37) + '…' : p.name, 540, 560);
    if (p.type === 'agent' && p.row.office_name) {
      x.fillStyle = '#9FB0C8'; x.font = '28px Inter, Arial, sans-serif';
      x.fillText(p.row.office_name.length > 44 ? p.row.office_name.slice(0, 43) + '…' : p.row.office_name, 540, 605);
    }
    const w = p.w;
    const vol = p.row[w.vol] != null ? U.moneyShort(p.row[w.vol]) : null;
    x.fillStyle = '#D99A31'; x.font = '700 56px Inter, Arial, sans-serif';
    x.fillText((vol ? vol + '  ·  ' : '') + (p.row[w.sides] || 0) + ' sides', 540, 710);
    x.fillStyle = '#9FB0C8'; x.font = '28px Inter, Arial, sans-serif';
    x.fillText(w.label + ' · closed transactions of record', 540, 765);
    // Milestone badges — only thresholds the 12-month data actually supports
    const miles = [];
    const v1y = p.row.volume_1y || 0, s1y = p.row.sides_1y || 0;
    if (p.rank <= 10) miles.push('TOP 10');
    if (v1y >= 100e6) miles.push('$100M+ CLOSED (12MO)');
    else if (v1y >= 50e6) miles.push('$50M+ CLOSED (12MO)');
    else if (v1y >= 25e6) miles.push('$25M+ CLOSED (12MO)');
    if (s1y >= 100) miles.push('100+ SIDES (12MO)');
    else if (s1y >= 50) miles.push('50+ SIDES (12MO)');
    if (miles.length) { x.fillStyle = '#5FC4CE'; x.font = '600 24px Inter, Arial, sans-serif'; x.fillText(miles.join('  ·  '), 540, 820); }
    x.fillStyle = '#7D8FAB'; x.font = '20px Inter, Arial, sans-serif';
    x.fillText(location.host + '/?lb=' + (p.type === 'office' ? 'o' : 'a') + ':' + p.id, 540, 900);
    const notice = srcNotice();
    x.font = '15px Inter, Arial, sans-serif';
    x.fillText(notice.slice(0, 78), 540, 950);
    x.fillText(notice.slice(78, 160), 540, 975);
    const aTag = document.createElement('a');
    aTag.download = 'njreindex-leaderboard-' + p.type + '-' + p.id + '.png';
    aTag.href = c.toDataURL('image/png');
    aTag.click();
  }

  // CLAIM FLOW — writes to profile_claims (insert-only for anon)
  function openClaim() {
    const p = _profileCtx; if (!p) return;
    const dlg = UI.dialog({
      title: 'Claim this profile', sub: U.esc(p.name) + ' — ' + (p.type === 'office' ? 'Brokerage' : 'Agent') + ' profile',
      body: `<div class="field"><label for="clName">Full name</label><input class="input" id="clName" autocomplete="name" required></div>
        <div class="field"><label for="clEmail">Email <span class="muted" style="font-weight:400">(ideally your MLS email)</span></label><input class="input" id="clEmail" type="email" autocomplete="email" required></div>
        <div class="grid-2"><div class="field"><label for="clPhone">Phone <span class="muted" style="font-weight:400">(optional)</span></label><input class="input" id="clPhone" type="tel" autocomplete="tel"></div>
        <div class="field"><label for="clLicense">NJ license # <span class="muted" style="font-weight:400">(optional)</span></label><input class="input" id="clLicense"></div></div>
        <div class="field-err" id="clErr" role="alert"></div>`,
      foot: '<span class="grow">We verify against MLS records. Contact information is never published.</span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-primary" id="clSubmit">Submit claim</button>',
    });
    const $ = (s) => U.$(s, dlg.el);
    $('#clSubmit').addEventListener('click', async () => {
      const name = $('#clName').value.trim(), email = $('#clEmail').value.trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('#clErr').textContent = 'Name and a valid email are required.'; return; }
      const btn = $('#clSubmit'); btn.disabled = true; btn.textContent = 'Submitting…';
      const { error } = await App.sb.from('profile_claims').insert({
        subject_type: p.type, subject_id: String(p.id), subject_name: p.name, claimant_name: name, email,
        phone: $('#clPhone').value.trim() || null, license_no: $('#clLicense').value.trim() || null,
      });
      btn.disabled = false; btn.textContent = 'Submit claim';
      if (error) { $('#clErr').textContent = 'Could not submit — please try again.'; return; }
      dlg.close();
      App.toast("Claim submitted — we'll verify against MLS records and follow up by email.");
    });
  }
})();


const SUPABASE_URL      = 'https://ynndoetrygfukebjumuv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlubmRvZXRyeWdmdWtlYmp1bXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2Nzc1NjIsImV4cCI6MjA4OTI1MzU2Mn0.27ysWyqqZ0Dk5PdN8vYFkUBpb_8w4KlvPqNeQu_CbPw';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allDrops    = [];
let currentArea = 'all';
let currentType = 'all';
let currentBed  = 'any';

//  DATA LOADING 
async function loadDrops() {
  try {
    const [b1,b2,b3,b4]=await Promise.all([sb.from('active_drops').select('*').order('drop_dollar',{ascending:false}).range(0,999),sb.from('active_drops').select('*').order('drop_dollar',{ascending:false}).range(1000,1999),sb.from('active_drops').select('*').order('drop_dollar',{ascending:false}).range(2000,2999),sb.from('active_drops').select('*').order('drop_dollar',{ascending:false}).range(3000,3999)]);
    const data=[...(b1.data||[]),...(b2.data||[]),...(b3.data||[]),...(b4.data||[])];
    const error=b1.error;
    if (error) throw error;
    allDrops = data || [];
    showDataBadge(true);
  } catch (err) {
    console.error('Supabase error:', err);
    document.getElementById('errorBanner').style.display = 'block';
    document.getElementById('errorBanner').textContent = 'Database error: ' + err.message;
    allDrops = [];
    showDataBadge(false);
  }
}

function showDataBadge(live) {
  const el = document.getElementById('data-source-badge');
  el.innerHTML = live
    ? '<span class="data-badge live">* LIVE MLS</span>'
    : '<span class="data-badge mock"> ERROR</span>';
}

//  FILTERING 
function getFiltered() {
  const sort   = document.getElementById('sortSelect').value;
  const dom    = parseInt(document.getElementById('domSelect').value) || 0;
  const county = document.getElementById('countySelect').value;
  const town   = document.getElementById('townSelect').value;
  let data = [...allDrops];

  if (currentArea !== 'all')   data = data.filter(d => d.city === currentArea);
  if (county !== 'all')        data = data.filter(d => d.county === county);
  if (town !== 'all')          data = data.filter(d => d.city === town);
  if (dom < 0)                 data = data.filter(d => (d.days_on_market || 0) <= Math.abs(dom));
  else if (dom > 0)             data = data.filter(d => (d.days_on_market || 0) >= dom);
  if (currentType === 'sf')        data = data.filter(d => d.property_type === 'Single Family' || d.property_type === 'Single Family Residence');
  if (currentType === 'condo')     data = data.filter(d => ['Condo','Townhouse','Condominium','Townhouse/Villa'].includes(d.property_type));
  if (currentType === 'land')      data = data.filter(d => d.property_type === 'Land');
  if (currentType === 'confirmed') data = data.filter(d => d.drop_dollar > 0);
  if (currentType === 'new')       data = data.filter(d => d.is_new_today);

  if (currentBed !== 'any') {
    if (currentBed === '6+') data = data.filter(d => d.bedrooms >= 6);
    else data = data.filter(d => d.bedrooms === parseInt(currentBed));
  }

  if (sort === 'pct')    data.sort((a,b) => b.drop_pct - a.drop_pct);
  else if (sort === 'recent') data.sort((a,b) => new Date(b.detected_at) - new Date(a.detected_at));
  else if (sort === 'low')    data.sort((a,b) => a.price_after - b.price_after);
  else if (sort === 'dom')    data.sort((a,b) => (b.days_on_market||0) - (a.days_on_market||0));
  else data.sort((a,b) => b.drop_dollar - a.drop_dollar);

  return data;
}

//  FORMATTING 
function fmtM(n) {
  if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
  return '$' + (n/1000).toFixed(0) + 'K';
}
function fmtPrice(n, curr) {
  if (!n) return '--';
  if (curr === 'eur') return 'EUR' + Math.round(n * 0.93).toLocaleString();
  if (curr === 'btc') return 'BTC' + (n / 97000).toFixed(4);
  return '$' + n.toLocaleString();
}
function fmtDrop(n, curr) {
  if (!n) return '';
  if (curr === 'eur') return '-EUR' + Math.round(n * 0.93).toLocaleString();
  if (curr === 'btc') return '-BTC' + (n / 97000).toFixed(4);
  return '-$' + n.toLocaleString();
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 24) return h < 1 ? 'Just now' : h + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

//  RENDER 
function renderListings() {
  const curr = document.getElementById('currSelect').value;
  const data = getFiltered();
  const el   = document.getElementById('listings');

  const confirmedCount = data.filter(d => d.drop_dollar > 0).length;
  const avgPct = confirmedCount ? (data.filter(d=>d.drop_pct>0).reduce((s,d)=>s+parseFloat(d.drop_pct),0)/confirmedCount).toFixed(1) : '0';
  const prices = data.map(d => d.price_after).filter(Boolean).sort((a,b)=>a-b);
  const med = prices[Math.floor(prices.length/2)] || 0;

  document.getElementById('stat-drops').textContent   = confirmedCount+' price drops / '+data.length;
  document.getElementById('stat-avg').textContent     = confirmedCount ? fmtDrop(Math.round(data.filter(d=>d.drop_dollar>0).reduce((s,d)=>s+d.drop_dollar,0)/confirmedCount), curr) : '--';
  document.getElementById('stat-watching').textContent = Math.floor(Math.random()*60)+160;
  document.getElementById('m-drops').textContent      = data.length;
  document.getElementById('m-avg').textContent        = avgPct + '%';
  document.getElementById('m-med').textContent        = med ? fmtM(med) : '--';
  document.getElementById('tsText').textContent       = '> ' + data.length + ' LISTINGS . ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + ' . LIVE MLS DATA';

  if (!data.length) {
    el.innerHTML = '<div class="loading">No listings match your current filters.</div>';
    return;
  }

  let html = '';
  data.forEach((d, i) => {
    const isConfirmed = d.drop_dollar > 0;
    const dom = d.days_on_market || 0;
    const typeClass = (d.property_type||'').includes('Single') ? 'tag-sf'
                    : ['Condo','Townhouse','Condominium'].some(t=>(d.property_type||'').includes(t)) ? 'tag-condo'
                    : (d.property_type||'').includes('Land') ? 'tag-land' : '';
    const typeLabel = (d.property_type||'').includes('Single') ? 'SINGLE FAM'
                    : (d.property_type||'').includes('Condo') ? 'CONDO'
                    : (d.property_type||'').includes('Town') ? 'TOWNHOUSE'
                    : (d.property_type||'').includes('Land') ? 'LAND' : d.property_type || 'RESIDENTIAL';

    const bedsStr = d.bedrooms > 0 ? d.bedrooms + ' BD' : '';
    const bathsStr = d.bathrooms ? d.bathrooms + ' BA' : '';
    const sqftStr = d.sqft ? d.sqft.toLocaleString() + ' SF' : '';
    const domTag = dom >= 180 ? '<span class="tag tag-longdom">'+dom+'D ON MKT</span>'
                 : dom >= 90  ? '<span class="tag tag-longdom">'+dom+'D ON MKT</span>'
                 : dom >= 60  ? '<span class="tag tag-longdom">'+dom+'D ON MKT</span>'
                 : '';
    const newTag  = d.is_new_today ? '<span class="tag tag-new">NEW TODAY</span>' : '';
    const hotTag  = d.drop_pct >= 10 ? '<span class="tag tag-hot">[!] PRICE CUT</span>' : '';
    const customTags = (d.tags || []).map(t => '<span class="tag">'+t+'</span>').join('');
    var pb="";if(d.ppsqft>0){var pr="ppsqft-gray",pl="$"+d.ppsqft+"/sf";if(d.town_avg_ppsqft>0){var pp=((d.ppsqft-d.town_avg_ppsqft)/d.town_avg_ppsqft)*100;if(pp<=-10){pr="ppsqft-green";pl="$"+d.ppsqft+"/sf (below avg)";}else if(pp>=10){pr="ppsqft-red";pl="$"+d.ppsqft+"/sf (above avg)";}else{pr="ppsqft-amber";pl="$"+d.ppsqft+"/sf (avg)";}}pb="<span class=\"ppsqft-badge "+pr+"\">"+pl+"</span>";}
    const imgHtml = d.photo_url ? '<img class="listing-photo" src="'+d.photo_url+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '';

    const priceDisplay = isConfirmed
      ? '<div class="price-current">' + fmtPrice(d.price_after, curr) + '</div><div class="price-meta"><span class="drop-amt">' + fmtDrop(d.drop_dollar, curr) + ' (' + parseFloat(d.drop_pct).toFixed(1) + '%)</span></div><div class="price-meta" style="margin-top:2px"><span style="color:var(--text3)">was ' + fmtPrice(d.price_before, curr) + '</span></div>'
      : '<div class="price-current">' + fmtPrice(d.price_after, curr) + '</div><div class="price-meta"><span style="color:var(--text3)">' + dom + ' days on market</span></div>';

    html += '<div class="listing-row' + (i===0?' hl':'') + '" onclick="openListing(\'' + (d.listing_url||'#') + '\',\'' + (d.mls_number||'') + '\')">'
      + '<div class="listing-num">#' + (i+1) + '</div>'
      + '<div class="listing-body"><div class="listing-body-wrap">' + imgHtml + '<div>'
      + '<div class="listing-title">' + (d.address||'') + '</div>'
      + '<div class="listing-sub">'
      + '<span class="sub-area">' + (d.city||'') + ' . ' + (d.county||'') + ' County</span>'
      + (d.neighborhood ? ' <span>. ' + d.neighborhood + '</span>' : '')
      + (bedsStr ? ' <span>. ' + bedsStr + '</span>' : '')
      + (bathsStr ? ' <span>' + bathsStr + '</span>' : '')
      + (sqftStr ? ' <span>. ' + sqftStr + '</span>' : '')
      + ' <span>. ' + timeAgo(d.detected_at) + '</span>'
      + '</div>'
      + '<div class="listing-tags"><span class="tag ' + typeClass + '">' + typeLabel + '</span>' + newTag + hotTag + domTag + customTags + (pb ? " " + pb : "") + "</div>"
      + '</div></div></div>'
      + '<div class="listing-price">' + priceDisplay
      + '<button class="btn-share" onclick="event.stopPropagation();share(\'' + (d.address||'').replace(/'/g,"\\'") + '\',' + (d.price_after||0) + ',' + (d.drop_dollar||0) + ')">> Share</button>'
      + '</div></div>';

    if (i === 4) {
      html += '<div class="ad-card"><div></div><div>'
        + '<div class="ad-title">These buyers need professionals they can trust</div>'
        + '<div class="ad-sub">Thousands of buyers visit MOMLS Pricing Dashboard daily -- they need Monmouth &amp; Ocean County agents, attorneys, inspectors &amp; mortgage specialists. Limited verified spots.</div>'
        + '</div><button class="btn-apply" onclick="alert(\'Professional applications opening soon!\')">Apply Now </button></div>';
    }
  });

  el.innerHTML = html;
}

function renderTicker() {
  const confirmed = allDrops.filter(d => d.drop_dollar > 0).slice(0, 15);
  const data = confirmed.length ? confirmed : allDrops.slice(0, 15);
  const doubled = [...data, ...data];
  document.getElementById('ticker').innerHTML = doubled.map(d =>
    '<div class="ticker-item"><span class="t-addr">' + d.address + ' . ' + d.city + '</span>'
    + (d.drop_dollar > 0 ? '<span class="t-drop">-$' + Math.round(d.drop_dollar/1000) + 'K</span>' : '<span style="color:var(--text3)">' + (d.days_on_market||0) + 'd on mkt</span>')
    + '<span style="color:var(--text3)">$' + Math.round((d.price_after||0)/1000) + 'K</span></div>'
  ).join('');
}

function renderAreaTabs() {
  const allCities = [...new Set(allDrops.map(d => d.city).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const cities = ['all', ...allCities];
  const counts = {};
  allDrops.forEach(d => { if(d.city) counts[d.city] = (counts[d.city]||0)+1; });
  document.getElementById('areaTabs').innerHTML = cities.map(c =>
    '<button class="area-tab ' + (c===currentArea?'active':'') + '" onclick="setArea(\'' + c + '\',\'' + (c==='all'?'All Areas':c) + '\')">'
    + (c==='all'?'All Areas':c) + ' <span class="cnt">' + (c==='all'?allDrops.length:(counts[c]||0)) + '</span></button>'
  ).join('');
}

//  EVENT HANDLERS 
function setArea(city, label) {
  currentArea = city;
  document.getElementById('bcCur').textContent = label;
  document.getElementById('headerArea').innerHTML = city==='all' ? 'Monmouth &amp; Ocean County' : label;
  renderAreaTabs();
  renderListings();
}
function setType(btn, type) {
  currentType = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderListings();
}
function setBed(btn, bed) {
  currentBed = bed;
  document.querySelectorAll('.bed-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderListings();
}
function applyFilters() {
  // When county changes, repopulate town dropdown
  const county = document.getElementById('countySelect').value;
  const townEl = document.getElementById('townSelect');
  const prevTown = townEl.value;
  const towns = [...new Set(
    allDrops
      .filter(d => county === 'all' || d.county === county)
      .map(d => d.city)
      .filter(Boolean)
  )].sort((a,b) => a.localeCompare(b));
  townEl.innerHTML = '<option value="all" selected>All Towns</option>'
    + towns.map(t => '<option value="'+t+'"'+(t===prevTown?' selected':'')+'>'+t+'</option>').join('');
  if (!towns.includes(prevTown)) townEl.value = 'all';
  renderListings();
}

function populateCountyDropdown(){
  var el=document.getElementById('countySelect');
  var cos=[...new Set(allDrops.map(function(d){return d.county;}).filter(Boolean))].sort();
  el.innerHTML='<option value="all">County: All</option>'+cos.map(function(c){return '<option value="'+c+'">'+c+'</option>';}).join('');
}
function populateTownDropdown() {
  const townEl = document.getElementById('townSelect');
  const towns = [...new Set(allDrops.map(d => d.city).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  townEl.innerHTML = '<option value="all" selected>All Towns</option>'
    + towns.map(t => '<option value="'+t+'">'+t+'</option>').join('');
  townEl.value = 'all';
}

function openListing(url, mls) {
  var q = encodeURIComponent(mls + ' NJ Zillow');
  window.open('https://www.google.com/search?q=' + q, '_blank');
}
function share(addr, price, drop) {
  const text = drop > 0
    ? 'Price Drop: ' + addr + ' -- $' + price.toLocaleString() + ' (down $' + drop.toLocaleString() + ') #MOMlsPricingDashboard'
    : 'Active Listing: ' + addr + ' -- $' + price.toLocaleString() + ' #MOMlsPricingDashboard';
  if (navigator.share) navigator.share({ title: 'MOMLS Pricing Dashboard', text });
  else { navigator.clipboard?.writeText(text); alert('Copied to clipboard!'); }
}

function subscribeRealtime() {
  sb.channel('price_drops')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'price_drops' }, () => {
      loadDrops().then(() => { renderTicker(); renderAreaTabs(); renderListings(); });
    })
    .subscribe();
}

async function init() {
  await loadDrops();
  populateCountyDropdown();
  populateTownDropdown();
  renderTicker();
  renderAreaTabs();
  renderListings();
  subscribeRealtime();
  setInterval(() => {
    document.getElementById('stat-watching').textContent = Math.floor(Math.random()*60)+160;
  }, 10000);
}

init();

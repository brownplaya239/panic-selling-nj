/**
 * NJREindex — NJ Public Records (SR-1A) ingestion
 * ================================================
 * Parses the NJ Division of Taxation SR-1A deed-sales files (fixed-width, layout
 * per SR1Afilelayout.pdf) and publishes compact aggregates to Supabase:
 *   pr_town_stats    — per municipality × month: usable residential sales stats
 *   pr_recent_sales  — newest usable residential deeds statewide (the tape)
 *
 *   node public-records.mjs            ← parses data-public/*.txt and publishes
 *
 * Source files (refresh by re-downloading — state updates YTD file periodically):
 *   data-public/Sales2025.txt, data-public/YTDSR1A2026.txt
 *   https://www.nj.gov/treasury/taxation/lpt/statdata.shtml
 *
 * Filtering: only U-N-TYPE = 'U' (state-classified USABLE, i.e. arm's-length)
 * sales count toward stats; class '2' (residential 1-4 family) drives the
 * headline numbers. $1 family transfers etc. are excluded by the state's own
 * NU coding, not our judgment.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const COUNTY = { '01':'Atlantic','02':'Bergen','03':'Burlington','04':'Camden','05':'Cape May','06':'Cumberland','07':'Essex','08':'Gloucester','09':'Hudson','10':'Hunterdon','11':'Mercer','12':'Middlesex','13':'Monmouth','14':'Morris','15':'Ocean','16':'Passaic','17':'Salem','18':'Somerset','19':'Sussex','20':'Union','21':'Warren' };

// Official municipality codes — NJ Division of Taxation cntycode.pdf
const MUNI = {
'0101':'Absecon City','0102':'Atlantic City','0103':'Brigantine City','0104':'Buena Boro','0105':'Buena Vista Twp','0106':'Corbin City','0107':'Egg Harbor City','0108':'Egg Harbor Twp','0109':'Estell Manor City','0110':'Folsom Boro','0111':'Galloway Twp','0112':'Hamilton Twp','0113':'Hammonton Town','0114':'Linwood City','0115':'Longport Boro','0116':'Margate City','0117':'Mullica Twp','0118':'Northfield City','0119':'Pleasantville City','0120':'Port Republic City','0121':'Somers Point City','0122':'Ventnor City','0123':'Weymouth Twp',
'0201':'Allendale Boro','0202':'Alpine Boro','0203':'Bergenfield Boro','0204':'Bogota Boro','0205':'Carlstadt Boro','0206':'Cliffside Park Boro','0207':'Closter Boro','0208':'Cresskill Boro','0209':'Demarest Boro','0210':'Dumont Boro','0211':'Elmwood Park Boro','0212':'East Rutherford Boro','0213':'Edgewater Boro','0214':'Emerson Boro','0215':'Englewood City','0216':'Englewood Cliffs Boro','0217':'Fair Lawn Boro','0218':'Fairview Boro','0219':'Fort Lee Boro','0220':'Franklin Lakes Boro','0221':'Garfield City','0222':'Glen Rock Boro','0223':'Hackensack City','0224':'Harrington Park Boro','0225':'Hasbrouck Heights Boro','0226':'Haworth Boro','0227':'Hillsdale Boro','0228':'Ho-Ho-Kus Boro','0229':'Leonia Boro','0230':'Little Ferry Boro','0231':'Lodi Boro','0232':'Lyndhurst Twp','0233':'Mahwah Twp','0234':'Maywood Boro','0235':'Midland Park Boro','0236':'Montvale Boro','0237':'Moonachie Boro','0238':'New Milford Boro','0239':'North Arlington Boro','0240':'Northvale Boro','0241':'Norwood Boro','0242':'Oakland Boro','0243':'Old Tappan Boro','0244':'Oradell Boro','0245':'Palisades Park Boro','0246':'Paramus Boro','0247':'Park Ridge Boro','0248':'Ramsey Boro','0249':'Ridgefield Boro','0250':'Ridgefield Park Village','0251':'Ridgewood Village','0252':'River Edge Boro','0253':'River Vale Twp','0254':'Rochelle Park Twp','0255':'Rockleigh Boro','0256':'Rutherford Boro','0257':'Saddle Brook Twp','0258':'Saddle River Boro','0259':'South Hackensack Twp','0260':'Teaneck Twp','0261':'Tenafly Boro','0262':'Teterboro Boro','0263':'Upper Saddle River Boro','0264':'Waldwick Boro','0265':'Wallington Boro','0266':'Washington Twp','0267':'Westwood Boro','0268':'Woodcliff Lake Boro','0269':'Wood-Ridge Boro','0270':'Wyckoff Twp',
'0301':'Bass River Twp','0302':'Beverly City','0303':'Bordentown City','0304':'Bordentown Twp','0305':'Burlington City','0306':'Burlington Twp','0307':'Chesterfield Twp','0308':'Cinnaminson Twp','0309':'Delanco Twp','0310':'Delran Twp','0311':'Eastampton Twp','0312':'Edgewater Park Twp','0313':'Evesham Twp','0314':'Fieldsboro Boro','0315':'Florence Twp','0316':'Hainesport Twp','0317':'Lumberton Twp','0318':'Mansfield Twp','0319':'Maple Shade Twp','0320':'Medford Twp','0321':'Medford Lakes Boro','0322':'Moorestown Twp','0323':'Mount Holly Twp','0324':'Mount Laurel Twp','0325':'New Hanover Twp','0326':'North Hanover Twp','0327':'Palmyra Boro','0328':'Pemberton Boro','0329':'Pemberton Twp','0330':'Riverside Twp','0331':'Riverton Boro','0332':'Shamong Twp','0333':'Southampton Twp','0334':'Springfield Twp','0335':'Tabernacle Twp','0336':'Washington Twp','0337':'Westampton Twp','0338':'Willingboro Twp','0339':'Woodland Twp','0340':'Wrightstown Boro',
'0401':'Audubon Boro','0402':'Audubon Park Boro','0403':'Barrington Boro','0404':'Bellmawr Boro','0405':'Berlin Boro','0406':'Berlin Twp','0407':'Brooklawn Boro','0408':'Camden City','0409':'Cherry Hill Twp','0410':'Chesilhurst Boro','0411':'Clementon Boro','0412':'Collingswood Boro','0413':'Gibbsboro Boro','0414':'Gloucester City','0415':'Gloucester Twp','0416':'Haddon Twp','0417':'Haddonfield Boro','0418':'Haddon Heights Boro','0419':'Hi-Nella Boro','0420':'Laurel Springs Boro','0421':'Lawnside Boro','0422':'Lindenwold Boro','0423':'Magnolia Boro','0424':'Merchantville Boro','0425':'Mount Ephraim Boro','0426':'Oaklyn Boro','0427':'Pennsauken Twp','0428':'Pine Hill Boro','0430':'Runnemede Boro','0431':'Somerdale Boro','0432':'Stratford Boro','0433':'Tavistock Boro','0434':'Voorhees Twp','0435':'Waterford Twp','0436':'Winslow Twp','0437':'Woodlynne Boro',
'0501':'Avalon Boro','0502':'Cape May City','0503':'Cape May Point Boro','0504':'Dennis Twp','0505':'Lower Twp','0506':'Middle Twp','0507':'North Wildwood City','0508':'Ocean City','0509':'Sea Isle City','0510':'Stone Harbor Boro','0511':'Upper Twp','0512':'West Cape May Boro','0513':'West Wildwood Boro','0514':'Wildwood City','0515':'Wildwood Crest Boro','0516':'Woodbine Boro',
'0601':'Bridgeton City','0602':'Commercial Twp','0603':'Deerfield Twp','0604':'Downe Twp','0605':'Fairfield Twp','0606':'Greenwich Twp','0607':'Hopewell Twp','0608':'Lawrence Twp','0609':'Maurice River Twp','0610':'Millville City','0611':'Shiloh Boro','0612':'Stow Creek Twp','0613':'Upper Deerfield Twp','0614':'Vineland City',
'0701':'Belleville Twp','0702':'Bloomfield Twp','0703':'Caldwell Boro','0704':'Cedar Grove Twp','0705':'East Orange City','0706':'Essex Fells Twp','0707':'Fairfield Twp','0708':'Glen Ridge Boro','0709':'Irvington Twp','0710':'Livingston Twp','0711':'Maplewood Twp','0712':'Millburn Twp','0713':'Montclair Twp','0714':'Newark City','0715':'North Caldwell Twp','0716':'Nutley Twp','0717':'Orange City','0718':'Roseland Boro','0719':'South Orange Village','0720':'Verona Twp','0721':'West Caldwell Twp','0722':'West Orange Twp',
'0801':'Clayton Boro','0802':'Deptford Twp','0803':'East Greenwich Twp','0804':'Elk Twp','0805':'Franklin Twp','0806':'Glassboro Boro','0807':'Greenwich Twp','0808':'Harrison Twp','0809':'Logan Twp','0810':'Mantua Twp','0811':'Monroe Twp','0812':'National Park Boro','0813':'Newfield Boro','0814':'Paulsboro Boro','0815':'Pitman Boro','0816':'South Harrison Twp','0817':'Swedesboro Boro','0818':'Washington Twp','0819':'Wenonah Boro','0820':'West Deptford Twp','0821':'Westville Boro','0822':'Woodbury City','0823':'Woodbury Heights Boro','0824':'Woolwich Twp',
'0901':'Bayonne City','0902':'East Newark Boro','0903':'Guttenberg Town','0904':'Harrison Town','0905':'Hoboken City','0906':'Jersey City','0907':'Kearny Town','0908':'North Bergen Twp','0909':'Secaucus Town','0910':'Union City','0911':'Weehawken Twp','0912':'West New York Town',
'1001':'Alexandria Twp','1002':'Bethlehem Twp','1003':'Bloomsbury Boro','1004':'Califon Boro','1005':'Clinton Town','1006':'Clinton Twp','1007':'Delaware Twp','1008':'East Amwell Twp','1009':'Flemington Boro','1010':'Franklin Twp','1011':'Frenchtown Boro','1012':'Glen Gardner Boro','1013':'Hampton Boro','1014':'High Bridge Boro','1015':'Holland Twp','1016':'Kingwood Twp','1017':'Lambertville City','1018':'Lebanon Boro','1019':'Lebanon Twp','1020':'Milford Boro','1021':'Raritan Twp','1022':'Readington Twp','1023':'Stockton Boro','1024':'Tewksbury Twp','1025':'Union Twp','1026':'West Amwell Twp',
'1101':'East Windsor Twp','1102':'Ewing Twp','1103':'Hamilton Twp','1104':'Hightstown Boro','1105':'Hopewell Boro','1106':'Hopewell Twp','1107':'Lawrence Twp','1108':'Pennington Boro','1111':'Trenton City','1112':'Robbinsville Twp','1113':'West Windsor Twp','1114':'Princeton',
'1201':'Carteret Boro','1202':'Cranbury Twp','1203':'Dunellen Boro','1204':'East Brunswick Twp','1205':'Edison Twp','1206':'Helmetta Boro','1207':'Highland Park Boro','1208':'Jamesburg Boro','1209':'Metuchen Boro','1210':'Middlesex Boro','1211':'Milltown Boro','1212':'Monroe Twp','1213':'New Brunswick City','1214':'North Brunswick Twp','1215':'Old Bridge Twp','1216':'Perth Amboy City','1217':'Piscataway Twp','1218':'Plainsboro Twp','1219':'Sayreville Boro','1220':'South Amboy City','1221':'South Brunswick Twp','1222':'South Plainfield Boro','1223':'South River Boro','1224':'Spotswood Boro','1225':'Woodbridge Twp',
'1301':'Aberdeen Twp','1302':'Allenhurst Boro','1303':'Allentown Boro','1304':'Asbury Park City','1305':'Atlantic Highlands Boro','1306':'Avon-by-the-Sea Boro','1307':'Belmar Boro','1308':'Bradley Beach Boro','1309':'Brielle Boro','1310':'Colts Neck Twp','1311':'Deal Boro','1312':'Eatontown Boro','1313':'Englishtown Boro','1314':'Fair Haven Boro','1315':'Farmingdale Boro','1316':'Freehold Boro','1317':'Freehold Twp','1318':'Hazlet Twp','1319':'Highlands Boro','1320':'Holmdel Twp','1321':'Howell Twp','1322':'Interlaken Boro','1323':'Keansburg Boro','1324':'Keyport Boro','1325':'Little Silver Boro','1326':'Loch Arbour Village','1327':'Long Branch City','1328':'Manalapan Twp','1329':'Manasquan Boro','1330':'Marlboro Twp','1331':'Matawan Boro','1332':'Middletown Twp','1333':'Millstone Twp','1334':'Monmouth Beach Boro','1335':'Neptune Twp','1336':'Neptune City Boro','1337':'Ocean Twp','1338':'Oceanport Boro','1339':'Red Bank Boro','1340':'Roosevelt Boro','1341':'Rumson Boro','1342':'Sea Bright Boro','1343':'Sea Girt Boro','1344':'Shrewsbury Boro','1345':'Shrewsbury Twp','1346':'Lake Como Boro','1347':'Spring Lake Boro','1348':'Spring Lake Heights Boro','1349':'Tinton Falls Boro','1350':'Union Beach Boro','1351':'Upper Freehold Twp','1352':'Wall Twp','1353':'West Long Branch Boro',
'1401':'Boonton Town','1402':'Boonton Twp','1403':'Butler Boro','1404':'Chatham Boro','1405':'Chatham Twp','1406':'Chester Boro','1407':'Chester Twp','1408':'Denville Twp','1409':'Dover Town','1410':'East Hanover Twp','1411':'Florham Park Boro','1412':'Hanover Twp','1413':'Harding Twp','1414':'Jefferson Twp','1415':'Kinnelon Boro','1416':'Lincoln Park Boro','1417':'Madison Boro','1418':'Mendham Boro','1419':'Mendham Twp','1420':'Mine Hill Twp','1421':'Montville Twp','1422':'Morris Twp','1423':'Morris Plains Boro','1424':'Morristown Town','1425':'Mountain Lakes Boro','1426':'Mount Arlington Boro','1427':'Mount Olive Twp','1428':'Netcong Boro','1429':'Parsippany-Troy Hills Twp','1430':'Long Hill Twp','1431':'Pequannock Twp','1432':'Randolph Twp','1433':'Riverdale Boro','1434':'Rockaway Boro','1435':'Rockaway Twp','1436':'Roxbury Twp','1437':'Victory Gardens Boro','1438':'Washington Twp','1439':'Wharton Boro',
'1501':'Barnegat Twp','1502':'Barnegat Light Boro','1503':'Bay Head Boro','1504':'Beach Haven Boro','1505':'Beachwood Boro','1506':'Berkeley Twp','1507':'Brick Twp','1508':'Toms River Twp','1509':'Eagleswood Twp','1510':'Harvey Cedars Boro','1511':'Island Heights Boro','1512':'Jackson Twp','1513':'Lacey Twp','1514':'Lakehurst Boro','1515':'Lakewood Twp','1516':'Lavallette Boro','1517':'Little Egg Harbor Twp','1518':'Long Beach Twp','1519':'Manchester Twp','1520':'Mantoloking Boro','1521':'Ocean Twp (Waretown)','1522':'Ocean Gate Boro','1523':'Pine Beach Boro','1524':'Plumsted Twp','1525':'Point Pleasant Boro','1526':'Point Pleasant Beach Boro','1527':'Seaside Heights Boro','1528':'Seaside Park Boro','1529':'Ship Bottom Boro','1530':'South Toms River Boro','1531':'Stafford Twp','1532':'Surf City Boro','1533':'Tuckerton Boro',
'1601':'Bloomingdale Boro','1602':'Clifton City','1603':'Haledon Boro','1604':'Hawthorne Boro','1605':'Little Falls Twp','1606':'North Haledon Boro','1607':'Passaic City','1608':'Paterson City','1609':'Pompton Lakes Boro','1610':'Prospect Park Boro','1611':'Ringwood Boro','1612':'Totowa Boro','1613':'Wanaque Boro','1614':'Wayne Twp','1615':'West Milford Twp','1616':'Woodland Park Boro',
'1701':'Alloway Twp','1702':'Carneys Point Twp','1703':'Elmer Boro','1704':'Elsinboro Twp','1705':'Lower Alloways Creek Twp','1706':'Mannington Twp','1707':'Oldmans Twp','1708':'Penns Grove Boro','1709':'Pennsville Twp','1710':'Pilesgrove Twp','1711':'Pittsgrove Twp','1712':'Quinton Twp','1713':'Salem City','1714':'Upper Pittsgrove Twp','1715':'Woodstown Boro',
'1801':'Bedminster Twp','1802':'Bernards Twp','1803':'Bernardsville Boro','1804':'Bound Brook Boro','1805':'Branchburg Twp','1806':'Bridgewater Twp','1807':'Far Hills Boro','1808':'Franklin Twp','1809':'Green Brook Twp','1810':'Hillsborough Twp','1811':'Manville Boro','1812':'Millstone Boro','1813':'Montgomery Twp','1814':'North Plainfield Boro','1815':'Peapack-Gladstone Boro','1816':'Raritan Boro','1817':'Rocky Hill Boro','1818':'Somerville Boro','1819':'South Bound Brook Boro','1820':'Warren Twp','1821':'Watchung Boro',
'1901':'Andover Boro','1902':'Andover Twp','1903':'Branchville Boro','1904':'Byram Twp','1905':'Frankford Twp','1906':'Franklin Boro','1907':'Fredon Twp','1908':'Green Twp','1909':'Hamburg Boro','1910':'Hampton Twp','1911':'Hardyston Twp','1912':'Hopatcong Boro','1913':'Lafayette Twp','1914':'Montague Twp','1915':'Newton Town','1916':'Ogdensburg Boro','1917':'Sandyston Twp','1918':'Sparta Twp','1919':'Stanhope Boro','1920':'Stillwater Twp','1921':'Sussex Boro','1922':'Vernon Twp','1923':'Walpack Twp','1924':'Wantage Twp',
'2001':'Berkeley Heights Twp','2002':'Clark Twp','2003':'Cranford Twp','2004':'Elizabeth City','2005':'Fanwood Boro','2006':'Garwood Boro','2007':'Hillside Twp','2008':'Kenilworth Boro','2009':'Linden City','2010':'Mountainside Boro','2011':'New Providence Boro','2012':'Plainfield City','2013':'Rahway City','2014':'Roselle Boro','2015':'Roselle Park Boro','2016':'Scotch Plains Twp','2017':'Springfield Twp','2018':'Summit City','2019':'Union Twp','2020':'Westfield Town','2021':'Winfield Twp',
'2101':'Allamuchy Twp','2102':'Alpha Boro','2103':'Belvidere Town','2104':'Blairstown Twp','2105':'Franklin Twp','2106':'Frelinghuysen Twp','2107':'Greenwich Twp','2108':'Hackettstown Town','2109':'Hardwick Twp','2110':'Harmony Twp','2111':'Hope Twp','2112':'Independence Twp','2113':'Knowlton Twp','2114':'Liberty Twp','2115':'Lopatcong Twp','2116':'Mansfield Twp','2117':'Oxford Twp','2119':'Phillipsburg Town','2120':'Pohatcong Twp','2121':'Washington Boro','2122':'Washington Twp','2123':'White Twp',
};

const num = s => { const n = parseInt(s, 10); return isNaN(n) ? 0 : n; };
// Layout PDF labels dates 9(6) without format; actual extract data is YYMMDD
// (verified against real records: "250522" = 2025-05-22)
const yymmdd = s => {
  if (!/^\d{6}$/.test(s)) return null;
  const yy = +s.slice(0, 2), mm = +s.slice(2, 4), dd = +s.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = yy >= 90 ? 1900 + yy : 2000 + yy;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
};

async function parseFile(path, sales, seen) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let rows = 0, usable = 0;
  for await (const line of rl) {
    rows++;
    if (line.length < 660) continue;
    const county = line.slice(0, 2), district = line.slice(2, 4);
    const muniCode = county + district;
    if (!COUNTY[county]) continue;
    const key = muniCode + '|' + line.slice(98, 105).trim() + '|' + line.slice(328, 338).trim(); // muni|serial|book+page
    if (seen.has(key)) continue;
    seen.add(key);
    const unType = line[33];
    if (unType !== 'U') continue; // state-classified non-usable (non-arm's-length) excluded
    usable++;
    const reported = num(line.slice(37, 46));
    const verified = num(line.slice(46, 55));
    const price = verified > 1000 ? verified : reported;
    if (price < 1000) continue;
    const deedDate = yymmdd(line.slice(338, 344).trim());
    const recDate = yymmdd(line.slice(344, 350).trim());
    if (!deedDate) continue;
    const cls = line.slice(626, 629).trim();
    const yearBuilt = num(line.slice(652, 656));
    const sqft = num(line.slice(656, 663));
    sales.push({
      muni: muniCode, county: COUNTY[county],
      address: line.slice(297, 322).trim(),
      price, deedDate, recDate, cls,
      yearBuilt: yearBuilt >= 1650 && yearBuilt <= 2030 ? yearBuilt : null,
      sqft: sqft >= 100 && sqft <= 50000 ? sqft : null,
    });
  }
  console.log(`  ${path}: ${rows.toLocaleString()} records, ${usable.toLocaleString()} usable`);
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

async function main() {
  console.log('🏛  Parsing SR-1A files...');
  const sales = [];
  const seen = new Set();
  await parseFile('./data-public/YTDSR1A2026.txt', sales, seen);
  await parseFile('./data-public/Sales2025.txt', sales, seen);
  console.log(`  Total usable arm's-length sales: ${sales.length.toLocaleString()}`);

  // ── Town × month aggregates (residential class 2 headline + all-class count)
  const byTownMonth = new Map();
  for (const s of sales) {
    const ym = s.deedDate.slice(0, 7);
    if (ym < '2025-01') continue;
    const k = s.muni + '|' + ym;
    const b = byTownMonth.get(k) || { muni: s.muni, ym, res: [], ppsf: [], all: 0, vol: 0 };
    b.all++;
    if (s.cls === '2') {
      b.res.push(s.price);
      b.vol += s.price;
      if (s.sqft && s.price / s.sqft > 20 && s.price / s.sqft < 3000) b.ppsf.push(Math.round(s.price / s.sqft));
    }
    byTownMonth.set(k, b);
  }
  const statRows = [...byTownMonth.values()].map(b => ({
    muni_code: b.muni, ym: b.ym,
    county: COUNTY[b.muni.slice(0, 2)],
    municipality: MUNI[b.muni] || ('District ' + b.muni),
    res_n: b.res.length,
    res_median: median(b.res),
    res_volume: b.vol,
    res_med_ppsf: median(b.ppsf),
    all_n: b.all,
  }));
  console.log(`  Aggregates: ${statRows.length.toLocaleString()} town-months across ${new Set(statRows.map(r => r.muni_code)).size} municipalities`);

  // ── Exact window rollups from RAW records (never median-of-medians):
  //    W12 = trailing 365d from data edge · YTD = 2026 to date · SP25 = same 2026
  //    months in 2025 (the honest YoY comparator given recording lag)
  const dataMax = sales.reduce((m, s) => (s.deedDate > m ? s.deedDate : m), '2025-01-01');
  const w12Start = new Date(new Date(dataMax) - 365 * 86400000).toISOString().slice(0, 10);
  const maxMonth = dataMax.slice(5, 7);
  const inWindow = {
    w12: s => s.deedDate >= w12Start,
    ytd26: s => s.deedDate >= '2026-01-01',
    sp25: s => s.deedDate >= '2025-01-01' && s.deedDate <= '2025-' + maxMonth + '-31',
  };
  const windowRows = [];
  const rollup = (scopeType, scopeId, label, rows) => {
    for (const [win, test] of Object.entries(inWindow)) {
      const g = rows.filter(s => s.cls === '2' && test(s));
      if (!g.length) continue;
      const prices = g.map(s => s.price);
      const ppsf = g.filter(s => s.sqft && s.price / s.sqft > 20 && s.price / s.sqft < 3000)
        .map(s => Math.round(s.price / s.sqft));
      windowRows.push({
        scope_type: scopeType, scope_id: scopeId, scope_label: label, win,
        county: scopeType === 'muni' ? COUNTY[scopeId.slice(0, 2)] : (scopeType === 'county' ? scopeId : null),
        res_n: g.length, res_median: median(prices),
        res_volume: prices.reduce((a, b) => a + b, 0),
        res_med_ppsf: median(ppsf),
      });
    }
  };
  rollup('state', 'NJ', 'New Jersey', sales);
  const byCounty = new Map(), byMuni = new Map();
  for (const s of sales) {
    (byCounty.get(s.county) ?? byCounty.set(s.county, []).get(s.county)).push(s);
    (byMuni.get(s.muni) ?? byMuni.set(s.muni, []).get(s.muni)).push(s);
  }
  for (const [c, rows] of byCounty) rollup('county', c, c, rows);
  for (const [m, rows] of byMuni) rollup('muni', m, MUNI[m] || ('District ' + m), rows);
  console.log(`  Window rollups: ${windowRows.length.toLocaleString()} (state + ${byCounty.size} counties + ${byMuni.size} munis × up to 3 windows)`);

  // ── Recent deeds tape: newest usable residential sales (90 days from max deed date)
  const maxDate = sales.reduce((m, s) => (s.deedDate > m ? s.deedDate : m), '2025-01-01');
  const cutoff = new Date(new Date(maxDate) - 90 * 86400000).toISOString().slice(0, 10);
  const recent = sales
    .filter(s => s.cls === '2' && s.deedDate >= cutoff && s.price >= 10000)
    .sort((a, b) => (a.deedDate < b.deedDate ? 1 : -1))
    .slice(0, 12000)
    .map(s => ({
      muni_code: s.muni, county: s.county,
      municipality: MUNI[s.muni] || ('District ' + s.muni),
      address: s.address, price: s.price,
      deed_date: s.deedDate, recorded_date: s.recDate,
      property_class: s.cls, year_built: s.yearBuilt, sqft: s.sqft,
      ppsf: s.sqft && s.price / s.sqft > 20 && s.price / s.sqft < 3000 ? Math.round(s.price / s.sqft) : null,
    }));
  console.log(`  Recent tape: ${recent.length.toLocaleString()} residential deeds since ${cutoff} (data through ${maxDate})`);

  // ── Publish (rebuild both tables)
  if (process.argv.includes('--dry')) {
    console.log('  --dry: sample stats:', JSON.stringify(statRows.filter(r => r.muni_code === '1507').slice(-3)));
    console.log('  --dry: sample deeds:', JSON.stringify(recent.slice(0, 2)));
    return;
  }
  console.log('  Publishing to Supabase...');
  let { error: e1 } = await supabase.from('pr_town_stats').delete().neq('muni_code', '');
  if (e1) { console.error('clear pr_town_stats:', e1.message); process.exit(1); }
  for (let i = 0; i < statRows.length; i += 500) {
    const { error } = await supabase.from('pr_town_stats').insert(statRows.slice(i, i + 500));
    if (error) { console.error('pr_town_stats insert:', error.message); process.exit(1); }
  }
  let { error: e2 } = await supabase.from('pr_recent_sales').delete().neq('muni_code', '');
  if (e2) { console.error('clear pr_recent_sales:', e2.message); process.exit(1); }
  for (let i = 0; i < recent.length; i += 500) {
    const { error } = await supabase.from('pr_recent_sales').insert(recent.slice(i, i + 500));
    if (error) { console.error('pr_recent_sales insert:', error.message); process.exit(1); }
  }
  let { error: e3 } = await supabase.from('pr_window_stats').delete().neq('scope_id', '');
  if (e3) { console.error('clear pr_window_stats:', e3.message); process.exit(1); }
  for (let i = 0; i < windowRows.length; i += 500) {
    const { error } = await supabase.from('pr_window_stats').insert(windowRows.slice(i, i + 500));
    if (error) { console.error('pr_window_stats insert:', error.message); process.exit(1); }
  }
  console.log(`✅ Published: ${windowRows.length.toLocaleString()} window rollups + ${statRows.length.toLocaleString()} town-months + ${recent.length.toLocaleString()} recent deeds (data through ${dataMax})`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

/**
 * seed-mock.js — Populates Supabase with realistic NJ mock data
 * Run: node seed-mock.js
 * Use this while waiting for Spark API approval.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MOCK_LISTINGS = [
  { id:'ML001', mls_number:'22401001', address:'412 Ocean Ave', city:'Long Branch', county:'Monmouth', zip:'07740', neighborhood:'North End', property_type:'Single Family', bedrooms:5, bathrooms:3.5, sqft:3820, lot_size:'0.18 acres', year_built:1998, garage:'2 car', current_price:1895000, original_price:2100000, days_on_market:14, status:'Active', latitude:40.2987, longitude:-73.9887, photo_url:'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800', listing_url:'#', agent_name:'Sarah Connelly', tags:['OCEAN VIEWS','PRICE REDUCED'] },
  { id:'ML002', mls_number:'22401002', address:'88 Sunset Blvd PH2', city:'Asbury Park', county:'Monmouth', zip:'07712', neighborhood:'Beachfront', property_type:'Condo', bedrooms:3, bathrooms:2.0, sqft:2100, lot_size:null, year_built:2019, garage:'2 car', current_price:1425000, original_price:1600000, days_on_market:8, status:'Active', latitude:40.2204, longitude:-74.0121, photo_url:'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800', listing_url:'#', agent_name:'Mark Torres', tags:['PENTHOUSE','OCEAN VIEWS','PRICE REDUCED'] },
  { id:'ML003', mls_number:'22401003', address:'211 Bay Blvd', city:'Lavallette', county:'Ocean', zip:'08735', neighborhood:'Bayfront', property_type:'Single Family', bedrooms:4, bathrooms:2.0, sqft:2250, lot_size:'50x100', year_built:1987, garage:'1 car', current_price:949000, original_price:1050000, days_on_market:31, status:'Active', latitude:39.9668, longitude:-74.0724, photo_url:'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800', listing_url:'#', agent_name:'Diane Mills', tags:['BEACH BLOCK','MOTIVATED SELLER'] },
  { id:'ML004', mls_number:'22401004', address:'7 Riverview Ct', city:'Red Bank', county:'Monmouth', zip:'07701', neighborhood:'Navesink Highlands', property_type:'Single Family', bedrooms:5, bathrooms:4.0, sqft:4400, lot_size:'0.42 acres', year_built:2005, garage:'3 car', current_price:1750000, original_price:1950000, days_on_market:22, status:'Active', latitude:40.3468, longitude:-74.0671, photo_url:'https://images.unsplash.com/photo-1416331108676-a22ccbe13c67?w=800', listing_url:'#', agent_name:'James Whitfield', tags:['POOL','SMART HOME','PRICE REDUCED'] },
  { id:'ML005', mls_number:'22401005', address:'540 Bay Ave Unit 3C', city:'Toms River', county:'Ocean', zip:'08753', neighborhood:'Bayview', property_type:'Condo', bedrooms:3, bathrooms:2.0, sqft:1875, lot_size:null, year_built:2011, garage:'1 car', current_price:619000, original_price:675000, days_on_market:45, status:'Active', latitude:39.9537, longitude:-74.1979, photo_url:'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800', listing_url:'#', agent_name:'Patricia Walsh', tags:['BAY VIEWS','CORNER UNIT'] },
  { id:'ML006', mls_number:'22401006', address:'33 Riverside Dr', city:'Point Pleasant', county:'Ocean', zip:'08742', neighborhood:'Riverfront', property_type:'Single Family', bedrooms:4, bathrooms:3.0, sqft:2640, lot_size:'0.22 acres', year_built:1992, garage:'2 car', current_price:875000, original_price:950000, days_on_market:18, status:'Active', latitude:40.0787, longitude:-74.0693, photo_url:'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800', listing_url:'#', agent_name:'Robert Chase', tags:['PRICE REDUCED','MOVE-IN READY'] },
  { id:'ML007', mls_number:'22401007', address:'1 Oceanfront Blvd', city:'Manasquan', county:'Monmouth', zip:'08736', neighborhood:'Oceanfront', property_type:'Land', bedrooms:0, bathrooms:null, sqft:null, lot_size:'100x120 double lot', year_built:null, garage:null, current_price:2100000, original_price:2400000, days_on_market:62, status:'Active', latitude:40.1173, longitude:-74.0435, photo_url:'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=800', listing_url:'#', agent_name:'Linda Farrow', tags:['OCEANFRONT','DOUBLE LOT','RARE'] },
  { id:'ML008', mls_number:'22401008', address:'22 Marina Way Unit 5B', city:'Brick', county:'Ocean', zip:'08723', neighborhood:'Metedeconk', property_type:'Townhouse', bedrooms:3, bathrooms:2.5, sqft:1920, lot_size:null, year_built:2003, garage:'1 car', current_price:788000, original_price:875000, days_on_market:27, status:'Active', latitude:40.0584, longitude:-74.1082, photo_url:'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800', listing_url:'#', agent_name:'Anthony Russo', tags:['MARINA SLIP','TURNKEY','PRICE REDUCED'] },
  { id:'ML009', mls_number:'22401009', address:'18 Lake Ave', city:'Bay Head', county:'Ocean', zip:'08742', neighborhood:'Oceanblock', property_type:'Single Family', bedrooms:4, bathrooms:3.5, sqft:3100, lot_size:'0.15 acres', year_built:2001, garage:'2 car', current_price:2250000, original_price:2500000, days_on_market:9, status:'Active', latitude:40.0742, longitude:-74.0431, photo_url:'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800', listing_url:'#', agent_name:'Christine Palmer', tags:['OCEAN VIEWS','WRAP DECK'] },
  { id:'ML010', mls_number:'22401010', address:'301 Broadway Unit 2A', city:'Long Branch', county:'Monmouth', zip:'07740', neighborhood:'Pier Village', property_type:'Condo', bedrooms:2, bathrooms:2.0, sqft:1340, lot_size:null, year_built:2015, garage:'1 car', current_price:565000, original_price:649000, days_on_market:38, status:'Active', latitude:40.2951, longitude:-73.9876, photo_url:'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=800', listing_url:'#', agent_name:'Kevin O\'Brien', tags:['PIER VILLAGE','PRICE REDUCED'] },
];

const MOCK_DROPS = [
  { listing_id:'ML001', price_before:2100000, price_after:1895000, detected_at: daysAgo(2) },
  { listing_id:'ML002', price_before:1600000, price_after:1425000, detected_at: daysAgo(1) },
  { listing_id:'ML003', price_before:1050000, price_after:949000,  detected_at: daysAgo(5) },
  { listing_id:'ML004', price_before:1950000, price_after:1750000, detected_at: daysAgo(3) },
  { listing_id:'ML005', price_before:675000,  price_after:619000,  detected_at: daysAgo(8) },
  { listing_id:'ML006', price_before:950000,  price_after:875000,  detected_at: daysAgo(1) },
  { listing_id:'ML007', price_before:2400000, price_after:2100000, detected_at: daysAgo(10) },
  { listing_id:'ML008', price_before:875000,  price_after:788000,  detected_at: daysAgo(4) },
  { listing_id:'ML009', price_before:2500000, price_after:2250000, detected_at: daysAgo(0) },
  { listing_id:'ML010', price_before:649000,  price_after:565000,  detected_at: daysAgo(6) },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function seed() {
  console.log('🌱 Seeding mock data...');

  // Upsert listings
  const { error: le } = await supabase.from('listings').upsert(MOCK_LISTINGS, { onConflict: 'id' });
  if (le) { console.error('Listings error:', le); process.exit(1); }
  console.log(`✅ Inserted ${MOCK_LISTINGS.length} listings`);

  // Insert drops
  const { error: de } = await supabase.from('price_drops').insert(
    MOCK_DROPS.map(d => ({ ...d, is_active: true }))
  );
  if (de) { console.error('Drops error:', de); process.exit(1); }
  console.log(`✅ Inserted ${MOCK_DROPS.length} price drops`);

  // Price snapshots
  const snapshots = MOCK_DROPS.flatMap(d => [
    { listing_id: d.listing_id, price: d.price_before, recorded_at: new Date(new Date(d.detected_at).getTime() - 86400000).toISOString() },
    { listing_id: d.listing_id, price: d.price_after,  recorded_at: d.detected_at },
  ]);
  await supabase.from('price_snapshots').insert(snapshots);
  console.log(`✅ Inserted ${snapshots.length} price snapshots`);

  console.log('\n🎉 Mock data ready! Your site will show real drops.');
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

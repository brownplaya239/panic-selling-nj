-- ============================================================
-- Panic Selling NJ — Supabase Database Schema
-- Run this in your Supabase SQL editor to set up all tables
-- ============================================================

-- LISTINGS: latest snapshot of every active listing
CREATE TABLE IF NOT EXISTS listings (
  id                  TEXT PRIMARY KEY,          -- MLS listing ID
  mls_number          TEXT,
  address             TEXT NOT NULL,
  city                TEXT NOT NULL,
  county              TEXT NOT NULL,             -- 'Monmouth' | 'Ocean'
  zip                 TEXT,
  neighborhood        TEXT,
  property_type       TEXT,                      -- 'Single Family' | 'Condo' | 'Townhouse' | 'Land' | 'Multi Family'
  bedrooms            INTEGER,
  bathrooms           NUMERIC(4,1),
  sqft                INTEGER,
  lot_size            TEXT,
  year_built          INTEGER,
  garage              TEXT,
  current_price       BIGINT NOT NULL,
  original_price      BIGINT,                    -- price when first listed
  list_date           DATE,
  days_on_market      INTEGER,
  status              TEXT DEFAULT 'Active',     -- 'Active' | 'Pending' | 'Sold' | 'Expired'
  latitude            NUMERIC(10,7),
  longitude           NUMERIC(10,7),
  photo_url           TEXT,
  listing_url         TEXT,
  agent_name          TEXT,
  agent_id            TEXT,
  office_name         TEXT,
  description         TEXT,
  tags                TEXT[],                    -- e.g. ['OCEAN VIEWS', 'POOL']
  last_seen_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- PRICE SNAPSHOTS: one row every time we poll and see a price
CREATE TABLE IF NOT EXISTS price_snapshots (
  id                  BIGSERIAL PRIMARY KEY,
  listing_id          TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price               BIGINT NOT NULL,
  recorded_at         TIMESTAMPTZ DEFAULT NOW()
);

-- PRICE DROPS: detected drops — this is what powers the website
CREATE TABLE IF NOT EXISTS price_drops (
  id                  BIGSERIAL PRIMARY KEY,
  listing_id          TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price_before        BIGINT NOT NULL,
  price_after         BIGINT NOT NULL,
  drop_dollar         BIGINT GENERATED ALWAYS AS (price_before - price_after) STORED,
  drop_pct            NUMERIC(5,2) GENERATED ALWAYS AS (
                        ROUND(((price_before - price_after)::NUMERIC / price_before) * 100, 2)
                      ) STORED,
  detected_at         TIMESTAMPTZ DEFAULT NOW(),
  is_active           BOOLEAN DEFAULT TRUE       -- false once listing goes Pending/Sold
);

-- POLL LOG: track every API call for debugging
CREATE TABLE IF NOT EXISTS poll_log (
  id                  BIGSERIAL PRIMARY KEY,
  started_at          TIMESTAMPTZ DEFAULT NOW(),
  finished_at         TIMESTAMPTZ,
  listings_fetched    INTEGER DEFAULT 0,
  drops_detected      INTEGER DEFAULT 0,
  new_listings        INTEGER DEFAULT 0,
  status              TEXT DEFAULT 'running',   -- 'running' | 'success' | 'error'
  error_message       TEXT
);

-- INDEXES for fast frontend queries
CREATE INDEX IF NOT EXISTS idx_price_drops_detected  ON price_drops(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_drops_active     ON price_drops(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_price_drops_pct        ON price_drops(drop_pct DESC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_price_drops_dollar     ON price_drops(drop_dollar DESC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_listings_city          ON listings(city);
CREATE INDEX IF NOT EXISTS idx_listings_county        ON listings(county);
CREATE INDEX IF NOT EXISTS idx_listings_type          ON listings(property_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_listing      ON price_snapshots(listing_id, recorded_at DESC);

-- VIEW: joins drops + listing details — used directly by the frontend API
CREATE OR REPLACE VIEW active_drops AS
SELECT
  pd.id                   AS drop_id,
  pd.listing_id,
  pd.price_before,
  pd.price_after,
  pd.drop_dollar,
  pd.drop_pct,
  pd.detected_at,
  l.address,
  l.city,
  l.county,
  l.neighborhood,
  l.zip,
  l.property_type,
  l.bedrooms,
  l.bathrooms,
  l.sqft,
  l.lot_size,
  l.year_built,
  l.garage,
  l.days_on_market,
  l.list_date,
  l.photo_url,
  l.listing_url,
  l.mls_number,
  l.agent_name,
  l.tags,
  l.latitude,
  l.longitude,
  -- Price per sq ft (computed from current price / sqft)
  ROUND(l.current_price::NUMERIC / NULLIF(l.sqft, 0))::INTEGER AS ppsqft,
  -- Average ppsqft for all active listings in same city
  (SELECT ROUND(AVG(l2.current_price::NUMERIC / NULLIF(l2.sqft, 0)))::INTEGER
   FROM listings l2
   WHERE l2.city = l.city
     AND l2.status = 'Active'
     AND l2.sqft > 0
     AND l2.current_price > 0) AS town_avg_ppsqft,
  -- Was this drop detected today?
  (pd.detected_at::DATE = CURRENT_DATE) AS is_new_today,
  -- Total number of price drops this listing has had
  (SELECT COUNT(*) FROM price_drops pd2 WHERE pd2.listing_id = pd.listing_id)::INTEGER AS drop_count
FROM price_drops pd
JOIN listings l ON l.id = pd.listing_id
WHERE pd.is_active = TRUE
  AND l.status = 'Active'
ORDER BY pd.drop_dollar DESC;

-- VIEW: all active listings (no drop required) — powers the "All Active" toggle
CREATE OR REPLACE VIEW all_active_listings AS
SELECT
  l.id                                                               AS listing_id,
  NULL::bigint                                                       AS drop_id,
  l.current_price                                                    AS price_after,
  l.original_price                                                   AS price_before,
  GREATEST(0, COALESCE(l.original_price, l.current_price) - l.current_price) AS drop_dollar,
  CASE
    WHEN l.original_price > l.current_price AND l.original_price > 0
    THEN ROUND(((l.original_price - l.current_price)::NUMERIC / l.original_price) * 100, 2)
    ELSE 0
  END                                                                AS drop_pct,
  NULL::timestamptz                                                  AS detected_at,
  l.address,
  l.city,
  l.county,
  l.neighborhood,
  l.zip,
  l.property_type,
  l.bedrooms,
  l.bathrooms,
  l.sqft,
  l.lot_size,
  l.year_built,
  l.garage,
  l.days_on_market,
  l.list_date,
  l.photo_url,
  l.listing_url,
  l.mls_number,
  l.agent_name,
  l.tags,
  l.latitude,
  l.longitude,
  ROUND(l.current_price::NUMERIC / NULLIF(l.sqft, 0))::INTEGER      AS ppsqft,
  (SELECT ROUND(AVG(l2.current_price::NUMERIC / NULLIF(l2.sqft, 0)))::INTEGER
   FROM listings l2
   WHERE l2.city = l.city
     AND l2.status = 'Active'
     AND l2.sqft > 0
     AND l2.current_price > 0)                                       AS town_avg_ppsqft,
  (l.list_date >= CURRENT_DATE - 1)                                 AS is_new_today,
  0::integer                                                         AS drop_count
FROM listings l
WHERE l.status = 'Active'
ORDER BY l.days_on_market DESC NULLS LAST;

-- ============================================================
-- Row Level Security (enable if using Supabase public anon key)
-- ============================================================
ALTER TABLE listings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_drops     ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_log        ENABLE ROW LEVEL SECURITY;

-- Public read-only access (anon key can read, never write)
CREATE POLICY "Public read listings"    ON listings     FOR SELECT USING (true);
CREATE POLICY "Public read drops"       ON price_drops  FOR SELECT USING (true);
CREATE POLICY "No public write"         ON listings     FOR INSERT WITH CHECK (false);
CREATE POLICY "No public drop write"    ON price_drops  FOR INSERT WITH CHECK (false);

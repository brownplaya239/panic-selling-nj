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
-- OUTCOME ENGINE: track listing lifecycle → grade predictions
-- ============================================================

-- Sale outcome columns on listings (populated when feed reports Pending/Closed)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS close_price  BIGINT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS close_date   DATE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS pending_date DATE;

-- STATUS EVENTS: one row per observed status transition (Active→Pending→Closed etc.)
CREATE TABLE IF NOT EXISTS listing_status_events (
  id               BIGSERIAL PRIMARY KEY,
  listing_id       TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  old_status       TEXT,
  new_status       TEXT NOT NULL,
  price_at_change  BIGINT,
  changed_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_status_events_listing ON listing_status_events(listing_id, changed_at DESC);
ALTER TABLE listing_status_events ENABLE ROW LEVEL SECURITY;  -- no public policies: service key only

-- VIEW: full lifecycle per listing that left the market — the grading substrate
-- (DROP first: CREATE OR REPLACE can't rename the current_price→list_price column)
DROP VIEW IF EXISTS listing_outcomes;
CREATE VIEW listing_outcomes AS
SELECT
  l.id AS listing_id,
  l.address, l.city, l.county, l.property_type,
  l.original_price, l.current_price AS list_price, l.close_price,
  l.list_date, l.pending_date, l.close_date, l.status,
  (SELECT COUNT(*) FROM price_drops pd WHERE pd.listing_id = l.id)::INTEGER AS total_cuts,
  -- Total capitulation: original list → close (only for listings we tracked active,
  -- since the feed masks OriginalListPrice on closed records)
  CASE WHEN l.close_price > 0 AND l.original_price > 0
       THEN ROUND(((l.original_price - l.close_price)::NUMERIC / l.original_price) * 100, 2)
  END AS final_discount_pct,
  -- Sold vs final asking: positive = over ask (market heat), negative = under ask
  CASE WHEN l.close_price > 0 AND l.current_price > 0
       THEN ROUND(((l.close_price - l.current_price)::NUMERIC / l.current_price) * 100, 2)
  END AS sold_vs_list_pct,
  CASE WHEN l.close_date IS NOT NULL AND l.list_date IS NOT NULL
       THEN (l.close_date - l.list_date)
  END AS days_to_close
FROM listings l
WHERE l.status IN ('Pending', 'Closed') OR l.close_price IS NOT NULL;

-- VIEW: per-town live market stats + cut-again rate (Neighborhood Intelligence)
CREATE OR REPLACE VIEW town_stats AS
WITH drop_stats AS (
  SELECT
    listing_id,
    COUNT(*) AS n_drops,
    MAX(CASE WHEN rn = 2 AND detected_at <= first_at + INTERVAL '30 days' THEN 1 ELSE 0 END) AS cut_again_30
  FROM (
    SELECT listing_id, detected_at,
           ROW_NUMBER() OVER (PARTITION BY listing_id ORDER BY detected_at) AS rn,
           MIN(detected_at) OVER (PARTITION BY listing_id) AS first_at
    FROM price_drops
  ) t
  GROUP BY listing_id
)
SELECT
  l.city,
  COUNT(*)::INTEGER AS active_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.current_price)::BIGINT AS median_price,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.days_on_market)::INTEGER AS median_dom,
  ROUND(100.0 * COUNT(ds.listing_id) / NULLIF(COUNT(*), 0))::INTEGER AS pct_with_cut,
  ROUND(100.0 * SUM(COALESCE(ds.cut_again_30, 0)) / NULLIF(COUNT(ds.listing_id), 0))::INTEGER AS cut_again_30_pct
FROM listings l
LEFT JOIN drop_stats ds ON ds.listing_id = l.id
WHERE l.status = 'Active'
GROUP BY l.city;

GRANT SELECT ON town_stats TO anon, authenticated;

-- VIEW: per-town SOLD outcome stats over the last 12 months (from the closed-sales
-- backfill) — days-to-close, sold-vs-ask, and market-heat. Min-N gate at 10 so we
-- never surface a noisy stat; the frontend applies a stronger confidence gate.
CREATE OR REPLACE VIEW town_outcomes AS
WITH sold AS (
  SELECT
    city,
    close_price,
    CASE WHEN close_date IS NOT NULL AND list_date IS NOT NULL
              AND (close_date - list_date) BETWEEN 0 AND 1825
         THEN (close_date - list_date) END                                    AS dtc,
    CASE WHEN current_price > 0
         THEN ((close_price - current_price)::NUMERIC / current_price) * 100 END AS svl,
    CASE WHEN current_price > 0 AND close_price >= current_price THEN 1
         WHEN current_price > 0 THEN 0 END                                    AS at_or_over
  FROM listings
  WHERE status = 'Closed' AND close_price >= 200000
    AND close_date >= CURRENT_DATE - INTERVAL '12 months'
)
SELECT
  city,
  COUNT(*)::INTEGER                                                           AS sold_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY close_price)::BIGINT            AS median_close,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dtc)::INTEGER                   AS median_days_to_close,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY svl)::NUMERIC, 1)         AS median_sold_vs_list,
  ROUND(100.0 * SUM(at_or_over) / NULLIF(COUNT(at_or_over), 0))::INTEGER      AS pct_at_or_over_ask
FROM sold
GROUP BY city
HAVING COUNT(*) >= 10;

GRANT SELECT ON town_outcomes TO anon, authenticated;

-- SUBSCRIBERS: buyer alert preferences
CREATE TABLE IF NOT EXISTS subscribers (
  id                BIGSERIAL PRIMARY KEY,
  email             TEXT NOT NULL,
  name              TEXT,
  counties          TEXT[],            -- ['Monmouth'] | ['Ocean'] | both | null=any
  towns             TEXT[],            -- ['Brick','Toms River'] | null=all towns
  property_types    TEXT[],            -- ['Single Family'] | null=any
  min_beds          INTEGER,           -- null=any
  min_baths         NUMERIC(3,1),      -- null=any
  min_price         BIGINT,            -- null=any
  max_price         BIGINT,            -- null=any
  min_sqft          INTEGER,           -- null=any
  max_sqft          INTEGER,           -- null=any
  min_drop_pct      NUMERIC(5,2) DEFAULT 1.0,
  features          TEXT[],            -- ['OCEAN VIEWS','POOL'] | null=any
  max_dom           INTEGER,           -- null=any
  alert_on          TEXT DEFAULT 'drops',   -- 'drops' | 'all'
  frequency         TEXT DEFAULT 'instant', -- 'instant' | 'weekly'
  is_active         BOOLEAN DEFAULT TRUE,
  unsubscribe_token TEXT DEFAULT gen_random_uuid()::text,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  last_emailed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_subscribers_email  ON subscribers(email);

-- UNSUBSCRIBE RPC — callable by anon key via ?unsub=TOKEN
CREATE OR REPLACE FUNCTION unsubscribe(token TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE subscribers SET is_active = FALSE WHERE unsubscribe_token = token;
END;
$$;
GRANT EXECUTE ON FUNCTION unsubscribe(TEXT) TO anon;

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

-- Subscribers: public can INSERT (sign up), but never read others' data
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can subscribe"    ON subscribers  FOR INSERT WITH CHECK (true);
CREATE POLICY "No public read subs"     ON subscribers  FOR SELECT USING (false);

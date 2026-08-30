# MOMLS Project State

*Snapshot: 2026-08-30, commit `be01c62`. For continuing work on any machine — read this plus recent `git log` before building.*

## What this system is

MOMLS (njreindex.com, formerly momls.netlify.app) is a Monmouth & Ocean County real-estate intelligence site built on a MORMLS/Spark IDX feed:

- **Pipeline**: `poller.js` (6 AM / 8 PM ET) ingests actives + recent pending/closed via price-bucketed fetch (Spark's cursor pagination is unreliable — see docs/DATA-DICTIONARY.md for every feed quirk), detects price cuts, records status transitions, refreshes materialized frontend views, rescores deals, sends alert emails (Resend), snapshots leaderboards monthly.
- **Surfaces** (all in `index.html`): Price Drops · All Active · Sold Comps (Netlify function `/api/comps`) · Best Towns · Deal Screener · Recent Sales tape · Market Leaderboards — cross-linked with context-carrying jumps and deep links (`?lb=a:ID`).
- **Self-compounding loops**: deal predictions grade themselves against closings (`prediction_outcomes`); closed-sale attribution accrues to leaderboards; 20K+ backfilled closings (`backfill-sales.js`).

## Frozen decisions — do not change without cause

- **Leaderboard methodology is FROZEN at `be01c62`**: 0.5 co-agent credit splits (sides AND volume), $50K–$25M close sanity band, 0.25–3× close/ask ratio guard, NON MEMBER sentinel excluded, canonical brokerage entity = **MLS Office ID** (brand rollup is supplemental only).
- **Agent board stays BETA** until the MLS feed-agreement question is resolved in writing (external/manual gate).
- Public profiles show **aggregated** activity only — never individual closed-transaction rows. Agent email/phone are never stored.
- Fetch floor $25K; rentals/commercial-lease excluded by PropertyTypeLabel class, not price.

## Current phase (user-set sequencing — beta acquisition, NOT more features)

1. Run the 15–25 agent claim beta using bespoke town hooks (`docs/beta-outreach-list.txt`).
2. Next build when claims land: **funnel instrumentation** (sent → visit → claim → verified → card → referral), ~1hr, no methodology changes.
3. Town leaderboard UI only if town hooks improve claim rates (`agent_town_leaderboard` view is query-ready).
4. Rank deltas (↑/↓) only after the September snapshot (second data point; snapshots self-record on the first poll of each month).
5. After sharing behavior is proven: agent-owned profiles (bio/headshot/slug), not more analytics.

**Core validation metric: verified-agent share rate** (~8–10 of 20 claimants voluntarily posting their card = the leaderboard is a distribution channel).

## Operational notes

- `.env` is required for poller/backfill (Spark token, Supabase service key, Resend) — never committed; copy it machine-to-machine via USB/password manager.
- Claims are reviewed in Supabase → `profile_claims` → set `status='verified'` (badge appears on the profile).
- The poller must run on *some* machine twice daily or data goes stale and alerts/snapshots stop.
- Schema changes are applied manually in the Supabase SQL editor from `schema.sql` (run only the new block, not the whole file).

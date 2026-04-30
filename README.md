# 📉 Panic Selling NJ
### Monmouth & Ocean County Real Estate Price Drops
---

## Architecture Overview

```
FlexMLS (MORMLS)
      │
      │  Spark API (OAuth2, IDX key)
      ▼
  poller.js          ← runs 2x/day via cron
      │  upserts listings, detects price drops
      ▼
  Supabase           ← PostgreSQL + Realtime
      │  active_drops VIEW
      ▼
  index.html         ← frontend (static, no framework needed)
      │  reads via @supabase/supabase-js anon key
      │  live updates via Supabase Realtime channel
```

---

## Setup Guide

### Step 1 — Create a Supabase project (free)

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Open the **SQL Editor** and paste the contents of `schema.sql` — run it
3. From **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`  ← safe to put in frontend
   - **service_role key** → `SUPABASE_SERVICE_KEY`  ← keep secret, backend only

### Step 2 — Add mock data (while waiting for Spark approval)

```bash
npm install
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY in .env
node seed-mock.js
```

### Step 3 — Wire up the frontend

Open `index.html` and replace lines 170-171:
```js
const SUPABASE_URL      = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your_anon_key_here';
```

Open the file in your browser — you'll see real data from Supabase.

### Step 4 — Deploy the Edge Function (API endpoint)

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy drops-api
```

Set the secrets in Supabase dashboard → Edge Functions → Secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Step 5 — Connect Spark API (when approved)

Once you receive your Spark API credentials from MORMLS:

1. Add to `.env`:
```
SPARK_CLIENT_ID=your_client_id
SPARK_CLIENT_SECRET=your_client_secret
```

2. Run the poller once to test:
```bash
node poller.js
```

3. Verify drops appear in Supabase dashboard → Table Editor → price_drops

4. Start watch mode (runs 6 AM + 8 PM daily):
```bash
node poller.js --watch
```

### Step 6 — Production hosting

**Frontend (index.html):** Deploy to Netlify, Vercel, or Cloudflare Pages — free tier is fine.

**Poller (poller.js):** Needs a server to run the cron. Options:
- **Railway.app** — easiest, ~$5/mo, deploy with `railway up`
- **Render.com** — free tier background worker
- **VPS** (DigitalOcean $4/mo) — most control
- **GitHub Actions** — free cron alternative (runs on schedule)

---

## Switching from Mock → Live Data

The frontend auto-detects whether Supabase is configured. The moment you:
1. Paste your `SUPABASE_URL` and `SUPABASE_ANON_KEY` into `index.html`
2. Run `node seed-mock.js` OR `node poller.js` to populate the DB

...the site switches from mock data to live Supabase data automatically.
The demo badge in the top-right changes from `◎ DEMO DATA` to `● LIVE MLS`.

---

## Spark API Notes

- **Rate limit:** 1,500 requests / 5 minutes (IDX key) — our poller batches by 1,000 so 1-2 calls per poll
- **Fields used:** All standard RESO fields — no custom field negotiation needed
- **IDX compliance:** Listings displayed must show MLS attribution. Add `© MORMLS` to footer.
- **Price drop logic:** We compare `current_price` vs the last snapshot price. A drop must be ≥$5,000 AND ≥1% to surface.

---

## File Structure

```
panicselling-nj/
├── index.html                  ← Frontend (wired to Supabase)
├── poller.js                   ← Spark API poller + drop detector
├── seed-mock.js                ← Populates DB with demo data
├── schema.sql                  ← Supabase database schema
├── package.json
├── .env.example                ← Copy to .env and fill in
└── supabase/
    └── functions/
        └── drops-api/
            └── index.ts        ← Edge Function REST API (optional)
```

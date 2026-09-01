# NJREindex — MLS Vendor / Data-License Application Package

*Reusable technical description for MLS vendor applications (GSMLS, Bright, All Jersey MLS, NJMLS, etc.). Pair with the sponsoring participant's signed agreement. Maintained at docs/VENDOR-APPLICATION.md.*

## 1. Applicant & platform

- **Platform**: NJREindex (https://njreindex.com) — a consumer real-estate market-intelligence website for New Jersey.
- **Operator**: [YOUR LEGAL NAME / ENTITY — fill in]
- **Sponsoring participant**: Sangita Sancheti, [license # — fill in], Coldwell Banker [office — fill in]
- **Broker of record (signatory)**: Dawn Mauro, [license # — fill in]
- **Current data relationships**: Monmouth Ocean Regional REALTORS® MLS (Spark platform feed), in production since 2026.

## 2. What the platform does (intended use)

Consumer-facing display and derived statistics:

1. **Active-listing display (IDX)** — searchable active inventory with photos, price history, and market context, with required attribution and source notices.
2. **Market statistics** — aggregated town/county metrics (median prices, days on market, price-reduction rates, sold-to-ask ratios) presented with reporting period and source identification per MLS rules on statistical representations.
3. **Comparable sales** — address-based recent-closed-sale lookups for consumers (sold price, date, $/sqft), where the license covers sold-data display.
4. **Professional recognition statistics** — objective, quantitative rankings of agents/offices by MLS-recorded closed volume and transaction sides (e.g., "#1 by closed listing-side volume, trailing 12 months"), with published methodology, reporting periods, and source notices. No subjective "best agent" claims. *[Include only where the MLS license covers this use; strike otherwise.]*
5. **Consumer alerts** — email notifications of price changes matching a consumer's saved criteria.

## 3. Technical architecture

- **Ingestion**: server-side poller (Node.js) pulls via the MLS's API (RESO Web API / RETS / Spark) twice daily; incremental status/price-change detection; no scraping, no redistribution of raw feeds.
- **Storage**: PostgreSQL (Supabase, US region). Raw listing records held server-side; public site reads only derived views through a row-level-security layer.
- **Display**: static frontend (Netlify CDN) + serverless functions. HTTPS everywhere (TLS via Cloudflare/Netlify).
- **Fields**: only fields permitted for public display are shown. Confidential/office-only fields (compensation, showing instructions, private remarks, agent contact records) are excluded from storage or never fetched.
- **Attribution**: listing courtesy/office attribution and MLS source notices rendered per each MLS's display rules; statistical representations identify reporting period and data source.

## 4. Data security & compliance

- API credentials stored server-side only (never in client code or public repositories).
- Public database role is read-only over approved derived views; write access restricted to the ingestion service.
- No resale, sublicensing, or bulk redistribution of MLS data; no provision of data to third parties.
- Data-retention and takedown: records of listings removed from the feed are marked off-market promptly (within one polling cycle); we honor MLS takedown requests.
- Audit trail: all ingestion runs logged with timestamps and record counts.

## 5. Requested access

- **Feed type**: RESO Web API preferred (RETS acceptable). **Primary request: full active inventory plus status changes (IDX scope).** Sold/closed records are additionally requested where available for the statistics and comparable-sales uses above — this is optional to the application: we will operate within IDX-only scope if sold data is not granted, and conform the product to whatever scope is licensed.
- **Update frequency**: 2× daily polling (low volume; ~2 requests/second bursts, paginated).

## 6. Contact

- Technical & operations: [YOUR NAME, EMAIL, PHONE — fill in]
- Sponsoring participant: [SANGITA'S OFFICE CONTACT — fill in]

---
*Internal notes (do not send): strike section 2.4 for any MLS whose license does not cover derived agent-level statistics — confirm in writing before enabling leaderboards on that MLS's data. MORMLS sold-data scope confirmation is the template conversation.*

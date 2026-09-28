# NJREindex redesign — September 2026

Full UI/UX redesign of njreindex.com: design system, application shell, homepage, map-first listings, Property Intelligence pages, analytics, workspace, performance, and accessibility. **Data pipelines, database schema, the poller, the `/api/comps` function, the deal-score and Best Towns formulas, and the frozen leaderboard methodology (be01c62) are unchanged.**

## 1. Audit of the previous site

**Architecture.** One 2,770-line `index.html` (163 KB: all CSS + JS inline), eight views toggled with `display`, vanilla JS + Supabase. No router: only `?lb=` (leaderboard profile) and `?unsub=` (unsubscribe) deep links existed.

**Duplication.** Eight near-identical `#modeBtnX.active` rules, `.ppsqft-badge` defined twice, four separate table styles, four "intro/foot" text styles, three "pulse tile" variants.

**Navigation.** Eight horizontal mode buttons with emoji, a ~200-town horizontal tab strip, and a scrolling ticker competed for the top of the page. Brand was "MOMLS Pricing Dashboard".

**Performance.** Listings loaded in **6 strictly sequential requests** (~2.2 s before anything rendered), `select=*`, supabase-js render-blocking in `<head>`, and switching Price Drops ↔ All refetched everything. Measured CLS **0.131** (fails the 0.1 target).

**Correctness issues found while auditing** (fixed in the new frontend unless noted):
- Paged queries ordered by non-unique columns (`days_on_market`, `drop_dollar`, `close_date`) can skip or duplicate rows across pages → added a unique tiebreak (`listing_id` / `id`).
- **54% of listings have county "Unknown"** in the feed; the county filter silently hid them. County is now inferred from other listings in the same town (flagged "inferred" in the UI).
- **1,281 "Adult Community" listings** matched no property-type filter. Type groups now cover every type in the feed.
- The feed's **original list price is sometimes reset to the current price after a cut** (e.g. a tracked $799K → $700K cut showed "listed at $700,000"). "Was" now uses the highest known asking price.
- The feed tags some towns with the wrong county (e.g. Howell as Ocean). Official municipality records are now preferred for county display.
- Deal cards said "based on N closed **5+**-cut sellers"; the poller pools 3+ cuts into one cohort. Label corrected to "3+".
- The alert wizard's **"New Listings Too" option was never read by the poller** (alerts are drops-only). Option removed rather than promise something that doesn't happen.
- Clicking a listing opened a Google search for "…NJ Zillow" (the feed has no listing URLs or photos). Listings now open NJREindex's own property page.
- Data strings were injected into `innerHTML` unescaped. All new templates escape data.

## 2. Architecture now

```
index.html                  shell: sidebar IA, header search, icon sprite, landmarks (19 KB)
assets/css/app.css          design tokens (light/dark, density) + all components
assets/js/core.js           config, data layer, listing model, workspace store, router, search
assets/js/ui.js             metric cards, data table, charts, dialog, drawer, alerts dialog,
                            compare tray, notifications, comps module, map loader
assets/js/views/*.js        one file per route, loaded on first visit (route-level code splitting)
```

- **Routing:** URL query state (`?view=listings&seg=drops&town=Brick`). Every filter is in the URL (bookmarkable/shareable); Back restores filters and scroll. Legacy links still work: `?lb=o:ID` / `?lb=a:ID` open ranking profiles, `?unsub=TOKEN` unsubscribes, `?view=boards|towns` redirect to their new homes.
- **Data layer:** in-memory cache with in-flight de-duplication; paged reads fetch the first page with an exact count, then all remaining pages **in parallel**. Price Drops and All Active are loaded once (in parallel) and joined client-side, so the segment switch is instant.
- **Lazy loading:** Leaflet + clustering load only when a map is shown (never on the homepage).
- **Versioned assets:** URLs carry `?v=2026.09.28a` and are cached for a year (`netlify.toml`). **Bump `App.VERSION` in `core.js` and the three `?v=` references in `index.html` whenever any asset changes.**

## 3. What was built

**Design system.** Palette per spec (navy #101D34, canvas #F6F8FB, teal #087F8C, slate #243750, amber #D99A31), Inter with tabular numerals, 8 px spacing, 10–12 px radii, thin borders, Lucide-style inline icons (no emoji), light theme default with a matching dark theme, comfortable/compact density. Green/amber/red are always paired with text or icons.

**Information architecture.** Collapsible sidebar: Overview (Dashboard) · Explore (Listings & Price Drops, Sales Tape) · Analyze (Property Intelligence, Comparables, Deal Screener) · Market Intelligence (Town & County Analytics, NJ Public Records, Agent & Brokerage Rankings) · My Workspace (Saved, Alerts, Reports). Persistent header search (`/` to focus), notifications bell, workspace/display menu. NJREindex is the brand; "MOMLS region" is the MLS coverage designation.

**Homepage.** Hero + global search (address, town, municipality, county, ZIP), four discovery cards, Market Pulse from live data with source, window, and refresh time (MLS region and statewide public records shown separately), 21-county discovery grid, capability previews, data-sources/methodology section, alerts CTA.

**Global search.** Active MLS listings by address, MLS towns, 565 public-records municipalities, 21 counties, ZIP codes, and "run comparables for any address". Place names rank first unless the query contains a house number. Full combobox keyboard support. Parcel/block-lot search is not offered (no parcel data in our sources).

**Listings & Price Drops.** Split list/map (list-only and map-only modes; List/Map toggle and filter sheet on phones), marker clustering over 5,700+ listings, "search as I move the map", removable filter chips, virtualized result cards (current price, highest known price, cumulative reduction, days on market, latest cut date, $/sq ft vs. town, and why the listing qualifies for the active screen), quick-preview drawer with tracked cut history and IDX brokerage attribution, save/compare on every card, contextual Save search / Get alerts, town context bar. Default segment remains **All active** (per the Sept 28 request).

**Property Intelligence.** One page per property: overview, sales & listing history timeline (MLS events + tracked cuts + matched recorded deed), comparable sales (lazy-loaded via `/api/comps`), public records (municipality stats + monthly chart; owner names deliberately not shown), taxes & assessment (explicitly unavailable — MOD-IV not integrated), market context vs. town, investment analysis (deal-score factors + published formula + editable underwriting calculator), private research notes, print report. Every value is labeled MLS / Public record / Calculated / Estimate / Your input / Unavailable.

**Analytics.** Town scorecards (Best Towns formula unchanged and now published), per-town scorecard pages with monthly MLS and public-record charts, 2–4 town side-by-side comparison, statewide public-records tables covering all municipalities (previously capped at 120) with municipality drill-down charts. Metric cards state measure, geography, window, n, and source.

**Deal Screener.** Same filters and scores; each card shows the factors behind its score, the exact scoring weights from `poller.js` are published, all filters live in the URL.

**Tables.** Sticky headers, click-to-sort, column visibility (remembered), search, pagination, right-aligned tabular numbers, card layout on phones. CSV export **only** for public-records tables; MLS data is not exportable.

**Alerts.** One-step dialog: criteria carried over from the current screen, email, frequency (instant default), consent. Advanced criteria one click away. Writes the identical `subscribers` row shape the poller matches. County-only alerts get a warning (half of listings lack a county) with a one-click switch to explicit towns.

**Workspace (browser-local — the site has no accounts).** Saved properties with change-since-saved and change-since-last-visit, saved searches with "new listings / new cuts since last check", recently viewed, compare tray (up to 4) with side-by-side comparison, private notes, notifications for watched-property price changes, reports hub (print-to-PDF for property, comparables, and town reports).

## 4. Intentional behavior changes (review these)

| Before | After | Why |
|---|---|---|
| Landing page = listing list | Landing page = Dashboard (homepage) | Spec §5. Listings still default to All active. |
| Scrolling ticker, ~200-town tab strip, in-list ad card | Removed | Replaced by search, town filter with counts, and contextual alert actions. |
| Beds filter = exact match | Beds = minimum ("3+") | Matches alert semantics (`min_beds`) and common practice. |
| "Price Reduced" type button | "Reduced from original" filter + Price drops segment | Clearer separation of tracked cuts vs. original-price comparisons. |
| Per-card Share button | Share on the property page | Cards stay scannable. |
| 6-step alert wizard | 1-step dialog + advanced section | Spec §9. Same database payload. |
| "New Listings Too" alert option | Removed | The poller never sent these alerts. |
| Dark terminal theme only | Light default, dark optional | Spec §3. |
| Social card brand "MOMLS" | "NJREindex" | Branding only; ranking data and methodology unchanged. |

## 5. Performance (measured in the local preview against live Supabase)

| Metric | Before | After |
|---|---|---|
| Listings: requests before first results | 6 sequential | 1 + 6 in parallel (+ drops in parallel) |
| Listings: all data received | 2,155 ms | 1,450 ms |
| Listings: cumulative layout shift | 0.131 | **0** |
| Homepage: cumulative layout shift | n/a | **0** |
| Homepage: listing data downloaded | ~4 MB JSON (whole list) | counts + 2 single-row medians only |
| Initial HTML | 163 KB | 19 KB (5.4 KB gzip) |
| Filter/segment interaction (main-thread work) | not measured | 21–57 ms incl. re-clustering 5,700 markers |
| Listing payload per 1,000 rows (gzip) | 106 KB | 88 KB |

Paint timings (LCP) could not be measured reliably because the preview pane was hidden (browsers defer paint in hidden tabs); check LCP in production with PageSpeed Insights after deploy.

## 6. Accessibility

axe-core (WCAG 2.0/2.1/2.2 A + AA rules) run on Dashboard, Listings, Property, Deals, Sales, Markets (list, scorecard, compare), Public Records, Rankings, Saved, Alerts, Reports, Comparables, the alerts dialog, and dark theme: **0 violations** after fixes (inline links now underlined; radio-group ARIA corrected). Also: skip link, landmarks, labeled controls, focus-visible rings, focus moved to the page heading on navigation, dialog focus trap + Escape + focus return, 30 px+ targets, chart data-table alternatives, `prefers-reduced-motion` honored.

## 7. Data integrity & compliance

- Provenance labels on every metric; MLS vs. public record vs. calculated vs. estimate vs. user input vs. unavailable.
- IDX: "Listing courtesy of {brokerage}" on previews and property pages; MLS attribution and "deemed reliable but not guaranteed" footer; rankings keep the MORMLS source notice.
- No statewide MLS claim anywhere; coverage stated in sidebar, hero, search results, and footer.
- No MLS bulk export; CSV only for public records. Owner names never displayed. Agent contact info still never stored or shown.
- Leaderboard methodology, BETA status for agents, and aggregated-only public profiles are preserved exactly.

## 8. Follow-ups (not done — need a decision or a different system)

1. **Map tiles:** uses OpenStreetMap's public tile server (fine for development and light traffic). Before significant traffic, switch to a keyed provider (MapTiler/Stadia) by changing `App.cfg.TILES` in `ui.js`. CARTO basemaps now require an API key.
2. **Poller county inference:** alert matching and `cut_edge` county rollups use the feed's county, which is missing on ~54% of listings and wrong for some towns. Inferring county in the poller would fix alerts, county stats, and the Howell/Ocean misgrouping.
3. **Poller original price:** preserve the first-seen asking price instead of overwriting `original_price`.
4. **Slow queries:** agent/brokerage profile panels take 5–8 s (`listings` filtered by agent/office ids) → add indexes on `agent_id`, `list_office_id`, `buyer_agent_id`, `buyer_office_id`. `town_stats`, `town_outcomes`, and `cut_edge` compute on every request (2–4 s) → materialize like `active_drops`.
5. **Taxes & assessment:** integrate NJ MOD-IV to fill the property-page section currently marked unavailable.
6. **Accounts:** the workspace is per-browser. Cross-device saved searches and server-side alert management need authentication.
7. **Comparables locally:** `/api/comps` only runs on Netlify (or `netlify dev`), so it shows its error state in the plain local preview.
8. **Tests:** verification was scripted in the preview browser; there is no automated test suite yet.

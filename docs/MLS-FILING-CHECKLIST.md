# Multi-MLS Filing Checklist

*Signatories: Sangita Sancheti (sponsoring participant) + Dawn Mauro (broker of record — has agreed to sign). Attach docs/VENDOR-APPLICATION.md (filled in) to every application. Posture: IDX/actives first; sold data as an optional rider, never a blocker.*

**Role structure (settled):** the operator (NJREindex) is a THIRD-PARTY VENDOR — signs vendor NDAs/agreements only, never joins an MLS, needs no RE license. Sangita must hold membership in EACH target MLS (secondary memberships are normal, ~a few hundred $/yr each; her Coldwell office may already participate in several). Where she won't join, the fallback is a direct commercial data license (no sponsor needed — e.g., Bright content licensing) at commercial pricing. IDX sections of the site are legally the participant's advertising → Sangita/Coldwell attribution required per MLS display rules + NJ ad regs.

- [ ] **Step zero: list which MLSs Sangita's logins cover** — that list = the immediate filings; gaps = secondary-membership vs direct-license decision per MLS.

## 0. MORMLS (already live) — the template conversation
- [ ] Written confirmation of current feed scope, esp. derived statistics/sold-data use (the leaderboard question). Whatever language works here gets reused in every other application.

## 1. All Jersey MLS — file first (statewide claim, broker-owned, friendliest)
- Contact: Info@AllJerseyMLS.com · (732) 661-9500 · support.alljerseymls.com
- [ ] Confirm Sangita's membership is active (she has the login)
- [ ] Email intro (template below) requesting vendor/IDX data-access forms
- [ ] Dawn signs broker agreement; submit with application package
- Why first: single agreement, potentially statewide active coverage.

## 2. GSMLS — biggest single win (North/Central NJ)
- Forms (from gsmls.com applications page):
  - [ ] **Vendor Access** form — completed by the broker (Dawn) requesting NJREindex be granted access
  - [ ] **Vendor Nondisclosure** — completed by us (the vendor)
  - [ ] Broker IDX agreement + board approval (Dawn signs; Sangita's board processes)
  - [ ] Credit Card Authorization for fees (amounts not published — ask when filing)
- Feed tech: RETS/API per their vendor docs (forms.gsmls.com/Applications/rets_vnda.pdf)

## 3. Bright MLS — South Jersey (contract required — NOT free)
- Per Bright's FAQ (verified 2026-09): "direct access to the data requires a contract with Bright. Fees apply." Only door: Bright Content Licensing (start with outreach email #3).
- [ ] Send content-licensing inquiry (docs/outreach-emails-mls.md #3)
- [ ] Contract + fee schedule → then OAuth credentials
- **Adapter notes for when credentials arrive** (from their FAQ):
  - `PropertySubType` largely DEPRECATED (Condominium/Farm/Mobile Home etc. removed) — real type lives in `StructureDesignType`, `OwnershipInterest`, `ArchitecturalStyle`. Our MORMLS property_type mapping will NOT transfer as-is.
  - Use `ListingKey` (stable) as primary id, NOT ListingId (changes if the county on a listing is corrected).
  - Agents/offices live in `BrightMembers` / `BrightOffices` resources (leaderboard attribution path).
  - Photos: up to 150/listing, URL storage allowed, order via `$orderby=MediaDisplayOrder asc`.
  - Refresh: NAR policy minimum every 12h — our 2×-daily cadence is exactly compliant.
  - No IP restrictions; concurrent connections permitted; page via max-page-size header.

## 4. NJMLS — North Jersey (Bergen/Essex/Passaic)
- [ ] Requires participant membership in NJMLS — confirm whether Sangita/office holds one; if not, defer until 1–3 are live.

## 5. Shore boards (Cape May County MLS, South Jersey Shore Regional, Hudson County)
- [ ] Defer — small inventories; revisit after the big three are flowing.

---

## Intro email template (send from Sangita's or your address)

> Subject: Vendor data-access application — NJREindex (sponsoring participant: Sangita Sancheti)
>
> Hello — I'm a participant member requesting IDX/data-feed access for a third-party platform, NJREindex (njreindex.com), a consumer market-statistics and listing-display site already operating in production on the Monmouth Ocean Regional MLS feed. Our broker of record, Dawn Mauro, will execute the required broker agreements.
>
> Could you send the vendor application, data-access agreement, and fee schedule? A technical description of the platform (architecture, security, display compliance) is attached. Primary scope requested is active-listing display and derived market statistics; we conform fully to your display and attribution rules.
>
> Thank you — [name, phone]

## Decision points to expect
- **Fees**: budget roughly $50–200/mo per MLS for vendor/IDX feeds; Bright potentially more. Get the schedule in writing before signing.
- **Sold data**: if refused, accept IDX-only and keep leaderboards MORMLS-scoped (per posture above).
- **Leaderboard/statistics use**: disclosed in the application package. If an MLS objects, that MLS's data powers listings/stats surfaces only — flag it and we scope the product per feed.
- **Timeline reality**: 2–8 weeks per MLS from filing to credentials; Bright can run longer.

## When the first new credential arrives (engineering starts then, not before)
1. Add `mls_source` column to listings; split `normalizeListing` into per-feed adapters.
2. Build cross-MLS dedup (address + lat/lon entity resolution) — the one new subsystem; overlapping listings must not double-count in stats/leaderboards.
3. Scope every stats/leaderboard surface per-feed to its licensed uses.

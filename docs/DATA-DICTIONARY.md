# MORMLS / Spark IDX Feed — Data Dictionary

Generated 2026-08-28 from a live census of the replication feed
(300 Active + 300 Closed listings, full StandardFields). **823 distinct fields observed.**

- **Act% / Cls%** = share of sampled Active / Closed records where the field is present and unmasked.
- **Masked** = feed returns `********` (field exists but this feed tier redacts it).
- Empty ≠ masked: many RESO fields simply aren't used by this MLS.
- Spark quirks that cost us bugs (all verified): `PropertyType` is a code — use `PropertySubType`;
  `DaysOnMarket` is absent — derive from `OnMarketDate`; `OriginalListPrice` is masked on Closed;
  `BedroomsTotal`/`ListAgentFullName`/`BuyerAgentFullName` are empty — use `BedsTotal` / First+Last;
  `_startat` pagination is ignored and `_skiptoken` is unreliable under heavy `_fields` — page by
  ListPrice buckets; `ZoningDescription` is occasionally a dict — string-guard.

## Curated: the fields that matter (with our DB mapping)

### Identity & Status

| Feed field | Our column | Act% | Cls% | Notes |
|---|---|---|---|---|
| `ListingId` | id (fallback) | 100% | 100% | MLS listing number; Spark record Id is primary key |
| `MlsStatus` | status | 100% | 100% | 'Active' | 'Pending' | 'Closed' — drives the whole pipeline |
| `PropertyType` | — | 100% | 100% | Single-letter CODE (e.g. "A") — do not use; see PropertySubType |
| `PropertySubType` | property_type | 100% | 100% | The real type: Single Family Residence, Condominium, Adult Community, Duplex, Commercial, Residential Land… |
| `PropertyTypeLabel` | property_class | 100% | 100% | Class: Residential | Multi-Family | Land/Lots | Commercial | Residential Rental | Commercial Lease. We ingest sales classes only |

### Address & Geography

| Feed field | Our column | Act% | Cls% | Notes |
|---|---|---|---|---|
| `UnparsedAddress` | address | 100% | 100% | Full street address incl. town/state/zip |
| `City` | city | 100% | 100% | Feed town name (variants exist: "Neptune Township", "Ocean Twp") |
| `PostalCode` | zip | 100% | 100% |  |
| `CountyOrParish` | — (derived) | 100% | 100% | We derive county from a town map; this field also exists |
| `SubdivisionName` | neighborhood | 99% | 99% |  |
| `Latitude` | latitude | 100% | 100% | Occasionally masked (********) |
| `Longitude` | longitude | 100% | 100% | Occasionally masked |

### Pricing & Key Dates

| Feed field | Our column | Act% | Cls% | Notes |
|---|---|---|---|---|
| `ListPrice` | current_price | 100% | 100% | CURRENT asking price (drops as seller cuts) |
| `OriginalListPrice` | original_price | 0% | 0% | MASKED on Closed records — only capturable while active. Why capitulation history must be tracked live |
| `ClosePrice` | close_price | 0% | 100% | Recorded sale price — present on Closed |
| `CloseDate` | close_date | 0% | 100% | Settlement date |
| `PurchaseContractDate` | pending_date | 0% | 100% | Went-under-contract date |
| `ListingContractDate` | list_date | 100% | 100% | List date; can predate OnMarketDate on relists |
| `OnMarketDate` | — (used in DOM calc) | 100% | 100% | 100% populated; preferred DOM anchor |
| `DaysOnMarket` | — (absent) | 0% | 0% | NOT provided by this feed tier (0/600) — we derive days_on_market from OnMarketDate |

### Physical Property

| Feed field | Our column | Act% | Cls% | Notes |
|---|---|---|---|---|
| `BedsTotal` | bedrooms | 98% | 97% | Use this, NOT BedroomsTotal (absent in this feed) |
| `BathsTotal` | bathrooms | 98% | 97% | Primary baths field (2.1 = 2 full 1 half) |
| `BathroomsTotalDecimal` | bathrooms (fallback) | 100% | 100% |  |
| `BuildingAreaTotal` | sqft | 91% | 85% | ~85-90% populated on residential |
| `YearBuilt` | year_built | 93% | 91% |  |
| `GarageSpaces` | garage | 99% | 98% |  |
| `Basement` | — (dict) | 88% | 81% | Object of flags: {"Crawl Space": true} |
| `ArchitecturalStyle` | — (dict) | 85% | 84% | Object of flags: {"Ranch": true, "Detached": true} |

### Lot & Zoning

| Feed field | Our column | Act% | Cls% | Notes |
|---|---|---|---|---|
| `LotSizeAcres` | lot_acres | 90% | 93% | Numeric; ~85% coverage incl. land |
| `LotSizeArea` | lot_size (text) | 90% | 93% |  |
| `LotSizeDimensions` | — | 63% | 60% | "50 x 100" |
| `LotSizeSquareFeet` | — | 90% | 93% |  |
| `ZoningDescription` | zoning | 77% | 77% | Comma-separated tags: Residential, Commercial, Agricultural, Mixed, Office… Occasionally a dict — string-guard on ingest |
| `Zoning` | — | 0% | 0% | MASKED — use ZoningDescription |
| `LotFeatures` | — | 56% | 56% | Object of flags |

### Listing-Side Agent & Office (100% on Closed)

| Feed field | Our column | Act% | Cls% | Notes |
|---|---|---|---|---|
| `ListAgentMlsId` | agent_id | 100% | 100% | Stable agent key — aggregate on this, not name |
| `ListAgentFirstName` | — | 100% | 100% | Use First+Last; ListAgentFullName is EMPTY in this feed |
| `ListAgentLastName` | — | 100% | 100% |  |
| `ListOfficeName` | office_name | 100% | 100% | Brokerage display name |
| `ListOfficeMlsId` | — (add for leaderboards) | 100% | 100% | Stable brokerage key |
| `ListAgentEmail` | — (do not publish) | 100% | 99% | Present but treat as private |
| `ListAgentCellPhone` | — (do not publish) | 96% | 96% | Present but treat as private |
| `CoListAgentMlsId` | — (add for leaderboards) | 15% | 10% | ~10% of closings have a co-list agent — needed for credit splitting |

### Buyer-Side Agent & Office (100% on Closed — enables buyer-agent rankings)

| Feed field | Our column | Act% | Cls% | Notes |
|---|---|---|---|---|
| `BuyerAgentMlsId` | — (add for leaderboards) | 7% | 100% | Stable buyer-agent key |
| `BuyerAgentFirstName` | — | 7% | 100% |  |
| `BuyerAgentLastName` | — | 7% | 100% |  |
| `BuyerOfficeName` | — (add for leaderboards) | 7% | 100% |  |
| `BuyerOfficeMlsId` | — (add for leaderboards) | 7% | 100% |  |
| `CoBuyerAgentMlsId` | — | 0% | 6% | ~6% of closings |
| `TeamName` | — | 0% | 0% | NOT populated (0/300) — team rankings need manually verified rosters, as your plan assumed |

### Features & Flags

| Feed field | Our column | Act% | Cls% | Notes |
|---|---|---|---|---|
| `WaterfrontYN` | → tags WATERFRONT | 0% | 0% |  |
| `WaterBodyName` | → tags OCEAN VIEWS | 0% | 0% |  |
| `PoolPrivateYN` | → tags POOL | 0% | 0% |  |
| `NewConstructionYN` | → tags NEW CONSTRUCTION | 68% | 63% |  |
| `SeniorCommunityYN` | senior_community | 34% | 24% | 55+ flag; we also infer from Adult Community subtype |
| `AssociationFee` | — | 36% | 38% | HOA fee + AssociationFeeFrequency |
| `PublicRemarks` | description | 97% | 96% | Listing copy — fuels motivation-keyword NLP (MOTIVATED, AS-IS, ESTATE…) |

### Media

| Feed field | Our column | Act% | Cls% | Notes |
|---|---|---|---|---|
| `Photos` | photo_url (first) | 0% | 0% | Array; Uri800 / UriThumb sizes |

## Full field census (all 823 observed fields)

| Field | Act% | Cls% | Masked | Type | Sample |
|---|---|---|---|---|---|
| `AboveGradeFinishedArea` | 0 | 0 | no |  |  |
| `AboveGradeFinishedAreaSource` | 0 | 0 | no |  |  |
| `AboveGradeFinishedAreaUnits` | 0 | 0 | no |  |  |
| `AboveGradeUnfinishedArea` | 0 | 0 | no |  |  |
| `AboveGradeUnfinishedAreaSource` | 0 | 0 | no |  |  |
| `AboveGradeUnfinishedAreaUnits` | 0 | 0 | no |  |  |
| `AccessCode` | 0 | 0 | no |  |  |
| `AccessibilityFeatures` | 6 | 5 | partial | object | {"Stall Shower":true} |
| `ActiveUnderContractTimestamp` | 0 | 0 | no |  |  |
| `AdditionalParcelsDescription` | 0 | 0 | no |  |  |
| `AdditionalParcelsYN` | 0 | 0 | no |  |  |
| `AnchorsCoTenants` | 0 | 0 | no |  |  |
| `ApprovalStatus` | 100 | 100 | no | boolean | true |
| `ArchitecturalStyle` | 85 | 84 | partial | object | {"Colonial":true} |
| `AssociationAmenities` | 34 | 31 | partial | object | {"Exercise Room":true,"Community Room":true,"Poo |
| `AssociationFee` | 36 | 38 | partial | number | 283 |
| `AssociationFee2` | 0 | 0 | no |  |  |
| `AssociationFee2Frequency` | 0 | 0 | no |  |  |
| `AssociationFeeFrequency` | 40 | 42 | partial | string | Monthly |
| `AssociationFeeIncludes` | 32 | 30 | partial | object | {"Common Area":true,"Lawn Maintenance":true,"Poo |
| `AssociationName` | 0 | 0 | YES |  |  |
| `AssociationName2` | 0 | 0 | no |  |  |
| `AssociationPhone` | 0 | 0 | YES |  |  |
| `AssociationPhone2` | 0 | 0 | no |  |  |
| `AssociationYN` | 97 | 97 | partial | boolean | true |
| `AttachedGarageYN` | 93 | 89 | partial | boolean | true |
| `AttributionContact` | 4 | 2 | no | string | 732-439-0016 |
| `AvailabilityDate` | 0 | 0 | YES | string | 2027-05-01 |
| `AvailableLeaseType` | 0 | 0 | no |  |  |
| `BackOnMarketDate` | 0 | 0 | no |  |  |
| `BackOnMarketTimestamp` | 5 | 12 | no | string | 2026-08-21T22:42:57Z |
| `Basement` | 88 | 81 | partial | object | {"Full":true} |
| `BasementYN` | 98 | 97 | partial | boolean | true |
| `BathroomsOneQuarter` | 0 | 0 | YES |  |  |
| `BathroomsPartial` | 0 | 0 | YES |  |  |
| `BathroomsTotalDecimal` | 100 | 100 | no | number | 0 |
| `BathroomsTotalInteger` | 100 | 100 | no | number | 0 |
| `BathroomsTotalNotational` | 100 | 100 | no | number | 0 |
| `BathsFull` | 98 | 97 | partial | number | 1 |
| `BathsHalf` | 98 | 97 | partial | number | 0 |
| `BathsOneQuarter` | 0 | 0 | YES |  |  |
| `BathsThreeQuarter` | 0 | 0 | YES |  |  |
| `BathsTotal` | 98 | 97 | partial | number | 1 |
| `BedroomsPossible` | 0 | 0 | no |  |  |
| `BedsTotal` | 98 | 97 | partial | number | 3 |
| `BelowGradeFinishedArea` | 0 | 0 | no |  |  |
| `BelowGradeFinishedAreaSource` | 0 | 0 | no |  |  |
| `BelowGradeFinishedAreaUnits` | 0 | 0 | no |  |  |
| `BelowGradeUnfinishedArea` | 0 | 0 | no |  |  |
| `BelowGradeUnfinishedAreaSource` | 0 | 0 | no |  |  |
| `BelowGradeUnfinishedAreaUnits` | 0 | 0 | no |  |  |
| `BodyType` | 0 | 0 | YES |  |  |
| `BoxNumber` | 0 | 0 | no |  |  |
| `BuilderModel` | 0 | 0 | no |  |  |
| `BuilderName` | 0 | 0 | no |  |  |
| `BuildingAreaSource` | 0 | 0 | no |  |  |
| `BuildingAreaTotal` | 91 | 85 | no | number | 1116 |
| `BuildingAreaUnits` | 0 | 0 | no |  |  |
| `BuildingFeatures` | 0 | 0 | YES |  |  |
| `BuildingName` | 0 | 0 | no |  |  |
| `BusinessName` | 0 | 0 | YES |  |  |
| `BusinessType` | 1 | 1 | YES | object | {"Retail":true,"Liquor Store":true,"Barber/Salon |
| `BuyerAgentAOR` | 0 | 0 | no |  |  |
| `BuyerAgentAssociation` | 100 | 100 | no | array | [] |
| `BuyerAgentCellPhone` | 0 | 0 | YES |  |  |
| `BuyerAgentDesignation` | 0 | 0 | YES |  |  |
| `BuyerAgentDesignationList` | 1 | 17 | no | object | {"CLHMS":true} |
| `BuyerAgentDirectPhone` | 0 | 0 | YES |  |  |
| `BuyerAgentEmail` | 0 | 0 | YES |  |  |
| `BuyerAgentFax` | 0 | 0 | YES |  |  |
| `BuyerAgentFirstName` | 7 | 100 | no | string | Steven |
| `BuyerAgentHomePhone` | 0 | 0 | no |  |  |
| `BuyerAgentId` | 7 | 100 | no | string | 20140811175810238519000000 |
| `BuyerAgentKey` | 0 | 0 | no |  |  |
| `BuyerAgentKeyNumeric` | 0 | 0 | no |  |  |
| `BuyerAgentLastName` | 7 | 100 | no | string | Porzio |
| `BuyerAgentLoginId` | 0 | 0 | YES |  |  |
| `BuyerAgentMarketingName` | 3 | 47 | no | string | The Gumnitz Team . |
| `BuyerAgentMemberType` | 7 | 99 | no | string | Realtor |
| `BuyerAgentMiddleName` | 0 | 0 | YES |  |  |
| `BuyerAgentMlsId` | 7 | 100 | no | string | 29862 |
| `BuyerAgentName` | 0 | 0 | YES |  |  |
| `BuyerAgentNamePrefix` | 0 | 0 | no |  |  |
| `BuyerAgentNameSuffix` | 0 | 0 | no |  |  |
| `BuyerAgentNrdsId` | 7 | 100 | no | number | 609024297 |
| `BuyerAgentOfficePhone` | 0 | 0 | YES |  |  |
| `BuyerAgentOfficePhoneExt` | 0 | 0 | YES |  |  |
| `BuyerAgentOriginatingSystemMlsId` | 7 | 100 | no | string | 29862 |
| `BuyerAgentPager` | 0 | 0 | YES |  |  |
| `BuyerAgentPreferredPhone` | 0 | 0 | YES |  |  |
| `BuyerAgentPreferredPhoneExt` | 0 | 0 | YES |  |  |
| `BuyerAgentPrimaryAssociation` | 0 | 0 | YES |  |  |
| `BuyerAgentSourceSystemMlsId` | 0 | 0 | YES |  |  |
| `BuyerAgentStateLicense` | 0 | 0 | YES |  |  |
| `BuyerAgentSuffix` | 0 | 0 | no |  |  |
| `BuyerAgentTeamKey` | 0 | 0 | no |  |  |
| `BuyerAgentTollFreePhone` | 0 | 0 | YES |  |  |
| `BuyerAgentURL` | 0 | 0 | YES |  |  |
| `BuyerAgentUserType` | 0 | 0 | YES |  |  |
| `BuyerAgentViewName` | 7 | 100 | no | string | Steven Porzio |
| `BuyerAgentVoiceMail` | 0 | 0 | YES |  |  |
| `BuyerAgentVoiceMailExt` | 0 | 0 | YES |  |  |
| `BuyerCompanyId` | 0 | 0 | YES |  |  |
| `BuyerFinancing` | 0 | 0 | YES |  |  |
| `BuyerOfficeAOR` | 0 | 0 | no |  |  |
| `BuyerOfficeAssociation` | 0 | 0 | YES |  |  |
| `BuyerOfficeEmail` | 0 | 0 | YES |  |  |
| `BuyerOfficeFax` | 0 | 0 | YES |  |  |
| `BuyerOfficeId` | 7 | 100 | no | string | 20140811142302394489000000 |
| `BuyerOfficeKey` | 0 | 0 | no |  |  |
| `BuyerOfficeKeyNumeric` | 0 | 0 | no |  |  |
| `BuyerOfficeLoginId` | 0 | 0 | YES |  |  |
| `BuyerOfficeMarketingName` | 0 | 1 | no | string | Real |
| `BuyerOfficeMlsId` | 7 | 100 | no | string | 1267 |
| `BuyerOfficeName` | 7 | 100 | no | string | Coldwell Banker Realty |
| `BuyerOfficeNrdsId` | 7 | 100 | no | number | 612000043 |
| `BuyerOfficeOfficeType` | 0 | 0 | no | string | Owner |
| `BuyerOfficeOriginatingSystemMlsId` | 7 | 100 | no | string | 1267 |
| `BuyerOfficePhone` | 0 | 0 | YES |  |  |
| `BuyerOfficePhoneExt` | 0 | 0 | YES |  |  |
| `BuyerOfficeSourceSystemMlsId` | 0 | 0 | YES |  |  |
| `BuyerOfficeTeamKey` | 0 | 0 | no |  |  |
| `BuyerOfficeURL` | 0 | 0 | YES |  |  |
| `BuyerOfficeUserType` | 0 | 0 | YES |  |  |
| `BuyerOfficeViewName` | 7 | 100 | no | string | Coldwell Banker Realty |
| `BuyerTeamKey` | 0 | 0 | YES |  |  |
| `BuyerTeamKeyNumeric` | 0 | 0 | no |  |  |
| `BuyerTeamName` | 0 | 0 | YES |  |  |
| `CableTvExpense` | 0 | 0 | no |  |  |
| `CancelDate` | 0 | 0 | YES |  |  |
| `CanceledTimestamp` | 0 | 0 | no |  |  |
| `CAPRate` | 0 | 0 | no |  |  |
| `CarportSpaces` | 0 | 0 | YES |  |  |
| `CarportYN` | 0 | 0 | no |  |  |
| `CarrierRoute` | 0 | 0 | no |  |  |
| `City` | 100 | 100 | no | string | Keyport |
| `CityRegion` | 0 | 0 | no |  |  |
| `CloseDate` | 0 | 100 | no | string | 2026-08-27 |
| `ClosedTimestamp` | 0 | 100 | no | string | 2026-08-28T00:26:24Z |
| `ClosePrice` | 0 | 100 | no | number | 715000 |
| `ClosePricePerSqft` | 0 | 0 | YES |  |  |
| `ClosingTerms` | 0 | 0 | no |  |  |
| `CoBuyerAgentAOR` | 0 | 0 | no |  |  |
| `CoBuyerAgentAssociation` | 0 | 0 | YES |  |  |
| `CoBuyerAgentCellPhone` | 0 | 0 | YES |  |  |
| `CoBuyerAgentDesignation` | 0 | 0 | YES |  |  |
| `CoBuyerAgentDesignationList` | 0 | 2 | no | object | {"ABR":true,"SRS":true} |
| `CoBuyerAgentDirectPhone` | 0 | 0 | YES |  |  |
| `CoBuyerAgentEmail` | 0 | 0 | YES |  |  |
| `CoBuyerAgentFax` | 0 | 0 | YES |  |  |
| `CoBuyerAgentFirstName` | 0 | 6 | no | string | Henry |
| `CoBuyerAgentHomePhone` | 0 | 0 | no |  |  |
| `CoBuyerAgentId` | 0 | 6 | no | string | 20141011001509420542000000 |
| `CoBuyerAgentKey` | 0 | 0 | no |  |  |
| `CoBuyerAgentKeyNumeric` | 0 | 0 | no |  |  |
| `CoBuyerAgentLastName` | 0 | 6 | no | string | Buerck |
| `CoBuyerAgentLoginId` | 0 | 0 | YES |  |  |
| `CoBuyerAgentMarketingName` | 0 | 3 | no | string | Dana Gets It Done |
| `CoBuyerAgentMemberType` | 0 | 5 | no | string | Realtor |
| `CoBuyerAgentMiddleName` | 0 | 0 | YES |  |  |
| `CoBuyerAgentMlsId` | 0 | 6 | no | string | 37840 |
| `CoBuyerAgentName` | 0 | 0 | YES |  |  |
| `CoBuyerAgentNamePrefix` | 0 | 0 | no |  |  |
| `CoBuyerAgentNameSuffix` | 0 | 0 | no |  |  |
| `CoBuyerAgentNrdsId` | 0 | 6 | no | number | 609528683 |
| `CoBuyerAgentOfficePhone` | 0 | 0 | YES |  |  |
| `CoBuyerAgentOfficePhoneExt` | 0 | 0 | YES |  |  |
| `CoBuyerAgentOriginatingSystemMlsId` | 0 | 6 | no | string | 37840 |
| `CoBuyerAgentPager` | 0 | 0 | YES |  |  |
| `CoBuyerAgentPreferredPhone` | 0 | 0 | YES |  |  |
| `CoBuyerAgentPreferredPhoneExt` | 0 | 0 | YES |  |  |
| `CoBuyerAgentSourceSystemMlsId` | 0 | 0 | YES |  |  |
| `CoBuyerAgentStateLicense` | 0 | 0 | YES |  |  |
| `CoBuyerAgentSuffix` | 0 | 0 | no |  |  |
| `CoBuyerAgentTeamKey` | 0 | 0 | no |  |  |
| `CoBuyerAgentTollFreePhone` | 0 | 0 | YES |  |  |
| `CoBuyerAgentURL` | 0 | 0 | YES |  |  |
| `CoBuyerAgentUserType` | 0 | 6 | no | string | Member |
| `CoBuyerAgentViewName` | 0 | 6 | no | string | Henry Buerck |
| `CoBuyerAgentVoiceMail` | 0 | 0 | YES |  |  |
| `CoBuyerAgentVoiceMailExt` | 0 | 0 | YES |  |  |
| `CoBuyerCompanyId` | 0 | 0 | YES |  |  |
| `CoBuyerOfficeAOR` | 0 | 0 | no |  |  |
| `CoBuyerOfficeAssociation` | 0 | 0 | YES |  |  |
| `CoBuyerOfficeEmail` | 0 | 6 | no | string | robertoquist@gmail.com |
| `CoBuyerOfficeFax` | 0 | 5 | no | string | 732-988-0017 |
| `CoBuyerOfficeId` | 0 | 6 | no | string | 20140811180432698069000000 |
| `CoBuyerOfficeKey` | 0 | 0 | no |  |  |
| `CoBuyerOfficeKeyNumeric` | 0 | 0 | no |  |  |
| `CoBuyerOfficeLoginId` | 0 | 0 | YES |  |  |
| `CoBuyerOfficeMarketingName` | 0 | 0 | no |  |  |
| `CoBuyerOfficeMlsId` | 0 | 6 | no | string | 3390 |
| `CoBuyerOfficeName` | 0 | 6 | no | string | RE/MAX Achievers |
| `CoBuyerOfficeNrdsId` | 0 | 6 | no | number | 609515688 |
| `CoBuyerOfficeOfficeType` | 0 | 0 | no |  |  |
| `CoBuyerOfficeOriginatingSystemMlsId` | 0 | 6 | no | string | 3390 |
| `CoBuyerOfficePhone` | 0 | 6 | no | string | 732-988-0012 |
| `CoBuyerOfficePhoneExt` | 0 | 0 | no |  |  |
| `CoBuyerOfficeSourceSystemMlsId` | 0 | 0 | YES |  |  |
| `CoBuyerOfficeTeamKey` | 0 | 0 | no |  |  |
| `CoBuyerOfficeURL` | 0 | 2 | no | string | https://holmdel.foxroach.com/ |
| `CoBuyerOfficeUserType` | 0 | 6 | no | string | Office |
| `CoBuyerOfficeViewName` | 0 | 6 | no | string | RE/MAX Achievers |
| `CoListAgentAOR` | 0 | 0 | no |  |  |
| `CoListAgentAssociation` | 0 | 0 | YES |  |  |
| `CoListAgentCellPhone` | 14 | 10 | no | string | 732-996-7448 |
| `CoListAgentDesignation` | 0 | 0 | YES |  |  |
| `CoListAgentDesignationList` | 3 | 4 | no | object | {"RSPS":true} |
| `CoListAgentDirectPhone` | 0 | 0 | YES |  |  |
| `CoListAgentEmail` | 0 | 0 | YES |  |  |
| `CoListAgentFax` | 0 | 0 | YES |  |  |
| `CoListAgentFirstName` | 15 | 10 | no | string | Genna |
| `CoListAgentHomePhone` | 0 | 0 | no |  |  |
| `CoListAgentId` | 15 | 10 | no | string | 20160301182032305858000000 |
| `CoListAgentKey` | 0 | 0 | no |  |  |
| `CoListAgentKeyNumeric` | 0 | 0 | no |  |  |
| `CoListAgentLastName` | 15 | 10 | no | string | Osterlo |
| `CoListAgentLoginId` | 0 | 0 | YES |  |  |
| `CoListAgentMarketingName` | 8 | 6 | no | string | Josie Kennedy |
| `CoListAgentMemberType` | 15 | 10 | no | string | Realtor |
| `CoListAgentMiddleName` | 0 | 0 | YES |  |  |
| `CoListAgentMlsId` | 15 | 10 | no | string | 40017 |
| `CoListAgentName` | 15 | 10 | no | string | Genna N Osterlo |
| `CoListAgentNamePrefix` | 0 | 0 | no |  |  |
| `CoListAgentNameSuffix` | 0 | 0 | no |  |  |
| `CoListAgentNrdsId` | 15 | 10 | no | number | 609034773 |
| `CoListAgentOfficePhone` | 0 | 0 | YES |  |  |
| `CoListAgentOfficePhoneExt` | 0 | 0 | YES |  |  |
| `CoListAgentOriginatingSystemMlsId` | 15 | 10 | no | string | 40017 |
| `CoListAgentPager` | 0 | 0 | YES |  |  |
| `CoListAgentPreferredPhone` | 0 | 0 | YES |  |  |
| `CoListAgentPreferredPhoneExt` | 0 | 0 | YES |  |  |
| `CoListAgentSourceSystemMlsId` | 0 | 0 | YES |  |  |
| `CoListAgentStateLicense` | 0 | 0 | YES |  |  |
| `CoListAgentSuffix` | 0 | 0 | no |  |  |
| `CoListAgentTeamKey` | 0 | 0 | no |  |  |
| `CoListAgentTollFreePhone` | 0 | 0 | YES |  |  |
| `CoListAgentURL` | 0 | 0 | YES |  |  |
| `CoListAgentUserType` | 15 | 10 | no | string | Member |
| `CoListAgentViewName` | 15 | 10 | no | string | Genna N Osterlo |
| `CoListAgentVoiceMail` | 0 | 0 | YES |  |  |
| `CoListAgentVoiceMailExt` | 0 | 0 | YES |  |  |
| `CoListCompanyId` | 11 | 8 | no | string | 20140811142333180546000000 |
| `CoListOfficeAOR` | 0 | 0 | no |  |  |
| `CoListOfficeAssociation` | 0 | 0 | YES |  |  |
| `CoListOfficeEmail` | 14 | 10 | no | string | glenkellyrealestate@aol.com |
| `CoListOfficeFax` | 10 | 9 | no | string | 855-468-7365 |
| `CoListOfficeId` | 15 | 10 | no | string | 20140811142333180546000000 |
| `CoListOfficeKey` | 0 | 0 | no |  |  |
| `CoListOfficeKeyNumeric` | 0 | 0 | no |  |  |
| `CoListOfficeLoginId` | 0 | 0 | YES |  |  |
| `CoListOfficeMarketingName` | 0 | 0 | no |  |  |
| `CoListOfficeMlsId` | 15 | 10 | no | string | 2845 |
| `CoListOfficeName` | 15 | 10 | no | string | Glen Kelly Real Estate LLC |
| `CoListOfficeNrdsId` | 15 | 10 | no | number | 609002701 |
| `CoListOfficeOfficeType` | 0 | 0 | no |  |  |
| `CoListOfficeOriginatingSystemMlsId` | 15 | 10 | no | string | 2845 |
| `CoListOfficePhone` | 15 | 10 | no | string | 732-244-0567 |
| `CoListOfficePhoneExt` | 0 | 0 | no |  |  |
| `CoListOfficeSourceSystemMlsId` | 0 | 0 | YES |  |  |
| `CoListOfficeTeamKey` | 0 | 0 | no |  |  |
| `CoListOfficeURL` | 2 | 2 | no | string | http://www.glenkelly.com |
| `CoListOfficeUserType` | 15 | 10 | no | string | Office |
| `CoListOfficeViewName` | 15 | 10 | no | string | Glen Kelly Real Estate LLC |
| `ComingSoonTimestamp` | 25 | 30 | no | string | 2026-08-12T04:54:32Z |
| `CommonWalls` | 3 | 5 | partial | object | {"End Unit":true} |
| `CommunityFeatures` | 0 | 0 | no |  |  |
| `CompSaleYN` | 0 | 0 | YES |  |  |
| `Concessions` | 0 | 0 | no |  |  |
| `ConcessionsAmount` | 0 | 0 | YES |  |  |
| `ConcessionsComments` | 0 | 0 | YES |  |  |
| `ConstructionMaterials` | 35 | 30 | partial | object | {"Aluminum Siding":true,"Brick":true} |
| `ContinentRegion` | 0 | 0 | no |  |  |
| `Contingency` | 0 | 0 | no |  |  |
| `ContingencyCode` | 8 | 0 | no | string | A |
| `ContingencyRemarks` | 0 | 0 | YES |  |  |
| `ContingentDate` | 9 | 61 | no | string | 2026-08-27 |
| `ContingentTimestamp` | 11 | 60 | no | string | 2026-08-28T00:44:08Z |
| `Cooling` | 99 | 98 | partial | object | {"Central Air":true} |
| `CoolingFuel` | 0 | 0 | YES |  |  |
| `CoolingYN` | 99 | 98 | partial | boolean | true |
| `CopyrightNotice` | 0 | 0 | YES |  |  |
| `Country` | 0 | 0 | no |  |  |
| `CountryRegion` | 0 | 0 | no |  |  |
| `CountyOrParish` | 100 | 100 | no | string | Monmouth |
| `CoveredSpaces` | 0 | 0 | no |  |  |
| `CropsIncludedYN` | 0 | 0 | no |  |  |
| `CrossStreet` | 0 | 0 | no |  |  |
| `CultivatedArea` | 0 | 0 | no |  |  |
| `CurrentFinancing` | 0 | 0 | no |  |  |
| `CurrentPrice` | 100 | 100 | no | number | 450000 |
| `CurrentPricePublic` | 100 | 100 | no | number | 450000 |
| `CurrentUse` | 0 | 0 | YES |  |  |
| `DelayedMarketingDate` | 0 | 0 | no |  |  |
| `DelayedMarketingYN` | 100 | 100 | no |  |  |
| `DetachedYN` | 0 | 0 | no |  |  |
| `DevelopmentStatus` | 0 | 0 | no |  |  |
| `DirectionFaces` | 0 | 0 | YES |  |  |
| `Directions` | 100 | 99 | partial | string | USE GPS |
| `DisabilityFeatures` | 0 | 0 | no |  |  |
| `DisallowProspecting` | 0 | 0 | no |  |  |
| `Disclaimer` | 0 | 0 | YES |  |  |
| `Disclosures` | 0 | 0 | YES |  |  |
| `DistanceFromSchoolBus` | 0 | 0 | no |  |  |
| `DistanceFromShopping` | 0 | 0 | no |  |  |
| `DistanceToBus` | 0 | 0 | no |  |  |
| `DistanceToBusComments` | 0 | 0 | no |  |  |
| `DistanceToBusNumeric` | 0 | 0 | no |  |  |
| `DistanceToBusUnits` | 0 | 0 | no |  |  |
| `DistanceToElectric` | 0 | 0 | no |  |  |
| `DistanceToElectricComments` | 0 | 0 | no |  |  |
| `DistanceToElectricNumeric` | 0 | 0 | no |  |  |
| `DistanceToElectricUnits` | 0 | 0 | no |  |  |
| `DistanceToFreeway` | 0 | 0 | no |  |  |
| `DistanceToFreewayComments` | 0 | 0 | no |  |  |
| `DistanceToFreewayNumeric` | 0 | 0 | no |  |  |
| `DistanceToFreewayUnits` | 0 | 0 | no |  |  |
| `DistanceToGas` | 0 | 0 | no |  |  |
| `DistanceToGasComments` | 0 | 0 | no |  |  |
| `DistanceToGasNumeric` | 0 | 0 | no |  |  |
| `DistanceToGasUnits` | 0 | 0 | no |  |  |
| `DistanceToPhoneService` | 0 | 0 | no |  |  |
| `DistanceToPhoneServiceComments` | 0 | 0 | no |  |  |
| `DistanceToPhoneServiceUnits` | 0 | 0 | no |  |  |
| `DistanceToPlaceofWorship` | 0 | 0 | no |  |  |
| `DistanceToPlaceofWorshipComments` | 0 | 0 | no |  |  |
| `DistanceToPlaceofWorshipNumeric` | 0 | 0 | no |  |  |
| `DistanceToPlaceofWorshipUnits` | 0 | 0 | no |  |  |
| `DistanceToSchoolBusComments` | 0 | 0 | no |  |  |
| `DistanceToSchoolBusNumeric` | 0 | 0 | no |  |  |
| `DistanceToSchoolBusUnits` | 0 | 0 | no |  |  |
| `DistanceToSchools` | 0 | 0 | no |  |  |
| `DistanceToSchoolsComments` | 0 | 0 | no |  |  |
| `DistanceToSchoolsNumeric` | 0 | 0 | no |  |  |
| `DistanceToSchoolsUnits` | 0 | 0 | no |  |  |
| `DistanceToSewer` | 0 | 0 | no |  |  |
| `DistanceToSewerComments` | 0 | 0 | no |  |  |
| `DistanceToSewerNumeric` | 0 | 0 | no |  |  |
| `DistanceToSewerUnits` | 0 | 0 | no |  |  |
| `DistanceToShoppingComments` | 0 | 0 | no |  |  |
| `DistanceToShoppingNumeric` | 0 | 0 | no |  |  |
| `DistanceToShoppingUnits` | 0 | 0 | no |  |  |
| `DistanceToStreet` | 0 | 0 | no |  |  |
| `DistanceToStreetComments` | 0 | 0 | no |  |  |
| `DistanceToStreetNumeric` | 0 | 0 | no |  |  |
| `DistanceToStreetUnits` | 0 | 0 | no |  |  |
| `DistanceToWater` | 0 | 0 | no |  |  |
| `DistanceToWaterComments` | 0 | 0 | no |  |  |
| `DistanceToWaterNumeric` | 0 | 0 | no |  |  |
| `DistanceToWaterUnits` | 0 | 0 | no |  |  |
| `DistrictElementarySchool` | 0 | 0 | no |  |  |
| `DistrictHighSchool` | 0 | 0 | no |  |  |
| `DistrictMiddleOrJuniorSchool` | 0 | 0 | no |  |  |
| `DocumentsChangeTimestamp` | 89 | 100 | no | string | 2026-01-05T16:35:42Z |
| `DocumentsCount` | 100 | 100 | no | number | 3 |
| `DOH1` | 0 | 0 | no |  |  |
| `DOH2` | 0 | 0 | no |  |  |
| `DOH3` | 0 | 0 | no |  |  |
| `DoorFeatures` | 48 | 49 | partial | object | {"Sliding Doors":true} |
| `Electric` | 1 | 0 | YES | object | {"220 Volts":true} |
| `ElectricExpense` | 0 | 0 | YES |  |  |
| `ElectricOnPropertyYN` | 0 | 0 | no |  |  |
| `ElementarySchool` | 38 | 38 | partial | string | Bangs Avenue |
| `ElementarySchoolDistrict` | 0 | 0 | YES |  |  |
| `Elevation` | 0 | 0 | no |  |  |
| `ElevationUnits` | 0 | 0 | no |  |  |
| `EnergySavingFeatures` | 0 | 0 | no |  |  |
| `EntryLevel` | 0 | 0 | no |  |  |
| `EntryLocation` | 0 | 0 | no |  |  |
| `Exclusions` | 52 | 56 | no | string | PERSONAL PROPERTY |
| `ExistingLeaseType` | 0 | 0 | no |  |  |
| `ExpiredTimestamp` | 0 | 1 | no | string | 2026-06-12T05:00:00Z |
| `ExtensionTimestamp` | 1 | 3 | no | string | 2026-06-25T18:12:58Z |
| `ExteriorFeatures` | 65 | 67 | partial | object | {"Lighting":true} |
| `FarmCreditServiceInclYN` | 0 | 0 | no |  |  |
| `FarmLandAreaSource` | 0 | 0 | no |  |  |
| `FarmLandAreaUnits` | 0 | 0 | no |  |  |
| `Fencing` | 32 | 36 | partial | object | {"Fenced":true} |
| `FinancialDataSource` | 0 | 0 | no |  |  |
| `FireplaceFeatures` | 0 | 0 | YES |  |  |
| `FireplaceFuel` | 0 | 0 | no |  |  |
| `FireplaceLocations` | 0 | 0 | no |  |  |
| `FireplacesTotal` | 99 | 98 | partial | number | 0 |
| `FireplaceYN` | 97 | 97 | partial | boolean | true |
| `Flooring` | 68 | 57 | partial | object | {"Wood":true} |
| `FloorPlansChangeTimestamp` | 22 | 19 | no | string | 2026-08-25T15:28:37Z |
| `FloorPlansCount` | 100 | 100 | no | number | 0 |
| `FoundationArea` | 0 | 0 | no |  |  |
| `FoundationDetails` | 17 | 20 | partial | object | {"Slab":true} |
| `FrontageLength` | 0 | 0 | no |  |  |
| `FrontageLengthUnits` | 0 | 0 | no |  |  |
| `FrontageType` | 0 | 0 | no |  |  |
| `Furnished` | 0 | 0 | YES | string | Furnished |
| `FurnitureReplacementExpense` | 0 | 0 | no |  |  |
| `GarageSpaces` | 99 | 98 | partial | number | 0 |
| `GarageYN` | 100 | 98 | partial | boolean | true |
| `GardnerExpense` | 0 | 0 | no |  |  |
| `Gas` | 0 | 0 | no |  |  |
| `GasExpense` | 0 | 0 | no |  |  |
| `GeocodeAccuracy` | 0 | 0 | no |  |  |
| `GeocodeSource` | 0 | 0 | no |  |  |
| `GrazingPermitsBLMYN` | 0 | 0 | no |  |  |
| `GrazingPermitsForestServiceYN` | 0 | 0 | no |  |  |
| `GrazingPermitsPrivateYN` | 0 | 0 | no |  |  |
| `GreenBuildingCertification` | 0 | 0 | no |  |  |
| `GreenBuildingVerificationType` | 0 | 0 | YES |  |  |
| `GreenCertificationRating` | 0 | 0 | no |  |  |
| `GreenCertifyingBody` | 0 | 0 | no |  |  |
| `GreenEnergyEfficient` | 3 | 4 | partial | object | {"Thermostat":true} |
| `GreenEnergyGeneration` | 6 | 6 | partial | object | {"Solar Panels":true} |
| `GreenIndoorAirQuality` | 0 | 0 | no |  |  |
| `GreenLocation` | 0 | 0 | no |  |  |
| `GreenSustainability` | 0 | 0 | no |  |  |
| `GreenWaterConservation` | 0 | 0 | no |  |  |
| `GreenYearCertified` | 0 | 0 | no |  |  |
| `GrossIncome` | 0 | 0 | YES | number | 1 |
| `GrossScheduledIncome` | 0 | 0 | YES |  |  |
| `HabitableResidenceYN` | 0 | 0 | no |  |  |
| `Heating` | 99 | 97 | partial | object | {"Natural Gas":true,"Forced Air":true} |
| `HeatingFuel` | 3 | 1 | partial | object | {"Natural Gas":true} |
| `HeatingYN` | 98 | 97 | partial | boolean | true |
| `HighSchool` | 56 | 57 | partial | string | Asbury Park |
| `HighSchoolDistrict` | 0 | 0 | no |  |  |
| `HoldDate` | 0 | 0 | YES |  |  |
| `HoldTimestamp` | 2 | 4 | no | string | 2026-08-14T14:53:12Z |
| `HomeWarrantyYN` | 0 | 0 | no |  |  |
| `HorseAmenities` | 0 | 0 | no |  |  |
| `HorseYN` | 0 | 0 | no |  |  |
| `HoursDaysOfOperation` | 0 | 0 | no |  |  |
| `HoursDaysofOperationDescription` | 0 | 0 | no |  |  |
| `IDXParticipant` | 100 | 100 | no | boolean | true |
| `Inclusions` | 81 | 80 | partial | string | Washer, Window Treatments, Blinds/Shades, Counte |
| `IncomeIncludes` | 0 | 0 | no |  |  |
| `InsuranceExpense` | 0 | 0 | YES |  |  |
| `InteriorFeatures` | 71 | 72 | partial | object | {"Attic":true} |
| `IrrigationSource` | 0 | 0 | no |  |  |
| `IrrigationWaterRightsAcres` | 0 | 0 | no |  |  |
| `IrrigationWaterRightsYN` | 0 | 0 | no |  |  |
| `KitchenAppliances` | 0 | 0 | YES |  |  |
| `LaborInformation` | 0 | 0 | no |  |  |
| `LandLeaseExpirationDate` | 0 | 0 | no |  |  |
| `LandLeaseExpirationTimestamp` | 0 | 0 | no |  |  |
| `LandLeaseFee` | 0 | 0 | no |  |  |
| `LandLeaseFeeFrequency` | 0 | 0 | no |  |  |
| `LandLeaseYN` | 0 | 0 | partial | boolean | true |
| `Latitude` | 100 | 100 | no | number | 40.438336 |
| `LaundryFeatures` | 7 | 9 | partial | object | {"Laundry Tub":true} |
| `LeasableArea` | 0 | 0 | YES | number | 3900 |
| `LeasableAreaUnits` | 0 | 0 | no |  |  |
| `LeaseAmount` | 1 | 0 | YES | number | 3850 |
| `LeaseAmountFrequency` | 0 | 0 | no |  |  |
| `LeaseAssignableYN` | 0 | 0 | no |  |  |
| `LeaseConsideredYN` | 0 | 0 | no |  |  |
| `LeaseExpiration` | 0 | 0 | no |  |  |
| `LeaseRenewalOptionYN` | 0 | 0 | no |  |  |
| `LeaseTerm` | 0 | 0 | YES | object | {"Summer":true,"Annual":true} |
| `Levels` | 15 | 15 | partial | object | {"2 Story":true} |
| `License1` | 0 | 0 | no |  |  |
| `License2` | 0 | 0 | no |  |  |
| `License3` | 0 | 0 | no |  |  |
| `LicensesExpense` | 0 | 0 | no |  |  |
| `ListAgentAOR` | 0 | 0 | no |  |  |
| `ListAgentAssociation` | 100 | 100 | no | array | [] |
| `ListAgentCellPhone` | 96 | 96 | no | string | 917-974-1915 |
| `ListAgentDesignation` | 0 | 0 | YES |  |  |
| `ListAgentDesignationList` | 23 | 23 | no | object | {"ABR":true,"ePRO":true,"SRES":true} |
| `ListAgentDirectPhone` | 2 | 2 | no | string | 732-291-0070 |
| `ListAgentEmail` | 100 | 99 | no | string | ronjison@gmail.com |
| `ListAgentFax` | 27 | 28 | no | string | 732-870-8121 |
| `ListAgentFirstName` | 100 | 100 | no | string | Ron |
| `ListAgentHomePhone` | 0 | 0 | no |  |  |
| `ListAgentId` | 100 | 100 | no | string | 20160614162007847715000000 |
| `ListAgentKey` | 100 | 100 | no | string | 20160614162007847715000000 |
| `ListAgentKeyNumeric` | 0 | 0 | no |  |  |
| `ListAgentLastName` | 100 | 100 | no | string | Ison |
| `ListAgentLoginId` | 0 | 0 | YES |  |  |
| `ListAgentMarketingName` | 56 | 56 | no | string | The Ison Group NJ - 917-974-1915 |
| `ListAgentMemberType` | 100 | 99 | no | string | Realtor |
| `ListAgentMiddleName` | 16 | 18 | no | string | C |
| `ListAgentMlsId` | 100 | 100 | no | string | 40523 |
| `ListAgentName` | 100 | 100 | no | string | Ron Ison |
| `ListAgentNamePrefix` | 0 | 0 | no |  |  |
| `ListAgentNameSuffix` | 0 | 0 | no |  |  |
| `ListAgentNrdsId` | 100 | 100 | no | number | 609035301 |
| `ListAgentOfficePhone` | 0 | 0 | YES |  |  |
| `ListAgentOfficePhoneExt` | 0 | 0 | YES |  |  |
| `ListAgentOriginatingSystemMlsId` | 100 | 100 | no | string | 40523 |
| `ListAgentPager` | 0 | 0 | YES |  |  |
| `ListAgentPreferredPhone` | 96 | 98 | no | string | 973-315-5959 |
| `ListAgentPreferredPhoneExt` | 0 | 0 | no |  |  |
| `ListAgentSourceSystemMlsId` | 0 | 0 | YES |  |  |
| `ListAgentStateLicense` | 0 | 0 | YES |  |  |
| `ListAgentSuffix` | 0 | 0 | no |  |  |
| `ListAgentTeamKey` | 0 | 0 | no |  |  |
| `ListAgentTollFreePhone` | 0 | 0 | no |  |  |
| `ListAgentURL` | 75 | 73 | no | string | WWW.RONISON.COM |
| `ListAgentUserType` | 0 | 0 | YES |  |  |
| `ListAgentViewName` | 100 | 100 | no | string | The Ison Group NJ - 917-974-1915, Ron Ison |
| `ListAgentVoiceMail` | 2 | 4 | no | string | 732-410-2763 |
| `ListAgentVoiceMailExt` | 0 | 0 | YES |  |  |
| `ListAOR` | 0 | 0 | no |  |  |
| `ListCompanyId` | 0 | 0 | YES |  |  |
| `ListingAgreement` | 0 | 0 | YES |  |  |
| `ListingContractDate` | 100 | 100 | no | string | 2026-01-05 |
| `ListingFinancing` | 0 | 0 | no |  |  |
| `ListingId` | 100 | 100 | no | string | 22600311 |
| `ListingKey` | 100 | 100 | no | string | 20260105162651982052000000 |
| `ListingKeyNumeric` | 0 | 0 | YES |  |  |
| `ListingNumber` | 100 | 100 | no | number | 22600311 |
| `ListingPrefix` | 0 | 0 | YES |  |  |
| `ListingService` | 0 | 0 | no |  |  |
| `ListingTerms` | 0 | 0 | YES |  |  |
| `ListingUpdateTimestamp` | 100 | 100 | no | string | 2026-08-28T00:44:24Z |
| `ListOfficeAOR` | 0 | 0 | no |  |  |
| `ListOfficeAssociation` | 0 | 0 | YES |  |  |
| `ListOfficeEmail` | 0 | 0 | YES |  |  |
| `ListOfficeFax` | 0 | 0 | YES |  |  |
| `ListOfficeId` | 100 | 100 | no | string | 20230602182019518480000000 |
| `ListOfficeKey` | 0 | 0 | no |  |  |
| `ListOfficeKeyNumeric` | 0 | 0 | no |  |  |
| `ListOfficeLoginId` | 0 | 0 | YES |  |  |
| `ListOfficeMarketingName` | 1 | 1 | no | string | Real |
| `ListOfficeMlsId` | 100 | 100 | no | string | 4543 |
| `ListOfficeName` | 100 | 100 | no | string | Serhant New Jersey LLC |
| `ListOfficeNrdsId` | 100 | 100 | no | number | 605506228 |
| `ListOfficeOfficeType` | 0 | 0 | no |  |  |
| `ListOfficeOriginatingSystemMlsId` | 100 | 100 | no | string | 4543 |
| `ListOfficePhone` | 0 | 0 | YES |  |  |
| `ListOfficePhoneExt` | 0 | 0 | YES |  |  |
| `ListOfficeSourceSystemMlsId` | 0 | 0 | YES |  |  |
| `ListOfficeTeamKey` | 0 | 0 | no |  |  |
| `ListOfficeURL` | 0 | 0 | YES |  |  |
| `ListOfficeUserType` | 0 | 0 | YES |  |  |
| `ListOfficeViewName` | 100 | 100 | no | string | Serhant New Jersey LLC |
| `ListPrice` | 100 | 100 | no | number | 450000 |
| `ListPriceCurrency` | 0 | 0 | no |  |  |
| `ListPriceHigh` | 0 | 0 | no |  |  |
| `ListPriceLow` | 0 | 0 | no |  |  |
| `ListPricePerSqft` | 0 | 0 | YES |  |  |
| `ListTeamKey` | 0 | 0 | YES |  |  |
| `ListTeamKeyNumeric` | 0 | 0 | no |  |  |
| `ListTeamName` | 0 | 0 | YES |  |  |
| `LivingArea` | 89 | 85 | partial | number | 1116 |
| `LivingAreaSource` | 0 | 0 | YES |  |  |
| `LivingAreaUnits` | 0 | 0 | YES |  |  |
| `LockBoxLocation` | 0 | 0 | no |  |  |
| `LockBoxNumber` | 0 | 0 | YES |  |  |
| `LockBoxSerialNumber` | 0 | 0 | no |  |  |
| `LockBoxType` | 0 | 0 | no |  |  |
| `Longitude` | 100 | 100 | no | number | -74.200176 |
| `LotDimensionsSource` | 0 | 0 | no |  |  |
| `LotFeatures` | 56 | 56 | partial | object | {"Cul-De-Sac":true} |
| `LotSizeAcres` | 90 | 93 | no | number | 0.02 |
| `LotSizeArea` | 90 | 93 | no | number | 0.02 |
| `LotSizeDimensions` | 63 | 60 | partial | string | 20 x 63 |
| `LotSizeSource` | 0 | 0 | no |  |  |
| `LotSizeSquareFeet` | 90 | 93 | no | number | 871.2 |
| `LotSizeUnits` | 89 | 93 | no | string | Acres |
| `MainLevelBathrooms` | 51 | 54 | partial | number | 2 |
| `MainLevelBedrooms` | 0 | 0 | no |  |  |
| `MaintenanceExpense` | 0 | 0 | YES |  |  |
| `MajorChangeTimestamp` | 100 | 100 | no | string | 2026-03-04T17:50:22Z |
| `MajorChangeType` | 100 | 100 | no | string | Price Reduced |
| `Make` | 0 | 0 | no |  |  |
| `ManagerExpense` | 0 | 0 | no |  |  |
| `MapCoordinate` | 0 | 0 | no |  |  |
| `MapCoordinateSource` | 0 | 0 | no |  |  |
| `MapURL` | 0 | 0 | no |  |  |
| `MiddleOrJuniorSchool` | 61 | 59 | partial | string | Martin Luther King Jr. Middle School |
| `MiddleOrJuniorSchoolDistrict` | 0 | 0 | YES |  |  |
| `MLSAreaMajor` | 100 | 100 | no | string | None |
| `MLSAreaMinor` | 100 | 100 | no | string | Keyport (KEY) |
| `MlsId` | 100 | 100 | no | string | 20140311223451933927000000 |
| `MlsStatus` | 100 | 100 | no | string | Active |
| `MlsStatusInformation` | 0 | 0 | YES |  |  |
| `MobileDimUnits` | 0 | 0 | no |  |  |
| `MobileHomeRemainsYN` | 0 | 0 | no |  |  |
| `MobileLength` | 0 | 0 | YES |  |  |
| `MobileWidth` | 0 | 0 | YES |  |  |
| `Model` | 23 | 26 | partial | string | Westport/den |
| `ModificationTimestamp` | 100 | 100 | no | string | 2026-08-28T00:44:24Z |
| `MonthlyGrossScheduledIncome` | 0 | 0 | no |  |  |
| `NetOperatingIncome` | 0 | 0 | YES |  |  |
| `NewConstructionYN` | 68 | 63 | partial | boolean | true |
| `NewTaxesExpense` | 0 | 0 | no |  |  |
| `NumberOfFullTimeEmployees` | 0 | 0 | no |  |  |
| `NumberOfLots` | 0 | 0 | no |  |  |
| `NumberOfPads` | 0 | 0 | no |  |  |
| `NumberOfPartTimeEmployees` | 0 | 0 | no |  |  |
| `NumberOfSeparateElectricMeters` | 0 | 0 | no |  |  |
| `NumberOfSeparateGasMeters` | 0 | 0 | no |  |  |
| `NumberOfSeparateWaterMeters` | 0 | 0 | no |  |  |
| `NumberOfUnitsBuildings` | 0 | 0 | no |  |  |
| `NumberOfUnitsInCommunity` | 0 | 0 | no |  |  |
| `NumberOfUnitsLeased` | 0 | 0 | no |  |  |
| `NumberOfUnitsMoMo` | 0 | 0 | no |  |  |
| `NumberOfUnitsTotal` | 1 | 0 | YES | number | 2 |
| `NumberOfUnitsVacant` | 0 | 0 | no |  |  |
| `OccupantName` | 0 | 0 | YES |  |  |
| `OccupantPhone` | 0 | 0 | YES |  |  |
| `OccupantType` | 0 | 0 | no |  |  |
| `OfficeMlsAccessYN` | 0 | 0 | no |  |  |
| `OffMarketDate` | 0 | 100 | no | string | 2026-07-27 |
| `OffMarketTimestamp` | 0 | 0 | YES |  |  |
| `OnMarketContractDate` | 100 | 100 | no | string | 2026-01-05 |
| `OnMarketDate` | 100 | 100 | no | string | 2026-01-05T16:35:41Z |
| `OnMarketTimestamp` | 0 | 0 | YES |  |  |
| `OpenHousesChangeTimestamp` | 65 | 59 | no | string | 2026-05-13T22:30:36Z |
| `OpenHousesCount` | 100 | 100 | no | number | 0 |
| `OpenParkingSpaces` | 0 | 0 | no |  |  |
| `OpenParkingYN` | 0 | 0 | no |  |  |
| `OperatingExpense` | 0 | 0 | YES |  |  |
| `OperatingExpenseIncludes` | 0 | 0 | no |  |  |
| `OriginalEntryTimestamp` | 0 | 0 | YES |  |  |
| `OriginalListPrice` | 0 | 0 | YES |  |  |
| `OriginalOnMarketTimestamp` | 100 | 100 | no | string | 2026-01-05T16:35:41Z |
| `OriginatingSystemID` | 100 | 100 | no | string | M00000452 |
| `OriginatingSystemKey` | 100 | 100 | no | string | 20260105162651982052000000 |
| `OriginatingSystemListingId` | 100 | 100 | no | string | 22600311 |
| `OriginatingSystemName` | 100 | 100 | no | string | MOREMLS (Monmouth Ocean Regional REALTORS®) |
| `OriginatingSystemPlatformID` | 100 | 100 | no | string | T00000052 |
| `OriginatingSystemPlatformName` | 100 | 100 | no | string | Flexmls |
| `OtherEquipment` | 1 | 2 | partial | object | {"Home Theater":true} |
| `OtherExpense` | 0 | 0 | YES |  |  |
| `OtherParking` | 0 | 0 | no |  |  |
| `OtherStructures` | 30 | 33 | partial | object | {"Shed(s)":true} |
| `OwnerName` | 0 | 0 | YES |  |  |
| `OwnerPays` | 1 | 0 | YES | object | {"Garbage Removal":true} |
| `OwnerPhone` | 0 | 0 | YES |  |  |
| `Ownership` | 0 | 0 | YES |  |  |
| `OwnershipType` | 0 | 0 | no |  |  |
| `ParcelNumber` | 100 | 100 | no | string | 24-00080-0000-00019 |
| `ParkingFeatures` | 89 | 87 | partial | object | {"On Street":true} |
| `ParkingTotal` | 3 | 7 | partial | number | 4 |
| `ParkManagerName` | 0 | 0 | no |  |  |
| `ParkManagerPhone` | 0 | 0 | no |  |  |
| `ParkName` | 0 | 0 | YES |  |  |
| `PastureArea` | 0 | 0 | no |  |  |
| `PatioAndPorchFeatures` | 81 | 80 | partial | object | {"Porch - Covered":true,"Patio":true} |
| `PendingDate` | 0 | 100 | no | string | 2026-07-27 |
| `PendingTimestamp` | 0 | 0 | YES |  |  |
| `PermitAddressInternetYN` | 0 | 0 | no |  |  |
| `PermitAVMInternetYN` | 0 | 0 | no |  |  |
| `PermitCommentsInternetYN` | 0 | 0 | no |  |  |
| `PermitInternetYN` | 100 | 100 | no | boolean | true |
| `PestControlExpense` | 0 | 0 | no |  |  |
| `PetsAllowed` | 22 | 19 | partial | object | {"Dogs OK":true,"Cats OK":true} |
| `PhotosChangeTimestamp` | 100 | 100 | no | string | 2026-01-05T16:35:42Z |
| `PhotosCount` | 100 | 100 | no | number | 42 |
| `PhotosTotal` | 0 | 0 | no |  |  |
| `PoolExpense` | 0 | 0 | no |  |  |
| `PoolFeatures` | 44 | 39 | partial | object | {"Common":true,"Fenced":true,"Heated":true,"In G |
| `PoolYN` | 0 | 0 | YES |  |  |
| `Possession` | 0 | 0 | YES |  |  |
| `PossibleUse` | 0 | 0 | YES |  |  |
| `PostalCity` | 0 | 0 | no |  |  |
| `PostalCode` | 100 | 100 | no | string | 07735 |
| `PostalCodePlus4` | 0 | 0 | YES |  |  |
| `PreferredPhotographer` | 0 | 0 | YES |  |  |
| `PreviousListPrice` | 0 | 0 | YES |  |  |
| `PreviousRentOrLeasePrice` | 0 | 0 | no |  |  |
| `PriceChangeTimestamp` | 28 | 22 | no | string | 2026-03-04T17:50:22Z |
| `PrivateRemarks` | 0 | 0 | YES |  |  |
| `ProfessionalManagementExpense` | 0 | 0 | no |  |  |
| `PropertyAttachedYN` | 10 | 13 | partial | boolean | true |
| `PropertyClass` | 100 | 100 | no | string | Commercial |
| `PropertyCondition` | 0 | 0 | no |  |  |
| `PropertySubType` | 100 | 100 | no | string | Mixed Use |
| `PropertySubTypeLabel` | 0 | 0 | YES |  |  |
| `PropertyType` | 100 | 100 | no | string | E |
| `PropertyTypeLabel` | 100 | 100 | no | string | Commercial |
| `ProviderId` | 0 | 0 | no |  |  |
| `ProviderName` | 0 | 0 | no |  |  |
| `PublicRemarks` | 97 | 96 | partial | string | NO FLOOD ZONE! - Prime Downtown Keyport Location |
| `PublicSurveyRange` | 0 | 0 | no |  |  |
| `PublicSurveySection` | 0 | 0 | no |  |  |
| `PublicSurveyTownship` | 0 | 0 | no |  |  |
| `PurchaseContractDate` | 0 | 100 | no | string | 2026-07-27 |
| `RangeArea` | 0 | 0 | no |  |  |
| `RentControlYN` | 0 | 0 | no |  |  |
| `RentIncludes` | 0 | 0 | YES |  |  |
| `RentOrLeaseDate` | 0 | 0 | no |  |  |
| `RentOrLeasePrice` | 0 | 0 | no |  |  |
| `RentOrLeasePriceCurrency` | 0 | 0 | no |  |  |
| `RentOrLeasePriceFrequency` | 0 | 0 | no |  |  |
| `ReserveListPrice` | 0 | 0 | no |  |  |
| `RetsStatus` | 0 | 0 | no |  |  |
| `RoadFrontageType` | 0 | 0 | no |  |  |
| `RoadResponsibility` | 0 | 0 | no |  |  |
| `RoadSurfaceType` | 0 | 0 | no |  |  |
| `Roof` | 99 | 97 | partial | object | {"Shingle":true} |
| `RoomsDescription` | 0 | 0 | no |  |  |
| `RoomsList` | 0 | 0 | no |  |  |
| `RoomsTotal` | 97 | 97 | partial | number | 8 |
| `RoomType` | 97 | 97 | partial | object | {"Living Room":true,"Dining Room":true,"Kitchen" |
| `RVParkingDimensions` | 0 | 0 | no |  |  |
| `SchoolDistrict` | 0 | 0 | no |  |  |
| `SeatingCapacity` | 0 | 0 | YES |  |  |
| `SecurityFeatures` | 13 | 15 | partial | object | {"Fire Alarm":true} |
| `SemiPrivateRemarks` | 0 | 0 | no |  |  |
| `SeniorCommunityYN` | 34 | 24 | partial | boolean | true |
| `SerialU` | 0 | 0 | no |  |  |
| `SerialX` | 0 | 0 | no |  |  |
| `SerialXX` | 0 | 0 | no |  |  |
| `Sewer` | 99 | 97 | partial | object | {"Public Sewer":true} |
| `ShowingConsiderations` | 0 | 0 | no |  |  |
| `ShowingContactName` | 0 | 0 | no |  |  |
| `ShowingContactType` | 0 | 0 | no |  |  |
| `ShowingInstructions` | 0 | 0 | YES |  |  |
| `ShowingPhoneExtension` | 0 | 0 | no |  |  |
| `ShowingPhoneNumber` | 0 | 0 | no |  |  |
| `ShowingRequirements` | 0 | 0 | YES |  |  |
| `ShowingServiceName` | 0 | 0 | no |  |  |
| `SignOnPropertyYN` | 0 | 0 | no |  |  |
| `Skirt` | 0 | 0 | YES |  |  |
| `SoldExclusive` | 0 | 0 | YES |  |  |
| `SourceMLSURL` | 100 | 100 | no | string | https://sourcemls.org/api/v1/eyJ0eXAiOiJKV1QiLCJ |
| `SourceSystemID` | 100 | 100 | no | string | M00000452 |
| `SourceSystemKey` | 100 | 100 | no | string | 20260105162651982052000000 |
| `SourceSystemName` | 100 | 100 | no | string | MOREMLS (Monmouth Ocean Regional REALTORS®) |
| `SourceSystemPlatformID` | 100 | 100 | no | string | T00000052 |
| `SourceSystemPlatformName` | 100 | 100 | no | string | Flexmls |
| `SpaFeatures` | 0 | 0 | YES |  |  |
| `SparkModificationTimestamp` | 100 | 100 | no | string | 2026-08-28T00:44:24Z |
| `SpaYN` | 0 | 0 | no |  |  |
| `SpecialLicenses` | 0 | 0 | no |  |  |
| `SpecialListingConditions` | 0 | 0 | YES |  |  |
| `StandardBuyerAgentDesignationList` | 0 | 0 | no |  |  |
| `StandardCoBuyerAgentDesignationList` | 0 | 0 | no |  |  |
| `StandardCoListAgentDesignationList` | 0 | 0 | no |  |  |
| `StandardListAgentDesignationList` | 0 | 0 | no |  |  |
| `StandardStatus` | 100 | 100 | no | string | Active |
| `StartShowingDate` | 0 | 0 | no |  |  |
| `StateOrProvince` | 100 | 100 | no | string | NJ |
| `StateRegion` | 0 | 0 | no |  |  |
| `StatusChangeDate` | 0 | 0 | YES |  |  |
| `StatusChangeDateTime` | 0 | 0 | no |  |  |
| `StatusChangeTimestamp` | 100 | 100 | no | string | 2026-01-05T16:35:41Z |
| `Stories` | 100 | 98 | partial | number | 1 |
| `StoriesTotal` | 0 | 0 | YES |  |  |
| `StreetAdditionalInfo` | 0 | 0 | no |  |  |
| `StreetDirPrefix` | 4 | 4 | no | string | E |
| `StreetDirSuffix` | 1 | 0 | no | string | E |
| `StreetName` | 100 | 100 | no | string | Front |
| `StreetNumber` | 100 | 100 | no | string | 55 |
| `StreetNumberInteger` | 100 | 100 | no | number | 55 |
| `StreetNumberModifier` | 0 | 0 | no |  |  |
| `StreetSuffix` | 98 | 99 | no | string | Street |
| `StreetSuffixModifier` | 0 | 0 | YES |  |  |
| `StructuralAreaUnits` | 0 | 0 | no |  |  |
| `StructureType` | 4 | 5 | partial | object | {"Townhouse":true} |
| `SubdivisionCode` | 0 | 0 | no |  |  |
| `SubdivisionName` | 99 | 99 | no | string | None |
| `SuppliesExpense` | 0 | 0 | YES |  |  |
| `SyndicationListingReferenceUrl` | 0 | 0 | no |  |  |
| `SyndicationRemarks` | 0 | 0 | YES |  |  |
| `TaxAmount` | 90 | 92 | partial | number | 6585 |
| `TaxAmountFrequency` | 0 | 0 | no |  |  |
| `TaxAssessedValue` | 99 | 100 | partial | number | 320600 |
| `TaxBlock` | 0 | 0 | YES |  |  |
| `TaxBookNumber` | 0 | 0 | no |  |  |
| `TaxExemptions` | 0 | 0 | no |  |  |
| `TaxLegalDescription` | 0 | 0 | no |  |  |
| `TaxLot` | 0 | 0 | YES |  |  |
| `TaxMapNumber` | 0 | 0 | no |  |  |
| `TaxOtherAssessmentAmount` | 1 | 0 | YES | number | 608200 |
| `TaxOtherAssessmentAmountFrequency` | 0 | 0 | no |  |  |
| `TaxParcelLetter` | 0 | 0 | no |  |  |
| `TaxStatusCurrent` | 0 | 0 | no |  |  |
| `TaxTractOrSection` | 0 | 0 | no |  |  |
| `TaxYear` | 90 | 92 | partial | number | 2025 |
| `Telephone` | 0 | 0 | no |  |  |
| `TenantPays` | 1 | 0 | YES | object | {"Snow Removal":true} |
| `Topography` | 20 | 28 | partial | string | Level |
| `TotalActualRent` | 0 | 0 | no |  |  |
| `TotalAnnualOperatingExpenses` | 0 | 0 | no |  |  |
| `TotalBathroomsSource` | 100 | 100 | no | string | MLS |
| `Township` | 0 | 0 | no |  |  |
| `TrashExpense` | 0 | 0 | no |  |  |
| `UnitNumber` | 11 | 8 | no | string | A |
| `UnitsFurnished` | 0 | 0 | no |  |  |
| `UnitTypeType` | 0 | 0 | YES |  |  |
| `UnparsedAddress` | 100 | 100 | no | string | 55 E Front Street, Keyport, NJ 07735 |
| `UnparsedFirstLineAddress` | 100 | 100 | no | string | 55 E Front Street |
| `Utilities` | 0 | 0 | YES |  |  |
| `VacancyAllowance` | 0 | 0 | no |  |  |
| `VacancyAllowanceRate` | 0 | 0 | no |  |  |
| `Vegetation` | 0 | 0 | no |  |  |
| `VideosChangeTimestamp` | 10 | 10 | YES | string | 2026-08-20T17:31:51Z |
| `VideosCount` | 100 | 100 | no | number | 0 |
| `View` | 15 | 10 | partial | object | {"Waterview":true} |
| `ViewYN` | 0 | 0 | no |  |  |
| `VirtualToursCount` | 100 | 100 | no | number | 0 |
| `VOWAddressDisplay` | 0 | 0 | no |  |  |
| `VOWAddressDisplayYN` | 100 | 100 | no | boolean | true |
| `VOWAutomatedValuationDisplay` | 0 | 0 | no |  |  |
| `VOWAutomatedValuationDisplayYN` | 100 | 100 | no | boolean | true |
| `VOWConsumerComment` | 0 | 0 | no |  |  |
| `VOWConsumerCommentYN` | 100 | 100 | no | boolean | true |
| `VOWEntireListingDisplay` | 0 | 0 | no |  |  |
| `VOWEntireListingDisplayYN` | 100 | 100 | no | boolean | true |
| `WalkScore` | 0 | 0 | no |  |  |
| `WaterBodyName` | 0 | 0 | YES |  |  |
| `WaterfrontFeatures` | 14 | 7 | no | object | {"Oceanside/Beach Blk":true} |
| `WaterfrontYN` | 0 | 0 | no |  |  |
| `WaterFrontYN` | 99 | 99 | partial | boolean | true |
| `WaterHeaterFuel` | 0 | 0 | no |  |  |
| `WaterSewerExpense` | 0 | 0 | YES |  |  |
| `WaterSource` | 95 | 95 | no | object | {"Public Water":true} |
| `WindowFeatures` | 21 | 18 | partial | object | {"Skylight(s)":true} |
| `WithdrawDate` | 0 | 0 | YES |  |  |
| `WithdrawnTimestamp` | 0 | 0 | no |  |  |
| `WoodedArea` | 0 | 0 | no |  |  |
| `WorkmansCompensationExpense` | 0 | 0 | no |  |  |
| `YardAndGroundsFeatures` | 0 | 0 | no |  |  |
| `YearBuilt` | 93 | 91 | partial | number | 1925 |
| `YearBuiltDetails` | 0 | 0 | no |  |  |
| `YearBuiltEffective` | 0 | 0 | no |  |  |
| `YearBuiltSource` | 0 | 0 | no |  |  |
| `YearEstablished` | 0 | 0 | no |  |  |
| `YearsCurrentOwner` | 0 | 0 | no |  |  |
| `Zoning` | 0 | 0 | YES |  |  |
| `ZoningDescription` | 77 | 77 | partial | string | Single Family, Retail, Residential, Professional |

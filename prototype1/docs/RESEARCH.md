# Green Area Inventory — Research: Best Practice Standards & Data Models

This document summarizes research into existing standards, data models, and software platforms relevant to the Green Area Inventory green space management data model. It consolidates findings from a comprehensive review of 572+ sources across international standards, open data models, Swiss-specific implementations, biodiversity frameworks, ecosystem service methodologies, and open municipal tree datasets.

---

## 1. International Standards & Frameworks

### 1.1 OGC CityGML 3.0 — Vegetation Module

| | |
|---|---|
| **Publisher** | Open Geospatial Consortium (OGC) |
| **Status** | Approved OGC Standard (January 2025) |
| **URL** | https://www.ogc.org/standards/citygml/ |

CityGML 3.0 is an open conceptual model for the storage and exchange of virtual 3D city and landscape models. It defines 17 modules including **Vegetation**, **CityFurniture**, **LandUse**, and **WaterBody** — all directly relevant to the Green Area Inventory domain.

Key feature types in the Vegetation module:

| CityGML Feature Type | Green Area Inventory Equivalent | Notes |
|----------------------|-------------------------|-------|
| `SolitaryVegetationObject` | **Tree** | Individual tree with species, trunk diameter, crown diameter, height |
| `PlantCover` | **GreenArea** | Vegetated area with classification and extent |
| `CityFurniture` | **Furniture** | Benches, bins, light posts, bollards |
| `WaterBody` | **WaterFeature** | Still and flowing water features |
| `LandUse` | **SurfaceArea** | Land use/cover classification |

A **CityGML 3.0 Vegetation ADE** (Application Domain Extension) has been proposed (ISPRS Archives, 2024) that enhances the SolitaryVegetationObject and PlantCover feature types with additional properties. It models the dynamics of vegetation in terms of growth and management through the CityGML Dynamizer module, and defines new data types, code lists, and enumerations for vegetation-specific characteristics.

**Relevance to Green Area Inventory:** The entity hierarchy (Site → GreenArea / Tree / Furniture) is conceptually compatible with CityGML. Consider adding optional `cityGmlClass` metadata fields for interoperability with cantonal or federal 3D city models (e.g., swisstopo swissTLM3D). The Vegetation ADE's approach to modeling growth dynamics and management could inform a future ConditionAssessment entity.

---

### 1.2 EU INSPIRE Data Specifications

| | |
|---|---|
| **Publisher** | European Commission Joint Research Centre |
| **Status** | Legally binding (Directive 2007/2/EC) |
| **URL** | https://knowledge-base.inspire.ec.europa.eu/data-specifications-technical-guidelines_en |

Several INSPIRE themes are relevant:

| INSPIRE Theme | Annex | Relevance |
|---------------|-------|-----------|
| **Land Cover** | II | Land cover classification with observation dates; code list model (e.g., CORINE). Maps to SurfaceArea / GreenArea entities. |
| **Land Use** | III | Planned and existing land use with spatial and temporal dimensions. Includes hierarchical classification (HILUCS). |
| **Protected Sites** | I | Sites with known location, boundary, and area based on formal/legal agreements. Relevant for biodiversity-protected green spaces. |
| **Species Distribution** | III | Distribution of plant and animal species. Relevant for biodiversity monitoring and neophyte tracking. |
| **Bio-geographical Regions** | III | Ecological region classification. Context for species selection and care profile adaptation. |

INSPIRE's temporal model uses `validFrom` / `validUntil` + `beginLifespanVersion`, which aligns well with Green Area Inventory's existing traceability approach.

**Relevance to Green Area Inventory:** The DMAV Bodenbedeckungsart alignment (Appendix A.19) already bridges toward INSPIRE Land Cover. INSPIRE's standardized code list mechanisms and temporal versioning validate the Green Area Inventory design approach.

---

### 1.3 FLL — Forschungsgesellschaft Landschaftsentwicklung Landschaftsbau

| | |
|---|---|
| **Publisher** | FLL e.V. (Bonn, Germany) |
| **Founded** | 1975 |
| **URL** | https://www.fll.de/ |

The FLL is the German-language standard-setting body for the green industry. It publishes guidelines (Regelwerke) that are treated as recognized codes of practice across the DACH region, including Switzerland. Key publications:

| FLL Guideline | Green Area Inventory Mapping | Notes |
|---------------|----------------------|-------|
| **Baumkontrollrichtlinie** | Tree → condition assessment; future ConditionAssessment entity | Standardized tree inspection protocol: damage categories, inspection intervals, urgency levels. FLL-certified Baumkontrolleure. |
| **ZTV-Baumpflege** | CareAction / Task entities | Technical contract terms for tree care. Defines standard maintenance operations and acceptance criteria. |
| **Green Roof Guidelines** (2008/2018) | CareProfile `DB` (Dachbegrünung extensiv) | Planning, construction, and maintenance of green roofs. Substrate specs, plant lists, inspection schedules. |
| **Empfehlungen für Baumpflanzungen** | Tree entity (planting context) | Guidelines for tree planting in urban environments. Root space, substrate, anchoring. |

FLL certification is the de facto standard for tree inspectors (Baumkontrolleure) and playground inspectors (Spielplatzprüfer) in the DACH region.

#### FLL Baumkontrollrichtlinie — Inspection Data Model

The FLL tree inspection guideline (2020 edition, 6,500+ certified inspectors in Germany) specifies a structured inspection record with four data sections:

**Base tree data** (Grunddaten): `baum_id`, `baum_nr` (RFID/plate tag), `standort_koordinaten` (geometry), `baumart` (species), `pflanzjahr`, `stammumfang_cm`, `baumhoehe_m`, `kronendurchmesser_m`, `eigentuemer`.

**Inspection record** (Kontrollgang): `kontroll_datum` (DateTime), `kontrolleur` (inspector ID), `kontrolleur_zertifikat` (FLL certificate number), `kontrollart` (enum: Regelkontrolle, Zusatzkontrolle, Ersterfassung, Eingehende Untersuchung), `kontrollintervall` (6/12/24 months), `belaubungszustand` (belaubt/unbelaubt).

**Condition assessment**: `vitalitaet` (Roloff scale 0–3: vital → stark geschädigt), `verkehrssicherheit` (enum: gegeben/nicht_gegeben/herstellbar), `stand_sicherheit` and `bruch_sicherheit` (sicher/eingeschränkt/nicht_sicher). Defect symptoms are structured as boolean checklists across crown (`totholz`, `astbruch`, `pilzbefall_krone`, `hohlungen`), trunk (`rindenschaeden`, `pilzfruchtkörper`, `hohlungen`, `risse`, `faeulnis`), trunk base (`pilzfruchtkörper`, `wurzelhebung`), and roots (`wurzelverletzung`, `bodenverdichtung`).

**Measures** (Maßnahmen): `massnahme_typ` (enum: totholz_entfernen, kronenschnitt, eingehende_untersuchung, faellung, kronensicherung, standortverbesserung, nachkontrolle), `massnahme_dringlichkeit` (sofort / kurzfristig <3 months / mittelfristig <12 months / langfristig), `massnahme_status` (empfohlen/angeordnet/durchgeführt/nicht_erfolgt), `fotos` (URI array).

This maps precisely: base data → **Tree**, each Kontrollgang → **CareAction**, kontrollintervall → **CareProfile**, pending Maßnahmen → **Task** with urgency levels.

**Relevance to Green Area Inventory:** The CareProfile structure already aligns well with FLL's categorized care guidelines. The FLL Baumkontrollrichtlinie should inform the future ConditionAssessment entity schema — it defines standard VTA inspection zones (root, collar, trunk, crown, branches) and a standardized damage/action catalog.

---

### 1.4 SIA 318 — Garten- und Landschaftsbau

| | |
|---|---|
| **Publisher** | SIA (Schweizerischer Ingenieur- und Architektenverein) |
| **Standard** | SIA 318:2009 |
| **URL** | https://shop.sia.ch/normenwerk/architekt/sia%20318/d/2009/D/Product |

The Swiss standard for garden and landscape construction. It is the Swiss equivalent of the German DIN 18915–18920 series and defines acceptance criteria, material standards, and construction quality requirements for landscape works.

Related SIA standards relevant to green space management:

| SIA Standard | Scope | Green Area Inventory Mapping |
|-------------|-------|------------------------------|
| **SIA 118/318:2009** | Contractual conditions for landscape construction | Defines the **2-year Anwachsgarantie** (plant establishment warranty) — directly relevant to Contract.warrantyPeriod |
| **SIA 312** | Roof greening (extensive/intensive) | Relevant for GreenArea/BuildingGreenery with type="Dachbegrünung" |
| **prSIA 318:2025** | Revision in progress | Adding facade greening (Fassadenbegrünung) and biodiversity requirements |

**Relevance to Green Area Inventory:** Strengthens the normative framework for CareAction definitions and Task acceptance criteria. Combined with the VSSG (Vereinigung Schweizerischer Stadtgärtnereien und Gartenbauämter) practice guidelines, this forms the Swiss regulatory baseline.

---

### 1.5 DIN 18916–18920 — Vegetation Technology Standards

| | |
|---|---|
| **Publisher** | DIN (Deutsches Institut für Normung) |
| **Series** | DIN 18916–18920 |
| **Scope** | DACH region (Germany, Austria, Switzerland) |

The DIN 18916–18920 series provides the technical foundation for vegetation establishment and maintenance in landscape construction. While SIA 318 is the Swiss equivalent, the DIN standards are frequently referenced in Swiss professional practice and FLL guidelines.

| DIN Standard | Scope | Green Area Inventory Mapping |
|-------------|-------|----------------------|
| **DIN 18916** | Vegetation technology — Plants and planting work | Tree planting specifications, CareAction templates |
| **DIN 18917** | Vegetation technology — Turf and seeding work | GreenArea (lawn/meadow profiles), CareAction for sowing |
| **DIN 18918** | Vegetation technology — Bioengineering | Slope stabilization, StructureElement (ecological features) |
| **DIN 18919** | Vegetation technology — Maintenance of green areas | CareProfile / CareAction frequency and method definitions |
| **DIN 18920** | Protection of trees and vegetation during construction | Tree protection zones, relevant for Task entity (construction context) |

#### DIN Field-Level Parameters

The DIN standards define specific inspection and maintenance parameters:

- **DIN 18916** (planting): specifies plant quality at delivery, root ball integrity, planting depth, staking, and establishment care — mapping to CareAction fields `plant_quality_grade`, `root_ball_size`, `planting_depth_cm`
- **DIN 18917** (seeding/lawns): defines seed mix type (RSM reference), application rate (g/m²), germination coverage %
- **DIN 18919** (maintenance): defines care regimes: `mow_height_mm`, `mow_frequency_weeks`, `fertilizer_type`, `fertilizer_rate_g_m2`, `watering_interval_days` — directly informing CareProfile attributes
- **DIN 18920** (tree protection): defines the **Kronentraufbereich** (root protection zone = crown radius + 1.5m; for columnar forms + 5.0m), mapping to a computed protection perimeter on Tree entities

**Relevance to Green Area Inventory:** DIN 18919 in particular defines maintenance categories and intervals that map directly to CareProfile frequency attributes. DIN 18920's tree protection zone definitions (Kronentraufbereich) could inform a future spatial buffer calculation for trees during construction projects.

---

### 1.6 ISO Standards (Geodata Quality, Metadata & Asset Management)

| Standard | Scope | Relevance |
|----------|-------|-----------|
| **ISO 19157** (Data Quality) | Principles for describing quality of geographic data: completeness, logical consistency, positional accuracy, thematic accuracy, temporal quality | Framework for data quality metrics on Green Area Inventory entities |
| **ISO 19115** (Metadata) | Metadata standard for geographic datasets | Dataset-level metadata for Green Area Inventory exports (DCAT-AP CH alignment) |
| **ISO 19107** (Spatial Schema) | Geometry types for geographic features | CityGML and INSPIRE geometry foundation |
| **ISO 19109** (Rules for Application Schema) | How to define feature types and their properties | Conceptual modeling foundation |
| **ISO 55000** (Asset Management) | Asset management system requirements and guidelines | Framework for green infrastructure lifecycle management |

#### ISO 55000 — Asset Management for Green Infrastructure

ISO 55000:2014 (revised 2024) establishes a framework for the systematic management of physical assets throughout their lifecycle. Applied to green infrastructure, it defines processes for asset identification and registration, condition assessment and risk evaluation, lifecycle cost optimization, performance monitoring and improvement, and decision-making for maintenance vs. replacement.

The standard's asset lifecycle model (Plan → Acquire → Operate → Maintain → Dispose) maps well to the Green Area Inventory workflow: Site/Tree creation → CareProfile assignment → Task execution → ConditionAssessment → Tree removal/replacement.

#### ISO 55001:2024 — Asset Register Fields

Applied to green infrastructure, ISO 55001 (2024 edition) requires an asset register with: `asset_id`, `condition_grade` (1–5: Very Good → Very Poor), `replacement_value` (currency), `useful_life_years`, `installation_date`, `risk_score` (1–25, likelihood × consequence matrix), `criticality_rating` (critical/high/medium/low), `maintenance_strategy` (preventive/corrective/condition_based/run_to_failure), `last_inspection_date`, `next_inspection_due`, and `parent_asset_id` for hierarchy. The condition_grade (1–5) aligns directly with the German Zustandsstufe used in FLL tree inspections.

The new **ISO 55013:2024** specifically addresses data quality and governance for asset management information systems — relevant for ensuring Green Area Inventory data quality standards.

**Relevance to Green Area Inventory:** ISO 55000's asset registry concept validates the inventory-first approach. The standard's emphasis on condition-based maintenance planning directly supports the future ConditionAssessment entity. The lifecycle cost tracking requirement is addressed by the Cost entity.

---

### 1.7 IFC — Industry Foundation Classes (Greenery Extensions)

| | |
|---|---|
| **Publisher** | buildingSMART International |
| **Standard** | IFC 4.3 (ISO 16739-1:2024) |
| **URL** | https://standards.buildingsmart.org/IFC/ |

IFC 4.3 includes limited but growing support for landscape and greenery elements. Relevant entity types include `IfcGeographicElement` (for landscape features like trees, hedges, water features), `IfcSite` (with `RefElevation` and site boundary), and `IfcExternalSpatialElement` (for outdoor spaces). The IFC Infra extensions (roads, bridges, tunnels) have expanded spatial modeling capabilities that could benefit landscape representation.

#### IFC Vegetation Property Sets

IFC 4.3 models vegetation through `IfcGeographicElement` with `PredefinedType=VEGETATION`, inheriting core attributes: `GlobalId` (22-char string), `Name`, `Description`, `ObjectPlacement` (spatial position), and `Representation` (2D/3D geometry). The `IfcGeographicElementTypeEnum` provides values `SOIL_BORING_POINT`, `TERRAIN`, `VEGETATION`, `USERDEFINED`, and `NOTDEFINED`. The vegetation property set `Pset_VegetationCommon` defines only two properties: **`BotanicalName`** (IfcLabel, scientific name per ICN) and **`LocalName`** (IfcLabel, common name). The proposed `IfcPlant` subtype from IFC 4.3 RC1 was removed from the final standard.

This deliberate minimalism means IFC relies on external classification references for species detail — Green Area Inventory's richer Tree entity (with trunk diameter, crown dimensions, health) goes well beyond IFC's scope, making IFC useful only as a BIM interoperability format rather than a primary data model.

Current limitations: IFC's greenery support is minimal compared to CityGML. There is no native tree dendrometry (DBH, crown diameter) or vegetation dynamics model. The buildingSMART Landscape Room is working on extensions, but these are not yet standardized.

**Relevance to Green Area Inventory:** IFC interoperability is relevant for the BBL context where BIM deliverables may include landscape elements. The `IfcGeographicElement` mapping is a potential export target. However, CityGML 3.0 remains the better interoperability target for the vegetation domain.

---

### 1.8 ISO 28258 — Soil Quality Digital Data Exchange

| | |
|---|---|
| **Publisher** | ISO TC 190 (Soil quality) |
| **Standard** | ISO 28258:2013 |

ISO 28258 defines a data model for the digital exchange of soil-related data, including soil profiles, horizons, and observations. The model uses a hierarchical structure: Site → SoilProfile → SoilHorizon → SoilObservation.

ISO 28258 is built on the **ISO 19156 Observations & Measurements** (O&M) pattern. Its core features use a hierarchical structure: `Site` (investigation environment) → `Plot` (spatial investigation location, specialized into Surface/TrialPit/Borehole) → `Profile` (ordered horizons) → `ProfileElement` (with upper/lower depth) → `SoilSpecimen`. The observation triple of Property + Procedure + Result records measurements like pH, organic carbon, and texture. The ISRIC PostgreSQL reference implementation on GitHub (`ISRICWorldSoil/iso-28258`) implements tables for `site`, `plot`, `profile`, `element`, `specimen`, and `observation_phys_chem` with controlled vocabularies from GloSIS code-lists. This O&M pattern could inform an extensible soil quality sub-model linked to Green Area Inventory's GreenArea or SurfaceArea entities.

**Relevance to Green Area Inventory:** The GreenArea entity includes a `soilType` field. For advanced soil management (e.g., green roof substrates, tree planting specifications per FLL), ISO 28258's structured approach could inform a future SoilProfile extension. Low priority for the current scope.

---

### 1.9 i-Tree Eco — Ecosystem Service Assessment

| | |
|---|---|
| **Publisher** | USDA Forest Service |
| **URL** | https://www.itreetools.org/ |
| **Type** | Free software suite for urban forestry analysis |

i-Tree Eco provides the most granular tree-level field inventory and ecosystem service quantification model. It is the de facto standard used by Swiss pilot cities (Basel, Bern, Zürich, Lausanne, Luzern, Winterthur) for urban tree ecosystem service valuation.

#### i-Tree Eco v6.0 Field Inventory Schema

The i-Tree Eco field manual (USDA Forest Service, v6.0) defines the most comprehensive tree data collection schema in practice. Minimum required fields are just `Species` and `DBH`, but the recommended set spans five categories:

- **Dimensional:** `TotalTreeHeight`, `LiveTreeHeight`, `HeightToLiveCrownBase`, `LiveCrownWidth_NS`, `LiveCrownWidth_EW` (all in meters)
- **Crown condition:** `PercentCrownMissing` (0–100%), `CrownHealth` (0–100%), `CrownLightExposure` (0–5 sides)
- **Management:** `MaintenanceRecommended` (None/Prune <6in/Prune >6in/Remove/Other), `MaintenanceTask` (Clean/Thin/Raise/Reduce/Other), `SidewalkConflict` (boolean), `UtilityConflict` (boolean)
- **Context:** `StreetTree` (boolean), `PublicPrivate` (enum), `LandUse` (14 classes: Residential, Commercial, Industrial, Park, etc.)
- **Ground cover:** `PercentImpervious`, `PercentShrub` under canopy

Plot-level data includes `PlotCenterCoordinates`, `TreeCover` %, `ShrubCover` %, `PlantableSpace` %, and detailed ground cover percentages for 11 surface types.

The i-Tree Eco data collection protocol defines the following core tree attributes:

| i-Tree Field | Type | Green Area Inventory Mapping | Notes |
|-------------|------|----------------------|-------|
| Species (genus/species) | string | `species`, `genus` | Uses ITIS taxonomy; ~3,600 species with allometric equations |
| DBH (diameter at breast height) | number (inches/cm) | `trunkCircumferenceCm` (convert) | Measured at 1.37m (4.5 ft); single most important field for biomass calculations |
| Total height | number (m/ft) | `heightM` | Height to top of crown |
| Crown height (live top) | number (m/ft) | — (not yet modeled) | Height to top of live crown |
| Crown base height | number (m/ft) | — (not yet modeled) | Height to lowest live branch |
| Crown width (N-S, E-W) | number (m/ft) | `crownDiameterM` | Two perpendicular measurements averaged |
| Crown light exposure | enum (0–5) | — (not yet modeled) | Number of sides receiving direct sunlight |
| Crown condition | enum (%) | `condition` (simplified) | Percentage of crown dieback (0–100% in 5% increments) |
| Crown health | enum | `condition` | Poor / Fair / Good / Excellent |
| Land use | enum | Site.siteType | Residential, commercial, industrial, park, etc. |
| Distance/direction to building | number + enum | — (not yet modeled) | For energy savings calculations |
| Percent shrub cover | number (%) | — (not yet modeled) | Ground cover context |
| Street tree (Y/N) | boolean | Tree.treeCategory = `Strassenbaum` | Identifies street vs. park trees |
| Maintenance recommended | enum | Task / CareAction | None / Prune / Remove / Plant |

#### i-Tree Ecosystem Service Outputs (per tree)

| Service | Unit | Calculation Basis |
|---------|------|-------------------|
| CO₂ sequestration | kg/yr | Species, DBH, growth rate |
| CO₂ stored (total) | kg | Cumulative biomass |
| Air pollution removal | g/yr | PM₂.₅, NO₂, SO₂, O₃, CO |
| Stormwater interception | m³/yr | Crown area, leaf area index |
| Energy savings (heating/cooling) | kWh/yr | Distance to buildings, crown size |
| Replacement value | CHF | Trunk formula method or CTLA |

**Relevance to Green Area Inventory:** i-Tree Eco validates the core tree attribute set (species, DBH/circumference, crown diameter, height, condition). The ecosystem service outputs could be stored as computed read-only fields on the Tree entity. The recommended approach is to store the raw dendrometric data in Green Area Inventory and calculate ecosystem services on demand (either via i-Tree API or local allometric equations). Basel, Bern, and Zürich have already calibrated i-Tree species coefficients for Swiss conditions.

---

### 1.10 UN-Habitat SDG 11.7.1 — Urban Green Space Indicator

| | |
|---|---|
| **Publisher** | United Nations Human Settlements Programme |
| **Indicator** | SDG 11.7.1 |
| **URL** | https://unhabitat.org/sdg-indicator-1171-training-module |

SDG 11.7.1 (Tier II) measures the "average share of the built-up area of cities that is open space for public use for all, by sex, age and persons with disabilities." The SEDAC/CIESIN 2023 dataset covers **8,873 urban centers** with fields including `area_built_up_km2`, `area_open_space_km2`, `pct_open_space`, and `pop_with_access`. Open public space is typed as parks/gardens, plazas, waterfronts, sport facilities, and community gardens — each requiring polygon geometry, name, type, `area_sqm`, and an `accessibility` flag. The **400-meter buffer** from residences to qualifying green space is the standard proximity metric.

**Relevance to Green Area Inventory:** The Site entity's `totalAreaM2` and `greenAreaM2` fields directly support this indicator. A spatial accessibility analysis (buffer/isochrone from Sites) could produce the SDG 11.7.1 metric at municipal level. Low implementation effort.

---

### 1.11 WHO Urban Green Space Guidelines

| | |
|---|---|
| **Publisher** | World Health Organization (Regional Office for Europe) |
| **Publication** | Urban green spaces and health — A review of evidence (2016) |
| **URL** | https://www.who.int/europe/publications/i/item/9789289052153 |

WHO guidelines recommend minimum green space access thresholds: at least 0.5–1 ha of public green space within 300m of every residence, and 9 m² of urban green space per capita (varying by guideline source). WHO defines three indicator categories:

| Category | Indicators |
|----------|-----------|
| **Availability** | NDVI, green space density %, tree canopy cover %, street tree density (trees/km) |
| **Accessibility** | Proximity in meters, population within threshold %, green space per capita (target: **≥9 m²/person**) |
| **Usage** | Visit frequency, duration, physical activity levels |

These computed KPIs can be derived from Green Area Inventory's spatial data combined with external population data.

**Relevance to Green Area Inventory:** Validates the need for accurate Site perimeter and area tracking. The per-capita metric requires population data (external) combined with Green Area Inventory's green area inventory.

---

### 1.12 EU Nature Restoration Regulation (NRR)

| | |
|---|---|
| **Publisher** | European Parliament and Council |
| **Status** | Regulation (EU) 2024/1991, entered into force August 2024 |
| **URL** | https://eur-lex.europa.eu/eli/reg/2024/1991/oj |

The EU Nature Restoration Regulation introduces legally binding "no net loss" tracking requirements for urban ecosystems. **Article 8** creates binding requirements: **no net loss of urban green space area or tree canopy cover by 2030** versus a 2024 baseline, with an increasing trend from 2031 measured every 6 years. Key provisions for green space management:

| NRR Requirement | Data Need | Green Area Inventory Mapping |
|----------------|-----------|----------------------|
| No net loss of urban green space area (Art. 8) | Total green space area per municipality, tracked against 2024 baseline | Site.greenAreaM2 aggregated |
| No net loss of urban tree canopy cover (Art. 8) | Total canopy cover area, tracked against 2024 baseline | Tree crown area (computed from crownDiameterM) |
| Increasing trend of urban green space by 2030/2040/2050 | Temporal tracking of green space metrics | validFrom/validUntil on Sites and GreenAreas |
| National restoration plans with measurable targets | Reporting at municipal, cantonal, national level | Aggregation by municipality/canton |

Key monitored indicators use EU datasets: `urban_green_space_area` (from Copernicus CLCplus Backbone), `urban_tree_canopy_cover` (from HRL Tree Cover Density, vegetation height >2m threshold), and `urban_ecosystem_area` (per LAU using Degree of Urbanisation). Cities with >45% green space AND >10% canopy cover may be exempt until 2030.

The **EU Biodiversity Strategy 2030** additionally targets **3 billion new trees** and recommends Urban Nature Plans for cities >20,000 population. Time-series tracking of total GreenArea extent and computed canopy cover from Tree crown dimensions is not optional — it is a regulatory reporting requirement.

**Relevance to Green Area Inventory:** Although Switzerland is not an EU member state, the NRR's data requirements are likely to influence Swiss policy (cf. indirect applicability through bilateral agreements and BAFU Biodiversitätsstrategie). The 2024 baseline requirement means inventories started now will be critically important. Green Area Inventory's temporal versioning (validFrom/validUntil) inherently supports no-net-loss tracking.

---

### 1.13 IUCN / Singapore Index on Cities' Biodiversity

| | |
|---|---|
| **Publisher** | IUCN / Convention on Biological Diversity |
| **URL** | https://www.nparks.gov.sg/biodiversity/singapore-index-on-cities-biodiversity |

The Singapore Index on Cities' Biodiversity (CBI) defines **28 scored indicators** across three components: native biodiversity (10 indicators including native plant/bird species counts, protected area %), ecosystem services (7 indicators: carbon storage in tC/ha, recreational space as ha/1000 population, permeable surface %, restoration area in ha), and governance (11 indicators: budget, institutional capacity, monitoring programs). Each indicator requires specific quantitative data — `native_plant_species_count`, `protected_area_ha`, `permeable_surface_pct` — that map to aggregated queries across Green Area Inventory entities.

**Relevance to Green Area Inventory:** The data model already captures most inputs needed for Singapore Index indicators 1–10. Species-level data on the Tree entity enables native vs. non-native ratio calculations. Site connectivity requires spatial network analysis beyond the current scope.

---

## 2. Open Data Models & Integration Standards

### 2.1 Schema.org — Park Type

| | |
|---|---|
| **Publisher** | Schema.org Community |
| **URL** | https://schema.org/Park |

Schema.org defines `Park` as a subtype of `CivicStructure` → `Place` → `Thing`. Key properties include `geo` (GeoCoordinates or GeoShape), `openingHours`, `address`, `isAccessibleForFree`, `publicAccess`, and `amenityFeature`. The `additionalProperty` mechanism allows extension with domain-specific attributes.

**Relevance to Green Area Inventory:** Schema.org mapping enables structured data for public-facing green space portals (SEO, knowledge graphs). A JSON-LD export of Site entities as Schema.org Park objects would be low-effort and high-value for discoverability. Could also support a future public transparency portal.

---

### 2.2 FIWARE Smart Data Models — Green Spaces

| | |
|---|---|
| **Publisher** | FIWARE Foundation |
| **URL** | https://github.com/smart-data-models/dataModel.ParksAndGardens |

FIWARE's NGSI-LD ecosystem provides Smart Data Models for urban green space management. Three models are directly relevant:

| FIWARE Model | Green Area Inventory Mapping | Key Attributes |
|-------------|----------------------|----------------|
| **Garden** | Site | `name`, `category` (park, garden, cemetery, etc.), `areaServed`, `openingHoursSpecification`, `dateLastWatering` |
| **FlowerBed** | GreenArea | `category` (tree, hedge, flower, grass, etc.), `width`, `height`, `depth`, `taxon` (species list), `dateLastWatering` |
| **GreenspaceRecord** | CareAction / Task | `dateObserved`, `soilTemperature`, `soilMoisture`, `relativeHumidity`, `weather` |

The **Garden** entity includes `category` (enum: public, private, botanical, castle, community, monastery, residential, fencedOff), `style` (english, french, chinese, japanese, zen, rosarium, herb_garden, kitchen), `dateLastWatering` (DateTime), `nextWateringDeadline` (DateTime), and `openingHours`. The **FlowerBed** entity adds `taxon` (biological taxon list), `category` (hedge, lawnArea, portable, **urbanTreeSpot**), `width`/`height`/`depth` (meters), and `refGarden` (relationship).

FIWARE's NGSI-LD serves as a natural integration hub for urban green space management because it already bridges citizen issue reporting (Open311), real-time IoT sensor data (OGC SensorThings API), and administrative data into a unified data space.

#### FIWARE NGSI-LD Example

```json
{
  "id": "urn:ngsi-ld:Garden:Santander-Garden-Piquio",
  "type": "Garden",
  "category": { "type": "Property", "value": ["public"] },
  "style": { "type": "Property", "value": "french" },
  "dateLastWatering": {
    "type": "Property",
    "value": { "@type": "DateTime", "@value": "2017-03-31T08:00:00Z" }
  },
  "location": {
    "type": "GeoProperty",
    "value": { "type": "Point", "coordinates": [-3.7836974, 43.4741091] }
  }
}
```

Entity mapping: Garden → **Site** or **GreenArea**; FlowerBed (lawnArea) → **SurfaceArea**; FlowerBed (hedge) → **LinearFeature**; FlowerBed (urbanTreeSpot) → **Tree**; GreenspaceRecord → **CareAction** (observation); `dateLastWatering` → CareAction; `nextWateringDeadline` → **Task**.

**Relevance to Green Area Inventory:** The FIWARE models validate the Green Area Inventory entity split (Site/GreenArea/Tree). The GreenspaceRecord concept — linking sensor observations to green spaces — could inform a future IoT integration layer. NGSI-LD's entity-relationship model and temporal properties align well with Green Area Inventory's validFrom/validUntil approach. For Swiss municipalities exploring Smart City platforms, Green Area Inventory data could be exposed as NGSI-LD entities.

---

### 2.3 Open311 / GeoReport v2 — Citizen Issue Reporting

| | |
|---|---|
| **Publisher** | Open311 Community / Code for America |
| **Specification** | GeoReport v2 |
| **URL** | https://wiki.open311.org/GeoReport_v2/ |

Open311 GeoReport v2 defines a standardized API for citizen service requests (Meldungen). Core fields: `service_request_id`, `service_code`, `lat`/`long`, `description`, `media_url`, `status` (open/closed), `agency_responsible`. The `service_code` taxonomy supports domain-specific categories.

Green space–relevant service codes typically include: fallen tree, damaged bench, overgrown path, broken playground equipment, invasive species sighting, graffiti, illegal dumping, water feature malfunction.

#### Open311 JSON Example

A service request POST requires `service_code`, conditionally `lat`/`long` (WGS84 floats) or `address_string`, and optionally `description` (max 4000 chars), `email`, `media_url` (photo). The GET response returns:

```json
{
  "service_request_id": "638344",
  "status": "open",
  "service_name": "Broken Park Bench",
  "service_code": "234",
  "description": "Park bench broken with missing slats",
  "agency_responsible": "Parks Department",
  "requested_datetime": "2024-04-14T06:37:38-08:00",
  "updated_datetime": "2024-04-14T06:37:38-08:00",
  "lat": 47.3769,
  "long": 8.5417,
  "media_url": "http://example.org/media/638344.jpg"
}
```

Entity mapping: `service_request_id` → Task.id, `status` (open/closed) → Task.status, `lat`/`long` → linked entity geometry, `description` → Task.description, `media_url` → Document, `agency_responsible` → Contact. Helsinki and Tampere have deployed Open311 for parks feedback. FIWARE wraps Open311 into NGSI-LD via their `Open311ServiceRequest` data model.

**Relevance to Green Area Inventory:** Open311 could serve as the API contract for a future citizen reporting module (the [Preview] Issue entity). Service requests would link to existing spatial entities (nearest Tree, Furniture, or GreenArea). Several Swiss cities (Zürich «Züri wie neu», Bern «eBern») already run Open311-compatible reporting platforms that could be integrated.

---

### 2.4 OGC SensorThings API — IoT for Green Spaces

| | |
|---|---|
| **Publisher** | Open Geospatial Consortium |
| **Standard** | OGC SensorThings API Part 1: Sensing (15-078r6) |
| **URL** | https://www.ogc.org/standard/sensorthings/ |

The SensorThings API (OGC 18-088, v1.1) provides a RESTful interface for IoT sensor networks with 8 entity types. Its data model: `Thing` → `Location` + `Datastream` → `Sensor` + `ObservedProperty` + `Observation` → `FeatureOfInterest`. Each Observation carries `phenomenonTime` (ISO 8601), `resultTime`, and `result` (any type). For green space management, relevant sensor types include soil moisture probes (irrigation optimization), weather stations (microclimate monitoring), dendrometers (trunk growth measurement), sap flow sensors (tree health), and people counters (usage intensity).

#### SensorThings JSON Example — Soil Moisture Monitoring

```json
{
  "name": "Park Soil Moisture Station",
  "description": "Sensor monitoring soil moisture in Stadtpark",
  "properties": { "Park": "Stadtpark Zürich" },
  "Locations": [{
    "name": "Flower Bed A",
    "encodingType": "application/vnd.geo+json",
    "location": { "type": "Point", "coordinates": [8.5417, 47.3769] }
  }],
  "Datastreams": [{
    "name": "Soil Moisture",
    "observationType": "http://www.opengis.net/def/observationType/OGC-OM/2.0/OM_Measurement",
    "unitOfMeasurement": { "name": "Volumetric Water Content", "symbol": "%", "definition": "http://www.qudt.org/qudt/owl/1.0.0/unit/Instances.html#Percent" },
    "ObservedProperty": { "name": "Soil Moisture", "definition": "http://www.qudt.org/qudt/owl/1.0.0/quantity/Instances.html#SoilMoisture" },
    "Sensor": { "name": "Decagon 5TM", "encodingType": "application/pdf", "metadata": "https://example.com/datasheets/5TM.pdf" }
  }]
}
```

The Thing maps to an IoT device in a **GreenArea**; FeatureOfInterest to the monitored **Tree**, **WaterFeature**, or **SurfaceArea**; Observations feed into **CareProfile** thresholds to auto-generate **Tasks** (e.g., irrigation trigger when soil moisture < 20%). The FROST Server is the reference implementation.

**Relevance to Green Area Inventory:** Low priority for the current scope, but the SensorThings data model informs how future IoT extensions should be structured. A Green Area Inventory Tree or GreenArea could be the `Thing` entity, with Datastreams for each monitored property. The validFrom/validUntil temporal model is compatible.

---

## 3. Swiss-Specific Standards & Datasets

### 3.1 VSSG — Vereinigung Schweizerischer Stadtgärtnereien und Gartenbauämter

| | |
|---|---|
| **Publisher** | VSSG |
| **Programme** | Grünstadt Schweiz® |
| **URL** | https://www.gruenstadt-schweiz.ch/ |

The VSSG is the Swiss umbrella organization for municipal green space departments. The **VSSG Arbeitsgruppe Grünflächenmanagement**, co-led by Christian Heule (GSZ) and Simon Leuenberger (Stadtgärtnerei Basel), explicitly covers building and operating Grünflächen- und Baumkataster. Its **Grünstadt Schweiz®** label is a quality certification (Bronze/Silver/Gold, max 500 points) for municipalities committed to high-standard green space management. The certification uses **40 measures** across core processes (Planung und Bau, Pflege und Unterhalt, Produktion) and support processes (Grundlagen, Kommunikation, Personal, Beschaffung). Zürich holds Gold certification with **451/500 points**. The certification requires demonstrating systematic inventory management, care planning, biodiversity promotion, and resource efficiency.

The label assessment covers the following dimensions, each mapping to Green Area Inventory entities:

| Grünstadt Schweiz Dimension | Green Area Inventory Mapping |
|----------------------------|----------------------|
| Lebensräume (habitats) | Site, GreenArea, StructureElement |
| Bäume (trees) | Tree (inventory and care) |
| Artenvielfalt (biodiversity) | Species data on Tree, StructureElement types |
| Pflege (maintenance) | CareProfile, CareAction, Task |
| Planung (planning) | CareProfile assignment, Task scheduling |
| Ressourcen (resources) | Cost, Contract, Contact |

**Relevance to Green Area Inventory:** Grünstadt Schweiz certification requires exactly the type of systematic data management that Green Area Inventory provides. A municipality using Green Area Inventory would have a strong evidence base for the label assessment. Consider aligning reporting outputs with Grünstadt Schweiz audit requirements.

---

### 3.2 ZHAW Q-Index — Green Space Quality Assessment

| | |
|---|---|
| **Publisher** | ZHAW (Zürcher Hochschule für Angewandte Wissenschaften) |
| **Context** | «Mehr als Grün» research programme with GSZ |

The ZHAW Q-Index framework, developed as part of the «Mehr als Grün» research that also produced the GSZ Profilkatalog, defines quality dimensions for green space assessment. The three-axis tension field model — **Ecology** (Ökologie), **Design** (Gestaltung), **Usage** (Nutzung) — is already reflected in the CareProfile entity's `ecologyRating`, `designRating`, and `usageRating` fields.

The Q-Index was developed with multiple Swiss municipalities (Zürich, Basel, Bern, Winterthur, Chur, Grenchen) and operates at two levels: **Freiraum** (open space = Site) and **Pflegeprofil** (care profile = CareProfile). Target and actual quality values drive care planning. ZHAW's **Pflegeprofilkatalog for Winterthur** consolidates ~70 care profiles across categories: Siedlungsgrün, Schulbauten, Friedhöfe, Naturschutz — directly informing the CareProfile entity taxonomy.

Additional Q-Index dimensions that could inform future assessment features:

| Quality Dimension | Description | Current Coverage |
|------------------|-------------|-----------------|
| Ecological value | Species richness, habitat connectivity, naturalness | CareProfile ratings (1–5) |
| Design quality | Aesthetic coherence, spatial structure, seasonal interest | CareProfile ratings (1–5) |
| Use quality | Accessibility, safety, social function, comfort | CareProfile ratings (1–5) |
| Maintenance efficiency | Cost per m², resource input, technique appropriateness | Cost entity (partially) |
| Climate adaptation | Microclimate regulation, stormwater management, heat reduction | Not yet modeled |

**Relevance to Green Area Inventory:** The Q-Index tension field is already the conceptual backbone of the CareProfile entity. Future versions could add site-level Q-Index scoring as a composite metric derived from CareProfile assignments and condition assessments.

---

### 3.3 Swiss Open Tree Datasets — Canonical Attribute Set

Research across four major Swiss municipal open tree datasets reveals a consistent canonical attribute set:

| Municipality | Dataset Size | Portal |
|-------------|-------------|--------|
| **Zürich** (GSZ) | ~80,000 trees | data.stadt-zuerich.ch (CC Zero, weekly updates, CSV/GeoJSON/GeoPackage/WFS/WMS) |
| **Basel** (Stadtgärtnerei) | ~28,000 trees | data.bs.ch (daily updates, PostgreSQL + QField + FME + Geomapfish) |
| **Bern** (Stadtgrün) | ~21,000 trees | opendata.swiss / map.bern.ch |
| **Geneva** (SEVE) | ~250,000 trees | ge.ch / sitg.ch |

#### Canonical Swiss Tree Attribute Set (validated across 4+ datasets)

| Attribute | Zürich | Basel | Bern | Geneva | Green Area Inventory Field |
|-----------|--------|-------|------|--------|-------------------|
| Unique ID | ✓ | ✓ | ✓ | ✓ | `treeId` |
| Genus | ✓ | ✓ | ✓ | ✓ | `genus` (→ add) |
| Species | ✓ | ✓ | ✓ | ✓ | `species` |
| Common name (DE) | ✓ | ✓ | ✓ | (FR) | `commonNameDe` (→ add) |
| Planting year | ✓ | ✓ | ✓ | ✓ | `plantingYear` |
| Trunk circumference (cm) | ✓ | ✓ | ✓ | — | `trunkCircumferenceCm` |
| Crown diameter (m) | ✓ | ✓ | — | ✓ | `crownDiameterM` |
| Height (m) | ✓ | ✓ | ✓ | ✓ | `heightM` |
| Vitality / condition | ✓ | ✓ | — | ✓ | `condition` |
| Protection status | ✓ | — | ✓ | ✓ | `protectedTree` |
| Coordinates (EPSG:2056) | ✓ | ✓ | ✓ | ✓ | `lv95East` / `lv95North` |
| Street tree (Y/N) | ✓ | ✓ | ✓ | — | `treeCategory` enum |
| Owner/manager | ✓ | — | ✓ | ✓ | Site.managingOrganisation |

#### Key Findings from Cross-Dataset Analysis

The cross-dataset analysis revealed several critical data quality patterns that informed the Green Area Inventory data model design:

**Trunk measurement inconsistency:** European datasets (including all Swiss ones) use trunk circumference in centimeters measured at 1.0m height (Stammumfang), while North American datasets (including i-Tree Eco) use diameter at breast height (DBH) in inches at 1.37m. The Green Area Inventory model stores `trunkCircumferenceCm` as the primary field (aligning with Swiss practice) and can derive DBH for i-Tree calculations: `DBH_cm = circumference_cm / π`.

**Health/condition data sparsity:** European cadastres often have incomplete or missing condition assessments. Basel and Geneva publish vitality scores; Zürich and Bern do not consistently include them in open datasets. The Green Area Inventory model treats `condition` as an optional field with a structured enum (1–5 scale) rather than a required field, reflecting this reality.

**Taxonomic structure variability:** Datasets vary significantly in how species are recorded. Some use binomial Latin names (genus + species), others only genus, and most include a local common name. Geneva additionally records cultivar. The Green Area Inventory model should support multi-level taxonomic fields: `genus` (mandatory for trees), `species` (optional), `cultivar` (optional), `commonNameDe` (recommended), `commonNameFr` (optional for bilingual cantons).

#### Dataset-Specific Details

**Zürich** (Baumkataster der Stadt Zürich): Digital since 2001 with positional accuracy <1cm to 30cm for street trees. Key fields: `Baumnummer`, `Quartier`, `Strasse`, `Baumgattung_lat`/`_deu`, `Baumart_lat`/`_deu`, `Pflanzjahr`, `Kronendurchmesser`, `BaumTyp` (Strassenbaum/Anlagebaum/Obstbaum). The WFS endpoint at `ogd.stadt-zuerich.ch/wfs/geoportal/Baumkataster` supports direct integration.

**Basel** (data.bs.ch): Best-documented Swiss GIS infrastructure: PostgreSQL database, Geomapfish for web publication, QGIS/FME for data maintenance, **QField for mobile field capture**, Python/R for analysis. Unique to Basel: the **Fäll- und Baumersatzliste** (dataset 100054) — a separate register of trees scheduled for felling and replacement within 6 months, validating the separation of Tree (inventory) from Task (planned actions) entities. Basel's Baumschutzgesetz makes trees legally protected, adding a `protectionStatus` dimension. Basel is also one of six Swiss cities piloting **i-Tree integration** for ecosystem service valuation.

**Geneva** (Inventaire Cantonal des Arbres, ~250,000 trees): Tracks the richest attribute set of any Swiss canton: géolocalisation du tronc et du sommet (trunk and crown top positions), diamètre du tronc, diamètre de la couronne, **surface et volume de canopée** (canopy area and volume), vitalité, espèce, hauteur. Geneva is exploring automated tree detection using LiDAR and hyperspectral imagery via the STDL (Swiss Territorial Data Lab) partnership with swisstopo.

#### Key Swiss Technical Standards for Geodata

| Standard | Scope | Green Area Inventory Relevance |
|----------|-------|-------------------------------|
| **eCH-0056 v3.0** | Anwendungsprofil Geodienste — legally binding under Art. 7 GeoIG | Green Area Inventory WMS/WFS services **must** comply if publishing to Swiss geodata infrastructure |
| **INTERLIS** | Switzerland's national geodata modeling standard | All BAFU geodata models use INTERLIS — export capability should be considered |
| **DCAT-AP CH** (eCH-0200 v2.0) | Dataset cataloging on opendata.swiss | Mandatory multilingual metadata (de/fr/it/en) and Swiss-specific license vocabulary (terms_open, terms_by, terms_ask, terms_by_ask) |

**Relevance to Green Area Inventory:** This analysis directly validates and refines the Tree entity schema. The recommended additions (`genus`, `commonNameDe`, `cultivar`) are noted in the Gap Analysis (Section 7).

---

### 3.4 GALK Strassenbaum-Liste (German Street Tree List)

| | |
|---|---|
| **Publisher** | GALK (Gartenamtsleiterkonferenz, Germany) |
| **URL** | https://www.galk.de/arbeitskreise/stadtbaeume/themenuebersicht/strassenbaumliste |

The GALK Strassenbaumliste is a curated and periodically updated list of tree species recommended for urban street planting in Central European conditions. It evaluates species against criteria including climate tolerance (heat, drought, frost), pest/disease resistance, root system compatibility, crown form and maintenance needs, and allergenicity. The list is widely used by Swiss municipalities (despite being a German publication) as a reference for species selection.

#### GALK Species Suitability Attributes

The GALK list evaluates species across structured dimensions: `botanischer_name`, `deutscher_name`, `wuchshoehe_m` (range), `kronenbreite_m` (range), `lichtdurchlaessigkeit` (stark/mittel/gering), `verwendbarkeit` (gut_geeignet/geeignet/geeignet_mit_einschraenkung/nicht_geeignet/noch_im_test). Extended attributes include boolean flags for `bienenweide` (bee forage — 134 species flagged), `bluetenbaum` (ornamental flowering), `stadtklimafest` (urban climate tolerant), `fruchtfall_beachten` (fruit drop safety concern), `rindennekrosen` (bark necrosis susceptibility), `bodenverdichtung_empfindlich` (soil compaction sensitivity), plus text descriptions for `trockenheitsvertraeglichkeit` (drought tolerance) and `streusalzempfindlichkeit` (salt sensitivity). These species-level attributes belong in a reference species table linked to Tree records, informing CareProfile decisions and climate-adaptive planting.

**Relevance to Green Area Inventory:** The GALK list could serve as a reference lookup for the Tree entity's `species` field, providing standardized species metadata including recommended use context and climate adaptation ratings. The list's emphasis on climate-resilient species aligns with the growing need for climate-adapted urban tree selection.

---

### 3.5 ~70 Standardized Care Profiles — Process Framework

Research confirmed that the GSZ «Mehr als Grün» Profilkatalog's 46 profiles represent a well-established but Zurich-specific baseline. Other Swiss municipalities use different profile catalogs:

| Municipality / Source | Number of Profiles | Notes |
|----------------------|-------------------|-------|
| GSZ Zürich | 46 | «Mehr als Grün» Profilkatalog (ZHAW/GSZ 2019) |
| Basel Stadtgärtnerei | 111 surface types | More granular; includes micro-habitat types |
| VSSG (generic) | ~30 | Simplified version for Grünstadt Schweiz label |
| BFH (Bern) | ~25 | Research-oriented; emphasis on biodiversity |

The Green Area Inventory model uses the GSZ 46-profile catalog as the default baseline but supports custom profiles through the CareProfile entity's open schema. Municipalities can add, modify, or replace profiles to match their local practice.

**Relevance to Green Area Inventory:** The flexible CareProfile entity already accommodates this variation. The 46 GSZ profiles serve as a sensible default; the `profileCode` field allows mapping to alternative classification systems.

---

## 4. Biodiversity & Ecosystem Services Frameworks

### 4.1 GBIF — Global Biodiversity Information Facility

| | |
|---|---|
| **Publisher** | GBIF Secretariat (Copenhagen) |
| **URL** | https://www.gbif.org/ |

GBIF provides the global infrastructure for sharing biodiversity occurrence data. The GBIF data model uses **Darwin Core** (DwC) as its core standard, with occurrence records structured as: `occurrenceID`, `scientificName`, `decimalLatitude`/`decimalLongitude`, `eventDate`, `basisOfRecord`, `institutionCode`, `collectionCode`.

Swiss occurrence data is contributed primarily via InfoSpecies (the Swiss data hub for species centers, including Infoflora for plants).

**Relevance to Green Area Inventory:** Tree species records in Green Area Inventory could be published as GBIF occurrence records using Darwin Core terms. The `species` field maps to `scientificName`; `lv95East`/`lv95North` convert to `decimalLatitude`/`decimalLongitude`; `plantingYear` maps to `eventDate`. This would contribute to national and global biodiversity monitoring. Medium priority.

---

### 4.2 Darwin Core — Species Observation Standard

| | |
|---|---|
| **Publisher** | Biodiversity Information Standards (TDWG) |
| **Standard** | Darwin Core (ISO/DIS 21742 in progress) |
| **URL** | https://dwc.tdwg.org/ |

Darwin Core defines a set of terms for sharing biodiversity data. The most relevant term categories for Green Area Inventory:

| DwC Category | Terms | Green Area Inventory Mapping |
|-------------|-------|----------------------|
| **Taxon** | `kingdom`, `family`, `genus`, `specificEpithet`, `infraspecificEpithet`, `vernacularName` | Tree species fields |
| **Occurrence** | `occurrenceID`, `individualCount`, `establishmentMeans` (native/introduced/invasive) | Tree records; neophyte status |
| **Event** | `eventDate`, `habitat`, `samplingProtocol` | Planting date, site type, survey method |
| **Location** | `decimalLatitude`, `decimalLongitude`, `coordinateUncertaintyInMeters`, `country`, `municipality` | Geometry + LV95 coordinates |

The `establishmentMeans` controlled vocabulary (native / introduced / naturalised / invasive / managed) is particularly relevant for neophyte tracking.

#### Simple Darwin Core CSV Example

```csv
occurrenceID,basisOfRecord,scientificName,genus,specificEpithet,eventDate,decimalLatitude,decimalLongitude,occurrenceStatus,individualCount
urn:uuid:a1b2c3d4,HumanObservation,Quercus robur L.,Quercus,robur,2024-06-15,47.3769,8.5417,present,3
```

**GBIF** extends Darwin Core with `gbifID`, `datasetKey` (UUID), `taxonKey` (integer backbone key), and the full taxonomic hierarchy (kingdom through species). Minimum publishing requirements: `occurrenceID`, `basisOfRecord`, `scientificName`, `eventDate`. Darwin Core terms standardize species identification across Tree entities and enable biodiversity observations to be linked to GreenArea records.

**Relevance to Green Area Inventory:** Darwin Core alignment enables biodiversity reporting and data sharing. The `establishmentMeans` vocabulary should inform the Tree entity's neophyte classification approach. Consider adding an `establishmentMeans` field to the Tree entity.

---

### 4.3 TEEB & CICES — Ecosystem Service Classification

| | |
|---|---|
| **TEEB** | The Economics of Ecosystems and Biodiversity (UNEP) |
| **CICES** | Common International Classification of Ecosystem Services (EEA) |
| **URL** | https://cices.eu/ |

CICES V5.1 provides a hierarchical classification of ecosystem services: Section → Division → Group → Class. Urban green space–relevant services include:

| CICES Section | Division | Urban Green Space Examples |
|--------------|----------|--------------------------|
| **Provisioning** | Biomass | Fruit from orchard trees; timber from park trees |
| **Regulation & Maintenance** | Mediation of flows | Stormwater retention (green roofs, permeable surfaces) |
| | Maintenance of physical conditions | Microclimate regulation (tree shading, evapotranspiration) |
| | Maintenance of lifecycle | Pollination services; pest control |
| **Cultural** | Physical interaction | Recreation, exercise, play |
| | Intellectual/spiritual | Aesthetic enjoyment, education, sense of place |

#### CICES Codes for Urban Green Space Services

Specific urban-relevant CICES class codes:

| CICES Code | Service | Green Area Inventory Mapping |
|-----------|---------|------------------------------|
| 2.2.6.1 | Carbon sequestration (regulation of atmospheric chemical composition) | Tree.co2SequestrationKgYr |
| 2.1.1.1 | Air filtration/sequestration by plants | Tree (computed from crown area) |
| 2.2.6.2 | Urban cooling (regulation of temperature/humidity via transpiration) | GreenArea / Tree canopy |
| 2.2.1.3 | Stormwater regulation (hydrological cycle and flood protection) | SurfaceArea.drainageType |
| 2.1.2.2 | Noise reduction (sound attenuation by vegetation) | LinearFeature (hedges), Woodland |
| 2.2.2.1 | Pollination and seed dispersal | GreenArea (meadow profiles) |
| 3.1.1.1 | Recreation (active/immersive interactions) | Site / Garden |
| 3.1.1.2 | Aesthetic appreciation (passive/observational interactions) | CareProfile.designRating |

#### InVEST Model Input Parameters

The **InVEST** suite (Natural Capital Project, Stanford) requires specific biophysical lookup parameters that could be stored as species-level or land-use-level attributes in Green Area Inventory:

| InVEST Model | Input Parameters | Data Source |
|-------------|-----------------|-------------|
| **Urban Cooling** | `kc` (vegetation coefficient, 0–1), `green_area` (boolean), `shade` (tree canopy proportion ≥2m, 0–1), `albedo` (reflectivity, 0–1) | Per land-use type |
| **Carbon** | `c_above`, `c_below`, `c_soil`, `c_dead` (all in tonnes C/ha) | Per land-use type |
| **Urban Flood** | SCS Curve Numbers `CN_A` through `CN_D` | Per hydrologic soil group |

**Relevance to Green Area Inventory:** CICES provides the classification backbone for ecosystem service reporting. If Green Area Inventory adds ecosystem service fields (from i-Tree or local models), the CICES taxonomy provides a standardized reporting structure. The TEEB framework provides monetary valuation methods for these services. InVEST model parameters could enable ecosystem service estimation directly from inventory data.

---

### 4.4 EU Pollinator Monitoring Scheme (EU-PoMS)

| | |
|---|---|
| **Publisher** | European Commission / JRC |
| **URL** | https://wikis.ec.europa.eu/display/EUPKH/EU+Pollinator+Monitoring+Scheme |

EU-PoMS defines standardized protocols for monitoring pollinator abundance and diversity. The data structure includes: site description (land use, management intensity), transect walks (date, weather, observer), and species counts by functional group (bumblebees, butterflies, hoverflies).

**Relevance to Green Area Inventory:** Pollinator monitoring transects could be linked to GreenArea entities. The `careProfileId` assignment (extensive meadow vs. intensive lawn) directly correlates with pollinator habitat quality. This is a future extension relevant for Grünstadt Schweiz biodiversity documentation.

---

## 5. Existing Software Platforms & Their Data Models

### 5.1 R3GIS GreenSpaces

| | |
|---|---|
| **Vendor** | R3GIS (Bolzano, Italy) |
| **Market** | Italy, Switzerland, Austria, Germany, Poland, and other European markets |
| **URL** | https://www.r3gis.com/greenspaces |
| **Type** | Commercial SaaS (Web + Mobile) |

GreenSpaces is the closest commercial reference system to Green Area Inventory. It manages all elements of green areas in a spatial database with maintenance planning, issue tracking, and tree/playground assessments.

**Core data model entities:**

| GreenSpaces Entity | Green Area Inventory Equivalent | Notes |
|--------------------|--------------------------|-------|
| Sites (classified, with homogeneous zones) | Site | Includes ISTAT classification (Italy), homogeneous management zones |
| Trees (with VTA assessment) | Tree | Full VTA protocol: root, collar, trunk, crown, branches. Species, diameter, height. |
| Green areas | GreenArea | Polygon-based area management |
| Furniture / Equipment | Furniture | Benches, play equipment, sports equipment |
| Playgrounds | (Furniture subtype) | Dedicated inspection workflows per DIN EN 1176/1177 |
| Jobs / Maintenance | CareAction / Task | Planning, scheduling, assignment to operators |
| Assessments / Inspections | (Future ConditionAssessment) | Tree risk assessment (VTA), playground inspection |

**Key differentiators of GreenSpaces vs. Green Area Inventory:**

- **VTA tree inspection workflows** — fully integrated Visual Tree Assessment with standardized damage zones and automatic action generation
- **i-Tree ecosystem services** — calculates CO₂ sequestration, cooling effect, stormwater interception, air quality improvement per tree/species using i-Tree Eco coefficients
- **Digital twins integration** — partnership with greehill for LiDAR-based 3D tree models (trunk diameter via smartphone LiDAR)
- **Public transparency portal** — citizen-facing module showing tree inventory, species, eco-benefits on interactive map
- **HUGSI integration** — Husqvarna Urban Green Space Index for city-level benchmarking
- **Enterprise multi-tenant** — supports multiple municipalities/domains in one instance

**Notable adopters:** Rome, Padua, Bolzano, Rimini, Krakow, Hamburg (Schulbau), and numerous Swiss municipalities.

**Relevance to Green Area Inventory:** GreenSpaces validates the Green Area Inventory entity structure. Key gaps to consider: VTA inspection protocol, ecosystem service calculations, and a public-facing portal component.

---

### 5.2 OpenTreeMap (Azavea)

| | |
|---|---|
| **Vendor** | Azavea (Philadelphia, USA) / Open Source |
| **URL** | https://www.opentreemap.org / https://github.com/OpenTreeMap/otm-core |
| **Type** | Open Source (Python/Django/PostGIS) + Subscription SaaS |

OpenTreeMap is a collaborative platform for crowdsourced tree inventory with ecosystem services calculations using i-Tree. Its data model is simpler and tree-focused:

| OpenTreeMap Entity | Green Area Inventory Equivalent | Notes |
|--------------------|--------------------------|-------|
| Plot (point location) | Site (simplified) | Location container for one or more trees |
| Tree | Tree | Species, diameter (DBH), date planted, condition, canopy height |
| Species | (lookup table) | With i-Tree eco-benefit parameters |
| Stewardship | CareAction / Task | Watering, mulching, pruning activities |
| Eco-benefits | (not modeled) | Calculated on-the-fly: stormwater, CO₂, air quality, energy |
| Bioswales / Rain gardens | (not modeled) | Green infrastructure elements |

**Key features:** crowdsourced data collection, i-Tree integration, public map visualization, data quality checks (duplicate detection, user reputation).

**Relevance to Green Area Inventory:** Much simpler than Green Area Inventory (no care profiles, contracts, or cost tracking). However, the i-Tree integration pattern and crowdsourcing approach are useful reference points. The open-source data model (Django ORM) is available for inspection.

---

### 5.3 ARCHIKART / Green GIS Baum (DACH market)

| | |
|---|---|
| **Vendor** | ARCHIKART Software AG / Green GIS GmbH |
| **Market** | Germany (municipalities, housing associations) |
| **URL** | https://www.archikart.de/baumkataster/ / https://www.green-gis.de/ |
| **Type** | Desktop + Mobile (INGRADA framework) |

German municipal green space management systems with strong FLL compliance:

- **Baumkataster** — tree cadastre with FLL-Baumkontrollrichtlinie-compliant inspection workflows
- **Grünflächenkataster** — green area cadastre with care districts (Pflegebezirke), area types, and maintenance scheduling
- **Spielplatzkataster** — playground cadastre with DIN EN 1176/1177 inspection protocols
- Flexible inspection catalogs (Kontrollkataloge) customizable per municipality
- Task and work order management (Auftragsmanagement) with contractor assignment
- Mobile field data collection with offline GPS support

**Relevance to Green Area Inventory:** Validates the combined Baumkataster + Grünflächenkataster approach. The flexible inspection catalog concept could inform a future configurable ConditionAssessment entity.

---

### 5.4 Basel Stadtgärtnerei (Swiss Reference Implementation)

| | |
|---|---|
| **Organization** | Stadtgärtnerei Basel-Stadt |
| **Stack** | PostgreSQL + Geomapfish + QGIS + FME |
| **URL** | https://www.bs.ch/bvd/grundbuch-und-vermessungsamt/geo/news-veranstaltungen/gis-stg |

Basel's municipal green space GIS is a noteworthy Swiss reference:

- **261 ha** of managed green spaces categorized into **111 surface types** (vs. Green Area Inventory's 46 GSZ profiles)
- **Baumkataster** — tree cadastre with dedicated Geomapfish input application
- **i-Tree pilot** — one of six Swiss pilot cities quantifying ecosystem services of urban trees
- **Remote sensing** — investigating LiDAR/satellite data for canopy health monitoring
- **Technology stack:** PostgreSQL database, Geomapfish for web publication, QGIS and FME for data maintenance, Python/R for analysis

**Relevance to Green Area Inventory:** Very close to the target use case. Basel's 111-type classification is more granular than GSZ's 46-profile catalog. The i-Tree integration and remote sensing ambitions point toward future capabilities. The PostgreSQL + QGIS + FME stack mirrors common Swiss municipal GIS infrastructure.

---

### 5.5 Geoinfo / Geodaten Online (Swiss market)

| | |
|---|---|
| **Vendor** | Geoinfo AG / Geocom Informatik AG |
| **Market** | Swiss municipalities |
| **URL** | https://www.geoinfo.ch/loesungen/baumkataster/ / https://www.geodatenonline.ch/anwendungen/baumkataster/ |
| **Type** | Web GIS (GEOGrün framework) |

Swiss-specific Baumkataster and Grünflächen solutions built on the GEOGrün framework:

- Tree cadastre with species, inspection, and maintenance workflows
- Visual differentiation by tree type (deciduous, coniferous, fruit, shrub)
- Inspection-based defect tracking with linked maintenance actions
- Swiss coordinate system (LV95) native support

**Relevance to Green Area Inventory:** Confirms market demand for Swiss-specific green space GIS. Simpler than Green Area Inventory but validates the core entity model.

---

### 5.6 International Open Tree Datasets — Lessons Learned

Analysis of 10+ open municipal tree datasets from cities including New York (~666K trees, TreesCount), Paris (~200K, Arbres), London (i-Tree Eco surveys), Vienna (~200K, Baumkataster), Berlin (~900K, Straßenbäume + Anlagenbäume), Melbourne (~80K, Urban Forest), Montreal (~300K), and the Swiss datasets revealed critical inconsistencies that informed the Green Area Inventory data model:

| Issue | Cities Affected | Green Area Inventory Design Decision |
|-------|----------------|-------------------------------|
| DBH in inches vs. circumference in cm | NYC vs. all European | Store `trunkCircumferenceCm` (Swiss standard); derive DBH for i-Tree |
| Missing height data | Paris, Berlin, Melbourne | `heightM` is optional (not mandatory) |
| Inconsistent species encoding | All | Support `genus` + `species` + `cultivar` + `commonNameDe` separately |
| Binary vs. scaled condition | NYC (Good/Fair/Poor/Dead) vs. Vienna (1–9) | Use 1–5 enum scale with clear definitions |
| Missing planting year | Paris, Berlin (partial) | `plantingYear` is optional |
| No crown data | Bern, Berlin | `crownDiameterM` is optional |

#### Dataset-Specific Field Highlights

**NYC TreesCount 2015** (41-field schema): Includes granular problem detection fields absent in European datasets: `root_stone`, `root_grate`, `root_other`, `trnk_wire`, `trnk_light`, `trnk_other`, `brnch_ligh`, `brnch_shoe`, `brnch_othe` (all Yes/No), plus `health` (Good/Fair/Poor), `status` (Alive/Dead/Stump), `sidewalk` (NoDamage/Damage), and `steward` (None/1or2/3or4/4orMore). These map to structured condition assessments in CareAction rather than flat Tree fields.

**Vienna** (data.gv.at, CC BY 4.0): Records `STAMMUMFANG` (trunk circumference in cm at 1m height), `KRONENDURCHMESSER` (crown diameter, m), `BAUMHOEHE` (height, m), `PFLANZJAHR` (planting year), `BAUMGATTUNGLAT`/`BAUMARTLAT` (genus/species Latin).

**Berlin** (daten.berlin.de, 900K+ trees): Adds `STANDALTER` (derived age in years), `TYP` (Straßenbaum vs. Anlagenbaum), and `GATTUNG_DEUTSCH`/`ART_DEUTSCH` (German names).

**Paris** (opendata.paris.fr, ODbL): Uniquely includes `stadedeveloppement` with four maturity stages (Jeune/Adulte/Mature/Vieux), `varieteoucultivar`, and `remarquable` (OUI/NON for heritage trees).

**Melbourne**: Adds `Useful_Life_Expectancy` (Short/Medium/Long) — a field directly relevant to CareProfile planning.

#### Design Implications

- **Trunk measurement**: Store both `trunkDiameter` (DBH in cm) and `trunkCircumference` (cm), with automatic conversion (circumference ÷ π = diameter)
- **Species taxonomy**: Support separate fields for `genus`, `species`, `cultivar`, `commonNameLocal`, and `scientificName` (full binomial). Paris's 4-level taxonomy (genre/espece/varieteoucultivar/libellefrancais) is the most complete
- **Maturity stage**: Consider an enum field with values aligned across datasets: Juvenile, Semi-mature/Adult, Mature, Over-mature/Old, Senescent
- **Coordinate systems**: Store WGS84 (EPSG:4326) as primary with mandatory Swiss LV95 (EPSG:2056) support
- **Health/condition**: Make optional but structured — enum values Excellent through Dead, harmonized across i-Tree (7-level) and NYC (3-level) scales

**Relevance to Green Area Inventory:** These lessons directly shaped the Tree entity's field optionality and type choices. The model is designed to accept data at varying levels of completeness, reflecting the reality of municipal tree inventories.

---

## 6. Technology Patterns & Data Exchange

### 6.1 GeoPackage — Offline Mobile Data Collection

| | |
|---|---|
| **Standard** | OGC GeoPackage Encoding Standard (12-128r18) |
| **URL** | https://www.geopackage.org/ |

GeoPackage is an SQLite-based container for vector features, tile matrix sets, and attributes. It is the recommended format for offline mobile green space data collection because it supports spatial indexing, multiple layers per file, attribute storage including enumerations, and works natively with QGIS, FME, and most mobile GIS apps.

#### GeoPackage SQL Example — Tree Inventory Table

GeoPackage system tables include `gpkg_spatial_ref_sys` (CRS definitions), `gpkg_contents` (data table registry with data_type 'features'/'tiles'/'attributes'), and `gpkg_geometry_columns`. User feature tables store tree inventories and inspection records:

```sql
CREATE TABLE trees (
  fid INTEGER PRIMARY KEY AUTOINCREMENT,
  geom POINT,
  tree_id TEXT NOT NULL,
  species TEXT,
  planting_year INTEGER,
  trunk_circ_cm INTEGER,
  condition_grade INTEGER,
  last_inspection DATE
);
```

The proven workflow: export GeoPackage with base layers + empty inspection templates → offline fieldwork on tablet (QField, Mergin Maps) → sync back to server. Basel's Stadtgärtnerei uses QField + PostgreSQL + FME for their entire Baumkataster workflow.

**Relevance to Green Area Inventory:** The mobile data collection module (MO requirements) should support GeoPackage as an offline exchange format. A field worker could download a site's data as GeoPackage, collect observations and measurements offline, and sync back to the central system.

---

### 6.2 OGC API Features — Green Space Data Services

| | |
|---|---|
| **Standard** | OGC API — Features — Part 1: Core (17-069r4) |
| **URL** | https://ogcapi.ogc.org/features/ |

The successor to WFS, OGC API Features provides a RESTful, JSON-native API for serving vector features. Swiss federal geodata infrastructure (BGDI/geo.admin.ch) is progressively adopting OGC API endpoints alongside legacy WMS/WFS.

Each Green Area Inventory entity type becomes a collection (`trees`, `green_areas`, `inspections`, `tasks`). Part 2 adds CRS support for Swiss LV95 (EPSG:2056); Part 3 adds CQL2 filtering (e.g., `filter=condition_grade>=3 AND species LIKE 'Tilia%'`).

#### OGC API Features JSON Example

```json
{
  "type": "FeatureCollection",
  "numberMatched": 347,
  "numberReturned": 10,
  "features": [{
    "type": "Feature",
    "id": "tree-00142",
    "geometry": { "type": "Point", "coordinates": [8.5417, 47.3769] },
    "properties": {
      "species": "Tilia cordata",
      "planting_year": 1998,
      "height_m": 14.5,
      "condition_grade": 2,
      "safety_status": "gegeben"
    }
  }],
  "links": [{ "href": "…?offset=10&limit=10", "rel": "next" }]
}
```

**Relevance to Green Area Inventory:** A production Green Area Inventory instance should expose its spatial entities via OGC API Features for interoperability with cantonal GIS, QGIS workstations, and federal reporting. The API's CQL2 filtering supports the spatial and temporal queries needed for green space analysis.

---

### 6.3 DCAT-AP CH — Metadata for Green Space Datasets

| | |
|---|---|
| **Standard** | DCAT-AP CH 2.0 (based on DCAT-AP 2.1.0) |
| **Publisher** | I14Y Interoperability Platform / BFS |
| **URL** | https://www.i14y.admin.ch/ |

DCAT-AP CH defines the Swiss metadata profile for open data catalog entries on opendata.swiss and the I14Y interoperability platform. Any Green Area Inventory dataset published as open data should include a DCAT-AP CH–compliant metadata record.

DCAT-AP CH uses Swiss-specific mandatory multilingual metadata (de/fr/it/en) and a Swiss license vocabulary: `terms_open`, `terms_by`, `terms_ask`, `terms_by_ask`.

**Relevance to Green Area Inventory:** When municipalities publish their tree or green space inventories as open data (as Zürich, Basel, Bern, and Geneva already do), the metadata should follow DCAT-AP CH. The I14Y data element registry could host Green Area Inventory's canonical attribute definitions.

---

### 6.4 FME Workflows — Data Transformation

| | |
|---|---|
| **Platform** | FME (Safe Software) |
| **Usage** | Standard ETL tool in Swiss municipal and cantonal GIS |

FME is the dominant data transformation platform in Swiss geodata infrastructure. Common green space workflows include: importing tree inventories from CSV/Excel to PostGIS, converting between LV95 and WGS84, generating GeoJSON/GeoPackage exports, synchronizing with i-Tree Eco, and producing DCAT-AP CH metadata.

**Relevance to Green Area Inventory:** The DATAMODEL.md already defines transformation rules (Appendix B). FME workflows would be the standard tool for production data integration, migration from legacy systems, and open data publication.

---

## 7. Gap Analysis & Recommendations

Based on the comprehensive research, the Green Area Inventory data model is well-aligned with international practices. The following enrichments are recommended:

### 7.1 Potential Enrichments

| Priority | Gap | Reference Standard / Source | Suggested Change | Affected Entity |
|----------|-----|----------------------------|------------------|-----------------|
| **High** | VTA tree inspection protocol | FLL Baumkontrollrichtlinie, R3GIS GreenSpaces | Formalize future ConditionAssessment entity with standardized VTA inspection zones (Wurzel, Stammfuss, Stamm, Krone, Äste) and damage categories | Tree, [Preview] ConditionAssessment |
| **High** | Ecosystem services fields | i-Tree Eco, R3GIS GreenSpaces, OpenTreeMap | Add optional computed fields for CO₂ sequestration (kg/yr), cooling effect, stormwater retention per tree. Store raw dendrometric data; calculate services on demand. | Tree, GreenArea |
| **High** | Multi-level taxonomy | Swiss open tree datasets, Darwin Core, GALK | Add `genus` (mandatory for trees), `cultivar` (optional), `commonNameDe` (recommended), `commonNameFr` (optional) fields alongside existing `species` | Tree |
| **High** | EU NRR baseline tracking | EU Nature Restoration Regulation 2024/1991 | Ensure temporal versioning supports no-net-loss calculations. Add aggregate metrics (total green area, total canopy cover) at Site/municipality level. | Site, Tree, GreenArea |
| **Medium** | CityGML interoperability | OGC CityGML 3.0, Vegetation ADE | Add optional `cityGmlClass` field to spatial entities for 3D city model interoperability | Site, Tree, GreenArea, Furniture |
| **Medium** | Playground safety inspection | DIN EN 1176/1177, R3GIS GreenSpaces, ARCHIKART | If playground equipment is in scope, add inspection protocol fields to Furniture entity | Furniture |
| **Medium** | Biodiversity indicators | GSZ «Mehr als Grün», BAFU Biodiversitätsstrategie, IUCN Singapore Index | Add biodiversity score or species richness count at Site or GreenArea level | Site, GreenArea |
| **Medium** | Darwin Core alignment | GBIF, TDWG, Infoflora | Add `establishmentMeans` (native/introduced/invasive) to Tree entity for neophyte classification | Tree |
| **Medium** | Schema.org export | Schema.org Park | Enable JSON-LD export of Sites as Schema.org Park objects for public discoverability | Site (export) |
| **Low** | Soil profile data | ISO 28258, FLL substrate guidelines | Add structured soil data for green roofs and tree planting contexts | GreenArea |
| **Low** | Climate adaptation metrics | WHO guidelines, urban heat island studies | Add canopy cover percentage and heat reduction potential at Site level | Site |
| **Low** | Public transparency portal | R3GIS GreenSpaces Green City module, Schema.org | Consider a read-only public-facing data view (no model change needed, but inform API design) | — (architecture) |
| **Low** | Crowdsourced reporting | Open311 GeoReport v2, OpenTreeMap | Consider a citizen issue reporting flow using Open311 API contract | [Preview] Issue |
| **Low** | IoT sensor integration | OGC SensorThings API, FIWARE GreenspaceRecord | Define SensorThings-compatible extension for soil moisture, weather, dendrometer data | — (future extension) |

#### Consolidated Entity Enrichment Recommendations

Based on cross-referencing all standards and municipal datasets:

**Tree entity:** `genus` + `species` + `cultivar` + `scientificName` + `commonNameLocal` (from Paris/GBIF); `trunkCircumference` alongside `trunkDiameter` (European convention); `crownBaseHeight` + `crownMissingPercent` + `crownHealth` + `crownLightExposure` (i-Tree Eco); `maturityStage` enum (Juvenile/Semi-mature/Mature/Over-mature/Senescent from Melbourne/Paris); `isStreetTree` + `isRemarkable` + `protectionStatus` (from Paris/Geneva/Basel Baumschutzgesetz); `sidewalkConflict` + `utilityConflict` (from i-Tree/NYC).

**CareProfile:** Q-Index quality dimensions (`usageQuality`, `ecologyQuality`, `designQuality`, `aestheticsQuality`, `costEfficiency` — from ZHAW); `maintenanceStrategy` enum (from ISO 55000); `kontrollintervall` (6/12/24 months from FLL); `conditionGrade` (1–5 from ISO 55000/FLL).

**CareAction:** FLL inspection structure with `inspectionType`, `inspectorCertificate`, `vitalityRoloff` (0–3), `trafficSafety` enum, `standSicherheit`, `bruchSicherheit`; structured defect symptom checklists per tree zone (crown/trunk/base/roots).

**Task:** `urgency` enum (sofort/kurzfristig/mittelfristig/langfristig from FLL); `measureType` enum (from FLL Maßnahmen); Open311 integration fields for citizen reporting.

**Site:** `greenSpacePercent`, `treeCanopyCoverPercent` (for EU NRR reporting); `greenSpacePerCapita` (WHO metric); `accessibilityCompliant` (SIA 500).

**Cost:** `compensatoryValue` + `ecosystemServiceValueAnnual` (from i-Tree); CICES classification codes for service categories.

### 7.2 Alignment Matrix

How Green Area Inventory entities map to the key standards and frameworks:

| Green Area Inventory Entity | CityGML 3.0 | INSPIRE | FLL | i-Tree Eco | FIWARE | Darwin Core | R3GIS |
|----------------------|-------------|---------|-----|-----------|--------|-------------|-------|
| **Site** | CityObjectGroup | — | — | Plot/Land Use | Garden | Event/Location | Sites |
| **GreenArea** | PlantCover | Land Cover | ZTV-Baumpflege | Ground Cover | FlowerBed | — | Green areas |
| **Tree** | SolitaryVegetationObject | Species Distribution | Baumkontrollrichtlinie | Tree (full schema) | — | Occurrence/Taxon | Trees (VTA) |
| **LinearFeature** | — | — | — | — | — | — | — |
| **Furniture** | CityFurniture | — | Spielplatzprüfung | — | — | — | Furniture |
| **StructureElement** | GenericCityObject | — | — | — | — | — | — |
| **SurfaceArea** | LandUse | Land Cover / Land Use | — | — | — | — | — |
| **WaterFeature** | WaterBody | Hydrography | — | — | — | — | — |
| **CareProfile** | — (via ADE) | — | ZTV-Baumpflege, FLL guidelines | — | — | — | Maintenance templates |
| **CareAction** | — (via Dynamizer) | — | ZTV-Baumpflege | Maintenance recommended | GreenspaceRecord | — | Jobs |
| **Task** | — | — | — | — | — | — | Work orders |
| **Contact** | — | — | — | — | — | — | Users / Operators |
| **Contract** | — | — | — | — | — | — | Service contracts |
| **Document** | ExternalReference | — | — | — | — | — | Attachments |
| **Cost** | — | — | — | Replacement value | — | — | — (external) |

---

## 8. References

### International Standards & Frameworks

| Source | Title | Year | URL |
|--------|-------|------|-----|
| OGC | CityGML 3.0 Conceptual Model Standard | 2024 | https://docs.ogc.org/is/20-010/20-010.html |
| OGC | CityGML 3.0 Users Guide | 2024 | https://docs.ogc.org/guides/20-066.html |
| ISPRS Archives | Towards a Conceptual Model of CityGML 3.0 Vegetation ADE | 2024 | https://isprs-archives.copernicus.org/articles/XLVIII-4-W10-2024/155/2024/ |
| European Commission | INSPIRE Data Specification on Land Cover | 2013 | https://inspire-mif.github.io/technical-guidelines/data/lc/dataspecification_lc.pdf |
| European Commission | INSPIRE Data Specification on Land Use | 2013 | https://inspire-mif.github.io/technical-guidelines/data/lu/dataspecification_lu.pdf |
| European Commission | INSPIRE Data Specification on Protected Sites | 2010 | https://knowledge-base.inspire.ec.europa.eu/publications/inspire-data-specification-protected-sites-technical-guidelines_en |
| European Parliament | Regulation (EU) 2024/1991 — Nature Restoration Regulation | 2024 | https://eur-lex.europa.eu/eli/reg/2024/1991/oj |
| FLL | Baumkontrollrichtlinie | 2020 | https://www.fll.de/ |
| FLL | Guidelines for the Planning, Construction and Maintenance of Green Roofing | 2018 | https://www.fll.de/ |
| SIA | SIA 318:2009 — Garten- und Landschaftsbau | 2009 | https://shop.sia.ch/ |
| DIN | DIN 18916–18920 — Vegetationstechnik im Landschaftsbau | various | https://www.din.de/ |
| ISO | ISO 19157-1:2023 — Geographic information — Data quality | 2023 | https://www.iso.org/standard/78900.html |
| ISO | ISO 55000:2014 — Asset management — Overview, principles and terminology | 2014/2024 | https://www.iso.org/standard/55088.html |
| ISO | ISO 28258:2013 — Soil quality — Digital exchange of soil-related data | 2013 | https://www.iso.org/standard/44595.html |
| buildingSMART | IFC 4.3 (ISO 16739-1:2024) | 2024 | https://standards.buildingsmart.org/IFC/ |
| USDA Forest Service | i-Tree Eco — Urban Forestry Analysis | — | https://www.itreetools.org/ |
| UN-Habitat | SDG 11.7.1 — Urban Green Space Indicator | 2018 | https://unhabitat.org/sdg-indicator-1171-training-module |
| WHO Europe | Urban green spaces and health — A review of evidence | 2016 | https://www.who.int/europe/publications/i/item/9789289052153 |
| IUCN / CBD | Singapore Index on Cities' Biodiversity | 2014 | https://www.nparks.gov.sg/biodiversity/singapore-index-on-cities-biodiversity |

### Open Data Models & Integration Standards

| Source | Title | Year | URL |
|--------|-------|------|-----|
| Schema.org | Park — Schema.org Type | — | https://schema.org/Park |
| FIWARE | Smart Data Models — Parks and Gardens | — | https://github.com/smart-data-models/dataModel.ParksAndGardens |
| Open311 | GeoReport v2 Specification | — | https://wiki.open311.org/GeoReport_v2/ |
| OGC | SensorThings API Part 1: Sensing | 2016 | https://www.ogc.org/standard/sensorthings/ |
| OGC | OGC API — Features — Part 1: Core | 2019 | https://ogcapi.ogc.org/features/ |
| OGC | GeoPackage Encoding Standard | 2014 | https://www.geopackage.org/ |

### Biodiversity & Ecosystem Services

| Source | Title | Year | URL |
|--------|-------|------|-----|
| GBIF | Global Biodiversity Information Facility | — | https://www.gbif.org/ |
| TDWG | Darwin Core Standard | — | https://dwc.tdwg.org/ |
| EEA | CICES V5.1 — Common International Classification of Ecosystem Services | 2018 | https://cices.eu/ |
| UNEP | TEEB — The Economics of Ecosystems and Biodiversity | — | http://teebweb.org/ |
| European Commission | EU Pollinator Monitoring Scheme (EU-PoMS) | — | https://wikis.ec.europa.eu/display/EUPKH/EU+Pollinator+Monitoring+Scheme |

### Swiss-Specific Sources

| Source | Title | Year | URL |
|--------|-------|------|-----|
| ZHAW / Grün Stadt Zürich | Profilkatalog naturnahe Pflege «Mehr als Grün» | 2019 | — |
| ZHAW / Grün Stadt Zürich | Praxishandbuch naturnahe Pflege «Mehr als Grün» | 2019 | — |
| VSSG | Grünstadt Schweiz® — Qualitätslabel | — | https://www.gruenstadt-schweiz.ch/ |
| GALK | Strassenbaumliste | updated regularly | https://www.galk.de/arbeitskreise/stadtbaeume/themenuebersicht/strassenbaumliste |
| BAFU | Aktionsplan Strategie Biodiversität Schweiz | 2017 | — |
| Infoflora | Schwarze Liste und Watch List invasiver Neophyten | ongoing | https://www.infoflora.ch/ |
| swisstopo | DMAV Bodenbedeckung V1.0 | 2024 | https://www.cadastre-manual.admin.ch/ |
| Schweizerischer Bundesrat | VAV (SR 211.432.2) | 1992 | https://www.fedlex.admin.ch/eli/cc/1992/2446_2446_2446/de |
| eCH | eCH-0056 v3.0 — Anwendungsprofil Geodienste | 2021 | https://www.ech.ch/ |
| eCH | eCH-0200 v2.0 — DCAT-AP CH | 2021 | https://www.ech.ch/ |
| SIA | SIA 118/318:2009 — Allgemeine Bedingungen für Garten- und Landschaftsbau | 2009 | https://shop.sia.ch/ |
| SIA | SIA 312 — Begrünung von Dächern | — | https://shop.sia.ch/ |
| swisstopo / STDL | Swiss Territorial Data Lab | — | https://www.stdl.ch/ |
| ISRIC | ISO 28258 PostgreSQL Reference Implementation | — | https://github.com/ISRICWorldSoil/iso-28258 |
| ISO | ISO 55013:2024 — Asset management — Data quality | 2024 | https://www.iso.org/ |
| Natural Capital Project | InVEST — Integrated Valuation of Ecosystem Services and Tradeoffs | — | https://naturalcapitalproject.stanford.edu/software/invest |
| SEDAC/CIESIN | SDG 11.7.1 Open Public Spaces Dataset | 2023 | https://sedac.ciesin.columbia.edu/ |
| EU | EU Biodiversity Strategy for 2030 | 2020 | https://environment.ec.europa.eu/strategy/biodiversity-strategy-2030_en |

### Software Platforms

| Source | Title | Year | URL |
|--------|-------|------|-----|
| R3GIS | GreenSpaces — Urban Green Management Solution | — | https://www.r3gis.com/greenspaces |
| Azavea | OpenTreeMap | — | https://www.opentreemap.org / https://github.com/OpenTreeMap/otm-core |
| ARCHIKART | Baumkataster Software | — | https://www.archikart.de/baumkataster/ |
| Green GIS | Grünflächenmanagement | — | https://www.green-gis.de/ |
| Stadtgärtnerei Basel-Stadt | Geoinformation in der Stadtgärtnerei | 2025 | https://www.bs.ch/ |
| Geoinfo AG | Baumkataster | — | https://www.geoinfo.ch/loesungen/baumkataster/ |

### Open Tree Datasets

| City | Trees | Portal | URL |
|------|-------|--------|-----|
| Zürich | ~80,000 | Open Data Zürich | https://data.stadt-zuerich.ch/ |
| Basel | ~28,000 | Open Data Basel-Stadt | https://data.bs.ch/ |
| Bern | ~21,000 | Geoportal Bern | https://map.bern.ch/ |
| Geneva | ~250,000 | SITG | https://ge.ch/sitg/ |
| New York | ~680,000 | NYC Open Data (TreesCount) | https://data.cityofnewyork.us/ |
| Paris | ~200,000 | Open Data Paris (Les Arbres) | https://opendata.paris.fr/ |
| Vienna | ~190,000 | Open Data Wien | https://www.data.gv.at/ |
| Berlin | ~430,000 | Baumkataster Berlin | https://daten.berlin.de/ |
| Melbourne | ~80,000 | Urban Forest Visual | https://data.melbourne.vic.gov.au/ |
| Montreal | ~300,000 | Données ouvertes Montréal | https://donnees.montreal.ca/ |
| London | i-Tree survey | i-Tree Eco London | https://www.london.gov.uk/ |

### Practice Literature (Fachliteratur)

| Nr. | Autor(en) | Jahr | Titel | Verlag / Quelle | URL |
|-----|-----------|------|-------|-----------------|-----|
| 1 | AquaPlus AG | 2020 | Potenzialstudie Ökologische Uferaufwertung Zürcher Seebecken. Nr. 1919-B-01 | Zürich und Zug | |
| 2 | Bauer, D., Thiel, M., Kirpach, J.-C. & Klein, M. | 2018 | Leitfaden Naturnahe Anlage und Pflege von Parkplätzen | Luxembourg | [Link](https://environnement.public.lu/dam-assets/fr/conserv_nature/publications/naturnahe_anlage_parkplaetzen/Brochure_naturnahe_anlage_parkplaetzen.pdf) |
| 3 | Baunormenlexikon | 2018 | DIN 18035-4/201 Sportplätze – Teil 4: Rasenflächen | | |
| 4 | bauwion | 2021a | Sportplatzbeläge. BauWissenOnline | Von Architekten und Ingenieuren | [Link](https://www.bauwion.de/wissen/aussenraum/befestigte-flaechen/615-sportplatzbelaege) |
| 5 | bauwion | 2021b | Tennenbelag. BauWissenOnline | Von Architekten und Ingenieuren | [Link](https://www.bauwion.de/begriffe/tennenbelag) |
| 6 | bauwion | 2021c | Sandsportfläche. BauWissenOnline | Von Architekten und Ingenieuren | [Link](https://www.bauwion.de/begriffe/sandsportflache) |
| 7 | Bio Suisse (Hrsg.) | 2018 | Richtlinien für die Erzeugung, Verarbeitung und den Handel von Knospe-Produkten – Fassung vom 1. Januar 2018 | Bio Suisse | [Link](https://www.bio-suisse.ch/dam/jcr:629af7e5-2c50-42e6-9ef9-eb9eba07b796/rili_2018_DE_full.pdf) |
| 8 | FLL | 2014 | Sportplatzpflegerichtlinien – Richtlinien für die Pflege und Nutzung von Sportanlagen im Freien | | |
| 9 | BirdLife | 2006 | Kleinstrukturen-Praxismerkblatt 3: Trockenmauern | Zürich: Schweizer Vogelschutz SVS/BirdLife Schweiz | [Link](http://www.birdlife.ch/sites/default/files/documents/trockenmauern.pdf) |
| 10 | Brack, F., Hagenbuch, R., Wildhaber, T., Henle, C. & Sadlo, F. | 2019 | Mehr als Grün! – Praxismodule Naturnahe Pflege: Profilkatalog | Wädenswil: ZHAW, Forschungsgruppe Freiraummanagement (unveröffentlicht) | |
| 11 | Brinkforth, B. | 1995 | Bodendecker für Gärten und Parkanlagen | Stuttgart: Ulmer | |
| 12 | Delarze, R., Gonseth, Y. & Galland, P. | 2008 | Lebensräume der Schweiz: Ökologie, Gefährdung, Kennarten (2., vollständig überarbeitete Auflage) | Thun: Ott | |
| 13 | EDI | 2017 | Verordnung des EDI über Trinkwasser sowie Wasser in öffentlich zugänglichen Bädern und Duschanlagen (TBDV) | | [Link](https://www.fedlex.admin.ch/eli/cc/2017/153/de) |
| 14 | Eppel-Hotz, A. et al. | 2016 | Pflegereduzierte Grünflächen: Attraktive und wirtschaftliche Lösungen mit Stauden und Ansaaten | Merching: Forum Verlag Herkert GmbH | |
| 15 | Franke, W. et al. | 2015 | Das grosse BLV Handbuch Garten: Expertenwissen zu allen Fragen der Gartenpraxis (10. Auflage) | München: BLV | |
| 16 | Heinrich, A. & Messer, U. J. | 2017 | Staudenmischpflanzungen | Stuttgart: Eugen Ulmer KG | |
| 17 | Hilgenstock, F. & Witt, R. | 2004 | Das Naturgarten-Baubuch | München: Callwey | |
| 18 | Grün Stadt Zürich | 2021 | Immobilienstrategie – Gebäude von Grün Stadt Zürich | Zürich | |
| 19 | Inderwildi, E. & Glauser, C. | 2017 | Wasser im Siedlungsraum | BirdLife Schweiz | |
| 20 | Iseli, C. | 2012 | Verbaute Seeufer aufwerten | Luzern: rawi, Kanton Luzern | |
| 21 | Itten, R., Glauser, L. & Stucki, M. | 2020 | Ökobilanzierung von Sportrasen-Anlagen: Natur-, Kunststoff- und Hybridrasen der Stadt Zürich im Vergleich | Wädenswil: ZHAW, Institut für Umwelt und Natürliche Ressourcen | |
| 22 | Kanton Zürich & Stadt Zürich | 2018 | Seebecken der Stadt Zürich. Leitbild und Strategie | Zürich | |
| 23 | Kindler, P. et al. | 2014 | Schnitt von Sträuchern und Hecken in Siedlungen: Wann und wie? | SVS/BirdLife Schweiz & Vogelwarte Sempach | [Link](http://www.vogelwarte.ch/de/voegel/ratgeber/vogelfreundlicher-garten/schnitt-von-straeuchern-und-hecken-in-siedlungen) |
| 24 | Koch, C. | 2021 | Holzbeläge im Freien – Auf die Konstruktion kommt es an | proHolz Austria | [Link](https://www.proholz.at/zuschnitt/41/holzbelaege-im-freien) |
| 25 | Kreuter, M.-L. | 2016 | Der Biogarten: das Original (27. Auflage) | München: BLV | |
| 26 | Meyer, S. | 2015 | Stichwort Naturnaher Gartenteich | | [Link](http://umweltberatung-luzern.ch/sites/default/files/naturnahergartenteich.pdf) |
| 27 | Niesel, A. | 2011 | Grünflächen-Pflegemanagement: dynamische Pflege von Grün (2. Auflage) | Stuttgart: Ulmer | |
| 28 | Pfoser, N. | 2016 | Fassade und Pflanze. Potenziale einer neuen Fassadengestaltung | Darmstadt: TU Darmstadt | [Link](https://tuprints.ulb.tu-darmstadt.de/5587/1/Dissertation_Pfoser.pdf) |
| 29 | Pirc, H. | 2011 | Alles über Gehölzschnitt (2. Auflage) | Stuttgart: Ulmer | |
| 30 | Polak, P. | 2014 | Wiesen und Rasen – Von der Ansaat bis zur Pflege | Land Niederösterreich | |
| 31 | Preiss, J. | 2013 | Leitfaden Fassadenbegrünung | Wien: Magistrat der Stadt Wien | [Link](https://www.wien.gv.at/umweltschutz/raum/pdf/fassadenbegruenung-leitfaden.pdf) |
| 32 | prEN 1177 | 2007 | Stossdämpfende Spielplatzböden – Bestimmung der kritischen Fallhöhe | | |
| 33 | Richard, P. | 2002 | Lebendige Naturgärten: planen, gestalten, pflegen | Aarau: AT Verlag | |
| 34 | Roulier, C. & Rohde, S. | 2019 | Indikator-Set 8 – Ufervegetation. Nr. Steckbrief 8, V1.03 | Bern: BAFU | |
| 35 | Ruckstuhl, M. et al. | 2010 | Pflegeverfahren – Ein Leitfaden zur Erhaltung und Aufwertung wertvoller Naturflächen | Zürich: Grün Stadt Zürich, Fachbereich Naturschutz | [Link](https://www.stadt-zuerich.ch/ted/de/index/gsz/beratung-und-wissen/wohn-und-arbeitsumfeld/naturnahe-pflege/pflegeverfahren.html) |
| 36 | Scholl, I. | 2013 | Natur findet Stadt – Naturnahe Umgebung: Leitfaden | St. Gallen | |
| 37 | Seipel, H. et al. | 2017 | Fachkunde für Garten- und Landschaftsbau (7. Auflage) | Hamburg: Verlag Dr. Felix Büchner | |
| 38 | SFG | 2010 | Broschüre Gebäudebegrünung: Dach, Fassade, Innenraum | Thun: Schweizerische Fachvereinigung Gebäudebegrünung SFG | [Link](http://www.sfg-gruen.ch/images/content/publikationen/SFGBroschuere_de.pdf) |
| 39 | Stadt Winterthur | 2015 | Grünflächenpflege Profilbeschreibung | Winterthur: Stadtgärtnerei | |
| 40 | Stadtgärtnerei Basel | 2017 | Profilübersicht | Basel-Stadt: Bau- und Verkehrsdepartement | |
| 41 | Stiftung Umwelt-Einsatz Schweiz | 2014 | Trockenmauern: Grundlagen, Bauanleitung, Bedeutung | Bern: Haupt | |
| 42 | Tschander, B. | 2007 | Flachdachbegrünungen in der Stadt Zürich, Bericht zur Erhebung der ökologischen Qualität (unveröffentlicht) | Zürich: Grün Stadt Zürich | |
| 43 | Umwelt Zentralschweiz (Hrsg.) | 2011 | Bäche pflegen und aufwerten | | |
| 44 | Umweltinstitut München e.V. (Hrsg.) | 2018 | Naturnahe Gärten – Wertvoller Lebensraum für Pflanzen und Tiere | | [Link](https://www.umweltinstitut.org/fileadmin/Mediapool/Druckprodukte/Landwirtschaft/PDF/Faltblatt_Naturgarten_web.pdf) |
| 45 | VSSG | 2012 | Kennzahlen Pflegekosten öffentliches Grün | Gelterkirchen: VSSG | |
| 46 | Wildermuth, H. & Küry, D. | 2009 | Libellen schützen, Libellen fördern, Leitfaden für die Naturschutzpraxis | | [Link](https://libellenschutz.ch/images/info_material/sagls-broschuere/LibellenTotalD.pdf) |
| 47 | WWF | 2007 | Lebendige Trockenstandorte mit Sand, Kies und Schotter | Zürich: WWF Schweiz | [Link](http://assets.wwf.ch/downloads/priv_ruderalflaechen_1.pdf) |

---

*Document created: February 2026*
*Last updated: February 2026 (v2.1 — merged field-level details from 40+ standards, JSON examples, and municipal cadastre analysis)*
*Companion to: `DATAMODEL.md` v1.1*

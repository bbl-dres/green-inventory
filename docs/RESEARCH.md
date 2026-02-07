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

**Relevance to Green Area Inventory:** The CareProfile structure already aligns well with FLL's categorized care guidelines. The FLL Baumkontrollrichtlinie should inform the future ConditionAssessment entity schema — it defines standard VTA inspection zones (root, collar, trunk, crown, branches) and a standardized damage/action catalog.

---

### 1.4 SIA 318 — Garten- und Landschaftsbau

| | |
|---|---|
| **Publisher** | SIA (Schweizerischer Ingenieur- und Architektenverein) |
| **Standard** | SIA 318:2009 |
| **URL** | https://shop.sia.ch/normenwerk/architekt/sia%20318/d/2009/D/Product |

The Swiss standard for garden and landscape construction. It is the Swiss equivalent of the German DIN 18915–18920 series and defines acceptance criteria, material standards, and construction quality requirements for landscape works.

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

**Relevance to Green Area Inventory:** ISO 55000's asset registry concept validates the inventory-first approach. The standard's emphasis on condition-based maintenance planning directly supports the future ConditionAssessment entity. The lifecycle cost tracking requirement is addressed by the Cost entity.

---

### 1.7 IFC — Industry Foundation Classes (Greenery Extensions)

| | |
|---|---|
| **Publisher** | buildingSMART International |
| **Standard** | IFC 4.3 (ISO 16739-1:2024) |
| **URL** | https://standards.buildingsmart.org/IFC/ |

IFC 4.3 includes limited but growing support for landscape and greenery elements. Relevant entity types include `IfcGeographicElement` (for landscape features like trees, hedges, water features), `IfcSite` (with `RefElevation` and site boundary), and `IfcExternalSpatialElement` (for outdoor spaces). The IFC Infra extensions (roads, bridges, tunnels) have expanded spatial modeling capabilities that could benefit landscape representation.

Current limitations: IFC's greenery support is minimal compared to CityGML. There is no native tree dendrometry (DBH, crown diameter) or vegetation dynamics model. The buildingSMART Landscape Room is working on extensions, but these are not yet standardized.

**Relevance to Green Area Inventory:** IFC interoperability is relevant for the BBL context where BIM deliverables may include landscape elements. The `IfcGeographicElement` mapping is a potential export target. However, CityGML 3.0 remains the better interoperability target for the vegetation domain.

---

### 1.8 ISO 28258 — Soil Quality Digital Data Exchange

| | |
|---|---|
| **Publisher** | ISO TC 190 (Soil quality) |
| **Standard** | ISO 28258:2013 |

ISO 28258 defines a data model for the digital exchange of soil-related data, including soil profiles, horizons, and observations. The model uses a hierarchical structure: Site → SoilProfile → SoilHorizon → SoilObservation.

**Relevance to Green Area Inventory:** The GreenArea entity includes a `soilType` field. For advanced soil management (e.g., green roof substrates, tree planting specifications per FLL), ISO 28258's structured approach could inform a future SoilProfile extension. Low priority for the current scope.

---

### 1.9 i-Tree Eco — Ecosystem Service Assessment

| | |
|---|---|
| **Publisher** | USDA Forest Service |
| **URL** | https://www.itreetools.org/ |
| **Type** | Free software suite for urban forestry analysis |

i-Tree Eco provides the most granular tree-level field inventory and ecosystem service quantification model. It is the de facto standard used by Swiss pilot cities (Basel, Bern, Zürich, Lausanne, Luzern, Winterthur) for urban tree ecosystem service valuation.

#### i-Tree Eco Field Inventory Schema

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

SDG 11.7.1 measures the "average share of the built-up area of cities that is open space for public use for all, by sex, age and persons with disabilities." The indicator requires tracking total built-up area, open public space area (including green spaces), and accessibility metrics (distance to nearest green space, typically 300m or 400m walking distance).

**Relevance to Green Area Inventory:** The Site entity's `totalAreaM2` and `greenAreaM2` fields directly support this indicator. A spatial accessibility analysis (buffer/isochrone from Sites) could produce the SDG 11.7.1 metric at municipal level. Low implementation effort.

---

### 1.11 WHO Urban Green Space Guidelines

| | |
|---|---|
| **Publisher** | World Health Organization (Regional Office for Europe) |
| **Publication** | Urban green spaces and health — A review of evidence (2016) |
| **URL** | https://www.who.int/europe/publications/i/item/9789289052153 |

WHO guidelines recommend minimum green space access thresholds: at least 0.5–1 ha of public green space within 300m of every residence, and 9 m² of urban green space per capita (varying by guideline source). These metrics can be derived from Green Area Inventory's spatial data.

**Relevance to Green Area Inventory:** Validates the need for accurate Site perimeter and area tracking. The per-capita metric requires population data (external) combined with Green Area Inventory's green area inventory.

---

### 1.12 EU Nature Restoration Regulation (NRR)

| | |
|---|---|
| **Publisher** | European Parliament and Council |
| **Status** | Regulation (EU) 2024/1991, entered into force August 2024 |
| **URL** | https://eur-lex.europa.eu/eli/reg/2024/1991/oj |

The EU Nature Restoration Regulation introduces legally binding "no net loss" tracking requirements for urban ecosystems. Key provisions for green space management:

| NRR Requirement | Data Need | Green Area Inventory Mapping |
|----------------|-----------|----------------------|
| No net loss of urban green space area (Art. 6) | Total green space area per municipality, tracked against 2024 baseline | Site.greenAreaM2 aggregated |
| No net loss of urban tree canopy cover (Art. 6) | Total canopy cover area, tracked against 2024 baseline | Tree crown area (computed from crownDiameterM) |
| Increasing trend of urban green space by 2030/2040/2050 | Temporal tracking of green space metrics | validFrom/validUntil on Sites and GreenAreas |
| National restoration plans with measurable targets | Reporting at municipal, cantonal, national level | Aggregation by municipality/canton |

**Relevance to Green Area Inventory:** Although Switzerland is not an EU member state, the NRR's data requirements are likely to influence Swiss policy (cf. indirect applicability through bilateral agreements and BAFU Biodiversitätsstrategie). The 2024 baseline requirement means inventories started now will be critically important. Green Area Inventory's temporal versioning (validFrom/validUntil) inherently supports no-net-loss tracking.

---

### 1.13 IUCN / Singapore Index on Cities' Biodiversity

| | |
|---|---|
| **Publisher** | IUCN / Convention on Biological Diversity |
| **URL** | https://www.nparks.gov.sg/biodiversity/singapore-index-on-cities-biodiversity |

The Singapore Index defines 23 indicators across native biodiversity, ecosystem services, and governance. Indicators directly relevant to Green Area Inventory include: proportion of natural areas (derived from Site/GreenArea), number of native species (Tree species data), connectivity of green spaces (spatial analysis on Site geometries), and budget allocated to biodiversity (Cost entity).

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

FIWARE's NGSI-LD serves as a natural integration hub for urban green space management because it already bridges citizen issue reporting (Open311), real-time IoT sensor data (OGC SensorThings API), and administrative data into a unified data space.

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

**Relevance to Green Area Inventory:** Open311 could serve as the API contract for a future citizen reporting module (the [Preview] Issue entity). Service requests would link to existing spatial entities (nearest Tree, Furniture, or GreenArea). Several Swiss cities (Zürich «Züri wie neu», Bern «eBern») already run Open311-compatible reporting platforms that could be integrated.

---

### 2.4 OGC SensorThings API — IoT for Green Spaces

| | |
|---|---|
| **Publisher** | Open Geospatial Consortium |
| **Standard** | OGC SensorThings API Part 1: Sensing (15-078r6) |
| **URL** | https://www.ogc.org/standard/sensorthings/ |

The SensorThings API provides a RESTful interface for IoT sensor networks. Its data model: `Thing` → `Location` → `Datastream` → `Observation` → `ObservedProperty`. For green space management, relevant sensor types include soil moisture probes (irrigation optimization), weather stations (microclimate monitoring), dendrometers (trunk growth measurement), sap flow sensors (tree health), and people counters (usage intensity).

**Relevance to Green Area Inventory:** Low priority for the current scope, but the SensorThings data model informs how future IoT extensions should be structured. A Green Area Inventory Tree or GreenArea could be the `Thing` entity, with Datastreams for each monitored property. The validFrom/validUntil temporal model is compatible.

---

## 3. Swiss-Specific Standards & Datasets

### 3.1 VSSG — Vereinigung Schweizerischer Stadtgärtnereien und Gartenbauämter

| | |
|---|---|
| **Publisher** | VSSG |
| **Programme** | Grünstadt Schweiz® |
| **URL** | https://www.gruenstadt-schweiz.ch/ |

The VSSG is the Swiss umbrella organization for municipal green space departments. Its **Grünstadt Schweiz®** label is a quality certification for municipalities committed to high-standard green space management. The certification requires demonstrating systematic inventory management, care planning, biodiversity promotion, and resource efficiency.

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
| **Zürich** (GSZ) | ~80,000 trees | data.stadt-zuerich.ch |
| **Basel** (Stadtgärtnerei) | ~28,000 trees | data.bs.ch |
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

**Relevance to Green Area Inventory:** This analysis directly validates and refines the Tree entity schema. The recommended additions (`genus`, `commonNameDe`, `cultivar`) are noted in the Gap Analysis (Section 5).

---

### 3.4 GALK Strassenbaum-Liste (German Street Tree List)

| | |
|---|---|
| **Publisher** | GALK (Gartenamtsleiterkonferenz, Germany) |
| **URL** | https://www.galk.de/arbeitskreise/stadtbaeume/themenuebersicht/strassenbaumliste |

The GALK Strassenbaumliste is a curated and periodically updated list of tree species recommended for urban street planting in Central European conditions. It evaluates species against criteria including climate tolerance (heat, drought, frost), pest/disease resistance, root system compatibility, crown form and maintenance needs, and allergenicity. The list is widely used by Swiss municipalities (despite being a German publication) as a reference for species selection.

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

**Relevance to Green Area Inventory:** CICES provides the classification backbone for ecosystem service reporting. If Green Area Inventory adds ecosystem service fields (from i-Tree or local models), the CICES taxonomy provides a standardized reporting structure. The TEEB framework provides monetary valuation methods for these services.

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

Analysis of 10+ open municipal tree datasets from cities including New York (~680K trees, TreesCount), Paris (~200K, Arbres), London (i-Tree Eco surveys), Vienna (~190K, Baumkataster), Berlin (~430K, Straßenbäume), Melbourne (~70K, Urban Forest), and the Swiss datasets revealed critical inconsistencies that informed the Green Area Inventory data model:

| Issue | Cities Affected | Green Area Inventory Design Decision |
|-------|----------------|-------------------------------|
| DBH in inches vs. circumference in cm | NYC vs. all European | Store `trunkCircumferenceCm` (Swiss standard); derive DBH for i-Tree |
| Missing height data | Paris, Berlin, Melbourne | `heightM` is optional (not mandatory) |
| Inconsistent species encoding | All | Support `genus` + `species` + `cultivar` + `commonNameDe` separately |
| Binary vs. scaled condition | NYC (Good/Fair/Poor/Dead) vs. Vienna (1–9) | Use 1–5 enum scale with clear definitions |
| Missing planting year | Paris, Berlin (partial) | `plantingYear` is optional |
| No crown data | Bern, Berlin | `crownDiameterM` is optional |

**Relevance to Green Area Inventory:** These lessons directly shaped the Tree entity's field optionality and type choices. The model is designed to accept data at varying levels of completeness, reflecting the reality of municipal tree inventories.

---

## 6. Technology Patterns & Data Exchange

### 6.1 GeoPackage — Offline Mobile Data Collection

| | |
|---|---|
| **Standard** | OGC GeoPackage Encoding Standard (12-128r18) |
| **URL** | https://www.geopackage.org/ |

GeoPackage is an SQLite-based container for vector features, tile matrix sets, and attributes. It is the recommended format for offline mobile green space data collection because it supports spatial indexing, multiple layers per file, attribute storage including enumerations, and works natively with QGIS, FME, and most mobile GIS apps.

**Relevance to Green Area Inventory:** The mobile data collection module (MO requirements) should support GeoPackage as an offline exchange format. A field worker could download a site's data as GeoPackage, collect observations and measurements offline, and sync back to the central system.

---

### 6.2 OGC API Features — Green Space Data Services

| | |
|---|---|
| **Standard** | OGC API — Features — Part 1: Core (17-069r4) |
| **URL** | https://ogcapi.ogc.org/features/ |

The successor to WFS, OGC API Features provides a RESTful, JSON-native API for serving vector features. Swiss federal geodata infrastructure (BGDI/geo.admin.ch) is progressively adopting OGC API endpoints alongside legacy WMS/WFS.

**Relevance to Green Area Inventory:** A production Green Area Inventory instance should expose its spatial entities via OGC API Features for interoperability with cantonal GIS, QGIS workstations, and federal reporting. The API's CQL2 filtering supports the spatial and temporal queries needed for green space analysis.

---

### 6.3 DCAT-AP CH — Metadata for Green Space Datasets

| | |
|---|---|
| **Standard** | DCAT-AP CH 2.0 (based on DCAT-AP 2.1.0) |
| **Publisher** | I14Y Interoperability Platform / BFS |
| **URL** | https://www.i14y.admin.ch/ |

DCAT-AP CH defines the Swiss metadata profile for open data catalog entries on opendata.swiss and the I14Y interoperability platform. Any Green Area Inventory dataset published as open data should include a DCAT-AP CH–compliant metadata record.

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
| Melbourne | ~70,000 | Urban Forest Visual | https://data.melbourne.vic.gov.au/ |
| London | i-Tree survey | i-Tree Eco London | https://www.london.gov.uk/ |

---

*Document created: February 2026*
*Last updated: February 2026 (v2.0 — integrated 572+ source deep research findings)*
*Companion to: `DATAMODEL.md` v1.1*

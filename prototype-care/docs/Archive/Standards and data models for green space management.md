# Standards and data models for municipal green space management

**Groundskeeper's data model aligns well with international practice but can be significantly enriched by adopting field-level conventions from i-Tree Eco, FIWARE Smart Data Models, the FLL Baumkontrollrichtlinie, and real municipal tree cadastres across Europe.** This report documents 40+ standards, schemas, and open datasets — with concrete field definitions, JSON examples, and entity mappings — that validate and extend the Groundskeeper data model for Swiss municipal green space inventory, maintenance, and care planning. The findings span international frameworks (IFC, ISO 28258, UN-Habitat, EU Nature Restoration Regulation), open data models (Open311, NGSI-LD, SensorThings API), Swiss-specific standards (VSSG, ZHAW Q-Index, eCH-0056, SIA 318), real-world municipal datasets (Zurich, Basel, Vienna, Berlin, Paris, NYC), biodiversity schemas (GBIF, Darwin Core, CICES), and maintenance standards (FLL, GALK, DIN 18916–18920, ISO 55000).

---

## International standards beyond the current RESEARCH.md coverage

### IFC landscape extensions remain minimal but growing

**buildingSMART's IFC 4.3** models vegetation through `IfcGeographicElement` with `PredefinedType=VEGETATION`, inheriting core attributes: `GlobalId` (22-char string), `Name`, `Description`, `ObjectPlacement` (spatial position), and `Representation` (2D/3D geometry). The `IfcGeographicElementTypeEnum` provides values `SOIL_BORING_POINT`, `TERRAIN`, `VEGETATION`, `USERDEFINED`, and `NOTDEFINED`. The vegetation property set `Pset_VegetationCommon` defines only two properties: **`BotanicalName`** (IfcLabel, scientific name per ICN) and **`LocalName`** (IfcLabel, common name). The proposed `IfcPlant` subtype from IFC 4.3 RC1 was removed from the final standard. This deliberate minimalism means IFC relies on external classification references for species detail — Groundskeeper's richer Tree entity (with trunk diameter, crown dimensions, health) goes well beyond IFC's scope, making IFC useful only as a BIM interoperability format rather than a primary data model.

**ISO 28258:2013** (Soil Quality — Digital Exchange) provides a robust soil data model built on the ISO 19156 Observations & Measurements pattern. Its core features — `Site` (investigation environment), `Plot` (spatial investigation location, specialized into Surface/TrialPit/Borehole), `Profile` (ordered horizons), `ProfileElement` (with upper/lower depth), and `SoilSpecimen` — use an observation triple of Property + Procedure + Result to record measurements like pH, organic carbon, and texture. The ISRIC PostgreSQL reference implementation on GitHub (`ISRICWorldSoil/iso-28258`) implements tables for `site`, `plot`, `profile`, `element`, `specimen`, and `observation_phys_chem` with controlled vocabularies from GloSIS code-lists. This O&M pattern could inform an extensible soil quality sub-model linked to Groundskeeper's GreenArea or SurfaceArea entities.

### UN-Habitat and WHO define measurable access indicators

**SDG Indicator 11.7.1** (UN-Habitat, Tier II) measures the "average share of built-up area that is open space for public use." The SEDAC/CIESIN 2023 dataset covers **8,873 urban centers** with fields including `area_built_up_km2`, `area_open_space_km2`, `pct_open_space`, and `pop_with_access`. Open public space is typed as parks/gardens, plazas, waterfronts, sport facilities, and community gardens — each requiring polygon geometry, name, type, `area_sqm`, and an `accessibility` flag. The **400-meter buffer** from residences to qualifying green space is the standard proximity metric.

WHO's primary recommended indicator is the **"proportion of population living within 300m of a public green space ≥1 hectare."** WHO defines three indicator categories: availability (NDVI, green space density %, tree canopy cover %, street tree density as trees/km), accessibility (proximity in meters, population within threshold %, green space per capita targeting **≥9 m²/person**), and usage (visit frequency, duration, physical activity). These computed KPIs can be derived from Groundskeeper's Site and GreenArea geometries combined with external population data.

### EU Nature Restoration Regulation sets binding urban greening targets

The **EU Nature Restoration Regulation** (2024/1991, in force June 2024) creates legally binding requirements under Article 8: **no net loss of urban green space area or tree canopy cover by 2030** versus a 2024 baseline, with an increasing trend from 2031 measured every 6 years. Key monitored indicators include `urban_green_space_area` (total trees, shrubs, herbaceous vegetation, water within cities — from Copernicus CLCplus Backbone), `urban_tree_canopy_cover` (from HRL Tree Cover Density, vegetation height >2m threshold), and `urban_ecosystem_area` (per LAU using Degree of Urbanisation). Cities with >45% green space AND >10% canopy cover may be exempt until 2030. The EU Biodiversity Strategy 2030 additionally targets **3 billion new trees** and recommends Urban Nature Plans for cities >20,000 population. For Groundskeeper, this means time-series tracking of total GreenArea extent and computed canopy cover from Tree crown dimensions is not optional — it is a regulatory reporting requirement.

### Singapore Index and i-Tree Eco provide the richest field-level schemas

The **Singapore Index on Cities' Biodiversity (CBI)** defines 28 scored indicators across three components: native biodiversity (10 indicators including native plant/bird species counts, protected area %), ecosystem services (7 indicators: carbon storage in tC/ha, recreational space as ha/1000 population, permeable surface %, restoration area in ha), and governance (11 indicators: budget, institutional capacity, monitoring programs). Each indicator requires specific quantitative data — `native_plant_species_count`, `protected_area_ha`, `permeable_surface_pct` — that map to aggregated queries across Groundskeeper entities.

The **i-Tree Eco field manual** (USDA Forest Service, v6.0) defines the most comprehensive tree data collection schema in practice. Minimum required fields are just `Species` and `DBH`, but the recommended set includes:

- **Dimensional:** `TotalTreeHeight`, `LiveTreeHeight`, `HeightToLiveCrownBase`, `LiveCrownWidth_NS`, `LiveCrownWidth_EW` (all in meters)
- **Crown condition:** `PercentCrownMissing` (0–100%), `CrownHealth` (0–100%), `CrownLightExposure` (0–5 sides)
- **Management:** `MaintenanceRecommended` (None/Prune <6in/Prune >6in/Remove/Other), `MaintenanceTask` (Clean/Thin/Raise/Reduce/Other), `SidewalkConflict` (boolean), `UtilityConflict` (boolean)
- **Context:** `StreetTree` (boolean), `PublicPrivate` (enum), `LandUse` (14 classes: Residential, Commercial, Industrial, Park, etc.)
- **Ground cover:** `PercentImpervious`, `PercentShrub` under canopy

Plot-level data includes `PlotCenterCoordinates`, `TreeCover` %, `ShrubCover` %, `PlantableSpace` %, and detailed ground cover percentages for 11 surface types. Computed outputs include carbon storage (kg), pollution removal (O₃, SO₂, NO₂, CO, PM2.5 in g/yr), avoided runoff (m³/yr), and compensatory value ($). Basel's Stadtgärtnerei is already piloting i-Tree integration with their Baumkataster as one of six Swiss cities.

---

## Open data models with concrete JSON schemas

### Open311 GeoReport v2 enables citizen issue reporting

Open311's REST API defines two core resources: **Services** (issue types) and **Service Requests** (individual reports). A service request POST requires `service_code`, conditionally `lat`/`long` (WGS84 floats) or `address_string`, and optionally `description` (max 4000 chars), `email`, `media_url` (photo). The GET response returns:

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

This maps directly: `service_request_id` → Task.id, `status` (open/closed) → Task.status, `lat`/`long` → linked entity geometry, `description` → Task.description, `media_url` → Document, `agency_responsible` → Contact. Helsinki and Tampere have deployed Open311 for parks feedback. FIWARE wraps Open311 into NGSI-LD via their `Open311ServiceRequest` data model.

### FIWARE Smart Data Models define Garden, FlowerBed, and GreenspaceRecord

The **FIWARE ParksAndGardens** domain (GitHub: `smart-data-models/dataModel.ParksAndGardens`, CC BY 4.0) provides three NGSI-LD entity types. The **Garden** entity includes `category` (enum: public, private, botanical, castle, community, monastery, residential, fencedOff), `style` (english, french, chinese, japanese, zen, rosarium, herb_garden, kitchen), `dateLastWatering` (DateTime), `nextWateringDeadline` (DateTime), `location` (GeoProperty/GeoJSON), `address` (schema.org PostalAddress), and `openingHours`. The **FlowerBed** entity adds `taxon` (biological taxon list), `category` (hedge, lawnArea, portable, **urbanTreeSpot**), `width`/`height`/`depth` (meters), and `refGarden` (relationship). The **GreenspaceRecord** captures observation data: `soilTemperature`, `soilMoisture`, `temperature`, `relativeHumidity`, `dateObserved`, and `refGreenspace`.

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

Garden maps to Groundskeeper's **Site** or **GreenArea**; FlowerBed (lawnArea) → **SurfaceArea**; FlowerBed (hedge) → **LinearFeature**; FlowerBed (urbanTreeSpot) → **Tree**; GreenspaceRecord → **CareAction** (observation); `dateLastWatering` → CareAction; `nextWateringDeadline` → **Task**.

### OGC SensorThings API models IoT monitoring with 8 entity types

The SensorThings API (OGC 18-088, v1.1) models IoT sensor networks with `Thing` → `Location` + `Datastream` → `Sensor` + `ObservedProperty` + `Observation` → `FeatureOfInterest`. Each Observation carries `phenomenonTime` (ISO 8601), `resultTime`, and `result` (any type). A complete soil moisture monitoring setup in a park:

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

---

## Real municipal tree cadastres reveal a canonical field set

Analysis of **six major open tree datasets** — NYC (666,134 trees), Vienna (~200,000), Berlin (900,000+), Paris (~200,000), Melbourne (~80,000), and Montreal (~300,000) — reveals a convergent core field set that validates Groundskeeper's Tree entity while highlighting important additions.

### NYC TreesCount 2015 provides the deepest condition data

NYC's 41-field schema includes granular problem detection fields absent in European datasets: `root_stone`, `root_grate`, `root_other`, `trnk_wire`, `trnk_light`, `trnk_other`, `brnch_ligh`, `brnch_shoe`, `brnch_othe` (all Yes/No), plus `health` (Good/Fair/Poor), `status` (Alive/Dead/Stump), `sidewalk` (NoDamage/Damage), and `steward` (None/1or2/3or4/4orMore). These map to structured condition assessments in CareAction rather than flat Tree fields.

### European cadastres emphasize trunk circumference over DBH

**Vienna** (data.gv.at, CC BY 4.0) records `STAMMUMFANG` (trunk circumference in cm at 1m height), `KRONENDURCHMESSER` (crown diameter, m), `BAUMHOEHE` (height, m), `PFLANZJAHR` (planting year), `BAUMGATTUNGLAT`/`BAUMARTLAT` (genus/species Latin). **Berlin** (daten.berlin.de, 900K+ trees) adds `STANDALTER` (derived age in years), `TYP` (Straßenbaum vs. Anlagenbaum), and `GATTUNG_DEUTSCH`/`ART_DEUTSCH` (German names). **Paris** (opendata.paris.fr, ODbL) uniquely includes `stadedeveloppement` with four maturity stages (Jeune/Adulte/Mature/Vieux), `varieteoucultivar`, and `remarquable` (OUI/NON for heritage trees). **Melbourne** adds `Useful_Life_Expectancy` (Short/Medium/Long) — a field directly relevant to CareProfile planning.

### Critical design implications for Groundskeeper

**Trunk measurement**: Store both `trunkDiameter` (DBH in cm) and `trunkCircumference` (cm), with automatic conversion (circumference ÷ π = diameter). NYC uses inches; all European cities use centimeters. **Species taxonomy**: Support separate fields for `genus`, `species`, `cultivar`, `commonNameLocal`, and `scientificName` (full binomial). Paris's 4-level taxonomy (genre/espece/varieteoucultivar/libellefrancais) is the most complete. **Maturity stage**: Add an enum field with values aligned across datasets: Juvenile, Semi-mature/Adult, Mature, Over-mature/Old, Senescent. **Coordinate systems**: Store WGS84 (EPSG:4326) as primary with mandatory Swiss LV95 (EPSG:2056) support. **Health/condition**: Make optional but structured — enum values Excellent through Dead, harmonized across i-Tree (7-level) and NYC (3-level) scales.

---

## Swiss-specific standards center on VSSG and cantonal Baumkataster

### VSSG's Grünstadt Schweiz label and Q-Index define the process model

The **VSSG Arbeitsgruppe Grünflächenmanagement**, co-led by Christian Heule (GSZ) and Simon Leuenberger (Stadtgärtnerei Basel), explicitly covers building and operating Grünflächen- und Baumkataster. The **Grünstadt Schweiz** sustainability label (Bronze/Silver/Gold, max 500 points) uses **40 measures** across core processes (Planung und Bau, Pflege und Unterhalt, Produktion) and support processes (Grundlagen, Kommunikation, Personal, Beschaffung). Zurich holds Gold certification with **451/500 points**. This process model maps directly to Groundskeeper's CareProfile → CareAction → Task workflow.

The **ZHAW Q-Index** (developed with Zurich, Basel, Bern, Winterthur, Chur, Grenchen) operates at two levels: **Freiraum** (open space = Site) and **Pflegeprofil** (care profile = CareProfile), defining quality dimensions of Nutzung (usage), Ökologie (ecology), Gestaltung (design), Ästhetik (aesthetics), and Kosten (costs). Target and actual quality values drive care planning. ZHAW's **Pflegeprofilkatalog for Winterthur** consolidates ~70 care profiles across categories: Siedlungsgrün, Schulbauten, Friedhöfe, Naturschutz — directly informing the CareProfile entity taxonomy.

### Zurich's Baumkataster is the primary reference dataset

The **Baumkataster der Stadt Zürich** (data.stadt-zuerich.ch, CC Zero, weekly updates, ~80,000 trees) managed by GSZ covers all municipal trees in street spaces, the Obstbauminventar (fruit trees), and selected park/private trees. Digital since 2001 with positional accuracy <1cm to 30cm for street trees. Available as CSV, GeoJSON, **GeoPackage** (EPSG:2056), Shapefile, WFS, WMS, WMTS. Key fields: `Baumnummer`, `Quartier`, `Strasse`, `Baumgattung_lat`/`_deu`, `Baumart_lat`/`_deu`, `Pflanzjahr`, `Kronendurchmesser`, `BaumTyp` (Strassenbaum/Anlagebaum/Obstbaum). The WFS endpoint at `ogd.stadt-zuerich.ch/wfs/geoportal/Baumkataster` supports direct integration.

**Basel** (data.bs.ch, daily updates, ~27,800 trees) provides the best-documented Swiss GIS infrastructure: PostgreSQL database, Geomapfish for web publication, QGIS/FME for data maintenance, **QField for mobile field capture**, Python/R for analysis. Unique to Basel: the **Fäll- und Baumersatzliste** (dataset 100054) — a separate register of trees scheduled for felling and replacement within 6 months, validating the separation of Tree (inventory) from Task (planned actions) entities. Basel's Baumschutzgesetz makes trees legally protected, adding a `protectionStatus` dimension. Basel is also one of six Swiss cities piloting **i-Tree integration** for ecosystem service valuation.

**Geneva's Inventaire Cantonal des Arbres** (~250,000 trees) tracks the richest attribute set of any Swiss canton: géolocalisation du tronc et du sommet (trunk and crown top positions), diamètre du tronc, diamètre de la couronne, **surface et volume de canopée** (canopy area and volume), vitalité, espèce, hauteur. Geneva is exploring automated tree detection using LiDAR and hyperspectral imagery via the STDL (Swiss Territorial Data Lab) partnership with swisstopo.

### Key Swiss technical standards

**eCH-0056 v3.0** (Anwendungsprofil Geodienste) is legally binding under Art. 7 GeoIG — Groundskeeper's WMS/WFS services **must** comply if publishing to Swiss geodata infrastructure. All BAFU geodata models use **INTERLIS**, Switzerland's national standard for geodata modeling, meaning INTERLIS export capability should be considered. **SIA 318:2009** (Garten- und Landschaftsbau, revision prSIA 318:2025 adding facade greening and biodiversity) defines material and construction standards mapping to StructureElement and SurfaceArea. **SIA 118/318:2009** defines contractual conditions including the **2-year Anwachsgarantie** (plant establishment warranty) — directly relevant to Contract.warrantyPeriod. **SIA 312** covers roof greening (extensive/intensive) relevant for GreenArea with type="Dachbegrünung". **DCAT-AP CH** (eCH-0200 v2.0) governs dataset cataloging on opendata.swiss with mandatory multilingual metadata (de/fr/it/en) and Swiss-specific license vocabulary (terms_open, terms_by, terms_ask, terms_by_ask).

---

## Biodiversity and ecosystem services schemas

### Darwin Core and GBIF provide species observation standards

The **Darwin Core standard** (TDWG, namespace `dwc:`) defines terms across six classes. Key terms for green space biodiversity monitoring: `dwc:occurrenceID` (global unique ID), `dwc:scientificName`, `dwc:genus`, `dwc:specificEpithet`, `dwc:taxonRank`, `dwc:eventDate` (ISO 8601), `dwc:recordedBy`, `dwc:decimalLatitude`/`dwc:decimalLongitude` (WGS84), `dwc:coordinateUncertaintyInMeters`, `dwc:basisOfRecord` (enum: HumanObservation, MachineObservation, LivingSpecimen, etc.), `dwc:occurrenceStatus` (present/absent), `dwc:individualCount`, `dwc:habitat`, `dwc:samplingProtocol`. A Simple Darwin Core CSV row:

```csv
occurrenceID,basisOfRecord,scientificName,genus,specificEpithet,eventDate,decimalLatitude,decimalLongitude,occurrenceStatus,individualCount
urn:uuid:a1b2c3d4,HumanObservation,Quercus robur L.,Quercus,robur,2024-06-15,47.3769,8.5417,present,3
```

**GBIF** extends Darwin Core with `gbifID`, `datasetKey` (UUID), `taxonKey` (integer backbone key), and the full taxonomic hierarchy (kingdom through species). Minimum publishing requirements: `occurrenceID`, `basisOfRecord`, `scientificName`, `eventDate`. For Groundskeeper, Darwin Core terms standardize species identification across Tree entities and enable biodiversity observations to be linked to GreenArea records.

### CICES v5.1 classifies ecosystem services relevant to urban green spaces

The **CICES v5.1** (EEA) uses a 5-level hierarchy: Section → Division → Group → Class → Class Type. Urban-relevant classes include:

- **Carbon sequestration** (2.2.6.1): Regulation of atmospheric chemical composition
- **Air filtration** (2.1.1.1): Filtration/sequestration by plants
- **Urban cooling** (2.2.6.2): Regulation of temperature/humidity via transpiration
- **Stormwater regulation** (2.2.1.3): Hydrological cycle and flood protection
- **Noise reduction** (2.1.2.2): Sound attenuation by vegetation
- **Pollination** (2.2.2.1): Pollination and seed dispersal
- **Recreation** (3.1.1.1): Active/immersive interactions with living systems
- **Aesthetic appreciation** (3.1.1.2): Passive/observational interactions

These CICES codes can serve as a controlled vocabulary for ecosystem service attributes on Tree and GreenArea entities, enabling systematic valuation.

### InVEST models define quantitative input requirements

The **InVEST Urban Cooling Model** (Natural Capital Project, Stanford) requires a biophysical table mapping each land use code to `kc` (vegetation coefficient, 0–1), `green_area` (boolean), `shade` (tree canopy proportion ≥2m, 0–1), and `albedo` (reflectivity, 0–1). The **Carbon model** requires `c_above`, `c_below`, `c_soil`, `c_dead` (all in tonnes C/ha) per land use. The **Urban Flood model** requires SCS Curve Numbers `CN_A` through `CN_D` per hydrologic soil group. These parameters could be stored as species-level or land-use-level lookup attributes in Groundskeeper, enabling ecosystem service estimation directly from inventory data.

---

## Maintenance and asset management standards at field level

### FLL Baumkontrollrichtlinie defines the tree inspection data model

The **FLL tree inspection guideline** (2020 edition, 6,500+ certified inspectors in Germany) specifies a structured inspection record with four data sections:

**Base tree data** (Grunddaten): `baum_id`, `baum_nr` (RFID/plate tag), `standort_koordinaten` (geometry), `baumart` (species), `pflanzjahr`, `stammumfang_cm`, `baumhoehe_m`, `kronendurchmesser_m`, `eigentuemer`.

**Inspection record** (Kontrollgang): `kontroll_datum` (DateTime), `kontrolleur` (inspector ID), `kontrolleur_zertifikat` (FLL certificate number), `kontrollart` (enum: Regelkontrolle, Zusatzkontrolle, Ersterfassung, Eingehende Untersuchung), `kontrollintervall` (6/12/24 months), `belaubungszustand` (belaubt/unbelaubt).

**Condition assessment**: `vitalitaet` (Roloff scale 0–3: vital → stark geschädigt), `verkehrssicherheit` (enum: gegeben/nicht_gegeben/herstellbar), `stand_sicherheit` and `bruch_sicherheit` (sicher/eingeschränkt/nicht_sicher). Defect symptoms are structured as boolean checklists across crown (`totholz`, `astbruch`, `pilzbefall_krone`, `hohlungen`), trunk (`rindenschaeden`, `pilzfruchtkörper`, `hohlungen`, `risse`, `faeulnis`), trunk base (`pilzfruchtkörper`, `wurzelhebung`), and roots (`wurzelverletzung`, `bodenverdichtung`).

**Measures** (Maßnahmen): `massnahme_typ` (enum: totholz_entfernen, kronenschnitt, eingehende_untersuchung, faellung, kronensicherung, standortverbesserung, nachkontrolle), `massnahme_dringlichkeit` (sofort / kurzfristig <3 months / mittelfristig <12 months / langfristig), `massnahme_status` (empfohlen/angeordnet/durchgeführt/nicht_erfolgt), `fotos` (URI array).

This maps precisely: base data → **Tree**, each Kontrollgang → **CareAction**, kontrollintervall → **CareProfile**, pending Maßnahmen → **Task** with urgency levels.

### GALK Straßenbaumliste structures species suitability data

The **GALK street tree list** (galk.de, AK-Stadtbäume) evaluates species across dimensions: `botanischer_name`, `deutscher_name`, `wuchshoehe_m` (range), `kronenbreite_m` (range), `lichtdurchlaessigkeit` (stark/mittel/gering), `verwendbarkeit` (gut_geeignet/geeignet/geeignet_mit_einschraenkung/nicht_geeignet/noch_im_test). Extended attributes include boolean flags for `bienenweide` (bee forage — 134 species flagged), `bluetenbaum` (ornamental flowering), `stadtklimafest` (urban climate tolerant), `fruchtfall_beachten` (fruit drop safety concern), `rindennekrosen` (bark necrosis susceptibility), `bodenverdichtung_empfindlich` (soil compaction sensitivity), plus text descriptions for `trockenheitsvertraeglichkeit` (drought tolerance) and `streusalzempfindlichkeit` (salt sensitivity). These species-level attributes belong in a reference species table linked to Tree records, informing CareProfile decisions and climate-adaptive planting.

### DIN 18916–18920 define vegetation technology inspection parameters

**DIN 18916** (planting) specifies plant quality at delivery, root ball integrity, planting depth, staking, and establishment care — mapping to CareAction fields `plant_quality_grade`, `root_ball_size`, `planting_depth_cm`. **DIN 18917** (seeding/lawns) defines seed mix type (RSM reference), application rate (g/m²), germination coverage %. **DIN 18919** (maintenance) defines care regimes: `mow_height_mm`, `mow_frequency_weeks`, `fertilizer_type`, `fertilizer_rate_g_m2`, `watering_interval_days` — directly informing CareProfile attributes. **DIN 18920** (tree protection during construction) defines the **Kronentraufbereich** (root protection zone = crown radius + 1.5m; for columnar forms + 5.0m), mapping to a computed protection perimeter on Tree entities.

### ISO 55000 provides the asset management lifecycle framework

**ISO 55001** (2024 edition) applied to green infrastructure requires an asset register with `asset_id`, `condition_grade` (1–5: Very Good → Very Poor), `replacement_value` (currency), `useful_life_years`, `installation_date`, `risk_score` (1–25, likelihood × consequence matrix), `criticality_rating` (critical/high/medium/low), `maintenance_strategy` (preventive/corrective/condition_based/run_to_failure), `last_inspection_date`, `next_inspection_due`, and `parent_asset_id` for hierarchy. The new **ISO 55013:2024** specifically addresses data quality and governance for asset management information systems. The condition_grade (1–5) aligns directly with the German Zustandsstufe used in FLL tree inspections.

---

## Technology patterns for data exchange and field collection

### GeoPackage enables offline mobile inspection workflows

**OGC GeoPackage** (v1.4, SQLite-based, `.gpkg`) is the ideal format for field data collection. System tables include `gpkg_spatial_ref_sys` (CRS definitions), `gpkg_contents` (data table registry with data_type 'features'/'tiles'/'attributes'), and `gpkg_geometry_columns`. User feature tables store tree inventories and inspection records:

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

The workflow — export GeoPackage with base layers + empty inspection templates → offline fieldwork on tablet (QField, Mergin Maps) → sync back to server — is proven in Basel's Stadtgärtnerei, which uses QField + PostgreSQL + FME for their entire Baumkataster workflow.

### OGC API Features replaces WFS with REST patterns

**OGC API Features** (17-069r3) exposes collections via RESTful endpoints: `/collections/{id}/items` returns paginated GeoJSON FeatureCollections with `numberMatched`, `numberReturned`, `timeStamp`, and `links` for pagination. Each Groundskeeper entity type becomes a collection (`trees`, `green_areas`, `inspections`, `tasks`). Part 2 adds CRS support for Swiss LV95 (EPSG:2056); Part 3 adds CQL2 filtering (`filter=condition_grade>=3 AND species LIKE 'Tilia%'`).

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

---

## Consolidated entity enrichment recommendations

Based on cross-referencing all standards and datasets, the following field additions would align Groundskeeper with international best practice:

**Tree entity enrichments**: `genus` + `species` + `cultivar` + `scientificName` + `commonNameLocal` (from Paris/GBIF); `trunkCircumference` alongside `trunkDiameter` (European convention); `crownBaseHeight` + `crownMissingPercent` + `crownHealth` + `crownLightExposure` (i-Tree Eco); `maturityStage` enum (Juvenile/Semi-mature/Mature/Over-mature/Senescent from Melbourne/Paris); `isStreetTree` + `isRemarkable` + `protectionStatus` (from Paris/Geneva/Basel Baumschutzgesetz); `sidewalkConflict` + `utilityConflict` (from i-Tree/NYC); `climateResilienceIndex` (from BFH/ZHAW research).

**CareProfile enrichments**: Q-Index quality dimensions (`usageQuality`, `ecologyQuality`, `designQuality`, `aestheticsQuality`, `costEfficiency` — from ZHAW); `maintenanceStrategy` enum (from ISO 55000); `kontrollintervall` (6/12/24 months from FLL); `conditionGrade` (1–5 from ISO 55000/FLL).

**CareAction enrichments**: FLL inspection structure with `inspectionType`, `inspectorCertificate`, `vitalityRoloff` (0–3), `trafficSafety` enum, `standSicherheit`, `bruchSicherheit`; structured defect symptom checklists per tree zone (crown/trunk/base/roots).

**Task enrichments**: `urgency` enum (sofort/kurzfristig/mittelfristig/langfristig from FLL); `measureType` enum (from FLL Maßnahmen); Open311 integration fields for citizen reporting.

**Site enrichments**: `greenSpacePercent`, `treeCanopyCoverPercent` (for EU NRR reporting); `greenSpacePerCapita` (WHO metric); `accessibilityCompliant` (SIA 500); DCAT-AP CH metadata for open data publication.

**Cost enrichments**: `compensatoryValue` + `ecosystemServiceValueAnnual` (from i-Tree); CICES classification codes for service categories.

## Conclusion

The research reveals that Groundskeeper's entity structure — Site, GreenArea, Tree, CareProfile, CareAction, Task — is well-validated by international practice. No major structural changes are needed. The most impactful enrichments come from three sources: **i-Tree Eco's field manual** (adding crown condition metrics and ecosystem service outputs to Tree), **FLL Baumkontrollrichtlinie** (adding structured inspection records to CareAction with the Roloff vitality scale and urgency-classified measures as Tasks), and **ZHAW's Q-Index** (adding quality dimensions to CareProfile). Swiss compliance requires EPSG:2056 coordinate support, eCH-0056-conformant geoservices, and DCAT-AP CH metadata for open data publication. The EU Nature Restoration Regulation makes time-series tracking of green space area and canopy cover a reporting obligation — Groundskeeper should compute these as derived KPIs from its spatial inventory. Basel's proven technology stack (PostgreSQL + QField + FME + Geomapfish) and Zurich's open WFS endpoint provide the closest real-world implementation references.
# Groundskeeper — Data Model

This document describes the data model for the Groundskeeper green space inventory application.

---

## 1. Introduction

### 1.1 Purpose & Scope

This document defines the canonical data model for the Groundskeeper application — a web-based GIS system for the inventory, management, and maintenance of municipal green spaces. The model supports:

- Green space visualization and GIS-based exploration
- Inventory management (green areas, trees, furniture, structures)
- Care profile assignment based on the GSZ «Mehr als Grün» catalog
- Maintenance planning and task management
- Contact and contract management
- Cost tracking and budget planning

### 1.2 Design Principles

| Principle | Description |
|-----------|-------------|
| **Flat Structure** | All fields live at the top level of each entity — no nested `extensionData` objects. This simplifies querying and aligns with the standalone nature of the application. |
| **Traceability** | All entities include `validFrom`/`validUntil` for temporal tracking and `eventType` for domain events. |
| **Standards Compliance** | Uses ISO 8601 for dates, ISO 4217 for currencies (`CHF`), and aligns with the GSZ Profilkatalog for care profiles. |
| **Spatial First** | Core entities carry geometry; GeoJSON files comply with RFC 7946 (WGS84 coordinates). Optional LV95 fields provide Swiss coordinate support. |
| **Bilingual Support** | All enumerations provide both English (EN) and German (DE) values; the demo uses German values. |
| **GSZ Alignment** | Care profiles align with the Grün Stadt Zürich «Mehr als Grün» Profilkatalog (ZHAW/GSZ 2019), providing 31 standardized profiles as a baseline. |

### 1.3 Swiss Context

| Standard / Identifier | Description | Usage |
|-----------------------|-------------|-------|
| **LV95 (EPSG:2056)** | Swiss coordinate reference system | Optional `lv95East`/`lv95North` fields on spatial entities. GeoJSON geometry uses WGS84. |
| **GSZ Profilkatalog** | 31 standardized care profiles from «Mehr als Grün» (ZHAW/GSZ 2019) | CareProfile entity; pre-configured system profiles |
| **ÖREB-Kataster** | Public-law restrictions on land ownership | Layer integration (Gewässerschutzzonen, Waldgrenzen, Nutzungsplanung) |
| **Amtliche Vermessung (AV)** | Official Swiss cadastral survey | Layer integration (Liegenschaften, Bodenbedeckung) |
| **swisstopo WMTS** | Federal mapping services (Landeskarte, SWISSIMAGE, swissTLM3D) | Base map layers |
| **Infoflora** | Swiss flora database; Black List / Watch List of invasive neophytes | Neophyte species lookup for field reporting |

### 1.4 Requirements Coverage

This data model covers 107 of 130 requirements from the REQUIEREMENTS.md specification (all **Must** and **Should** priorities). The remaining 22 **Could** requirements and 1 **Won't** requirement are noted as [Preview] entities for future implementation.

| Module | Covered Requirements |
|--------|---------------------|
| Kartenmodul (K) | K-001..K-003, K-010..K-015, K-020..K-024, K-030..K-033 |
| Inventarmodul (I) | I-001..I-007, I-010..I-017, I-020..I-023 |
| Pflegeprofil-Bibliothek (P) | P-001..P-009, P-020..P-024, P-030..P-032 |
| Massnahmenplanung (M) | M-001..M-007, M-010..M-014 |
| Mobile Erfassung (MO) | MO-001..MO-005, MO-010..MO-014, MO-020..MO-022 |
| Kontaktmanagement (C) | C-001..C-005 |
| Kosten & Prognosen (F) | F-001..F-005, F-010..F-012 |
| Datenimport/-export (D) | D-001..D-004, D-010..D-012, D-020..D-021 |
| Suche & Filter (S) | S-001..S-005 |
| Benutzerverwaltung (U) | U-001..U-004 |
| Nicht-funktionale Anf. (N) | N-001..N-004, N-010..N-014, N-020..N-024 |

---

## 2. Architecture Overview

### 2.1 Entity Relationship Diagram

```mermaid
erDiagram
    Site ||--o{ GreenArea : contains
    Site ||--o{ Tree : contains
    Site ||--o{ LinearFeature : contains
    Site ||--o{ Furniture : contains
    Site ||--o{ StructureElement : contains
    Site ||--o{ SurfaceArea : contains
    Site ||--o{ WaterFeature : contains
    Site }o--o{ Contact : "managed by"
    Site }o--o{ Contract : "covered by"
    Site }o--o{ Document : "documented by"
    Site }o--o{ Cost : "incurs"

    GreenArea }o--|| CareProfile : "assigned"
    Tree }o--o| CareProfile : "assigned"
    LinearFeature }o--o| CareProfile : "assigned"
    SurfaceArea }o--o| CareProfile : "assigned"
    WaterFeature }o--o| CareProfile : "assigned"

    CareProfile ||--o{ CareAction : defines
    Task }o--o| CareAction : "based on"
    Task }o--|| Contact : "assigned to"

    Site {
        string siteId PK
        string name
        string siteType
        string status
    }

    GreenArea {
        string greenAreaId PK
        string siteId FK
        string careProfileId FK
        number areaM2
        string condition
    }

    Tree {
        string treeId PK
        string siteId FK
        string species
        number trunkCircumferenceCm
        number crownDiameterM
        string treeCategory
    }

    LinearFeature {
        string linearFeatureId PK
        string siteId FK
        string featureType
        number lengthM
    }

    Furniture {
        string furnitureId PK
        string siteId FK
        string furnitureType
        string condition
    }

    StructureElement {
        string structureElementId PK
        string siteId FK
        string elementType
        string ecologicalValue
    }

    SurfaceArea {
        string surfaceAreaId PK
        string siteId FK
        string surfaceType
        number areaM2
    }

    WaterFeature {
        string waterFeatureId PK
        string siteId FK
        string waterType
    }

    CareProfile {
        string careProfileId PK
        string profileCode
        string name
        string category
        number ecologyRating
        number designRating
        number usageRating
    }

    CareAction {
        string careActionId PK
        string careProfileId FK
        string actionName
        number frequencyPerYear
    }

    Task {
        string taskId PK
        string taskType
        string status
        string assignedContactId FK
    }

    Contact {
        string contactId PK
        string name
        string contactType
        string role
    }

    Contract {
        string contractId PK
        string contractType
        string contractPartner
        number amount
    }

    Document {
        string documentId PK
        string name
        string documentType
    }

    Cost {
        string costId PK
        string costCategory
        string costType
        number amount
    }
```

### 2.2 Entity Hierarchy

Entities are organized into functional layers:

| Layer | Entities | Description |
|-------|----------|-------------|
| **Spatial Core** | Site, GreenArea, Tree, LinearFeature, Furniture, StructureElement, SurfaceArea, WaterFeature | Geo-referenced objects displayed on the map |
| **Profile & Maintenance** | CareProfile, CareAction, Task | Care instructions and operational work orders |
| **Supporting** | Contact, Contract, Document, Cost | People, agreements, files, and financials |
| **Future** | ConditionAssessment, NeophyteReport, MachineCatalog | Planned entities for future releases (see Section 6) |

### 2.3 Demo vs. Production Implementation

**Current Demo Implementation:**

For the demo stage, entities are stored in flat JSON and GeoJSON files:

```
data/sites.geojson          → Site polygons
data/green-areas.geojson    → GreenArea polygons
data/trees.geojson          → Tree points
data/care-profiles.json     → CareProfile + CareAction
data/tasks.json             → Task
data/furniture.json         → Furniture + StructureElement
data/contacts.json          → Contact
data/contracts.json         → Contract
data/costs.json             → Cost
data/documents.json         → Document
```

**Production Implementation:**

In a production system, these would be stored in PostGIS with proper foreign key constraints, enabling:

- Independent lifecycle management per entity
- Many-to-many relationships (e.g., one contact managing multiple sites)
- Efficient spatial querying and indexing
- Event sourcing for audit trails
- Concurrent multi-user editing with conflict detection

---

## 3. Core Spatial Entities

### 3.1 Site (Standort)

A site represents a top-level container for green spaces, such as a park, school grounds, sports facility, or street-side green strip. All spatial objects belong to exactly one site.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **siteId** | PK | string | Unique identifier for the site. | **mandatory**, minLength: 1, maxLength: 50 | Site ID | Standort-ID |
| **name** | | string | Name of the site (e.g., «Parkanlage Sonnenberg»). | **mandatory**, minLength: 1, maxLength: 200 | Site Name | Standortname |
| **siteType** | | string, enum | Type of site. See [Site Types](#a1-site-types). | **mandatory** | Site Type | Standortart |
| **municipality** | | string | Municipality where the site is located. | **mandatory**, minLength: 1, maxLength: 100 | Municipality | Gemeinde |
| **canton** | | string | Canton code (e.g., «ZH», «BE», «GE»). | **mandatory**, minLength: 2, maxLength: 2 | Canton | Kanton |
| **address** | | string | Street address of the main entrance. | minLength: 1, maxLength: 200 | Address | Adresse |
| **totalAreaM2** | | number | Total site area in square meters. | **mandatory**, minimum: 0 | Total Area | Gesamtfläche |
| **greenAreaM2** | | number | Total green area in square meters. | minimum: 0 | Green Area | Grünfläche |
| **hardSurfaceAreaM2** | | number | Total hard surface area in square meters. | minimum: 0 | Hard Surface | Hartfläche |
| **ownershipType** | | string, enum | Ownership type. See [Ownership Types](#a2-shared-enumerations). | **mandatory** | Ownership | Eigentum |
| **managingOrganisation** | | string | Organisation responsible for maintenance. | minLength: 1, maxLength: 200 | Organisation | Organisation |
| **responsibleContactId** | FK | string | Primary responsible contact. | minLength: 1, maxLength: 50 | Responsible | Verantwortlich |
| **status** | | string, enum | Current status of the site. See [Status Types](#a2-shared-enumerations). | **mandatory** | Status | Status |
| **lv95East** | | number | LV95 easting coordinate (EPSG:2056) of site centroid. | minimum: 2480000, maximum: 2840000 | LV95 E | LV95 Ost |
| **lv95North** | | number | LV95 northing coordinate (EPSG:2056) of site centroid. | minimum: 1070000, maximum: 1300000 | LV95 N | LV95 Nord |
| **validFrom** | | string | Record validity start date. ISO 8601 format. | **mandatory**, minLength: 20 | Valid From | Gültig von |
| **validUntil** | | string | Record validity end date. ISO 8601 format. Null if still active. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. ISO 8601 format. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. ISO 8601 format. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `SiteAdded`, `SiteUpdated`, `SiteDeleted` | | Event Type | Ereignistyp |

#### Geometry

Sites use **Polygon** or **MultiPolygon** geometry representing the site perimeter boundary. Coordinates are WGS84 (EPSG:4326) per GeoJSON RFC 7946.

#### Example: Site Object

```json
{
  "type": "Feature",
  "properties": {
    "siteId": "SITE-001",
    "name": "Parkanlage Sonnenberg",
    "siteType": "Park",
    "municipality": "Zürich",
    "canton": "ZH",
    "address": "Sonnenbergstrasse 20, 8032 Zürich",
    "totalAreaM2": 18500,
    "greenAreaM2": 14200,
    "hardSurfaceAreaM2": 4300,
    "ownershipType": "Öffentlich",
    "managingOrganisation": "Grün Stadt Zürich",
    "responsibleContactId": "CONT-001",
    "status": "Aktiv",
    "lv95East": 2683200,
    "lv95North": 1247550,
    "validFrom": "2020-01-01T00:00:00Z",
    "validUntil": null,
    "createdAt": "2025-03-15T10:30:00Z",
    "updatedAt": "2026-01-20T14:15:00Z",
    "eventType": "SiteUpdated"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [8.5180, 47.3640],
      [8.5230, 47.3640],
      [8.5230, 47.3665],
      [8.5180, 47.3665],
      [8.5180, 47.3640]
    ]]
  }
}
```

> **Note:** The demo uses German values (e.g., `"siteType": "Park"`, `"status": "Aktiv"`). For English implementations, use `"siteType": "Park"`, `"status": "Active"`.

---

### 3.2 GreenArea (Grünfläche)

A green area represents a vegetated polygon within a site. Each green area is assigned exactly one active care profile that defines its maintenance regime. Green areas are the primary spatial unit for care planning.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **greenAreaId** | PK | string | Unique identifier for the green area. | **mandatory**, minLength: 1, maxLength: 50 | Green Area ID | Grünflächen-ID |
| **siteId** | FK | string | Reference to the parent site. | **mandatory**, minLength: 1, maxLength: 50 | Site ID | Standort-ID |
| **name** | | string | Descriptive name (e.g., «Blumenwiese Süd»). | **mandatory**, minLength: 1, maxLength: 200 | Name | Bezeichnung |
| **careProfileId** | FK | string | Reference to the assigned care profile. | **mandatory**, minLength: 1, maxLength: 50 | Care Profile | Pflegeprofil |
| **areaM2** | | number | Area in square meters (computed from geometry or manually entered). | **mandatory**, minimum: 0 | Area | Fläche |
| **condition** | | number, enum | Condition rating (1–5 scale). See [Condition Scale](#a2-shared-enumerations). | **mandatory**, minimum: 1, maximum: 5 | Condition | Zustand |
| **usageIntensity** | | string, enum | Usage intensity level. See [Usage Intensity](#a2-shared-enumerations). | | Usage Intensity | Nutzungsintensität |
| **vegetationType** | | string | Description of the vegetation type or species composition. | minLength: 1, maxLength: 500 | Vegetation | Vegetation |
| **soilType** | | string | Soil type description. | minLength: 1, maxLength: 200 | Soil Type | Bodentyp |
| **irrigated** | | boolean | Is the area irrigated? | | Irrigated | Bewässert |
| **lastCareDate** | | string | Date of last care activity. ISO 8601 format. | | Last Care | Letzte Pflege |
| **notes** | | string | Free-text notes. | maxLength: 2000 | Notes | Bemerkungen |
| **lv95East** | | number | LV95 easting of centroid. | | LV95 E | LV95 Ost |
| **lv95North** | | number | LV95 northing of centroid. | | LV95 N | LV95 Nord |
| **validFrom** | | string | Record validity start date. ISO 8601 format. | **mandatory** | Valid From | Gültig von |
| **validUntil** | | string | Record validity end date. ISO 8601 format. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. ISO 8601 format. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. ISO 8601 format. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `GreenAreaAdded`, `GreenAreaUpdated`, `GreenAreaDeleted` | | Event Type | Ereignistyp |

#### Geometry

Green areas use **Polygon** geometry representing the area boundary. Coordinates are WGS84 (EPSG:4326).

#### Example: GreenArea Object

```json
{
  "type": "Feature",
  "properties": {
    "greenAreaId": "GA-001",
    "siteId": "SITE-001",
    "name": "Blumenwiese Sonnenberg Süd",
    "careProfileId": "CP-BW",
    "areaM2": 3200,
    "condition": 2,
    "usageIntensity": "Gering",
    "vegetationType": "Artenreiche Blumenwiese mit Margeriten, Wiesensalbei und Glockenblumen",
    "soilType": "Lehmig-sandig",
    "irrigated": false,
    "lastCareDate": "2025-09-15T00:00:00Z",
    "notes": "Herbstschnitt 2025 durchgeführt. Artenvielfalt nimmt seit Umstellung zu.",
    "validFrom": "2022-04-01T00:00:00Z",
    "validUntil": null,
    "createdAt": "2022-04-01T08:00:00Z",
    "updatedAt": "2025-09-16T10:00:00Z",
    "eventType": "GreenAreaUpdated"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [8.5190, 47.3642],
      [8.5210, 47.3642],
      [8.5210, 47.3652],
      [8.5190, 47.3652],
      [8.5190, 47.3642]
    ]]
  }
}
```

> **Note:** The demo uses German values (e.g., `"usageIntensity": "Gering"`). For English implementations, use `"usageIntensity": "Low"`.

---

### 3.3 Tree (Baum)

A tree represents an individual tree within a site. Trees are tracked as point objects with dendrometric data (trunk, crown, height), species identification, condition assessment, and care profile assignment.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **treeId** | PK | string | Unique identifier for the tree. | **mandatory**, minLength: 1, maxLength: 50 | Tree ID | Baum-ID |
| **siteId** | FK | string | Reference to the parent site. | **mandatory**, minLength: 1, maxLength: 50 | Site ID | Standort-ID |
| **treeNumber** | | string | Local tree number within the site (e.g., «B-047»). | minLength: 1, maxLength: 20 | Tree No. | Baum-Nr. |
| **species** | | string | Scientific name (Latin binomial, e.g., «Tilia cordata»). | **mandatory**, minLength: 1, maxLength: 200 | Species | Art (wiss.) |
| **speciesCommon** | | string | Common German name (e.g., «Winterlinde»). | minLength: 1, maxLength: 200 | Common Name | Volksname |
| **treeCategory** | | string, enum | Functional category. See [Tree Categories](#a4-tree-categories). | **mandatory** | Category | Kategorie |
| **careProfileId** | FK | string | Reference to the assigned care profile. | minLength: 1, maxLength: 50 | Care Profile | Pflegeprofil |
| **trunkCircumferenceCm** | | number | Trunk circumference in cm, measured at 1m height. | minimum: 0, maximum: 2000 | Trunk Circ. | Stammumfang |
| **crownDiameterM** | | number | Crown diameter in meters. | minimum: 0, maximum: 50 | Crown Diam. | Kronendurchmesser |
| **heightM** | | number | Total height in meters. | minimum: 0, maximum: 60 | Height | Höhe |
| **plantingYear** | | number | Year the tree was planted. | minimum: 1800, maximum: 2100 | Planting Year | Pflanzjahr |
| **condition** | | number, enum | Condition rating (1–5 scale). See [Condition Scale](#a2-shared-enumerations). | **mandatory**, minimum: 1, maximum: 5 | Condition | Zustand |
| **protectionStatus** | | string, enum | Protection status. See [Protection Status](#a2-shared-enumerations). | | Protection | Schutzstatus |
| **lastInspectionDate** | | string | Date of last tree inspection. ISO 8601 format. | | Last Inspection | Letzte Kontrolle |
| **nextInspectionDate** | | string | Date of next scheduled inspection. ISO 8601 format. | | Next Inspection | Nächste Kontrolle |
| **notes** | | string | Free-text notes (diseases, damage, special features). | maxLength: 2000 | Notes | Bemerkungen |
| **lv95East** | | number | LV95 easting. | | LV95 E | LV95 Ost |
| **lv95North** | | number | LV95 northing. | | LV95 N | LV95 Nord |
| **validFrom** | | string | Record validity start date. ISO 8601 format. | **mandatory** | Valid From | Gültig von |
| **validUntil** | | string | Record validity end date. ISO 8601 format. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. ISO 8601 format. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. ISO 8601 format. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `TreeAdded`, `TreeUpdated`, `TreeDeleted` | | Event Type | Ereignistyp |

#### Geometry

Trees use **Point** geometry representing the trunk base position. Coordinates are WGS84 (EPSG:4326).

#### Example: Tree Object

```json
{
  "type": "Feature",
  "properties": {
    "treeId": "TREE-001",
    "siteId": "SITE-001",
    "treeNumber": "B-001",
    "species": "Tilia cordata",
    "speciesCommon": "Winterlinde",
    "treeCategory": "Parkbaum",
    "careProfileId": "CP-PB",
    "trunkCircumferenceCm": 220,
    "crownDiameterM": 12.5,
    "heightM": 18,
    "plantingYear": 1952,
    "condition": 2,
    "protectionStatus": "Geschützt",
    "lastInspectionDate": "2025-11-10T00:00:00Z",
    "nextInspectionDate": "2028-11-01T00:00:00Z",
    "notes": "Imposanter Solitärbaum am Hauptweg. Leichter Totholzanteil in Krone.",
    "validFrom": "2020-01-01T00:00:00Z",
    "validUntil": null,
    "createdAt": "2020-01-15T09:00:00Z",
    "updatedAt": "2025-11-10T15:30:00Z",
    "eventType": "TreeUpdated"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [8.5195, 47.3648]
  }
}
```

> **Note:** The demo uses German values (e.g., `"treeCategory": "Parkbaum"`, `"protectionStatus": "Geschützt"`). For English implementations, use `"treeCategory": "Park tree"`, `"protectionStatus": "Protected"`.

---

### 3.4 LinearFeature (Linienobjekt)

A linear feature represents a line-shaped object within a site, such as hedges, walls, fences, or paths.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **linearFeatureId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Feature ID | Linienobjekt-ID |
| **siteId** | FK | string | Reference to the parent site. | **mandatory**, minLength: 1, maxLength: 50 | Site ID | Standort-ID |
| **name** | | string | Descriptive name. | **mandatory**, minLength: 1, maxLength: 200 | Name | Bezeichnung |
| **featureType** | | string, enum | Type of linear feature. See [Linear Feature Types](#a6-linear-feature-types). | **mandatory** | Feature Type | Objektart |
| **careProfileId** | FK | string | Reference to the assigned care profile. | minLength: 1, maxLength: 50 | Care Profile | Pflegeprofil |
| **lengthM** | | number | Length in meters. | **mandatory**, minimum: 0 | Length | Länge |
| **heightM** | | number | Height in meters (for hedges, walls). | minimum: 0 | Height | Höhe |
| **widthM** | | number | Width in meters. | minimum: 0 | Width | Breite |
| **material** | | string | Material description (for walls, fences). | maxLength: 200 | Material | Material |
| **condition** | | number, enum | Condition rating (1–5 scale). See [Condition Scale](#a2-shared-enumerations). | minimum: 1, maximum: 5 | Condition | Zustand |
| **installationYear** | | number | Year of installation or planting. | minimum: 1800, maximum: 2100 | Installation | Erstellungsjahr |
| **notes** | | string | Free-text notes. | maxLength: 2000 | Notes | Bemerkungen |
| **validFrom** | | string | Record validity start date. ISO 8601 format. | **mandatory** | Valid From | Gültig von |
| **validUntil** | | string | Record validity end date. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `LinearFeatureAdded`, `LinearFeatureUpdated`, `LinearFeatureDeleted` | | Event Type | Ereignistyp |

#### Geometry

Linear features use **LineString** or **MultiLineString** geometry. Coordinates are WGS84 (EPSG:4326).

#### Example: LinearFeature Object

```json
{
  "type": "Feature",
  "properties": {
    "linearFeatureId": "LF-001",
    "siteId": "SITE-001",
    "name": "Formhecke Hauptweg Nord",
    "featureType": "Formhecke",
    "careProfileId": "CP-FH",
    "lengthM": 45,
    "heightM": 1.2,
    "widthM": 0.6,
    "condition": 2,
    "installationYear": 2005,
    "notes": "Hainbuche (Carpinus betulus), wird 2x jährlich geschnitten.",
    "validFrom": "2020-01-01T00:00:00Z",
    "validUntil": null,
    "createdAt": "2020-01-15T09:00:00Z",
    "updatedAt": "2025-06-20T11:00:00Z",
    "eventType": "LinearFeatureUpdated"
  },
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [8.5192, 47.3655],
      [8.5195, 47.3655],
      [8.5200, 47.3656],
      [8.5210, 47.3656]
    ]
  }
}
```

> **Note:** The demo uses German values (e.g., `"featureType": "Formhecke"`). For English implementations, use `"featureType": "Formal hedge"`.

---

### 3.5 Furniture (Mobiliar)

Furniture represents point objects for benches, fountains, play equipment, waste bins, lighting, and other installations within a site.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **furnitureId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Furniture ID | Mobiliar-ID |
| **siteId** | FK | string | Reference to the parent site. | **mandatory**, minLength: 1, maxLength: 50 | Site ID | Standort-ID |
| **name** | | string | Descriptive name (e.g., «Parkbank am Teich»). | **mandatory**, minLength: 1, maxLength: 200 | Name | Bezeichnung |
| **furnitureType** | | string, enum | Type of furniture. See [Furniture Types](#a7-furniture-types). | **mandatory** | Furniture Type | Mobiliarart |
| **manufacturer** | | string | Manufacturer or brand. | maxLength: 200 | Manufacturer | Hersteller |
| **material** | | string | Primary material (e.g., «Holz/Metall», «Granit»). | maxLength: 200 | Material | Material |
| **installationYear** | | number | Year of installation. | minimum: 1800, maximum: 2100 | Installation | Einbaujahr |
| **condition** | | number, enum | Condition rating (1–5 scale). See [Condition Scale](#a2-shared-enumerations). | minimum: 1, maximum: 5 | Condition | Zustand |
| **lastMaintenanceDate** | | string | Date of last maintenance. ISO 8601 format. | | Last Maintenance | Letzte Wartung |
| **nextMaintenanceDate** | | string | Date of next scheduled maintenance. ISO 8601 format. | | Next Maintenance | Nächste Wartung |
| **notes** | | string | Free-text notes. | maxLength: 2000 | Notes | Bemerkungen |
| **validFrom** | | string | Record validity start date. ISO 8601 format. | **mandatory** | Valid From | Gültig von |
| **validUntil** | | string | Record validity end date. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `FurnitureAdded`, `FurnitureUpdated`, `FurnitureDeleted` | | Event Type | Ereignistyp |

#### Geometry

Furniture uses **Point** geometry. Coordinates are WGS84 (EPSG:4326).

#### Example: Furniture Object

```json
{
  "type": "Feature",
  "properties": {
    "furnitureId": "FURN-001",
    "siteId": "SITE-001",
    "name": "Parkbank Sonnenberg 1",
    "furnitureType": "Sitzbank",
    "manufacturer": "Velopa AG",
    "material": "Holz/Metall",
    "installationYear": 2018,
    "condition": 2,
    "lastMaintenanceDate": "2025-04-10T00:00:00Z",
    "nextMaintenanceDate": "2026-04-01T00:00:00Z",
    "notes": "Standardbank mit Rückenlehne, 1.8m Sitzfläche.",
    "validFrom": "2018-06-01T00:00:00Z",
    "validUntil": null,
    "createdAt": "2018-06-01T10:00:00Z",
    "updatedAt": "2025-04-10T14:00:00Z",
    "eventType": "FurnitureUpdated"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [8.5198, 47.3650]
  }
}
```

> **Note:** The demo uses German values (e.g., `"furnitureType": "Sitzbank"`). For English implementations, use `"furnitureType": "Bench"`.

---

### 3.6 StructureElement (Strukturelement)

A structure element represents an ecological feature within a site, such as dry stone walls, brush piles, stone piles, nesting aids, or dead wood. These elements are tracked for their biodiversity value per the GSZ Profilkatalog.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **structureElementId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Element ID | Strukturelement-ID |
| **siteId** | FK | string | Reference to the parent site. | **mandatory**, minLength: 1, maxLength: 50 | Site ID | Standort-ID |
| **name** | | string | Descriptive name. | **mandatory**, minLength: 1, maxLength: 200 | Name | Bezeichnung |
| **elementType** | | string, enum | Type of structure element. See [Structure Element Types](#a8-structure-element-types). | **mandatory** | Element Type | Elementtyp |
| **careProfileId** | FK | string | Reference to the assigned care profile. | minLength: 1, maxLength: 50 | Care Profile | Pflegeprofil |
| **dimensionDescription** | | string | Description of dimensions (e.g., «3m lang, 1.5m hoch, 0.8m breit»). | maxLength: 500 | Dimensions | Abmessungen |
| **ecologicalValue** | | string, enum | Ecological value assessment. See [Ecological Value](#a2-shared-enumerations). | | Eco Value | Ökologischer Wert |
| **targetSpecies** | | string | Target species or species groups. | maxLength: 500 | Target Species | Zielarten |
| **installationYear** | | number | Year of creation. | minimum: 1800, maximum: 2100 | Installation | Erstellungsjahr |
| **condition** | | number, enum | Condition rating (1–5 scale). | minimum: 1, maximum: 5 | Condition | Zustand |
| **notes** | | string | Free-text notes. | maxLength: 2000 | Notes | Bemerkungen |
| **validFrom** | | string | Record validity start date. ISO 8601 format. | **mandatory** | Valid From | Gültig von |
| **validUntil** | | string | Record validity end date. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `StructureElementAdded`, `StructureElementUpdated`, `StructureElementDeleted` | | Event Type | Ereignistyp |

#### Geometry

Structure elements use **Point** geometry for small features or **Polygon** geometry for larger areas (e.g., dry stone walls). Coordinates are WGS84 (EPSG:4326).

#### Example: StructureElement Object

```json
{
  "type": "Feature",
  "properties": {
    "structureElementId": "STRUCT-001",
    "siteId": "SITE-001",
    "name": "Trockenmauer Rosengarten",
    "elementType": "Trockenmauer",
    "careProfileId": "CP-TM",
    "dimensionDescription": "8m lang, 1.2m hoch, 0.6m breit",
    "ecologicalValue": "Hoch",
    "targetSpecies": "Eidechsen, Wildbienen, Schnecken",
    "installationYear": 2019,
    "condition": 1,
    "notes": "Natursteinmauer aus lokalem Kalkstein. Fugen bewusst offen gehalten.",
    "validFrom": "2019-10-01T00:00:00Z",
    "validUntil": null,
    "createdAt": "2019-10-01T08:00:00Z",
    "updatedAt": "2025-05-20T10:00:00Z",
    "eventType": "StructureElementUpdated"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [8.5205, 47.3649]
  }
}
```

> **Note:** The demo uses German values (e.g., `"elementType": "Trockenmauer"`, `"ecologicalValue": "Hoch"`). For English implementations, use `"elementType": "Dry stone wall"`, `"ecologicalValue": "High"`.

---

### 3.7 SurfaceArea (Belagsfläche)

A surface area represents a hard surface or paved area within a site, such as gravel paths, asphalt areas, play surface materials, or paved plazas.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **surfaceAreaId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Surface ID | Belagsflächen-ID |
| **siteId** | FK | string | Reference to the parent site. | **mandatory**, minLength: 1, maxLength: 50 | Site ID | Standort-ID |
| **name** | | string | Descriptive name. | **mandatory**, minLength: 1, maxLength: 200 | Name | Bezeichnung |
| **surfaceType** | | string, enum | Type of surface. See [Surface Types](#a9-surface-types). | **mandatory** | Surface Type | Belagsart |
| **careProfileId** | FK | string | Reference to the assigned care profile. | minLength: 1, maxLength: 50 | Care Profile | Pflegeprofil |
| **areaM2** | | number | Area in square meters. | **mandatory**, minimum: 0 | Area | Fläche |
| **condition** | | number, enum | Condition rating (1–5 scale). | minimum: 1, maximum: 5 | Condition | Zustand |
| **installationYear** | | number | Year of installation. | minimum: 1800, maximum: 2100 | Installation | Erstellungsjahr |
| **notes** | | string | Free-text notes. | maxLength: 2000 | Notes | Bemerkungen |
| **validFrom** | | string | Record validity start date. ISO 8601 format. | **mandatory** | Valid From | Gültig von |
| **validUntil** | | string | Record validity end date. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `SurfaceAreaAdded`, `SurfaceAreaUpdated`, `SurfaceAreaDeleted` | | Event Type | Ereignistyp |

#### Geometry

Surface areas use **Polygon** geometry. Coordinates are WGS84 (EPSG:4326).

#### Example: SurfaceArea Object

```json
{
  "type": "Feature",
  "properties": {
    "surfaceAreaId": "SURF-001",
    "siteId": "SITE-001",
    "name": "Hauptweg Chaussierung",
    "surfaceType": "Chaussierung",
    "careProfileId": "CP-CH",
    "areaM2": 680,
    "condition": 2,
    "installationYear": 2015,
    "notes": "Wassergebundene Decke, wird jährlich nachgeschottert.",
    "validFrom": "2020-01-01T00:00:00Z",
    "validUntil": null,
    "createdAt": "2020-01-15T09:00:00Z",
    "updatedAt": "2025-03-10T08:00:00Z",
    "eventType": "SurfaceAreaUpdated"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [8.5193, 47.3643],
      [8.5196, 47.3643],
      [8.5215, 47.3660],
      [8.5212, 47.3660],
      [8.5193, 47.3643]
    ]]
  }
}
```

> **Note:** The demo uses German values (e.g., `"surfaceType": "Chaussierung"`). For English implementations, use `"surfaceType": "Gravel surface"`.

---

### 3.8 WaterFeature (Gewässer)

A water feature represents a water body or water installation within a site, including ponds, streams, fountains, and water basins.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **waterFeatureId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Water Feature ID | Gewässer-ID |
| **siteId** | FK | string | Reference to the parent site. | **mandatory**, minLength: 1, maxLength: 50 | Site ID | Standort-ID |
| **name** | | string | Descriptive name. | **mandatory**, minLength: 1, maxLength: 200 | Name | Bezeichnung |
| **waterType** | | string, enum | Type of water feature. See [Water Feature Types](#a10-water-feature-types). | **mandatory** | Water Type | Gewässerart |
| **careProfileId** | FK | string | Reference to the assigned care profile. | minLength: 1, maxLength: 50 | Care Profile | Pflegeprofil |
| **areaM2** | | number | Area in square meters (for still water bodies). | minimum: 0 | Area | Fläche |
| **lengthM** | | number | Length in meters (for flowing water). | minimum: 0 | Length | Länge |
| **depthM** | | number | Maximum depth in meters. | minimum: 0 | Depth | Tiefe |
| **waterQuality** | | string, enum | Water quality rating. See [Water Quality](#a2-shared-enumerations). | | Water Quality | Wasserqualität |
| **condition** | | number, enum | Condition rating (1–5 scale). | minimum: 1, maximum: 5 | Condition | Zustand |
| **notes** | | string | Free-text notes. | maxLength: 2000 | Notes | Bemerkungen |
| **validFrom** | | string | Record validity start date. ISO 8601 format. | **mandatory** | Valid From | Gültig von |
| **validUntil** | | string | Record validity end date. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `WaterFeatureAdded`, `WaterFeatureUpdated`, `WaterFeatureDeleted` | | Event Type | Ereignistyp |

#### Geometry

Water features use **Polygon** geometry for still water bodies or **LineString** geometry for flowing water. Coordinates are WGS84 (EPSG:4326).

#### Example: WaterFeature Object

```json
{
  "type": "Feature",
  "properties": {
    "waterFeatureId": "WF-001",
    "siteId": "SITE-001",
    "name": "Weiher Sonnenberg",
    "waterType": "Ruhend",
    "careProfileId": "CP-GW-RU",
    "areaM2": 180,
    "depthM": 1.2,
    "waterQuality": "Gut",
    "condition": 2,
    "notes": "Naturnaher Weiher mit Seerosen und Schilfgürtel. Amphibienlaichgebiet.",
    "validFrom": "2020-01-01T00:00:00Z",
    "validUntil": null,
    "createdAt": "2020-01-15T09:00:00Z",
    "updatedAt": "2025-08-20T16:00:00Z",
    "eventType": "WaterFeatureUpdated"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [8.5207, 47.3647],
      [8.5212, 47.3646],
      [8.5214, 47.3648],
      [8.5211, 47.3650],
      [8.5207, 47.3649],
      [8.5207, 47.3647]
    ]]
  }
}
```

> **Note:** The demo uses German values (e.g., `"waterType": "Ruhend"`, `"waterQuality": "Gut"`). For English implementations, use `"waterType": "Still"`, `"waterQuality": "Good"`.

---

## 4. Profile & Maintenance Entities

### 4.1 CareProfile (Pflegeprofil)

A care profile defines a standardized maintenance regime for a type of green space. The system ships with 31 pre-configured profiles based on the GSZ «Mehr als Grün» Profilkatalog. Profiles can be customized and extended by administrators.

Each profile includes a tension field rating (ecology vs. design vs. usage) and references a list of care actions with their timing and frequency.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **careProfileId** | PK | string | Unique identifier (e.g., «CP-GR» for Gebrauchsrasen). | **mandatory**, minLength: 1, maxLength: 50 | Profile ID | Profil-ID |
| **profileCode** | | string | Short code for map labelling (e.g., «GR», «BW», «PB»). | **mandatory**, minLength: 1, maxLength: 10 | Profile Code | Profilcode |
| **name** | | string | Full profile name. | **mandatory**, minLength: 1, maxLength: 200 | Name | Bezeichnung |
| **category** | | string, enum | Profile category. See [Profile Categories](#a3-care-profile-categories). | **mandatory** | Category | Kategorie |
| **description** | | string | Detailed description of the profile. | maxLength: 2000 | Description | Beschreibung |
| **naturalCareGuidelines** | | string | Principles of nature-based care for this profile. | maxLength: 2000 | Natural Care | Grundsätze naturnahe Pflege |
| **ecologyRating** | | number | Ecology rating in the tension field (1–5 scale). | **mandatory**, minimum: 1, maximum: 5 | Ecology | Ökologie |
| **designRating** | | number | Design rating in the tension field (1–5 scale). | **mandatory**, minimum: 1, maximum: 5 | Design | Gestaltung |
| **usageRating** | | number | Usage rating in the tension field (1–5 scale). | **mandatory**, minimum: 1, maximum: 5 | Usage | Nutzung |
| **mapColor** | | string | Hex color for map rendering (e.g., «#7CB342»). | **mandatory**, pattern: `^#[0-9A-Fa-f]{6}$` | Map Color | Kartenfarbe |
| **mapSymbol** | | string | Symbol identifier for map rendering. | maxLength: 50 | Map Symbol | Kartensymbol |
| **costPerM2Year** | | number | Estimated annual maintenance cost in CHF per m². | minimum: 0 | Cost/m²/yr | Kosten/m²/Jahr |
| **isSystemProfile** | | boolean | Is this a pre-configured GSZ standard profile? | | System Profile | Standardprofil |
| **referenceImageUrl** | | string | URL to reference image. | maxLength: 500 | Reference Image | Referenzbild |
| **validFrom** | | string | Record validity start date. ISO 8601 format. | **mandatory** | Valid From | Gültig von |
| **validUntil** | | string | Record validity end date. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `CareProfileAdded`, `CareProfileUpdated`, `CareProfileDeleted` | | Event Type | Ereignistyp |

#### Example: CareProfile Object

```json
{
  "careProfileId": "CP-BW",
  "profileCode": "BW",
  "name": "Blumenwiese",
  "category": "Rasen & Wiesen",
  "description": "Artenreiche, extensiv gepflegte Wiese mit standortgerechten Wildblumen und Gräsern. Wichtiger Lebensraum für Insekten und Kleintiere.",
  "naturalCareGuidelines": "Reduktion der Schnittfrequenz auf 1–2 Schnitte pro Jahr. Schnittgut abführen (Aushagerung). Verzicht auf Düngung und Herbizid-Einsatz. Zeitlich gestaffelte Mahd zur Sicherung von Rückzugsstreifen.",
  "ecologyRating": 5,
  "designRating": 3,
  "usageRating": 2,
  "mapColor": "#8BC34A",
  "mapSymbol": "meadow",
  "costPerM2Year": 2.50,
  "isSystemProfile": true,
  "referenceImageUrl": "/assets/images/profiles/blumenwiese.jpg",
  "validFrom": "2020-01-01T00:00:00Z",
  "validUntil": null,
  "createdAt": "2020-01-01T00:00:00Z",
  "updatedAt": "2025-01-15T10:00:00Z",
  "eventType": "CareProfileUpdated"
}
```

---

### 4.2 CareAction (Pflegemassnahme)

A care action is a specific maintenance task defined within a care profile. It specifies what to do, when, how often, and with what equipment. Care actions serve as templates for generating concrete tasks.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **careActionId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Action ID | Massnahmen-ID |
| **careProfileId** | FK | string | Reference to the parent care profile. | **mandatory**, minLength: 1, maxLength: 50 | Profile ID | Profil-ID |
| **actionName** | | string | Name of the action (e.g., «Mahd», «Schnitt», «Düngung»). | **mandatory**, minLength: 1, maxLength: 200 | Action Name | Massnahme |
| **description** | | string | Detailed description of the action. | maxLength: 2000 | Description | Beschreibung |
| **timingMonths** | | array[number] | Months when the action should be performed (1=Jan, 12=Dec). | items: minimum: 1, maximum: 12 | Timing | Zeitpunkt |
| **frequencyPerYear** | | number | How many times per year this action should be performed. | **mandatory**, minimum: 0 | Frequency | Häufigkeit/Jahr |
| **durationMinutesPerUnit** | | number | Estimated duration in minutes per 100m² or per tree. | minimum: 0 | Duration | Dauer |
| **equipmentNeeded** | | array[string] | List of required equipment. | | Equipment | Geräte/Maschinen |
| **materialsNeeded** | | array[string] | List of required materials. | | Materials | Materialien |
| **isNaturalCare** | | boolean | Is this action specific to the nature-based care variant? | | Natural Care | Naturnahe Pflege |
| **remarks** | | string | Additional remarks or caveats. | maxLength: 1000 | Remarks | Bemerkungen |

#### Example: CareAction Object

```json
{
  "careActionId": "CA-BW-01",
  "careProfileId": "CP-BW",
  "actionName": "Mahd",
  "description": "Wiese mit Balkenmäher oder Sense mähen. Schnittgut 2–3 Tage trocknen lassen, dann abführen.",
  "timingMonths": [6, 9],
  "frequencyPerYear": 2,
  "durationMinutesPerUnit": 15,
  "equipmentNeeded": ["Balkenmäher", "Rechen", "Heugabel"],
  "materialsNeeded": [],
  "isNaturalCare": true,
  "remarks": "Rückzugsstreifen (10–20%) stehen lassen und alternierend mähen."
}
```

---

### 4.3 Task (Massnahme)

A task represents a concrete, scheduled or completed maintenance work order. Tasks can be generated automatically from care profiles or created manually. Each task is linked to one or more spatial objects and assigned to a contact.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **taskId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Task ID | Massnahmen-ID |
| **title** | | string | Short title describing the task. | **mandatory**, minLength: 1, maxLength: 200 | Title | Titel |
| **description** | | string | Detailed description. | maxLength: 2000 | Description | Beschreibung |
| **taskType** | | string, enum | Type of task. See [Task Types](#a11-task-types). | **mandatory** | Task Type | Massnahmentyp |
| **priority** | | string, enum | Priority level. See [Priority Levels](#a2-shared-enumerations). | **mandatory** | Priority | Priorität |
| **status** | | string, enum | Workflow status. See [Task Status](#a12-task-status). | **mandatory** | Status | Status |
| **targetIds** | FK | array[string] | IDs of the spatial objects this task applies to. | **mandatory**, minLength: 1 | Targets | Zielobjekte |
| **targetType** | | string, enum | Type of target object. See [Target Types](#a2-shared-enumerations). | **mandatory** | Target Type | Zielobjekttyp |
| **siteId** | FK | string | Reference to the site. | **mandatory**, minLength: 1, maxLength: 50 | Site ID | Standort-ID |
| **careActionId** | FK | string | Reference to the care action template (if auto-generated). | maxLength: 50 | Care Action | Pflegemassnahme |
| **assignedContactId** | FK | string | Contact responsible for execution. | maxLength: 50 | Assigned To | Zugewiesen an |
| **dueDate** | | string | Planned due date. ISO 8601 format. | **mandatory** | Due Date | Fälligkeitsdatum |
| **startDate** | | string | Actual start date. ISO 8601 format. | | Start Date | Startdatum |
| **completedDate** | | string | Actual completion date. ISO 8601 format. | | Completed | Abschlussdatum |
| **approvedDate** | | string | Date of acceptance/sign-off. ISO 8601 format. | | Approved | Abnahmedatum |
| **plannedHours** | | number | Estimated work hours. | minimum: 0 | Planned Hours | Geplante Stunden |
| **actualHours** | | number | Actual work hours. | minimum: 0 | Actual Hours | Effektive Stunden |
| **equipmentUsed** | | array[string] | Equipment actually used. | | Equipment Used | Eingesetzte Geräte |
| **materialsUsed** | | array[string] | Materials actually used. | | Materials Used | Eingesetzte Materialien |
| **checklist** | | array[object] | Checklist items: `{ "item": string, "done": boolean }`. | | Checklist | Checkliste |
| **notes** | | string | Free-text notes. | maxLength: 2000 | Notes | Bemerkungen |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `TaskAdded`, `TaskUpdated`, `TaskDeleted` | | Event Type | Ereignistyp |

#### Task Status Workflow

```
Geplant → In Bearbeitung → Abgeschlossen → Abgenommen
```

Each transition records a timestamp and the responsible user.

#### Example: Task Object

```json
{
  "taskId": "TASK-001",
  "title": "Frühjahrsschnitt Blumenwiese Süd",
  "description": "Erster Schnitt der Blumenwiese gemäss Profil BW. Rückzugsstreifen 15% stehen lassen.",
  "taskType": "Pflege",
  "priority": "Mittel",
  "status": "Geplant",
  "targetIds": ["GA-001"],
  "targetType": "GreenArea",
  "siteId": "SITE-001",
  "careActionId": "CA-BW-01",
  "assignedContactId": "CONT-002",
  "dueDate": "2026-06-15T00:00:00Z",
  "startDate": null,
  "completedDate": null,
  "approvedDate": null,
  "plannedHours": 4,
  "actualHours": null,
  "equipmentUsed": [],
  "materialsUsed": [],
  "checklist": [
    { "item": "Balkenmäher vorbereiten", "done": false },
    { "item": "Rückzugsstreifen markieren", "done": false },
    { "item": "Mahd durchführen", "done": false },
    { "item": "Schnittgut 2 Tage trocknen lassen", "done": false },
    { "item": "Schnittgut abführen", "done": false }
  ],
  "notes": null,
  "createdAt": "2026-01-10T08:00:00Z",
  "updatedAt": "2026-01-10T08:00:00Z",
  "eventType": "TaskAdded"
}
```

> **Note:** The demo uses German values (e.g., `"taskType": "Pflege"`, `"status": "Geplant"`, `"priority": "Mittel"`). For English implementations, use `"taskType": "Maintenance"`, `"status": "Planned"`, `"priority": "Medium"`.

---

## 5. Supporting Entities

### 5.1 Contact (Kontakt)

Contacts represent people and organisations involved in green space management — internal staff, external contractors, authorities, and suppliers.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **contactId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Contact ID | Kontakt-ID |
| **name** | | string | Full name of person or organisation. | **mandatory**, minLength: 1, maxLength: 200 | Name | Name |
| **contactType** | | string, enum | Type of contact. See [Contact Types](#a14-contact-types). | **mandatory** | Contact Type | Kontaktart |
| **role** | | string, enum | Role or function. See [Contact Roles](#a15-contact-roles). | **mandatory** | Role | Rolle |
| **organisation** | | string | Organisation or department. | minLength: 1, maxLength: 200 | Organisation | Organisation |
| **phone** | | string | Phone number. | maxLength: 30 | Phone | Telefon |
| **email** | | string | Email address. | maxLength: 100, format: email | Email | E-Mail |
| **siteIds** | FK | array[string] | Array of site IDs this contact is associated with. | | Sites | Standorte |
| **isPrimary** | | boolean | Is this the primary contact for associated sites? | | Primary | Hauptkontakt |
| **validFrom** | | string | Contact assignment start date. ISO 8601 format. | **mandatory** | Valid From | Gültig von |
| **validUntil** | | string | Contact assignment end date. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `ContactAdded`, `ContactUpdated`, `ContactDeleted` | | Event Type | Ereignistyp |

#### Example: Contact Object

```json
{
  "contactId": "CONT-001",
  "name": "Martin Huber",
  "contactType": "Mitarbeiter",
  "role": "Bereichsleiter Grünflächen",
  "organisation": "Grün Stadt Zürich",
  "phone": "+41 44 412 27 00",
  "email": "martin.huber@zuerich.ch",
  "siteIds": ["SITE-001", "SITE-002"],
  "isPrimary": true,
  "validFrom": "2020-01-01T00:00:00Z",
  "validUntil": null,
  "createdAt": "2020-01-01T00:00:00Z",
  "updatedAt": "2025-06-01T10:00:00Z",
  "eventType": "ContactUpdated"
}
```

> **Note:** The demo uses German values (e.g., `"contactType": "Mitarbeiter"`, `"role": "Bereichsleiter Grünflächen"`). For English implementations, use `"contactType": "Employee"`, `"role": "Head of Green Spaces"`.

---

### 5.2 Contract (Vertrag)

Contracts represent service agreements for green space maintenance, including care contracts, tree inspection agreements, and supplier contracts.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **contractId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Contract ID | Vertrags-ID |
| **contractType** | | string, enum | Type of contract. See [Contract Types](#a16-contract-types). | **mandatory** | Contract Type | Vertragsart |
| **title** | | string | Contract title or description. | **mandatory**, minLength: 1, maxLength: 200 | Title | Titel |
| **contractPartner** | | string | Name of the contract partner. | **mandatory**, minLength: 1, maxLength: 200 | Partner | Vertragspartner |
| **siteIds** | FK | array[string] | Array of site IDs covered by this contract. | **mandatory**, minLength: 1 | Sites | Standorte |
| **contactId** | FK | string | Contact person for this contract. | maxLength: 50 | Contact | Ansprechperson |
| **validFrom** | | string | Contract start date. ISO 8601 format. | **mandatory** | Valid From | Vertragsbeginn |
| **validUntil** | | string | Contract end date. ISO 8601 format. | null allowed | Valid Until | Vertragsende |
| **amount** | | number | Contract value (annual or total). | minimum: 0 | Amount | Betrag |
| **currency** | | string | Currency code (ISO 4217). | minLength: 3, maxLength: 3 | Currency | Währung |
| **status** | | string, enum | Contract status. See [Contract Status](#a2-shared-enumerations). | **mandatory** | Status | Status |
| **reminderDate** | | string | Reminder date before expiry. ISO 8601 format. | | Reminder | Erinnerung |
| **autoRenewal** | | boolean | Does the contract auto-renew? | | Auto Renewal | Autom. Verlängerung |
| **notes** | | string | Free-text notes. | maxLength: 2000 | Notes | Bemerkungen |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `ContractAdded`, `ContractUpdated`, `ContractDeleted` | | Event Type | Ereignistyp |

#### Example: Contract Object

```json
{
  "contractId": "CONTR-001",
  "contractType": "Pflegevertrag",
  "title": "Grünflächenpflege Sonnenberg 2024–2027",
  "contractPartner": "Weber Gartenbau GmbH",
  "siteIds": ["SITE-001"],
  "contactId": "CONT-004",
  "validFrom": "2024-01-01T00:00:00Z",
  "validUntil": "2027-12-31T00:00:00Z",
  "amount": 85000,
  "currency": "CHF",
  "status": "Aktiv",
  "reminderDate": "2027-06-01T00:00:00Z",
  "autoRenewal": false,
  "notes": "Umfasst Rasenpflege, Staudenpflege und Heckenschnitt. Baumschnitt separat.",
  "createdAt": "2023-11-15T10:00:00Z",
  "updatedAt": "2024-01-05T09:00:00Z",
  "eventType": "ContractUpdated"
}
```

> **Note:** The demo uses German values (e.g., `"contractType": "Pflegevertrag"`, `"status": "Aktiv"`). For English implementations, use `"contractType": "Maintenance contract"`, `"status": "Active"`.

---

### 5.3 Document (Dokument)

Documents represent files and records associated with green space objects — care plans, photos, tree assessments, cadastral plans, and reports.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **documentId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Document ID | Dokument-ID |
| **name** | | string | Title or name of the document. | **mandatory**, minLength: 1, maxLength: 200 | Name | Bezeichnung |
| **documentType** | | string, enum | Type of document. See [Document Types](#a17-document-types). | **mandatory** | Type | Dokumenttyp |
| **targetIds** | FK | array[string] | IDs of the objects this document relates to. | **mandatory**, minLength: 1 | Targets | Zielobjekte |
| **targetType** | | string, enum | Type of target objects. See [Target Types](#a2-shared-enumerations). | **mandatory** | Target Type | Zielobjekttyp |
| **fileFormat** | | string | File format (e.g., «PDF», «JPG», «DWG», «GeoJSON»). | maxLength: 20 | Format | Dateiformat |
| **fileSize** | | string | File size as string (e.g., «2.4 MB»). | maxLength: 20 | Size | Dateigrösse |
| **url** | | string | URL or path to the document. | maxLength: 500 | URL | URL |
| **description** | | string | Description or notes about the document. | maxLength: 1000 | Description | Beschreibung |
| **version** | | string | Document version. | maxLength: 20 | Version | Version |
| **geoCoordinateLat** | | number | Latitude for geotagged photos. | | Latitude | Breitengrad |
| **geoCoordinateLng** | | number | Longitude for geotagged photos. | | Longitude | Längengrad |
| **validFrom** | | string | Document date or effective date. ISO 8601 format. | **mandatory** | Valid From | Gültig von |
| **validUntil** | | string | Expiry date for time-limited documents. | null allowed | Valid Until | Gültig bis |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `DocumentAdded`, `DocumentUpdated`, `DocumentDeleted` | | Event Type | Ereignistyp |

#### Example: Document Object

```json
{
  "documentId": "DOC-001",
  "name": "Pflegeübersichtsplan Sonnenberg 2025",
  "documentType": "Pflegeübersichtsplan",
  "targetIds": ["SITE-001"],
  "targetType": "Site",
  "fileFormat": "PDF",
  "fileSize": "4.8 MB",
  "url": "/documents/SITE-001/pflegeuebersichtsplan-2025.pdf",
  "description": "Farbkodierter Übersichtsplan aller Pflegeprofile der Parkanlage Sonnenberg.",
  "version": "2.0",
  "validFrom": "2025-01-15T00:00:00Z",
  "validUntil": null,
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:00:00Z",
  "eventType": "DocumentAdded"
}
```

> **Note:** The demo uses German values (e.g., `"documentType": "Pflegeübersichtsplan"`). For English implementations, use `"documentType": "Care overview plan"`.

---

### 5.4 Cost (Kosten)

Costs represent financial entries for green space maintenance — personnel costs, materials, external services, equipment, and disposal. Costs can be linked to specific tasks, sites, or areas, and support budget vs. actual tracking.

#### Schema Definition

| Field | PK/FK | Type | Description | Constraints | Alias (EN) | Alias (DE) |
|-------|-------|------|-------------|-------------|------------|------------|
| **costId** | PK | string | Unique identifier. | **mandatory**, minLength: 1, maxLength: 50 | Cost ID | Kosten-ID |
| **costCategory** | | string, enum | Cost category. See [Cost Categories](#a18-cost-categories). | **mandatory** | Category | Kostenkategorie |
| **costType** | | string | Specific cost type description. | **mandatory**, minLength: 1, maxLength: 200 | Cost Type | Kostenart |
| **siteIds** | FK | array[string] | Site IDs this cost belongs to. | **mandatory**, minLength: 1 | Sites | Standorte |
| **taskId** | FK | string | Reference to a specific task (optional). | maxLength: 50 | Task | Massnahme |
| **amount** | | number | Cost amount. | **mandatory**, minimum: 0 | Amount | Betrag |
| **currency** | | string | Currency code (ISO 4217). Default: «CHF». | **mandatory**, minLength: 3, maxLength: 3 | Currency | Währung |
| **period** | | string, enum | Cost period. See [Cost Periods](#a2-shared-enumerations). | **mandatory** | Period | Periode |
| **budgetYear** | | number | Budget year. | minimum: 2000, maximum: 2100 | Budget Year | Budgetjahr |
| **costCenter** | | string | Cost center code. | maxLength: 50 | Cost Center | Kostenstelle |
| **isActual** | | boolean | `true` = actual cost, `false` = budgeted/planned cost. | **mandatory** | Is Actual | Ist-Kosten |
| **referenceDate** | | string | Reference date. ISO 8601 format. | **mandatory** | Reference Date | Stichtag |
| **notes** | | string | Free-text notes. | maxLength: 2000 | Notes | Bemerkungen |
| **createdAt** | | string | Timestamp of record creation. | | Created | Erstellt |
| **updatedAt** | | string | Timestamp of last update. | | Updated | Aktualisiert |
| **eventType** | | string, enum | Domain event type. Options: `CostAdded`, `CostUpdated`, `CostDeleted` | | Event Type | Ereignistyp |

#### Example: Cost Object

```json
{
  "costId": "COST-001",
  "costCategory": "Personal",
  "costType": "Pflege Grünflächen",
  "siteIds": ["SITE-001"],
  "taskId": null,
  "amount": 120000,
  "currency": "CHF",
  "period": "Jährlich",
  "budgetYear": 2026,
  "costCenter": "CC-GSZ-410",
  "isActual": false,
  "referenceDate": "2026-01-01T00:00:00Z",
  "notes": "Budget für Eigenleistungen Pflege (2 FTE Reviergärtner/in).",
  "createdAt": "2025-11-01T08:00:00Z",
  "updatedAt": "2025-11-01T08:00:00Z",
  "eventType": "CostAdded"
}
```

> **Note:** The demo uses German values (e.g., `"costCategory": "Personal"`, `"period": "Jährlich"`). For English implementations, use `"costCategory": "Personnel"`, `"period": "Annual"`.

---

## 6. Future Entities [Preview]

The following entities are planned for future implementation:

### 6.1 ConditionAssessment (Zustandsbeurteilung)

Structured field assessment of green areas and trees with standardized scoring, damage documentation, and recommended measures.

**Relationship:** n Assessments → 1 Spatial Object (GreenArea, Tree, Furniture, etc.)

**Planned fields:** assessmentId, targetId, targetType, assessmentDate, assessor (contactId), overallScore, damageTypes, photographs, recommendedActions, urgency.

### 6.2 NeophyteReport (Neophyten-Meldung)

Field report for invasive neophyte sightings with species identification, location, estimated coverage, and management urgency.

**Relationship:** n Reports → 1 Site

**Planned fields:** reportId, siteId, species (from Infoflora Black List/Watch List), estimatedAreaM2, coordinates, photographs, urgency, managementMethod, disposalType, reportedBy, reportedDate.

### 6.3 MachineCatalog (Maschinen-/Gerätekatalog)

Reference catalog of machines and equipment used in green space maintenance, linked to care actions.

**Relationship:** n Machines ↔ n CareActions

**Planned fields:** machineId, name, category, manufacturer, purchaseYear, operatingCostPerHour, fuelType, emissionClass.

---

## 7. Appendix A: Reference Tables

### A.1 Site Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Park` | `Park` | Public park or garden |
| `Campus` | `Campus` | Campus grounds (school, university) |
| `Cemetery` | `Friedhof` | Cemetery or memorial grounds |
| `Sports facility` | `Sportanlage` | Sports facility grounds |
| `Street greenery` | `Strassenbegleitgrün` | Street-side green strips and medians |
| `School grounds` | `Schulanlage` | School grounds and yards |
| `Residential green` | `Wohnsiedlungsgrün` | Residential housing green areas |
| `Allotment garden` | `Familiengarten` | Community or allotment gardens |
| `Other` | `Andere` | Other site types |

### A.2 Shared Enumerations

#### Ownership Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Public` | `Öffentlich` | Publicly owned |
| `Private` | `Privat` | Privately owned |
| `Mixed` | `Gemischt` | Mixed ownership |

#### Status Types

Used by: Site, Contract

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Active` | `Aktiv` | Currently active and maintained |
| `In renovation` | `In Renovation` | Under renovation or restructuring |
| `In planning` | `In Planung` | Planned but not yet operational |
| `Inactive` | `Inaktiv` | No longer active or maintained |
| `Expired` | `Ausgelaufen` | Expired (contracts) |
| `Cancelled` | `Gekündigt` | Cancelled (contracts) |

#### Condition Scale

Used by: GreenArea, Tree, LinearFeature, Furniture, StructureElement, SurfaceArea, WaterFeature

| Value | Label (EN) | Label (DE) | Description |
|-------|------------|------------|-------------|
| 1 | `Very good` | `Sehr gut` | Excellent condition, no action needed |
| 2 | `Good` | `Gut` | Good condition, minor wear |
| 3 | `Adequate` | `Genügend` | Acceptable, maintenance recommended |
| 4 | `Poor` | `Schlecht` | Poor condition, maintenance required |
| 5 | `Very poor` | `Sehr schlecht` | Critical condition, urgent action needed |

#### Usage Intensity

Used by: GreenArea

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `High` | `Hoch` | Heavily used (sports fields, playgrounds) |
| `Medium` | `Mittel` | Moderate use (park lawns, paths) |
| `Low` | `Gering` | Light use (meadows, peripheral areas) |
| `None` | `Keine` | No public use (ecological reserves) |

#### Protection Status

Used by: Tree

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Protected` | `Geschützt` | Legally protected tree |
| `Noteworthy` | `Bemerkenswert` | Noteworthy or heritage tree (not legally protected) |
| `None` | `Kein Schutz` | No special protection |

#### Ecological Value

Used by: StructureElement

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Very high` | `Sehr hoch` | Outstanding biodiversity value |
| `High` | `Hoch` | Significant biodiversity value |
| `Medium` | `Mittel` | Moderate biodiversity value |
| `Low` | `Gering` | Limited biodiversity value |

#### Water Quality

Used by: WaterFeature

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Very good` | `Sehr gut` | Excellent water quality |
| `Good` | `Gut` | Good water quality |
| `Moderate` | `Mässig` | Moderate water quality |
| `Poor` | `Schlecht` | Poor water quality |

#### Priority Levels

Used by: Task

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `High` | `Hoch` | Urgent, immediate attention needed |
| `Medium` | `Mittel` | Normal priority |
| `Low` | `Niedrig` | Can be deferred |

#### Target Types

Used by: Task, Document

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Site` | `Standort` | Site entity |
| `GreenArea` | `Grünfläche` | Green area entity |
| `Tree` | `Baum` | Tree entity |
| `LinearFeature` | `Linienobjekt` | Linear feature entity |
| `Furniture` | `Mobiliar` | Furniture entity |
| `StructureElement` | `Strukturelement` | Structure element entity |
| `SurfaceArea` | `Belagsfläche` | Surface area entity |
| `WaterFeature` | `Gewässer` | Water feature entity |

#### Cost Periods

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Annual` | `Jährlich` | Yearly cost |
| `Monthly` | `Monatlich` | Monthly cost |
| `Quarterly` | `Quartalsweise` | Quarterly cost |
| `One-time` | `Einmalig` | One-time cost |

---

### A.3 Care Profile Categories

| Value (EN) | Value (DE) | Profiles |
|------------|------------|----------|
| `Lawns & Meadows` | `Rasen & Wiesen` | Gebrauchsrasen, Blumenrasen, Blumenwiese, Schotterrasen |
| `Plantings` | `Bepflanzungen` | Beetrosen, Bodendecker, Moorbeet, Ruderalvegetation, Staudenbepflanzung, Hochstaudenflur, Wechselflor |
| `Shrubs` | `Gehölze` | Strauchbepflanzung, Formhecken, Wildhecken |
| `Trees` | `Bäume` | Parkbaum, Strassenbaum, Obstbaum |
| `Special surfaces` | `Spezialflächen` | Vertikalbegrünung, Dachbegrünung extensiv |
| `Structure elements` | `Strukturelemente` | Trockenmauer, Asthaufen, Steinhaufen, Nisthilfen |
| `Surfaces` | `Beläge` | Chaussierung, Stabilizer, Asphalt/Ortbeton, Pflasterung/Plattenbeläge, Klinker, Fallschutz lose |
| `Water features` | `Gewässer` | Gewässer ruhend, Gewässer fliessend, Brunnen/Wasserbecken/Planschbecken |
| `Use areas` | `Nutzungsflächen` | Spielanlagen, Nutzgarten |

---

### A.4 Tree Categories

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Park tree` | `Parkbaum` | Tree in a park or garden setting |
| `Street tree` | `Strassenbaum` | Tree along a street or road |
| `Fruit tree` | `Obstbaum` | Fruit-bearing tree (orchard) |

---

### A.5 GSZ Care Profile Codes

Complete list of 31 pre-configured profiles based on the GSZ Profilkatalog:

| Code | Category (DE) | Profile Name (DE) | Profile Name (EN) |
|------|---------------|-------------------|-------------------|
| GR | Rasen & Wiesen | Gebrauchsrasen | Utility Lawn |
| BR | Rasen & Wiesen | Blumenrasen | Flower Lawn |
| BW | Rasen & Wiesen | Blumenwiese | Flower Meadow |
| SR | Rasen & Wiesen | Schotterrasen | Gravel Lawn |
| BT | Bepflanzungen | Beetrosen | Rose Bed |
| BD | Bepflanzungen | Bodendecker | Ground Cover |
| MB | Bepflanzungen | Moorbeet | Bog Bed |
| RV | Bepflanzungen | Ruderalvegetation | Ruderal Vegetation |
| ST | Bepflanzungen | Staudenbepflanzung | Perennial Planting |
| HS | Bepflanzungen | Hochstaudenflur | Tall Herb Vegetation |
| WF | Bepflanzungen | Wechselflor | Seasonal Planting |
| SB | Gehölze | Strauchbepflanzung | Shrub Planting |
| FH | Gehölze | Formhecken | Formal Hedges |
| WH | Gehölze | Wildhecken | Wild Hedges |
| PB | Bäume | Parkbaum | Park Tree |
| STB | Bäume | Strassenbaum | Street Tree |
| OB | Bäume | Obstbaum | Fruit Tree |
| VB | Spezialflächen | Vertikalbegrünung | Vertical Greening |
| DB | Spezialflächen | Dachbegrünung extensiv | Extensive Green Roof |
| TM | Strukturelemente | Trockenmauer | Dry Stone Wall |
| AH | Strukturelemente | Asthaufen | Brush Pile |
| SH | Strukturelemente | Steinhaufen | Stone Pile |
| NH | Strukturelemente | Nisthilfen | Nesting Aids |
| CH | Beläge | Chaussierung | Gravel Surface |
| SZ | Beläge | Stabilizer | Stabilizer Surface |
| AO | Beläge | Asphalt/Ortbeton | Asphalt/Concrete |
| PP | Beläge | Pflasterung/Plattenbeläge | Paving/Slabs |
| KL | Beläge | Klinker | Clinker |
| FL | Beläge | Fallschutz lose | Loose Fall Protection |
| GW-RU | Gewässer | Gewässer ruhend | Still Water |
| GW-FL | Gewässer | Gewässer fliessend | Flowing Water |
| GW-BR | Gewässer | Brunnen/Wasserbecken | Fountain/Water Basin |
| SA | Nutzungsflächen | Spielanlagen | Play Facilities |
| NG | Nutzungsflächen | Nutzgarten | Kitchen Garden |

> **Note:** Codes GW-RU, GW-FL, GW-BR use a category prefix to avoid collisions with other two-letter codes. The `careProfileId` in data files uses the format `CP-{CODE}` (e.g., `CP-BW`, `CP-GW-RU`).

---

### A.6 Linear Feature Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Formal hedge` | `Formhecke` | Trimmed/formal hedge |
| `Wild hedge` | `Wildhecke` | Natural/wild hedge |
| `Wall` | `Mauer` | Stone or brick wall |
| `Fence` | `Zaun` | Fence of any material |
| `Footpath` | `Fussweg` | Pedestrian path |
| `Cycle path` | `Radweg` | Bicycle path |

---

### A.7 Furniture Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Bench` | `Sitzbank` | Seating bench |
| `Fountain` | `Brunnen` | Drinking fountain or decorative fountain |
| `Play equipment` | `Spielgerät` | Playground equipment |
| `Waste bin` | `Abfallbehälter` | Waste or recycling bin |
| `Lighting` | `Beleuchtung` | Outdoor lighting fixture |
| `Bike rack` | `Veloständer` | Bicycle parking rack |
| `Table` | `Tisch` | Outdoor table |
| `Pergola` | `Pergola` | Pergola or shelter structure |
| `Signage` | `Beschilderung` | Information or wayfinding signs |

---

### A.8 Structure Element Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Dry stone wall` | `Trockenmauer` | Wall built without mortar for ecological habitat |
| `Brush pile` | `Asthaufen` | Pile of branches for habitat |
| `Stone pile` | `Steinhaufen` | Pile of stones for habitat |
| `Nesting aid` | `Nisthilfe` | Bird or insect nesting structures |
| `Dead wood` | `Totholz` | Standing or lying dead wood for habitat |
| `Insect hotel` | `Insektenhotel` | Constructed insect habitat |
| `Sand area` | `Sandfläche` | Bare sand area for ground-nesting species |

---

### A.9 Surface Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Gravel surface` | `Chaussierung` | Water-bound gravel surface |
| `Stabilizer` | `Stabilizer` | Stabilized earth surface |
| `Asphalt/Concrete` | `Asphalt/Ortbeton` | Asphalt or poured concrete |
| `Paving/Slabs` | `Pflasterung/Plattenbeläge` | Stone paving or concrete slabs |
| `Clinker` | `Klinker` | Clinker brick paving |
| `Loose fall protection` | `Fallschutz lose` | Loose fill fall protection (bark, sand, rubber) |
| `Rubber surface` | `Fallschutz gebunden` | Bound rubber safety surface |
| `Tartan` | `Tartan` | Synthetic sports surface |

---

### A.10 Water Feature Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Still water` | `Ruhend` | Pond, lake, or pool |
| `Flowing water` | `Fliessend` | Stream, brook, or channel |
| `Fountain/Basin` | `Brunnen/Wasserbecken` | Fountain, water basin, or paddling pool |

---

### A.11 Task Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Maintenance` | `Pflege` | Regular maintenance activity |
| `New construction` | `Neubau` | New installation or planting |
| `Renovation` | `Sanierung` | Renovation or restructuring |
| `Inspection` | `Inspektion` | Inspection or assessment |
| `Neophyte control` | `Neophytenbekämpfung` | Invasive species management |

---

### A.12 Task Status

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Planned` | `Geplant` | Scheduled, not yet started |
| `In progress` | `In Bearbeitung` | Currently being executed |
| `Completed` | `Abgeschlossen` | Work completed, awaiting sign-off |
| `Accepted` | `Abgenommen` | Signed off and accepted |

---

### A.13 Neophyte Management (for Task Type «Neophytenbekämpfung»)

When a task has `taskType: "Neophytenbekämpfung"`, the following additional attributes apply (stored in `notes` or as structured fields in future versions):

| Attribute | Description |
|-----------|-------------|
| Species | Invasive species (per Infoflora Black List / Watch List) |
| Control method | Mechanical removal, cutting, root extraction |
| Safety measures | Protective equipment, disposal precautions |
| Disposal type | Green waste, incineration (for certain species like Ambrosia) |

Common invasive species in Swiss green spaces:

| Scientific Name | Common Name (DE) | Common Name (EN) |
|----------------|------------------|-------------------|
| `Ailanthus altissima` | `Götterbaum` | `Tree of Heaven` |
| `Reynoutria japonica` | `Japanischer Staudenknöterich` | `Japanese Knotweed` |
| `Solidago canadensis` | `Kanadische Goldrute` | `Canadian Goldenrod` |
| `Buddleja davidii` | `Sommerflieder` | `Butterfly Bush` |
| `Robinia pseudoacacia` | `Robinie` | `Black Locust` |
| `Ambrosia artemisiifolia` | `Aufrechtes Traubenkraut` | `Common Ragweed` |
| `Heracleum mantegazzianum` | `Riesenbärenklau` | `Giant Hogweed` |
| `Impatiens glandulifera` | `Drüsiges Springkraut` | `Himalayan Balsam` |

---

### A.14 Contact Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Employee` | `Mitarbeiter` | Internal municipal employee |
| `Contractor` | `Unternehmer` | External contractor (landscaping, tree care) |
| `Authority` | `Behörde` | Government authority or agency |
| `Supplier` | `Lieferant` | Material or equipment supplier |

---

### A.15 Contact Roles

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Head of Green Spaces` | `Bereichsleiter Grünflächen` | Department head for green spaces |
| `District Gardener` | `Reviergärtner/in` | Gardener responsible for a district |
| `Tree Inspector` | `Baumkontrolleur/in` | Certified tree inspection specialist |
| `Landscape Architect` | `Landschaftsarchitekt/in` | Landscape architecture professional |
| `Nature Conservation` | `Natur- und Umweltschutz` | Nature and environmental conservation officer |
| `Operations Manager` | `Betriebsleiter/in` | Operations manager |
| `Contractor Manager` | `Projektleiter/in Unternehmer` | Contact person at contractor firm |
| `Other` | `Sonstige` | Other role |

---

### A.16 Contract Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Maintenance contract` | `Pflegevertrag` | Green space maintenance contract |
| `Tree care contract` | `Baumkontrollvertrag` | Tree inspection and care contract |
| `Playground inspection` | `Spielplatzwartung` | Playground equipment inspection |
| `Neophyte control` | `Neophytenbekämpfung` | Invasive species management contract |
| `Winter service` | `Winterdienst` | Snow removal and winter maintenance |
| `Supply contract` | `Liefervertrag` | Material or plant supply contract |
| `Service contract` | `Dienstleistungsvertrag` | General service contract |
| `Other` | `Sonstige` | Other contract type |

---

### A.17 Document Types

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Care plan` | `Pflegeplan` | Maintenance or care plan document |
| `Care overview plan` | `Pflegeübersichtsplan` | Color-coded care profile map |
| `Photograph` | `Foto` | Photograph (with optional geotag) |
| `Tree assessment` | `Baumgutachten` | Tree condition assessment report |
| `Cadastral plan` | `Katasterplan` | Cadastral or survey plan |
| `Safety data sheet` | `Sicherheitsdatenblatt` | Safety data sheet for chemicals |
| `Contract document` | `Vertragsdokument` | Contract or agreement document |
| `Inspection report` | `Inspektionsbericht` | Inspection report |
| `Profile sheet` | `Profilblatt` | GSZ profile sheet (Praxishandbuch) |
| `CAD drawing` | `CAD-Zeichnung` | CAD plan (DXF/DWG) |
| `Other` | `Sonstige` | Other document type |

---

### A.18 Cost Categories

| Value (EN) | Value (DE) | Description |
|------------|------------|-------------|
| `Personnel` | `Personal` | Internal staff costs |
| `Materials` | `Material` | Seeds, fertilizer, soil, plants |
| `External services` | `Fremdleistung` | External contractor services |
| `Equipment` | `Maschinen` | Machine and equipment costs |
| `Disposal` | `Entsorgung` | Green waste and disposal costs |
| `Water` | `Wasser` | Irrigation and water costs |
| `Other` | `Sonstige` | Other costs |

---

## 8. Appendix B: Transformation Rules

### B.1 Date Format

All dates must be in ISO 8601 format: `yyyy-mm-ddThh:mm:ssZ`

| Source Format | Conversion Rule | Example |
|---------------|-----------------|---------|
| Year only (e.g., «2019») | Use January 1st: `yyyy-01-01T00:00:00Z` | «2019» → `"2019-01-01T00:00:00Z"` |
| Date only (e.g., «2019-03-15») | Add time: `yyyy-mm-ddT00:00:00Z` | «2019-03-15» → `"2019-03-15T00:00:00Z"` |
| Swiss format (e.g., «15.03.2019») | Parse and convert | «15.03.2019» → `"2019-03-15T00:00:00Z"` |
| Null or empty | Use `null` for optional fields | `""` → `null` |

All timestamps are stored in UTC (suffix `Z`).

### B.2 Coordinate Reference Systems

| Context | CRS | Format |
|---------|-----|--------|
| GeoJSON geometry | WGS84 (EPSG:4326) | `[longitude, latitude]` — required by RFC 7946 |
| Optional Swiss coordinates | LV95 (EPSG:2056) | `lv95East`, `lv95North` fields — for cadastral precision |

When importing data in LV95, convert to WGS84 for GeoJSON storage and retain original LV95 values in the dedicated fields.

### B.3 Area Calculations

- Area values (`areaM2`) should be derived from polygon geometry where possible
- Manual overrides are permitted (the stored value takes precedence)
- Unit is always square meters (m²)

### B.4 Currency

- Default currency: `CHF` (Swiss Franc)
- All monetary amounts use ISO 4217 currency codes

---

## 9. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | February 2026 | Complete rewrite for green space management domain. Replaces BBL Immobilienportfolio data model. 15 entities covering spatial inventory, care profiles, maintenance tasks, contacts, contracts, documents, and costs. |

---

## 10. References

| Source | Title | Year |
|--------|-------|------|
| ZHAW / Grün Stadt Zürich | Profilkatalog naturnahe Pflege «Mehr als Grün» | 2019 |
| ZHAW / Grün Stadt Zürich | Praxishandbuch naturnahe Pflege «Mehr als Grün» | 2019 |
| BAFU | Aktionsplan Strategie Biodiversität Schweiz | 2017 |
| Infoflora | Schwarze Liste und Watch List invasiver Neophyten | fortlaufend |
| swisstopo | LV95 — Schweizer Koordinatenreferenzsystem | — |
| IETF | RFC 7946 — The GeoJSON Format | 2016 |
| ISO | ISO 8601 — Date and time format | — |
| ISO | ISO 4217 — Currency codes | — |
| ISO | ISO 3166 — Country codes | — |

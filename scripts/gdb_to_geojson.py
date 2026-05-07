"""
Convert GFMBundesgaerten.gdb -> data/data.geojson

Source layers:
  Objekt                  - 73 site boundary polygons (one per Standort)
  Pflegeelement_point     - 2737 point features (trees + benches + lamps + ...)
  Pflegeelement_polygon   - 3283 polygons (vegetation areas + tree-canopy circles)

Output: a single FeatureCollection in WGS84. Each feature carries:
  - properties.entity_type  in {site, site_location, tree, tree_canopy, point, area}
  - properties.category     used by the existing legend/filter code paths
  - all raw GDB columns preserved (with decoded labels added where we have a codelist)

The Excel sheet "Liste_Objekte.xls" supplies decoded labels for the 5 FK
columns on Objekt. The point/polygon layers reference fk_profil,
fk_pflegeklasse, fk_pflegedurchfuehrung, fk_zustand, fk_baumart,
fk_pflegeverantwortung, fk_winterdienst, fk_kostenstelle - we don't have
those codelists yet, so the integers are kept verbatim plus a placeholder
profil_label such as "Profil 19" that the UI can swap once the catalog
arrives.

Run:
    python scripts/gdb_to_geojson.py
"""

from __future__ import annotations

import json
import math
import os
from collections import Counter
from datetime import datetime, date
from pathlib import Path

import pandas as pd
import pyogrio
from pyproj import Transformer
from shapely.geometry import mapping
from shapely.ops import transform as sh_transform

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
GDB_PATH = Path(r"C:\Users\DavidRasner\Downloads\Daten_Bundesgärtnerei\GFMBundesgaerten.gdb")
XLS_PATH = Path(r"C:\Users\DavidRasner\Downloads\Daten_Bundesgärtnerei\Liste_Objekte.xls")
OUT_PATH = ROOT / "data" / "data.geojson"

SRC_CRS = "EPSG:21781"   # CH1903 / LV03 (the GDB's stated CRS)
LV95_CRS = "EPSG:2056"   # CH1903+ / LV95
WGS84 = "EPSG:4326"

to_wgs = Transformer.from_crs(SRC_CRS, WGS84, always_xy=True).transform
to_lv95 = Transformer.from_crs(SRC_CRS, LV95_CRS, always_xy=True).transform

# ---------------------------------------------------------------------------
# Codelist decoders (Objekt only - decoded from Liste_Objekte.xls)
# ---------------------------------------------------------------------------
PFLEGEKLASSE = {1: "PK 1", 2: "PK 2", 3: "PK 3"}
EIGENTUEMER = {1: "Bund", 2: "Dritte"}
PFLEGEVERANTWORTUNG = {1: "intern", 2: "extern", 3: "intern/extern"}
JA_NEIN = {0: None, 1: "ja", 2: "nein"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def to_int(v):
    """Coerce a value to int, preserving None/NaN.

    pyogrio promotes integer columns containing nulls to float64 (a pandas
    quirk - NaN doesn't fit in int64).  That makes codes display as "1.0"
    instead of "1".  Apply this to columns we know are integer codes.
    """
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "item"):
        try:
            v = v.item()
        except Exception:
            pass
    if isinstance(v, float):
        if math.isnan(v):
            return None
        return int(v)
    return v


def jsonify(v):
    """Make a value JSON-serializable.

    Handles:
      - pandas NaT / NA / NaN (-> None)
      - datetime / date / pandas Timestamp (-> ISO 8601 string)
      - numpy scalar types (np.int32, np.float64, ...) -> Python scalars
      - Python float NaN -> None
    """
    if v is None:
        return None
    # pandas missing-value sentinels
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        # pd.isna raises on arrays/list-likes - safe to ignore for scalars
        pass
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, float) and math.isnan(v):
        return None
    # numpy scalar -> Python native via .item()
    if hasattr(v, "item") and not isinstance(v, str):
        try:
            return v.item()
        except (ValueError, AttributeError):
            pass
    return v


CANOPY_MIN_AREA_M2 = 1.5  # below this we treat circle polygons as ornamental
                          # area features (Bollensteine etc.), not tree crowns.

def is_canopy(geom_length: float | None, geom_area: float | None) -> bool:
    """Detect tree-canopy circles in the polygon layer.

    These are stored as small regular polygons approximating a circle:
    perimeter ~ 2*pi*r, area ~ pi*r^2.  The relation P^2 / (4*pi*A) = 1
    holds for any circle regardless of size, so we test that ratio.

    We also require a minimum area: many decorative "Bollenstein" features
    (round paving stones) are also 12-gon circles in the data, but at
    ~0.05 m² they're not tree crowns.  Anything smaller than
    CANOPY_MIN_AREA_M2 is left as a regular `area` feature.
    """
    if not geom_length or not geom_area:
        return False
    if geom_length <= 0 or geom_area <= 0:
        return False
    if geom_area < CANOPY_MIN_AREA_M2:
        return False
    ratio = (geom_length * geom_length) / (4 * math.pi * geom_area)
    return abs(ratio - 1.0) < 0.05


def reproject(geom, transformer):
    """Reproject a Shapely geometry using a pyproj transformer."""
    return sh_transform(transformer, geom)


def round_coords(geom, ndigits=7):
    """Round geometry coordinates to keep file size reasonable.

    7 decimals of WGS84 latitude is ~1.1 cm precision - more than enough for
    a green-area inventory.
    """
    def _round(x, y, z=None):
        if z is None:
            return (round(x, ndigits), round(y, ndigits))
        return (round(x, ndigits), round(y, ndigits), z)
    return sh_transform(_round, geom)


# ---------------------------------------------------------------------------
# Site loader (Objekt)
# ---------------------------------------------------------------------------
def load_sites():
    """Return (site_polygon_features, site_location_features, site_lookup).

    site_lookup maps OBJECTID -> dict(name, address, ...) so the point/polygon
    builders can attach the site name to every child feature.
    """
    # We pull the Excel sheet primarily for the decoded values.  The GDB
    # itself contains the raw integers; the Excel is the only place where the
    # FK codes are spelled out.
    obj_df = pd.read_excel(XLS_PATH, sheet_name="Objekt")
    decoded_by_oid = {row.OBJECTID: row for row in obj_df.itertuples()}

    polys = []
    dots = []
    lookup = {}

    # pyogrio gives us every column the FileGDB driver knows about (fiona
    # 1.10 silently drops columns the OpenFileGDB driver added in newer
    # GDAL versions, e.g. aufwandsfaktor).
    gdf = pyogrio.read_dataframe(GDB_PATH, layer="Objekt", fid_as_index=True)
    for oid, row in gdf.iterrows():
        if row.geometry is None or row.geometry.is_empty:
            continue
        geom = row.geometry
        props = row.drop("geometry").to_dict()
        oid = int(oid) if oid is not None else None
    # (existing logic resumes below — vars: oid, props, geom)

        geom_lv95 = reproject(geom, to_lv95)
        geom_wgs = round_coords(reproject(geom, to_wgs))

        centroid_src = geom.representative_point()  # always inside polygon
        centroid_lv95 = reproject(centroid_src, to_lv95)
        cx_lv95, cy_lv95 = centroid_lv95.x, centroid_lv95.y
        centroid_wgs = round_coords(reproject(centroid_src, to_wgs))

        # Decoded fields.  Fall back to raw integer text if the Excel
        # row is missing for some reason.
        xl = decoded_by_oid.get(oid)
        pflegeklasse_lbl = (xl.fk_pflegeklasseObjekt if xl is not None
                            else PFLEGEKLASSE.get(props.get("fk_pflegeklasseObjekt")))
        eigentuemer_lbl = (xl.fk_eigentuemer if xl is not None
                           else EIGENTUEMER.get(props.get("fk_eigentuemer")))
        verantwortung_lbl = (xl.fk_pflegeverantwortungObjekt if xl is not None
                             else PFLEGEVERANTWORTUNG.get(props.get("fk_pflegeverantwortungObjekt")))
        kontrolle_lbl = (xl.kontrolle if xl is not None
                         else JA_NEIN.get(props.get("kontrolle")))
        reinigung_lbl = (xl.reinigung if xl is not None
                         else JA_NEIN.get(props.get("reinigung")))

        # Same identifier values exposed under two names: the native site
        # columns AND the site_* form used by child features.  This way
        # the table needs only one column for "Standort" / "Adresse" /
        # "Objekt-Nr." / "Los" instead of two.
        objektnummer_v = jsonify(props.get("objektnummer"))
        name_v        = jsonify(props.get("objektbezeichnung"))
        adresse_v     = jsonify(props.get("Adresse"))
        lose_v        = jsonify(props.get("Lose"))
        base = {
            "objectid": oid,
            "site_oid": oid,
            "objektnummer": objektnummer_v,
            "site_objektnummer": objektnummer_v,
            "name": name_v,
            "site_name": name_v,
            "adresse": adresse_v,
            "site_adresse": adresse_v,
            "parzelle": jsonify(props.get("parzelle")),
            "lose": lose_v,
            "site_lose": lose_v,
            "erstellungsjahr": to_int(props.get("erstellungsjahr")),
            "erfassungsdatum": jsonify(props.get("Erfassungsdatum")),
            "objektausmass": jsonify(props.get("objektausmass")),
            "titel_objektblatt": jsonify(props.get("TitelObjektblatt")),
            "titel_kalkulation": jsonify(props.get("TitelKalkulation")),
            "bemerkung": jsonify(props.get("bemerkung")),
            "shape_length_m": jsonify(props.get("Shape_Length")),
            "shape_area_m2": jsonify(props.get("Shape_Area")),
            # Decoded codelist values (Excel cells may be NaN -> normalise)
            "pflegeklasse": jsonify(pflegeklasse_lbl),
            "eigentuemer": jsonify(eigentuemer_lbl),
            "pflegeverantwortung": jsonify(verantwortung_lbl),
            "kontrolle": jsonify(kontrolle_lbl),
            "reinigung": jsonify(reinigung_lbl),
            # Raw codelist FKs (kept for reference)
            "fk_pflegeklasse_raw": to_int(props.get("fk_pflegeklasseObjekt")),
            "fk_eigentuemer_raw": to_int(props.get("fk_eigentuemer")),
            "fk_pflegeverantwortung_raw": to_int(props.get("fk_pflegeverantwortungObjekt")),
            "kontrolle_raw": to_int(props.get("kontrolle")),
            "reinigung_raw": to_int(props.get("reinigung")),
            "lv95_east_centroid": round(cx_lv95, 2),
            "lv95_north_centroid": round(cy_lv95, 2),
        }

        # Polygon feature
        polys.append({
            "type": "Feature",
            "geometry": mapping(geom_wgs),
            "properties": {
                **base,
                "entity_type": "site",
                "category": "site_boundary",
                "feature_type": "Standort",
                "subtype": "Standortfläche",
                "area_m2": round(geom_lv95.area, 1),
                "source": "GDB:Objekt",
            },
        })

        # Centroid dot - one per Standort, useful when zoomed out
        dots.append({
            "type": "Feature",
            "geometry": mapping(centroid_wgs),
            "properties": {
                **base,
                "entity_type": "site_location",
                "category": "site_location",
                "feature_type": "Standort",
                "subtype": "Standort-Markierung",
                "area_m2": round(geom_lv95.area, 1),
                "source": "GDB:Objekt (Zentroid)",
            },
        })

        lookup[oid] = {
            "name": base["name"],
            "objektnummer": base["objektnummer"],
            "adresse": base["adresse"],
            "lose": base["lose"],
        }

    return polys, dots, lookup


# ---------------------------------------------------------------------------
# Point loader (Pflegeelement_point)
# ---------------------------------------------------------------------------
def load_points(site_lookup):
    trees = []
    others = []
    gdf = pyogrio.read_dataframe(GDB_PATH, layer="Pflegeelement_point")
    for _, row in gdf.iterrows():
        if row.geometry is None or row.geometry.is_empty:
            continue
        geom = row.geometry
        props = row.drop("geometry").to_dict()

        geom_lv95 = reproject(geom, to_lv95)
        geom_wgs = round_coords(reproject(geom, to_wgs))

        site_oid = props.get("fk_objektbezeichnung")
        if pd.isna(site_oid):
            site_oid = None
        else:
            site_oid = int(site_oid)
        site = site_lookup.get(site_oid, {})

        raw_baumart = props.get("baumart")
        baumart = (raw_baumart.strip() if isinstance(raw_baumart, str) else "") or None
        fk_baumart = props.get("fk_baumart")
        if pd.isna(fk_baumart):
            fk_baumart = None
        is_tree = bool(baumart) or (fk_baumart not in (None, 0))

        # aufwandsfaktor (effort factor): real numeric data missed by fiona,
        # surfaced via pyogrio.  Range observed: 0.5 - 5.0, mostly 1.0.
        #
        # Skipped (verified always 0/None across all 2737/3283 rows):
        #   objektbezeichnung_name, eigentuemer_name, kostenstelle_name,
        #   parzelle_name, fk_kostenstelle, fk_zustand, naturobjekt,
        #   hoehe (point), and per-point fk_pflegeklasse.
        # Kept (occasionally populated): fk_pflegeklasse (polygon: 43 rows
        # have value 2), fk_pflegeverantwortung (point: 1 row).
        base = {
            "site_oid": site_oid,
            "site_name": site.get("name"),
            "site_objektnummer": site.get("objektnummer"),
            "site_adresse": site.get("adresse"),
            "site_lose": site.get("lose"),
            "fk_profil": to_int(props.get("fk_profil")),
            "profil_label": (f"Profil {to_int(props.get('fk_profil'))}"
                             if not pd.isna(props.get("fk_profil")) else None),
            "fk_pflegedurchfuehrung": to_int(props.get("fk_pflegedurchfuehrung")),
            "fk_pflegeverantwortung": to_int(props.get("fk_pflegeverantwortung")),
            # aufwandsfaktor stored as float32 in the GDB - round away the
            # rounding-error tail so 0.6 doesn't print as 0.6000000238.
            "aufwandsfaktor": (round(jsonify(props.get("aufwandsfaktor")), 2)
                               if not pd.isna(props.get("aufwandsfaktor")) else None),
            "bewaesserung": to_int(props.get("bewaesserung")),
            "lauben": to_int(props.get("lauben")),
            "max_hoehe_m": jsonify(props.get("maxHoehe")),  # float (e.g. 1.4)
            "ausmass": to_int(props.get("ausmass")),
            "bemerkung": jsonify(props.get("bemerkung")),
            "letzte_aenderung": jsonify(props.get("letzte_aenderung")),
            "lv95_east": round(geom_lv95.x, 2),
            "lv95_north": round(geom_lv95.y, 2),
        }

        if is_tree:
            base.update({
                "baumart": baumart,
                "fk_baumart": to_int(fk_baumart),
                "baumnummer": to_int(props.get("Baumnummer")),
            })
            trees.append({
                "type": "Feature",
                "geometry": mapping(geom_wgs),
                "properties": {
                    **base,
                    "entity_type": "tree",
                    "category": "tree",
                    "feature_type": "Baum",
                    "subtype": baumart or f"Baum (Art-Code {to_int(fk_baumart)})",
                    "source": "GDB:Pflegeelement_point",
                },
            })
        else:
            others.append({
                "type": "Feature",
                "geometry": mapping(geom_wgs),
                "properties": {
                    **base,
                    "entity_type": "point",
                    "category": "point_other",
                    "feature_type": "Punktelement",
                    "subtype": (f"Profil {to_int(props.get('fk_profil'))}"
                                if not pd.isna(props.get("fk_profil")) else "Punktelement"),
                    "source": "GDB:Pflegeelement_point",
                },
            })

    return trees, others


# ---------------------------------------------------------------------------
# Polygon loader (Pflegeelement_polygon)
# ---------------------------------------------------------------------------
def load_polygons(site_lookup):
    canopies = []
    areas = []
    gdf = pyogrio.read_dataframe(GDB_PATH, layer="Pflegeelement_polygon")
    for _, row in gdf.iterrows():
        if row.geometry is None or row.geometry.is_empty:
            continue
        geom = row.geometry
        props = row.drop("geometry").to_dict()

        geom_lv95 = reproject(geom, to_lv95)
        geom_wgs = round_coords(reproject(geom, to_wgs))

        site_oid = props.get("fk_objektbezeichnung")
        if pd.isna(site_oid):
            site_oid = None
        else:
            site_oid = int(site_oid)
        site = site_lookup.get(site_oid, {})

        base = {
            "site_oid": site_oid,
            "site_name": site.get("name"),
            "site_objektnummer": site.get("objektnummer"),
            "site_adresse": site.get("adresse"),
            "site_lose": site.get("lose"),
            "fk_profil": to_int(props.get("fk_profil")),
            "profil_label": (f"Profil {to_int(props.get('fk_profil'))}"
                             if not pd.isna(props.get("fk_profil")) else None),
            "fk_pflegedurchfuehrung": to_int(props.get("fk_pflegedurchfuehrung")),
            "fk_pflegeklasse": to_int(props.get("fk_pflegeklasse")),  # 43 rows non-zero
            "fk_winterdienst": to_int(props.get("fk_winterdienst")),
            # aufwandsfaktor stored as float32 in the GDB - round away the
            # rounding-error tail so 0.6 doesn't print as 0.6000000238.
            "aufwandsfaktor": (round(jsonify(props.get("aufwandsfaktor")), 2)
                               if not pd.isna(props.get("aufwandsfaktor")) else None),
            "bewaesserung": to_int(props.get("bewaesserung")),
            "lauben": to_int(props.get("lauben")),
            "max_hoehe_m": jsonify(props.get("maxHoehe")),  # float
            "ausmass": jsonify(props.get("ausmass")),  # mostly None, kept as-is
            "bemerkung": jsonify(props.get("bemerkung")),
            "geom_length_m": jsonify(props.get("geom_Length")),
            "geom_area_m2": round(geom_lv95.area, 2),
        }

        if is_canopy(props.get("geom_Length"), props.get("geom_Area")):
            # Tree-canopy circle - rendered as a circle outline on the map.
            # Area gives crown surface; radius = sqrt(area/pi).
            radius_m = math.sqrt(props["geom_Area"] / math.pi)
            canopies.append({
                "type": "Feature",
                "geometry": mapping(geom_wgs),
                "properties": {
                    **base,
                    "entity_type": "tree_canopy",
                    "category": "tree_canopy",
                    "feature_type": "Baumkrone",
                    "subtype": (f"Profil {to_int(props.get('fk_profil'))}"
                                if not pd.isna(props.get("fk_profil")) else "Baumkrone"),
                    "crown_radius_m": round(radius_m, 2),
                    "crown_diameter_m": round(2 * radius_m, 2),
                    "area_m2": round(geom_lv95.area, 1),
                    "source": "GDB:Pflegeelement_polygon (circle)",
                },
            })
        else:
            areas.append({
                "type": "Feature",
                "geometry": mapping(geom_wgs),
                "properties": {
                    **base,
                    "entity_type": "area",
                    # Use fk_profil as sub-category so each profile gets its
                    # own colour bucket in the legend until we have a real
                    # codelist.
                    "category": (f"profil_{to_int(props.get('fk_profil'))}"
                                 if not pd.isna(props.get("fk_profil")) else "profil_unknown"),
                    "feature_type": "Pflegefläche",
                    "subtype": (f"Profil {to_int(props.get('fk_profil'))}"
                                if not pd.isna(props.get("fk_profil")) else "Profil ?"),
                    "area_m2": round(geom_lv95.area, 1),
                    "source": "GDB:Pflegeelement_polygon",
                },
            })

    return canopies, areas


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"Reading: {GDB_PATH}")
    sites, dots, lookup = load_sites()
    trees, others = load_points(lookup)
    canopies, areas = load_polygons(lookup)

    # Order matters - features rendered later sit on top.  We want sites at
    # the bottom (large boundary polygons), then areas, then tree canopies,
    # then trees and other points, then site-centroid dots on top.
    features = []
    features.extend(sites)
    features.extend(areas)
    features.extend(canopies)
    features.extend(trees)
    features.extend(others)
    features.extend(dots)

    # Stable feature ids = array index (keeps URL ?sel=N stable).
    for i, f in enumerate(features):
        f["id"] = i

    # Compute distinct fk_profil values for the legend
    profile_codes = sorted({
        f["properties"]["fk_profil"]
        for f in features
        if f["properties"].get("fk_profil") is not None
    })
    profile_counts = Counter(
        f["properties"].get("fk_profil")
        for f in features
        if f["properties"].get("entity_type") == "area"
    )

    fc = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "metadata": {
            "source": str(GDB_PATH),
            "extracted_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "src_crs": SRC_CRS,
            "out_crs": "EPSG:4326 (WGS84, RFC 7946)",
            "lv95_in_properties": True,
            "counts": {
                "sites": len(sites),
                "site_locations": len(dots),
                "trees": len(trees),
                "points_other": len(others),
                "tree_canopies": len(canopies),
                "areas": len(areas),
                "total": len(features),
            },
            "fk_profil_values": profile_codes,
            "fk_profil_area_counts": dict(sorted(profile_counts.items(), key=lambda kv: -kv[1])),
            "todo_codelists": [
                "fk_profil (1..40)  - GSZ care profile codes",
                "fk_pflegedurchfuehrung (1..9)",
                "fk_pflegeklasse (point/polygon)",
                "fk_zustand",
                "fk_baumart - tree species table",
                "fk_winterdienst, fk_kostenstelle",
            ],
        },
        "features": features,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Belt-and-suspenders: walk the whole structure once more and replace any
    # NaN that slipped through (pandas/numpy can introduce them via Excel
    # rows).  json.dump with allow_nan=False also enforces strict RFC 8259.
    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, list):
            return [clean(v) for v in o]
        return jsonify(o)
    fc = clean(fc)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, indent=1, allow_nan=False)

    sz = os.path.getsize(OUT_PATH)
    print(f"Wrote {OUT_PATH} ({sz/1024/1024:.1f} MB, {len(features)} features)")
    print("Counts:", fc["metadata"]["counts"])
    print("Distinct fk_profil:", profile_codes)


if __name__ == "__main__":
    main()

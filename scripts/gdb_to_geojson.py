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

import fiona
import pandas as pd
from pyproj import Transformer
from shapely.geometry import shape, mapping
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
def jsonify(v):
    """Make a value JSON-serializable (handles dates, NaN, etc.)."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def is_circle(geom_length: float | None, geom_area: float | None) -> bool:
    """Detect tree-canopy circles in the polygon layer.

    These are stored as small regular polygons approximating a circle:
    perimeter ~ 2*pi*r, area ~ pi*r^2.  The relation P^2 / (4*pi*A) = 1
    holds for any circle regardless of size, so we test that ratio.
    """
    if not geom_length or not geom_area:
        return False
    if geom_length <= 0 or geom_area <= 0:
        return False
    ratio = (geom_length * geom_length) / (4 * math.pi * geom_area)
    # Allow up to 5% deviation for digitized "circles" stored as 12/16-gons.
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

    with fiona.open(GDB_PATH, layer="Objekt") as src:
        # OBJECTID is the layer's primary key; fiona exposes it via feat.id
        for feat in src:
            oid = int(feat.id) if feat.id is not None else None
            props = dict(feat["properties"])
            if feat["geometry"] is None:
                continue
            geom = shape(feat["geometry"])
            if geom.is_empty:
                continue

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

            base = {
                "objectid": oid,
                "objektnummer": jsonify(props.get("objektnummer")),
                "name": jsonify(props.get("objektbezeichnung")),
                "adresse": jsonify(props.get("Adresse")),
                "parzelle": jsonify(props.get("parzelle")),
                "lose": jsonify(props.get("Lose")),
                "erstellungsjahr": jsonify(props.get("erstellungsjahr")),
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
                "fk_pflegeklasse_raw": jsonify(props.get("fk_pflegeklasseObjekt")),
                "fk_eigentuemer_raw": jsonify(props.get("fk_eigentuemer")),
                "fk_pflegeverantwortung_raw": jsonify(props.get("fk_pflegeverantwortungObjekt")),
                "kontrolle_raw": jsonify(props.get("kontrolle")),
                "reinigung_raw": jsonify(props.get("reinigung")),
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
    with fiona.open(GDB_PATH, layer="Pflegeelement_point") as src:
        for feat in src:
            props = dict(feat["properties"])
            if feat["geometry"] is None:
                continue
            geom = shape(feat["geometry"])
            if geom.is_empty:
                continue

            geom_lv95 = reproject(geom, to_lv95)
            geom_wgs = round_coords(reproject(geom, to_wgs))

            site_oid = props.get("fk_objektbezeichnung")
            site = site_lookup.get(site_oid, {})

            baumart = (props.get("baumart") or "").strip() or None
            fk_baumart = props.get("fk_baumart")
            is_tree = bool(baumart) or fk_baumart not in (None, 0)

            base = {
                "site_oid": site_oid,
                "site_name": site.get("name"),
                "site_objektnummer": site.get("objektnummer"),
                "site_adresse": site.get("adresse"),
                "site_lose": site.get("lose"),
                "fk_profil": props.get("fk_profil"),
                "profil_label": (f"Profil {props.get('fk_profil')}"
                                 if props.get("fk_profil") is not None else None),
                "fk_pflegedurchfuehrung": props.get("fk_pflegedurchfuehrung"),
                "fk_pflegeklasse": props.get("fk_pflegeklasse"),
                "fk_pflegeverantwortung": props.get("fk_pflegeverantwortung"),
                "fk_zustand": props.get("fk_zustand"),
                "fk_kostenstelle": props.get("fk_kostenstelle"),
                "kostenstelle_name": props.get("kostenstelle_name"),
                "bewaesserung": props.get("bewaesserung"),
                "lauben": props.get("lauben"),
                "max_hoehe_m": props.get("maxHoehe"),
                "hoehe": props.get("hoehe"),
                "ausmass": props.get("ausmass"),
                "naturobjekt": props.get("naturobjekt"),
                "parzelle_name": props.get("parzelle_name"),
                "bemerkung": props.get("bemerkung"),
                "letzte_aenderung": jsonify(props.get("letzte_aenderung")),
                "lv95_east": round(geom_lv95.x, 2),
                "lv95_north": round(geom_lv95.y, 2),
            }

            if is_tree:
                base.update({
                    "baumart": baumart,
                    "fk_baumart": fk_baumart,
                    "baumnummer": props.get("Baumnummer"),
                })
                trees.append({
                    "type": "Feature",
                    "geometry": mapping(geom_wgs),
                    "properties": {
                        **base,
                        "entity_type": "tree",
                        "category": "tree",
                        "feature_type": "Baum",
                        "subtype": baumart or f"Baum (Art-Code {fk_baumart})",
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
                        "subtype": f"Profil {props.get('fk_profil')}"
                                   if props.get("fk_profil") is not None else "Punktelement",
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
    with fiona.open(GDB_PATH, layer="Pflegeelement_polygon") as src:
        for feat in src:
            props = dict(feat["properties"])
            if feat["geometry"] is None:
                continue
            geom = shape(feat["geometry"])
            if geom.is_empty:
                continue

            geom_lv95 = reproject(geom, to_lv95)
            geom_wgs = round_coords(reproject(geom, to_wgs))

            site_oid = props.get("fk_objektbezeichnung")
            site = site_lookup.get(site_oid, {})

            base = {
                "site_oid": site_oid,
                "site_name": site.get("name"),
                "site_objektnummer": site.get("objektnummer"),
                "site_adresse": site.get("adresse"),
                "site_lose": site.get("lose"),
                "fk_profil": props.get("fk_profil"),
                "profil_label": (f"Profil {props.get('fk_profil')}"
                                 if props.get("fk_profil") is not None else None),
                "fk_pflegedurchfuehrung": props.get("fk_pflegedurchfuehrung"),
                "fk_pflegeklasse": props.get("fk_pflegeklasse"),
                "fk_pflegeverantwortung": props.get("fk_pflegeverantwortung"),
                "fk_zustand": props.get("fk_zustand"),
                "fk_winterdienst": props.get("fk_winterdienst"),
                "fk_kostenstelle": props.get("fk_kostenstelle"),
                "kostenstelle_name": props.get("kostenstelle_name"),
                "bewaesserung": props.get("bewaesserung"),
                "lauben": props.get("lauben"),
                "max_hoehe_m": props.get("maxHoehe"),
                "ausmass": props.get("ausmass"),
                "naturobjekt": props.get("naturobjekt"),
                "parzelle_name": props.get("parzelle_name"),
                "bemerkung": props.get("bemerkung"),
                "geom_length_m": props.get("geom_Length"),
                "geom_area_m2": round(geom_lv95.area, 2),
            }

            if is_circle(props.get("geom_Length"), props.get("geom_Area")):
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
                        "subtype": f"Profil {props.get('fk_profil')}"
                                   if props.get("fk_profil") is not None else "Baumkrone",
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
                        "category": f"profil_{props.get('fk_profil')}"
                                    if props.get("fk_profil") is not None else "profil_unknown",
                        "feature_type": "Pflegefläche",
                        "subtype": (f"Profil {props.get('fk_profil')}"
                                    if props.get("fk_profil") is not None else "Profil ?"),
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

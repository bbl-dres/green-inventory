"""
extract_features.py

Extracts vector features from a Swiss landscape plan PDF (Grünflächenpflege).
Features are classified by fill color matching the plan legend and output
as WGS84 GeoJSON.

Scale: 1:650  (MASSSTAB confirmed in title block)
Site:  Mühlestrasse 2-6, 3063 Ittigen

Dependencies:
    pip install pymupdf shapely numpy pyproj
"""

import json
import math
from collections import defaultdict, Counter

import numpy as np
import fitz  # PyMuPDF
from pyproj import Transformer
from shapely.geometry import Polygon, Point, mapping
from shapely.ops import unary_union

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

PDF_PATH    = "data/[838147959] 1602.GR_Mühlestrasse 2+4+6+8Grünflächenpflege.pdf"
OUTPUT_PATH = "data/[838147959] 1602.GR_Mühlestrasse 2+4+6+8Grünflächenpflege.geojson"

# Map area: x < MAP_X_MAX is the plan drawing; legend/title is to the right
MAP_X_MAX = 1140.0

# Scale bar tick marks (measured from PDF):
#   left  tick (0 m)  at x = 1499.08 pt
#   right tick (40 m) at x = 1673.57 pt
SCALE_PTS_PER_M = (1673.57 - 1499.08) / 40.0   # ~4.362 pts/m
SCALE_M_PER_PT  = 1.0 / SCALE_PTS_PER_M          # ~0.2292 m/pt

# Local coordinate origin: bottom-left corner of map area (PDF y↓ → local y↑)
ORIGIN_X_PT = 67.2
ORIGIN_Y_PT = 1146.7

MAP_WIDTH_M  = (1139.4 - 67.2)  * SCALE_M_PER_PT   # ~245.7 m
MAP_HEIGHT_M = (1146.7 - 48.0)  * SCALE_M_PER_PT   # ~251.8 m
MAP_CENTER_LOCAL = (MAP_WIDTH_M / 2, MAP_HEIGHT_M / 2)

# Separation threshold: paths wider AND taller than this are "area fills";
# smaller ones are "pattern tiles" (hatching dots, dashes, etc.)
SIZE_THRESHOLD = 20   # PDF points

# Buffer for large f-only solid fills (e.g. Saumvegetation base polygons).
# Just enough to close sub-pixel gaps; no real expansion intended.
MERGE_BUFFER_M = 0.1

# Buffer for small pattern tiles (Rasengittersteine, Holzhäckselbelag,
# Geröllstreifen, etc.). Bridges the inter-tile gap (~0.3–0.6 m) without
# filling large empty spaces between disconnected areas.
TILE_MERGE_BUFFER_M = 0.5

# Minimum polygon area to keep after merging (filters noise fragments)
MIN_AREA_M2 = 1.5

# ---------------------------------------------------------------------------
# GEOREFERENCE  (single GCP assumed at map centre)
# ---------------------------------------------------------------------------

GCP1_WGS84  = (46.97510261409845, 7.474172139626702)   # (lat, lon)
GCP1_LOCAL  = MAP_CENTER_LOCAL

_to_lv95    = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)
_from_lv95  = Transformer.from_crs("EPSG:2056", "EPSG:4326", always_xy=True)

_gcp1_e, _gcp1_n   = _to_lv95.transform(GCP1_WGS84[1], GCP1_WGS84[0])
_origin_e = _gcp1_e - GCP1_LOCAL[0]
_origin_n = _gcp1_n - GCP1_LOCAL[1]


def local_m_to_wgs84(x_m, y_m):
    lon, lat = _from_lv95.transform(_origin_e + x_m, _origin_n + y_m)
    return lon, lat


def transform_geometry(geom_dict):
    """Reproject a GeoJSON geometry dict from local metres to WGS84."""
    gtype  = geom_dict["type"]
    coords = geom_dict["coordinates"]

    def tr_ring(ring):
        return [list(local_m_to_wgs84(x, y)) for x, y in ring]

    if gtype == "Point":
        return {"type": gtype, "coordinates": list(local_m_to_wgs84(*coords))}
    if gtype == "Polygon":
        return {"type": gtype, "coordinates": [tr_ring(r) for r in coords]}
    if gtype == "MultiPolygon":
        return {"type": gtype,
                "coordinates": [[tr_ring(r) for r in poly] for poly in coords]}
    return geom_dict   # fallback – unsupported type, leave as-is


# ---------------------------------------------------------------------------
# COLOR → FEATURE TYPE MAPPING
# ---------------------------------------------------------------------------

COLOR_TOL = 0.04

FEATURE_COLORS = [
    # ---- Rasen (Lawns) ----
    {"rgb": (0.596, 0.902, 0.000), "type": "Rasen",     "subtype": "Geb.Rasen kf.",         "category": "lawn"},
    # ---- Wiesen (Meadows) ----
    {"rgb": (0.659, 0.890, 0.851), "type": "Wiesen",    "subtype": "Feuchtwiese",            "category": "meadow"},
    {"rgb": (0.914, 1.000, 0.745), "type": "Wiesen",    "subtype": "Blumenwiese",            "category": "meadow"},
    {"rgb": (0.961, 0.961, 0.478), "type": "Wiesen",    "subtype": "Saumvegetation",         "category": "meadow"},
    # ---- Rabatten (Planting beds) ----
    {"rgb": (1.000, 0.451, 0.875), "type": "Rabatten",  "subtype": "Wechselflor",            "category": "planting_bed"},
    {"rgb": (0.361, 0.271, 0.659), "type": "Rabatten",  "subtype": "Moorbeet",               "category": "planting_bed"},
    {"rgb": (0.875, 0.451, 1.000), "type": "Rabatten",  "subtype": "Stauden",                "category": "planting_bed"},
    {"rgb": (0.520, 0.000, 0.660), "type": "Rabatten",  "subtype": "Stauden",                "category": "planting_bed"},
    {"rgb": (1.000, 0.333, 0.000), "type": "Rabatten",  "subtype": "Beetrosen",              "category": "planting_bed"},
    {"rgb": (1.000, 0.667, 0.000), "type": "Rabatten",  "subtype": "Ruderalflaeche",         "category": "planting_bed"},
    # ---- Hecken (Hedges) ----
    {"rgb": (0.843, 0.843, 0.620), "type": "Hecken",    "subtype": "Wildhecke",              "category": "hedge"},
    {"rgb": (0.847, 0.506, 0.133), "type": "Hecken",    "subtype": "Formhecke",              "category": "hedge"},
    {"rgb": (0.660, 0.440, 0.000), "type": "Hecken",    "subtype": "Formhecke",              "category": "hedge"},
    # ---- Gehölzflächen (Wooded areas) ----
    {"rgb": (0.537, 0.439, 0.267), "type": "Gehoelz",   "subtype": "Gehoelz & Bodend.",      "category": "woody_area"},
    {"rgb": (0.447, 0.537, 0.267), "type": "Gehoelz",   "subtype": "Gehoelzrabatte",         "category": "woody_area"},
    {"rgb": (0.150, 0.450, 0.000), "type": "Gehoelz",   "subtype": "Wald",                   "category": "woody_area"},
    # ---- Spezielle Bepflanzungsformen ----
    {"rgb": (1.000, 0.745, 0.745), "type": "Spezielle", "subtype": "Dach: ext. Stauden",     "category": "special_planting"},
    # ---- Beläge (Surfaces) ----
    {"rgb": (0.408, 0.408, 0.408), "type": "Belag",     "subtype": "Asphaltbelag",           "category": "surface"},
    {"rgb": (0.440, 0.660, 0.000), "type": "Belag",     "subtype": "Rasengittersteine",      "category": "surface"},
    {"rgb": (0.660, 0.220, 0.000), "type": "Belag",     "subtype": "Holzhaeckselbelag",      "category": "surface"},
    {"rgb": (0.804, 0.537, 0.400), "type": "Belag",     "subtype": "Chaussierung",           "category": "surface"},
    {"rgb": (0.612, 0.612, 0.612), "type": "Belag",     "subtype": "Betonpl./Naturstein",    "category": "surface"},
    # Geröllstreifen/Bollensteine: dark-grey 12-gon circle tiles (~6.5 pt each)
    # The (0.310, 0.310, 0.310) entry previously mapped here as Asphaltbelag —
    # the actual tile colour is (0.306, 0.306, 0.306) which are round cobblestones.
    {"rgb": (0.306, 0.306, 0.306), "type": "Belag",     "subtype": "Geroellstreifen",        "category": "surface"},
    # ---- Wasserflächen (Water) ----
    {"rgb": (0.000, 0.663, 0.902), "type": "Wasser",    "subtype": "Brunnen",                "category": "water"},
    {"rgb": (0.000, 0.439, 1.000), "type": "Wasser",    "subtype": "Gewaesser ruhend",       "category": "water"},
    # ---- Anderes ----
    {"rgb": (1.000, 1.000, 0.000), "type": "Anderes",   "subtype": "Anderes",                "category": "other"},
    # ---- Trees ----
    {"rgb": (0.600, 0.900, 0.000), "type": "Baum",      "subtype": "Laubb. nat. kleink.",    "category": "tree"},
    {"rgb": (0.000, 0.520, 0.660), "type": "Baum",      "subtype": "Strassenb. Laub",        "category": "tree"},
    {"rgb": (0.000, 0.440, 1.000), "type": "Baum",      "subtype": "Strassenb. Laub nat.",   "category": "tree"},
]


def color_distance(c1, c2):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(c1, c2)))


def classify_color(rgb):
    if rgb is None:
        return None
    best, best_dist = None, COLOR_TOL
    for feat in FEATURE_COLORS:
        d = color_distance(rgb, feat["rgb"])
        if d < best_dist:
            best_dist = d
            best = feat
    return best


# ---------------------------------------------------------------------------
# PDF COORDINATE HELPERS
# ---------------------------------------------------------------------------

def pt_to_m(x_pt, y_pt):
    """PDF points -> local metres (y-up)."""
    return (
        (x_pt - ORIGIN_X_PT) * SCALE_M_PER_PT,
        (ORIGIN_Y_PT - y_pt) * SCALE_M_PER_PT,
    )


def rect_to_polygon_m(rect):
    """Convert a PyMuPDF Rect directly to a Shapely Polygon in local metres."""
    x0, y0 = pt_to_m(rect.x0, rect.y0)
    x1, y1 = pt_to_m(rect.x1, rect.y1)
    xmin, xmax = min(x0, x1), max(x0, x1)
    ymin, ymax = min(y0, y1), max(y0, y1)
    if xmax - xmin < 1e-6 or ymax - ymin < 1e-6:
        return None
    return Polygon([(xmin, ymin), (xmax, ymin), (xmax, ymax), (xmin, ymax)])


def path_to_shapely(path):
    """Convert a PyMuPDF drawing dict to a Shapely Polygon/MultiPolygon in local metres."""
    rings, current = [], []

    for item in path["items"]:
        k = item[0]
        if k == "m":
            if current:
                rings.append(current)
            current = [pt_to_m(item[1].x, item[1].y)]
        elif k == "l":
            current.append(pt_to_m(item[2].x, item[2].y))
        elif k == "c":                         # cubic bezier — use endpoint
            current.append(pt_to_m(item[3].x, item[3].y))
        elif k == "re":
            r = item[1]
            rings.append([
                pt_to_m(r.x0, r.y0), pt_to_m(r.x1, r.y0),
                pt_to_m(r.x1, r.y1), pt_to_m(r.x0, r.y1),
                pt_to_m(r.x0, r.y0),
            ])
            current = []
        elif k == "qu":                        # quad — treat like re
            q = item[1]
            pts = [pt_to_m(q.ul.x, q.ul.y), pt_to_m(q.ur.x, q.ur.y),
                   pt_to_m(q.lr.x, q.lr.y), pt_to_m(q.ll.x, q.ll.y)]
            rings.append(pts + [pts[0]])
            current = []

    if len(current) >= 2:
        rings.append(current)

    polys = []
    for ring in rings:
        if len(ring) < 3:
            continue
        try:
            p = Polygon(ring)
            if not p.is_valid:
                p = p.buffer(0)
            if not p.is_empty:
                polys.append(p)
        except Exception:
            pass

    if not polys:
        return None
    return polys[0] if len(polys) == 1 else unary_union(polys)


# ---------------------------------------------------------------------------
# MERGE HELPER: buffer → union → erode → explode
# ---------------------------------------------------------------------------

def merge_and_explode(geoms, buffer_m=MERGE_BUFFER_M, min_area=MIN_AREA_M2):
    """
    Given a list of Shapely geometries (hatch stripes or pattern tiles):
    1. Buffer each by buffer_m to bridge gaps
    2. Union all buffered shapes
    3. Erode back by (buffer_m * 0.9) to approximate original boundaries
    4. Return list of individual Polygons (explode MultiPolygon)
    """
    valid = [g for g in geoms if g and not g.is_empty]
    if not valid:
        return []

    merged = unary_union([g.buffer(buffer_m) for g in valid])
    result = merged.buffer(-buffer_m * 0.9)

    if result.is_empty:
        return []

    parts = list(result.geoms) if result.geom_type == "MultiPolygon" else [result]
    return [p for p in parts if p.geom_type == "Polygon" and p.area >= min_area]


def make_feature(geom_local, feat_info, fill_rgb, source):
    geom_wgs84 = transform_geometry(mapping(geom_local))
    return {
        "type": "Feature",
        "geometry": geom_wgs84,
        "properties": {
            "feature_type": feat_info["type"],
            "subtype":      feat_info["subtype"],
            "category":     feat_info["category"],
            "fill_rgb":     [round(c, 3) for c in fill_rgb],
            "source":       source,
            "area_m2":      round(geom_local.area, 2),
        },
    }


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def extract():
    doc   = fitz.open(PDF_PATH)
    page  = doc[0]
    paths = page.get_drawings()

    # Restrict to map area
    map_paths = [p for p in paths if p["rect"].x1 < MAP_X_MAX]

    print(f"Map paths total : {len(map_paths)}")

    features     = []
    unclassified = set()

    # ── Pass 1: fs (fill+stroke) paths → direct boundaries ──────────────────
    # These are the actual drawn feature outlines. Each path is one polygon.
    # Collect which (type, subtype, category) combos are covered so Pass 2
    # can skip the internal hatch stripes for the same colors.
    print("\n[1] Fill+stroke paths (direct boundaries)...")

    fs_covered = set()   # (type, subtype, category) tuples that have fs paths

    for p in map_paths:
        if p.get("type") != "fs":
            continue
        fill_rgb = p.get("fill")
        if not fill_rgb:
            continue
        feat_info = classify_color(fill_rgb)
        if feat_info is None:
            unclassified.add(tuple(round(c, 2) for c in fill_rgb))
            continue

        geom = path_to_shapely(p)
        if not geom or geom.is_empty:
            continue

        cat_key = (feat_info["type"], feat_info["subtype"], feat_info["category"])
        fs_covered.add(cat_key)

        # Emit each sub-polygon individually (no merging — shape is already correct)
        polys = list(geom.geoms) if geom.geom_type in ("MultiPolygon", "GeometryCollection") else [geom]
        for poly in polys:
            if poly.geom_type == "Polygon" and poly.area >= MIN_AREA_M2:
                if not poly.is_valid:
                    poly = poly.buffer(0)
                features.append(make_feature(poly, feat_info, fill_rgb, "area_direct"))

    print(f"  -> {len(features)} direct boundary features")
    print(f"  Categories with fs boundaries: {sorted(k[1] for k in fs_covered)}")

    # ── Pass 2: f-only paths → direct (large) or tile-merge (small) ──────────
    # Skip any color already covered in Pass 1 (those f-only paths are internal
    # hatch stripes inside the fs boundaries, not additional geometry).
    # Large fills (e.g. Saumvegetation base) → emit directly with light union.
    # Small tiles (Rasengittersteine, Holzhäckselbelag, Geröllstreifen …)
    #   → merge with TILE_MERGE_BUFFER_M (0.5 m) which bridges inter-tile gaps
    #     (~0.3–0.6 m) without swamping larger empty spaces between areas.
    print("\n[2] Fill-only paths (large fills direct / small tiles merged)...")

    large_buckets: dict = defaultdict(lambda: {"geoms": [], "fill_rgb": None, "feat_info": None})
    tile_buckets:  dict = defaultdict(lambda: {"geoms": [], "fill_rgb": None, "feat_info": None})

    for p in map_paths:
        if p.get("type") != "f":
            continue
        fill_rgb = p.get("fill")
        if not fill_rgb:
            continue
        feat_info = classify_color(fill_rgb)
        if feat_info is None:
            unclassified.add(tuple(round(c, 2) for c in fill_rgb))
            continue

        cat_key = (feat_info["type"], feat_info["subtype"], feat_info["category"])
        if cat_key in fs_covered:
            continue  # internal hatch stripe — skip

        rgb_key    = tuple(round(c, 3) for c in fill_rgb)
        bucket_key = (feat_info["type"], feat_info["subtype"], feat_info["category"], rgb_key)

        rect = p["rect"]
        w, h = rect.width, rect.height
        if w >= SIZE_THRESHOLD and h >= SIZE_THRESHOLD:
            geom = path_to_shapely(p)
            if geom and not geom.is_empty:
                large_buckets[bucket_key]["geoms"].append(geom)
                large_buckets[bucket_key]["fill_rgb"]  = fill_rgb
                large_buckets[bucket_key]["feat_info"] = feat_info
        else:
            geom = rect_to_polygon_m(rect)
            if geom:
                tile_buckets[bucket_key]["geoms"].append(geom)
                tile_buckets[bucket_key]["fill_rgb"]  = fill_rgb
                tile_buckets[bucket_key]["feat_info"] = feat_info

    if unclassified:
        print(f"  Unclassified colors: {sorted(unclassified)[:8]}")

    n_before = len(features)
    for key, data in large_buckets.items():
        # Light union (MERGE_BUFFER_M = 0.1 m) just closes sub-pixel gaps
        merged_polys = merge_and_explode(data["geoms"], buffer_m=MERGE_BUFFER_M)
        for poly in merged_polys:
            features.append(make_feature(poly, data["feat_info"], data["fill_rgb"], "area_merged"))
    print(f"  -> {len(features) - n_before} large-fill area features")

    n_before = len(features)
    for key, data in tile_buckets.items():
        merged_polys = merge_and_explode(data["geoms"], buffer_m=TILE_MERGE_BUFFER_M)
        for poly in merged_polys:
            features.append(make_feature(poly, data["feat_info"], data["fill_rgb"], "pattern_merged"))
    print(f"  -> {len(features) - n_before} tile-merged features")

    # ── 3. Save ──────────────────────────────────────────────────────────────
    origin_lon, origin_lat = local_m_to_wgs84(0, 0)
    far_lon,    far_lat    = local_m_to_wgs84(MAP_WIDTH_M, MAP_HEIGHT_M)

    geojson = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "metadata": {
            "source_pdf":        PDF_PATH,
            "site":              "Muehlestrasse 2-6, 3063 Ittigen",
            "scale":             "1:650",
            "gcp1_wgs84":        list(GCP1_WGS84),
            "gcp1_local_m":      list(GCP1_LOCAL),
            "map_extent_m":      [round(MAP_WIDTH_M, 1), round(MAP_HEIGHT_M, 1)],
            "approx_bbox_wgs84": [
                round(origin_lon, 7), round(origin_lat, 7),
                round(far_lon, 7),    round(far_lat, 7),
            ],
            "note": (
                "Georeferenced with one GCP at assumed map centre. "
                "North assumed up (plan may be rotated). "
                "Use edit mode in the map viewer to adjust position."
            ),
            "offset_m": [0.0, 0.0],   # [east_m, north_m] — updated by map viewer drag
            "total_features": len(features),
        },
        "features": features,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(features)} features to {OUTPUT_PATH}")
    print(f"Approx WGS84 bbox: {geojson['metadata']['approx_bbox_wgs84']}")

    counts = Counter(feat["properties"]["category"] for feat in features)
    print("\nFeature counts by category:")
    for cat, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {cat:<25} {n}")


if __name__ == "__main__":
    extract()

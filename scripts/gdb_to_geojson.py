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
import pyproj
from pyproj import Transformer
from shapely.geometry import MultiPolygon, mapping
from shapely.geometry.polygon import orient
from shapely.ops import transform as sh_transform
from shapely.validation import make_valid

# Enable the PROJ CDN so pyproj fetches the CHENyx06 NTv2 grid the first
# time a CH1903 -> WGS84 transform runs.  Without this, pyproj silently
# falls back to a 7-parameter Helmert approximation that's ~1.0-1.6 m off
# in parts of Switzerland - exactly the order of magnitude as a tree crown.
pyproj.network.set_network_enabled(True)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
GDB_PATH = Path(r"C:\Users\DavidRasner\Downloads\Daten_Bundesgärtnerei\GFMBundesgaerten.gdb")
XLS_PATH = Path(r"C:\Users\DavidRasner\Downloads\Daten_Bundesgärtnerei\Liste_Objekte.xls")
OUT_PATH = ROOT / "data" / "data.geojson"

EXPECTED_SRC_CRS = ("EPSG:21781", "EPSG:2056")  # LV03 (Bessel) or LV95 (Bessel+)
LV95_CRS = "EPSG:2056"
WGS84 = "EPSG:4326"


# ---------------------------------------------------------------------------
# Codelist extractor (ctypes against pyogrio's bundled GDAL)
# ---------------------------------------------------------------------------
# pyogrio doesn't expose GDAL >= 3.3's OGR_FieldDomain API.  We load GDAL
# directly via ctypes and read the coded-value enumerations.  This gives us
# real labels for every fk_* code in the GDB - the legacy GFM domain
# catalog (idPP, idPPy, idBa, idPd, ...) which the GSZ Profilkatalog and
# the inventory toolchain were built around.
#
# Cross-platform note: this works wherever pyogrio.libs has a shared
# library.  On Windows it's gdal-*.dll, on Linux it's libgdal-*.so, on
# macOS it's libgdal.*.dylib.  The function signatures are identical.

def _find_gdal_lib():
    import glob
    libs_dir = os.path.dirname(pyogrio.__file__) + ".libs"
    for pattern in ("gdal-*.dll", "libgdal-*.so", "libgdal.*.dylib"):
        hits = glob.glob(os.path.join(libs_dir, pattern))
        if hits:
            return hits[0]
    return None


def extract_codelists(gdb_path):
    """Read all coded-value field domains from a FileGDB.

    Returns a dict {domain_name: {int_code: label}}.  Empty domains are
    still included with an empty dict so downstream code can tell "domain
    exists but unused" from "domain doesn't exist".
    """
    import ctypes
    gdal_path = _find_gdal_lib()
    if not gdal_path:
        print("  WARNING: couldn't find pyogrio's bundled GDAL library; "
              "skipping codelist extraction.")
        return {}

    class OGRCodedValue(ctypes.Structure):
        _fields_ = [("pszCode", ctypes.c_char_p), ("pszValue", ctypes.c_char_p)]

    g = ctypes.CDLL(gdal_path)
    g.GDALAllRegister()
    g.GDALOpenEx.argtypes = [ctypes.c_char_p, ctypes.c_uint, ctypes.c_void_p,
                             ctypes.c_void_p, ctypes.c_void_p]
    g.GDALOpenEx.restype = ctypes.c_void_p
    g.GDALClose.argtypes = [ctypes.c_void_p]
    g.GDALClose.restype = None
    g.GDALDatasetGetFieldDomainNames.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    g.GDALDatasetGetFieldDomainNames.restype = ctypes.POINTER(ctypes.c_char_p)
    g.GDALDatasetGetFieldDomain.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    g.GDALDatasetGetFieldDomain.restype = ctypes.c_void_p
    g.OGR_FldDomain_GetDomainType.argtypes = [ctypes.c_void_p]
    g.OGR_FldDomain_GetDomainType.restype = ctypes.c_int
    g.OGR_FldDomain_GetDescription.argtypes = [ctypes.c_void_p]
    g.OGR_FldDomain_GetDescription.restype = ctypes.c_char_p
    g.OGR_CodedFldDomain_GetEnumeration.argtypes = [ctypes.c_void_p]
    g.OGR_CodedFldDomain_GetEnumeration.restype = ctypes.POINTER(OGRCodedValue)

    GDAL_OF_VECTOR = 0x04
    OFDT_CODED = 0
    ds = g.GDALOpenEx(str(gdb_path).encode("mbcs"), GDAL_OF_VECTOR,
                      None, None, None)
    if not ds:
        print(f"  WARNING: couldn't open {gdb_path} for codelist extraction.")
        return {}

    out = {}
    try:
        names_ptr = g.GDALDatasetGetFieldDomainNames(ds, None)
        i = 0
        while names_ptr[i]:
            name = names_ptr[i].decode("utf-8")
            i += 1
            d = g.GDALDatasetGetFieldDomain(ds, name.encode("utf-8"))
            if not d:
                out[name] = {}
                continue
            if g.OGR_FldDomain_GetDomainType(d) != OFDT_CODED:
                out[name] = {}
                continue
            enum_arr = g.OGR_CodedFldDomain_GetEnumeration(d)
            mapping = {}
            j = 0
            while enum_arr and enum_arr[j].pszCode:
                code_s = enum_arr[j].pszCode.decode("utf-8")
                val_s = (enum_arr[j].pszValue.decode("utf-8")
                         if enum_arr[j].pszValue else "")
                # Codes come back as strings; coerce to int when numeric so
                # downstream lookups can use the raw fk_* integer key.
                key = int(code_s) if code_s.lstrip("-").isdigit() else code_s
                mapping[key] = val_s
                j += 1
                if j > 10000:
                    break  # paranoia
            out[name] = mapping
    finally:
        g.GDALClose(ds)
    return out


def lookup(codelist, code):
    """Decode a single code via a codelist dict.  Tolerates None, NaN, and
    string codes.  Returns None when the code isn't in the domain."""
    if code is None:
        return None
    try:
        if pd.isna(code):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(code, "item"):
        try: code = code.item()
        except Exception: pass
    return codelist.get(code)

# SRC_CRS, to_wgs, to_lv95, lv95_to_wgs are populated by configure_transforms()
# once we've read the actual GDB layer's CRS and verified it matches.
SRC_CRS = None
to_wgs = None
to_lv95 = None
lv95_to_wgs = None


def _best_transformer(src, dst):
    """Pick the most accurate transformer pyproj knows about for src -> dst.

    The default Transformer.from_crs returns the operation pyproj judges
    "best", but its accuracy heuristic doesn't always pick the lowest-
    accuracy-value candidate.  Enumerate the group and pick by the smallest
    nominal accuracy in metres; tie-breaks fall back to pyproj's order.
    """
    from pyproj.transformer import TransformerGroup
    tg = TransformerGroup(src, dst, always_xy=True)
    if not tg.transformers:
        raise SystemExit(f"pyproj has no transform path for {src} -> {dst}")
    # Filter out "ballpark" (accuracy = -1.0) candidates if better ones exist
    rated = [t for t in tg.transformers if t.accuracy is not None and t.accuracy >= 0]
    if rated:
        return min(rated, key=lambda t: t.accuracy)
    return tg.transformers[0]


def configure_transforms(layer_crs):
    """Verify the source CRS and build pyproj transformers.

    Called once we know the GDB's actual CRS.  Asserts we got one of the
    two CH1903 variants we support; refuses to run otherwise so silent
    double-reprojection can't happen if a future GDB drop changes CRS.

    Practical accuracy bounds for our pipeline (Switzerland):
      LV03 -> LV95:  ~0.2 m   (CHENyx06 grid, bundled with pyproj)
      LV95 -> WGS84: ~1.0 m   (7-parameter Helmert; PROJ has no better
                                grid for this leg.  Sub-decimetre needs
                                swisstopo's Reframe Web API.)
      LV03 -> WGS84: ~1.5 m   (compound of the above)
    """
    global SRC_CRS, to_wgs, to_lv95, lv95_to_wgs
    if str(layer_crs) not in EXPECTED_SRC_CRS:
        raise SystemExit(
            f"Unexpected source CRS '{layer_crs}'. Supported: {EXPECTED_SRC_CRS}. "
            "Update configure_transforms() if this is intentional."
        )
    SRC_CRS = str(layer_crs)

    t_wgs    = _best_transformer(SRC_CRS, WGS84)
    t_lv     = _best_transformer(SRC_CRS, LV95_CRS)
    t_lv_wgs = _best_transformer(LV95_CRS, WGS84)

    # Surface the accuracy and operation chain so a future change to PROJ /
    # data files is visible in the run log.  An accuracy worse than ~2 m on
    # SRC -> WGS84 indicates a missing grid (re-check pyproj install).
    print(f"  {SRC_CRS} -> WGS84:  acc={t_wgs.accuracy} m   {t_wgs.description}")
    print(f"  {SRC_CRS} -> LV95:   acc={t_lv.accuracy} m   {t_lv.description}")
    print(f"  LV95 -> WGS84:      acc={t_lv_wgs.accuracy} m   {t_lv_wgs.description}")
    if t_wgs.accuracy is not None and t_wgs.accuracy > 2.0:
        print("  WARNING: WGS84 accuracy worse than 2 m - CHENyx06 grid may "
              "be missing.  Run with PROJ_NETWORK=ON and verify proj-data "
              "package is installed.")

    to_wgs = t_wgs.transform
    to_lv95 = t_lv.transform
    lv95_to_wgs = t_lv_wgs.transform
    # Cache for metadata
    configure_transforms.accuracy_m = {
        f"{SRC_CRS}->WGS84": t_wgs.accuracy,
        f"{SRC_CRS}->LV95":  t_lv.accuracy,
        "LV95->WGS84":       t_lv_wgs.accuracy,
    }

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
# Circularity ratio thresholds for regular n-gons:
#   n=12: ratio = 1.023
#   n=10: ratio = 1.034
#   n=8:  ratio = 1.052
# The historical convention in the source GDB is 12-gon circles, but loosening
# the bound to 8 % means we still catch octagons / decagons if the convention
# ever changes.  A square (n=4, ratio = 1.273) still fails clearly.
CANOPY_CIRCULARITY_TOL = 0.08

def is_canopy(geom_length: float | None, geom_area: float | None) -> bool:
    """Detect tree-canopy circles in the polygon layer.

    These are stored as small regular polygons approximating a circle:
    perimeter ~ 2*pi*r, area ~ pi*r^2.  The relation P^2 / (4*pi*A) = 1
    holds for any circle regardless of size, so we test that ratio.

    We also require a minimum area: many decorative "Bollenstein" features
    (round paving stones) are also small n-gon circles in the data, but at
    ~0.05 m² they're not tree crowns.
    """
    if not geom_length or not geom_area:
        return False
    if geom_length <= 0 or geom_area <= 0:
        return False
    if geom_area < CANOPY_MIN_AREA_M2:
        return False
    ratio = (geom_length * geom_length) / (4 * math.pi * geom_area)
    return abs(ratio - 1.0) < CANOPY_CIRCULARITY_TOL


# Douglas-Peucker simplification settings (LV95 metres).
#
# We only simplify polygons that exceed SIMPLIFY_VERTEX_THRESHOLD - those
# are the digitization-noise outliers (originally up to 41 823 vertices on
# a 1060 m² polygon = vertex every 7 cm of perimeter).  Normal hand-
# digitized polygons stay pixel-perfect at any zoom: a 5 cm tolerance
# applied indiscriminately straightens corners that are visible at z21+
# on the aerial basemap.
#
# Why a tighter tolerance (5 cm vs the previous 10 cm)?  At z22 one screen
# pixel ≈ 6.5 mm; 10 cm was 15 px of straight-edge artifact, while 5 cm is
# under 8 px and only kicks in for the outliers anyway.
SIMPLIFY_TOL_M = 0.05
SIMPLIFY_VERTEX_THRESHOLD = 200


def _vertex_count(geom):
    if geom is None or geom.is_empty:
        return 0
    if geom.geom_type == "Polygon":
        n = len(geom.exterior.coords)
        for ring in geom.interiors:
            n += len(ring.coords)
        return n
    if geom.geom_type == "MultiPolygon":
        return sum(_vertex_count(p) for p in geom.geoms)
    return 0


def clean_polygon(geom):
    """Repair invalid geometry, simplify ONLY high-vertex outliers, and
    enforce GeoJSON right-hand rule (outer ring CCW, inner rings CW).

    Caller is expected to pass a Shapely geometry already in LV95 metres so
    the simplification tolerance is meaningful in real-world units.
    """
    if geom is None or geom.is_empty:
        return geom
    if not geom.is_valid:
        # make_valid can return GeometryCollection on some pathological
        # inputs; for our polygon-only pipeline pick the largest poly part.
        geom = make_valid(geom)
        if geom.geom_type not in ("Polygon", "MultiPolygon"):
            polys = [g for g in getattr(geom, "geoms", [geom])
                     if g.geom_type in ("Polygon", "MultiPolygon")]
            if not polys:
                return None
            geom = max(polys, key=lambda g: g.area)
    # Only simplify when there's evidence of digitization noise.  Anything
    # under SIMPLIFY_VERTEX_THRESHOLD is treated as authoritative.
    if _vertex_count(geom) > SIMPLIFY_VERTEX_THRESHOLD:
        geom = geom.simplify(SIMPLIFY_TOL_M, preserve_topology=True)
    if geom.is_empty:
        return geom
    if geom.geom_type == "Polygon":
        return orient(geom, sign=1.0)
    if geom.geom_type == "MultiPolygon":
        return MultiPolygon([orient(p, sign=1.0) for p in geom.geoms])
    return geom


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
def load_sites(codelists):
    """Return (site_polygon_features, site_location_features, site_lookup).

    site_lookup maps OBJECTID -> dict(name, address, ...) so the point/polygon
    builders can attach the site name to every child feature.

    Codelists are looked up via the authoritative GDB field-domain catalog:
      idPk = pflegeklasse, idEg = eigentuemer, idPv = pflegeverantwortung,
      idJn = ja/nein (kontrolle, reinigung).
    Excel sheet `Liste_Objekte.xls` is no longer consulted - the GDB
    domains are the single source of truth.
    """
    pk_map = codelists.get("idPk", {}) or PFLEGEKLASSE
    eg_map = codelists.get("idEg", {}) or EIGENTUEMER
    pv_map = codelists.get("idPv", {}) or PFLEGEVERANTWORTUNG
    jn_map = codelists.get("idJn", {}) or JA_NEIN

    polys = []
    dots = []
    site_lookup = {}

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

        # Reproject to LV95, then clean (validity + simplify + orient).
        # Cleaning happens in metric LV95 so SIMPLIFY_TOL_M is real metres.
        # WGS84 view is derived from the cleaned LV95, so the two stay
        # geometrically consistent down to the simplification tolerance.
        geom_lv95 = clean_polygon(reproject(geom, to_lv95))
        if geom_lv95 is None or geom_lv95.is_empty:
            continue
        geom_wgs = round_coords(reproject(geom_lv95, lv95_to_wgs))

        centroid_src = geom.representative_point()  # always inside polygon
        centroid_lv95 = reproject(centroid_src, to_lv95)
        cx_lv95, cy_lv95 = centroid_lv95.x, centroid_lv95.y
        centroid_wgs = round_coords(reproject(centroid_src, to_wgs))

        # Decode via the GDB's own field-domain catalog (extracted via ctypes).
        pflegeklasse_lbl  = lookup(pk_map, props.get("fk_pflegeklasseObjekt"))
        eigentuemer_lbl   = lookup(eg_map, props.get("fk_eigentuemer"))
        verantwortung_lbl = lookup(pv_map, props.get("fk_pflegeverantwortungObjekt"))
        kontrolle_lbl     = lookup(jn_map, props.get("kontrolle"))
        reinigung_lbl     = lookup(jn_map, props.get("reinigung"))

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

        site_lookup[oid] = {
            "name": base["name"],
            "objektnummer": base["objektnummer"],
            "adresse": base["adresse"],
            "lose": base["lose"],
        }

    return polys, dots, site_lookup


# ---------------------------------------------------------------------------
# Point loader (Pflegeelement_point)
# ---------------------------------------------------------------------------
def load_points(site_lookup, codelists):
    trees = []
    others = []
    # Profile codes on POINTS use idPP (1=Laubb. nat. grossk., 12=Abfalleimer,
    # 13=Sitzbank, ...) - a different domain than idPPy used by polygons!
    profil_map  = codelists.get("idPP", {})
    durch_map   = codelists.get("idPd", {})
    pk_map      = codelists.get("idPk", {})
    pv_map      = codelists.get("idPv", {})
    bewaess_map = codelists.get("idBw", {})
    baumart_map = codelists.get("idBa", {})
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
        fk_profil_v = to_int(props.get("fk_profil"))
        base = {
            "site_oid": site_oid,
            "site_name": site.get("name"),
            "site_objektnummer": site.get("objektnummer"),
            "site_adresse": site.get("adresse"),
            "site_lose": site.get("lose"),
            "fk_profil": fk_profil_v,
            "profil_label": profil_map.get(fk_profil_v) or (
                f"Profil {fk_profil_v}" if fk_profil_v is not None else None),
            "fk_pflegedurchfuehrung": to_int(props.get("fk_pflegedurchfuehrung")),
            "pflegedurchfuehrung": lookup(durch_map, props.get("fk_pflegedurchfuehrung")),
            "fk_pflegeverantwortung": to_int(props.get("fk_pflegeverantwortung")),
            "pflegeverantwortung": lookup(pv_map, props.get("fk_pflegeverantwortung")),
            # aufwandsfaktor stored as float32 in the GDB - round away the
            # rounding-error tail so 0.6 doesn't print as 0.6000000238.
            "aufwandsfaktor": (round(jsonify(props.get("aufwandsfaktor")), 2)
                               if not pd.isna(props.get("aufwandsfaktor")) else None),
            "bewaesserung": to_int(props.get("bewaesserung")),
            "bewaesserung_label": lookup(bewaess_map, props.get("bewaesserung")),
            "lauben": to_int(props.get("lauben")),
            "max_hoehe_m": jsonify(props.get("maxHoehe")),  # float (e.g. 1.4)
            "ausmass": to_int(props.get("ausmass")),
            "bemerkung": jsonify(props.get("bemerkung")),
            "letzte_aenderung": jsonify(props.get("letzte_aenderung")),
            "lv95_east": round(geom_lv95.x, 2),
            "lv95_north": round(geom_lv95.y, 2),
        }

        if is_tree:
            # Prefer the textual `baumart` if populated; otherwise look the
            # numeric fk_baumart up in idBa (430 species).
            baumart_decoded = baumart or lookup(baumart_map, fk_baumart)
            base.update({
                "baumart": baumart_decoded,
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
                    "subtype": baumart_decoded or f"Baum (Art-Code {to_int(fk_baumart)})",
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
                    # Use the human-readable profile name as subtype if we
                    # have one (e.g. "Sitzbank"), else fall back to the code.
                    "subtype": base["profil_label"] or "Punktelement",
                    "source": "GDB:Pflegeelement_point",
                },
            })

    return trees, others


# ---------------------------------------------------------------------------
# Polygon loader (Pflegeelement_polygon)
# ---------------------------------------------------------------------------
def load_polygons(site_lookup, codelists):
    canopies = []
    areas = []
    # Profile codes on POLYGONS use idPPy (1=Geb.Rasen kf., 5=Blumenrasen,
    # 25=Asphaltbelag, 37=Geröllstreifen/Bollensteine, ...) - a different
    # 44-entry domain than idPP used by points.
    profil_map  = codelists.get("idPPy", {})
    durch_map   = codelists.get("idPd", {})
    pk_map      = codelists.get("idPk", {})
    pv_map      = codelists.get("idPv", {})
    bewaess_map = codelists.get("idBw", {})
    winter_map  = codelists.get("Winterdienst", {})
    gdf = pyogrio.read_dataframe(GDB_PATH, layer="Pflegeelement_polygon")
    for _, row in gdf.iterrows():
        if row.geometry is None or row.geometry.is_empty:
            continue
        geom = row.geometry
        props = row.drop("geometry").to_dict()

        # Reproject + clean (validity, DP-simplify in metres, orient CCW).
        # Skip canopy candidates from the simplification step - they're
        # circular by design and we don't want to flatten the curvature.
        is_circle_candidate = is_canopy(props.get("geom_Length"),
                                        props.get("geom_Area"))
        geom_lv95 = reproject(geom, to_lv95)
        if not is_circle_candidate:
            geom_lv95 = clean_polygon(geom_lv95)
        else:
            # Still validate, just don't simplify.
            if not geom_lv95.is_valid:
                geom_lv95 = make_valid(geom_lv95)
            if geom_lv95.geom_type == "Polygon":
                geom_lv95 = orient(geom_lv95, sign=1.0)
            elif geom_lv95.geom_type == "MultiPolygon":
                geom_lv95 = MultiPolygon([orient(p, sign=1.0) for p in geom_lv95.geoms])
        if geom_lv95 is None or geom_lv95.is_empty:
            continue
        geom_wgs = round_coords(reproject(geom_lv95, lv95_to_wgs))

        site_oid = props.get("fk_objektbezeichnung")
        if pd.isna(site_oid):
            site_oid = None
        else:
            site_oid = int(site_oid)
        site = site_lookup.get(site_oid, {})

        fk_profil_v = to_int(props.get("fk_profil"))
        base = {
            "site_oid": site_oid,
            "site_name": site.get("name"),
            "site_objektnummer": site.get("objektnummer"),
            "site_adresse": site.get("adresse"),
            "site_lose": site.get("lose"),
            "fk_profil": fk_profil_v,
            "profil_label": profil_map.get(fk_profil_v) or (
                f"Profil {fk_profil_v}" if fk_profil_v is not None else None),
            "fk_pflegedurchfuehrung": to_int(props.get("fk_pflegedurchfuehrung")),
            "pflegedurchfuehrung": lookup(durch_map, props.get("fk_pflegedurchfuehrung")),
            "fk_pflegeklasse": to_int(props.get("fk_pflegeklasse")),
            "pflegeklasse": lookup(pk_map, props.get("fk_pflegeklasse")),
            "fk_winterdienst": to_int(props.get("fk_winterdienst")),
            "winterdienst": lookup(winter_map, props.get("fk_winterdienst")),
            # aufwandsfaktor stored as float32 in the GDB - round away the
            # rounding-error tail so 0.6 doesn't print as 0.6000000238.
            "aufwandsfaktor": (round(jsonify(props.get("aufwandsfaktor")), 2)
                               if not pd.isna(props.get("aufwandsfaktor")) else None),
            "bewaesserung": to_int(props.get("bewaesserung")),
            "bewaesserung_label": lookup(bewaess_map, props.get("bewaesserung")),
            "lauben": to_int(props.get("lauben")),
            "max_hoehe_m": jsonify(props.get("maxHoehe")),  # float
            "ausmass": jsonify(props.get("ausmass")),  # mostly None, kept as-is
            "bemerkung": jsonify(props.get("bemerkung")),
            "geom_length_m": jsonify(props.get("geom_Length")),
            "geom_area_m2": round(geom_lv95.area, 2),
        }

        if is_circle_candidate:
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
                    "subtype": base["profil_label"] or "Baumkrone",
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
                    "subtype": base["profil_label"] or "Pflegefläche",
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
    # Verify the source CRS by reading layer info before the heavy load.
    # Refuse to run silently against an unexpected CRS - that would otherwise
    # produce garbage coordinates without any visible error.
    info = pyogrio.read_info(GDB_PATH, layer="Objekt")
    print(f"  Source CRS: {info['crs']}")
    configure_transforms(info["crs"])

    # Extract codelists once.  The dict is read by all three loaders.
    codelists = extract_codelists(GDB_PATH)
    print(f"  Codelists: {len(codelists)} domains "
          f"({sum(1 for v in codelists.values() if v)} populated)")

    sites, dots, site_lookup = load_sites(codelists)
    trees, others = load_points(site_lookup, codelists)
    canopies, areas = load_polygons(site_lookup, codelists)

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

    # Compute the FeatureCollection bounding box (RFC 7946 §5 - lets
    # consumers fit/zoom without walking every coordinate of every feature).
    minLon = minLat = float("inf")
    maxLon = maxLat = float("-inf")
    def _scan(c):
        nonlocal minLon, minLat, maxLon, maxLat
        if isinstance(c[0], (int, float)):
            if c[0] < minLon: minLon = c[0]
            if c[0] > maxLon: maxLon = c[0]
            if c[1] < minLat: minLat = c[1]
            if c[1] > maxLat: maxLat = c[1]
        else:
            for x in c: _scan(x)
    for f in features:
        if f.get("geometry") and f["geometry"].get("coordinates"):
            _scan(f["geometry"]["coordinates"])
    bbox = [round(minLon, 6), round(minLat, 6),
            round(maxLon, 6), round(maxLat, 6)] if minLon != float("inf") else None

    fc = {
        # RFC 7946 mandates WGS84 (longitude, latitude) and explicitly forbids
        # the legacy `crs` member - downstream tooling should assume WGS84.
        # Source CRS is recorded in metadata.src_crs for traceability only.
        "type": "FeatureCollection",
        **({"bbox": bbox} if bbox else {}),
        "metadata": {
            "source": str(GDB_PATH),
            "attribution": "© Bundesamt für Bauten und Logistik (BBL) — Bundesgärtnerei",
            "license": "Internal use only",
            "extracted_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "src_crs": SRC_CRS,
            "out_crs": "EPSG:4326 (WGS84, RFC 7946)",
            "transform_accuracy_m": configure_transforms.accuracy_m,
            "simplify_tolerance_m_lv95": SIMPLIFY_TOL_M,
            "simplify_vertex_threshold": SIMPLIFY_VERTEX_THRESHOLD,
            "canopy_min_area_m2": CANOPY_MIN_AREA_M2,
            "canopy_circularity_tol": CANOPY_CIRCULARITY_TOL,
            "lv95_in_properties": True,
            # Codelists extracted from the GDB's own field-domain catalog
            # (via the ctypes → OGR_FldDomain_GetEnumeration path).  Keys
            # match the GDB domain names (idPP, idPPy, idBa, ...).  Values
            # are {int_code: label}.
            "codelists": codelists,
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

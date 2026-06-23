// ═══════════════════════════════════════════════════════════════════════════
// DATA LAYER — load the normalized per-entity files (docs/DATAMODEL.md) and
// assemble the in-memory FeatureCollection the app renders from.
//
// The normalized files are the single source of truth:
//   data/sites.json                  Site            (reference)
//   data/land_parcels.geojson        Land Parcel     (polygon, FK → site)
//   data/maintenance_polygons.geojson Maintenance Polygon (FK → parcel, profile)
//   data/maintenance_points.geojson  Maintenance Point   (FK → parcel, profile)
//   data/care_profiles.json          Care Profile + nested Care Tasks
//   data/codelists.json              17 field-domain codelists (decode codes)
//
// assembleInventory() does every join + codelist decode ONCE, here, producing
// the six entity_type features (site, area, tree_canopy, tree, point,
// site_location) the map/table/report consume.  No denormalized data is read
// from disk — it is all derived from the normalized records.
//
// Actor / Assignment and the execution party (Pflege durch) are intentionally
// absent (no data held, for data-compliance reasons), so the app no longer
// surfaces them.
// Depends on: config.js (DATA_FILES).
// ═══════════════════════════════════════════════════════════════════════════

// Provenance carried onto the assembled FeatureCollection's metadata.
const DATA_ATTRIBUTION = '© Bundesamt für Bauten und Logistik (BBL) — Bundesgärtnerei';
const DATA_LICENSE = 'Internal use only';

// LV95 (CH1903+) → WGS84 closed-form approximation (swisstopo "Reframe"),
// sub-metre inside Switzerland.  Canonical home for this transform — map.js
// (loaded after data.js) reuses this global instead of redefining it.
function lv95ToWgs84(E, N) {
  const yp = (E - 2600000) / 1000000;
  const xp = (N - 1200000) / 1000000;
  const lamSec = 2.6779094 + 4.728982 * yp + 0.791484 * yp * xp
    + 0.1306 * yp * xp * xp - 0.0436 * Math.pow(yp, 3);
  const phiSec = 16.9023892 + 3.238272 * xp - 0.270978 * yp * yp
    - 0.002528 * xp * xp - 0.0447 * yp * yp * xp - 0.0140 * Math.pow(xp, 3);
  return [lamSec * 100 / 36, phiSec * 100 / 36];
}

// Display address for a parcel.  Prefer the verbatim source string carried by
// the split (address_full); fall back to rejoining the tidy components.  The
// parsed components are best-effort for concatenated multi-parcel addresses,
// so the verbatim string is the faithful display value.
function _parcelAddress(pa) {
  if (pa.address_full != null && pa.address_full !== '') return pa.address_full;
  const line1 = [pa.address_street, pa.address_house_number].filter(Boolean).join(' ');
  const line2 = [pa.address_postal_code, pa.address_locality].filter(Boolean).join(' ');
  const out = [line1, line2].filter(Boolean).join(', ');
  return out || null;
}

// Per-entity-type display constants (mirror the old conversion's derived fields).
const _FEATURE_TYPE = {
  site: 'Standort', site_location: 'Standort', area: 'Pflegefläche',
  tree_canopy: 'Baumkrone', tree: 'Baum', point: 'Punktelement',
};
const _SOURCE_TAG = {
  site: 'GDB:Objekt', site_location: 'GDB:Objekt (centroid)',
  area: 'GDB:Pflegeelement_polygon', tree_canopy: 'GDB:Pflegeelement_polygon (circle)',
  tree: 'GDB:Pflegeelement_point', point: 'GDB:Pflegeelement_point',
};

// Build the FeatureCollection from already-parsed normalized stores.  Pure
// (no I/O), so it is unit-testable under Node as well as the browser.
function assembleInventory(stores) {
  const { sites, parcels, polygons, points, profiles, codelists } = stores;

  const decode = (domain, code) => {
    if (code == null) return null;
    const cl = codelists && codelists[domain];
    if (!cl) return null;
    const v = cl[code] != null ? cl[code] : cl[String(code)];
    return v == null ? null : v;
  };
  const profById = {};
  for (const pr of profiles) profById[pr.fid] = pr;
  const siteById = {};
  for (const s of sites) siteById[s.fid] = s;
  const parcelById = {};
  const addrByParcelFid = {};           // computed once per parcel, reused below
  for (const pf of parcels.features) {
    parcelById[pf.properties.fid] = pf;
    addrByParcelFid[pf.properties.fid] = _parcelAddress(pf.properties);
  }

  // Site context resolved through element → parcel → site.
  const siteCtxOfParcel = (parcelFid) => {
    const pf = parcelFid == null ? null : parcelById[parcelFid];
    if (!pf) return { site_oid: null, site_name: null, site_objektnummer: null,
                      site_adresse: null, site_lose: null };
    const s = siteById[pf.properties.site_fid] || {};
    return {
      site_oid: pf.properties.site_fid ?? null,
      site_name: s.name ?? null,
      site_objektnummer: s.system_id ?? null,
      site_adresse: addrByParcelFid[parcelFid] ?? null,
      site_lose: s.district ?? null,
    };
  };

  const features = [];

  // ── Sites (parcel polygon carries the geometry) ────────────────────────────
  const siteLocations = [];
  for (const pf of parcels.features) {
    const pa = pf.properties;
    const s = siteById[pa.site_fid] || {};
    const addr = addrByParcelFid[pa.fid];
    const base = {
      objectid: s.fid ?? null, site_oid: s.fid ?? null,
      objektnummer: s.system_id ?? null, site_objektnummer: s.system_id ?? null,
      name: s.name ?? null, site_name: s.name ?? null,
      adresse: addr, site_adresse: addr,
      parzelle: pa.parcel_number ?? null,
      lose: s.district ?? null, site_lose: s.district ?? null,
      erstellungsjahr: s.created_year ?? null,
      erfassungsdatum: s.surveyed_at ?? null,
      bemerkung: s.remarks ?? null,
      shape_length_m: pa.perimeter ?? null, shape_area_m2: pa.area_m2 ?? null,
      pflegeklasse: decode('idPk', s.maintenance_class),
      eigentuemer: decode('idEg', pa.owner),
      pflegeverantwortung: decode('idPv', pa.responsible_actor_fid),
      kontrolle: decode('idJn', s.inspection),
      reinigung: decode('idJn', s.cleaning),
      fk_pflegeklasse_raw: s.maintenance_class ?? null,
      fk_eigentuemer_raw: pa.owner ?? null,
      fk_pflegeverantwortung_raw: pa.responsible_actor_fid ?? null,
      kontrolle_raw: s.inspection ?? null, reinigung_raw: s.cleaning ?? null,
      lv95_east_centroid: pa.lv95_east ?? null, lv95_north_centroid: pa.lv95_north ?? null,
      area_m2: pa.area_m2 ?? null,
    };
    features.push({ type: 'Feature', geometry: pf.geometry, properties: {
      ...base, entity_type: 'site', category: 'site_boundary',
      feature_type: _FEATURE_TYPE.site, subtype: 'Standortfläche', source: _SOURCE_TAG.site } });

    // Centroid render-aid (red site marker); reprojected from stored LV95.
    if (pa.lv95_east != null && pa.lv95_north != null) {
      const [lng, lat] = lv95ToWgs84(pa.lv95_east, pa.lv95_north);
      siteLocations.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { ...base, entity_type: 'site_location', category: 'site_location',
          feature_type: _FEATURE_TYPE.site_location, subtype: 'Standortfläche',
          source: _SOURCE_TAG.site_location } });
    }
  }

  // ── Maintenance polygons → area | tree_canopy ──────────────────────────────
  const areaProfileCodes = new Set();
  for (const f of polygons.features) {
    const g = f.properties;
    const et = g.crown_radius != null ? 'tree_canopy' : 'area';
    const pr = g.care_profile_fid != null ? profById[g.care_profile_fid] : null;
    if (pr) areaProfileCodes.add(pr.code);
    const props = {
      ...siteCtxOfParcel(g.parcel_fid),
      fk_profil: pr ? pr.code : null, profil_label: pr ? pr.label : null,
      aufwandsfaktor: g.effort_factor ?? null,
      bewaesserung: g.irrigation ?? null, bewaesserung_label: decode('idBw', g.irrigation),
      lauben: g.leaf_clearing ?? null, max_hoehe_m: g.max_height ?? null,
      ausmass: null, bemerkung: g.remarks ?? null,
      geom_length_m: g.perimeter ?? null, geom_area_m2: g.area_m2 ?? null,
      fk_winterdienst: g.winter_service ?? null, winterdienst: decode('Winterdienst', g.winter_service),
      crown_radius_m: g.crown_radius ?? null, crown_diameter_m: g.crown_diameter ?? null,
      area_m2: g.area_m2 ?? null,
      entity_type: et,
      category: et === 'tree_canopy' ? 'tree_canopy' : (pr ? 'profil_' + pr.code : 'profil_unknown'),
      feature_type: _FEATURE_TYPE[et],
      subtype: pr ? pr.label : null,
      source: _SOURCE_TAG[et],
    };
    if (g._link_status) props._link_status = g._link_status;
    features.push({ type: 'Feature', geometry: f.geometry, properties: props });
  }

  // ── Maintenance points → tree | point ──────────────────────────────────────
  for (const f of points.features) {
    const g = f.properties;
    const isTree = (g.species_text != null && g.species_text !== '') || g.species_code != null;
    const et = isTree ? 'tree' : 'point';
    const pr = g.care_profile_fid != null ? profById[g.care_profile_fid] : null;
    const props = {
      ...siteCtxOfParcel(g.parcel_fid),
      fk_profil: pr ? pr.code : null, profil_label: pr ? pr.label : null,
      aufwandsfaktor: g.effort_factor ?? null,
      bewaesserung: g.irrigation ?? null, bewaesserung_label: decode('idBw', g.irrigation),
      lauben: g.leaf_clearing ?? null, max_hoehe_m: g.max_height ?? null,
      ausmass: g.count ?? null, bemerkung: g.remarks ?? null,
      lv95_east: g.lv95_east ?? null, lv95_north: g.lv95_north ?? null,
      baumart: g.species_text ?? null, fk_baumart: g.species_code ?? null,
      baumnummer: g.tree_number ?? null,
      entity_type: et,
      category: isTree ? 'tree' : 'point_other',
      feature_type: _FEATURE_TYPE[et],
      subtype: isTree ? (g.species_text ?? null) : (pr ? pr.label : null),
      source: _SOURCE_TAG[et],
    };
    if (g._link_status) props._link_status = g._link_status;
    features.push({ type: 'Feature', geometry: f.geometry, properties: props });
  }

  // Centroid markers go last (matches the old site → … → site_location order).
  for (const sl of siteLocations) features.push(sl);

  // bbox (RFC 7946) over every geometry.
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const scan = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < minLon) minLon = c[0]; if (c[0] > maxLon) maxLon = c[0];
      if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
    } else c.forEach(scan);
  };
  for (const f of features) if (f.geometry) scan(f.geometry.coordinates);

  return {
    type: 'FeatureCollection',
    bbox: isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : undefined,
    metadata: {
      source: 'normalized entity files (data/*.json, *.geojson)',
      attribution: DATA_ATTRIBUTION,
      license: DATA_LICENSE,
      out_crs: 'EPSG:4326 (WGS84, RFC 7946)',
      codelists,
      fk_profil_values: [...areaProfileCodes].sort((a, b) => a - b),
    },
    features,
  };
}

// Browser entry: fetch all normalized files, then assemble.  Each file is
// fetched individually so a failure names the file that broke (HTTP status or
// bad JSON), instead of an opaque Promise.all rejection.
async function loadInventory(files) {
  const get = async (key) => {
    const url = files[key];
    let resp;
    try { resp = await fetch(url); }
    catch (e) { throw new Error(`Could not fetch ${key} (${url}): ${e.message}`); }
    if (!resp.ok) throw new Error(`Could not load ${key} (${url}): HTTP ${resp.status}`);
    try { return await resp.json(); }
    catch (e) { throw new Error(`Invalid JSON in ${key} (${url}): ${e.message}`); }
  };
  const [sites, parcels, polygons, points, profiles, codelists] = await Promise.all([
    get('sites'), get('parcels'), get('polygons'),
    get('points'), get('profiles'), get('codelists'),
  ]);
  return assembleInventory({ sites, parcels, polygons, points, profiles, codelists });
}

// Node test hook (ignored in the browser).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { assembleInventory, loadInventory, _parcelAddress, lv95ToWgs84 };
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA LAYER — load the normalized per-entity files (docs/DATAMODEL.md) and
// assemble the in-memory FeatureCollection the app renders from.
//
// The normalized files are the single source of truth:
//   data/sites.geojson               Standort        (attributes + Pflegeperimeter)
//   data/land_parcels.geojson        Land Parcel     (cadastral polygon, EGRID)
//   data/maintenance_polygons.geojson Maintenance Polygon (site assigned, parcel located, profile)
//   data/maintenance_points.geojson  Maintenance Point   (site assigned, parcel located, profile)
//   data/care_profiles.json          Care Profile + nested Care Tasks
//   data/codelists.json              17 field-domain codelists (decode codes)
//
// assembleInventory() does every join + codelist decode ONCE, here, producing
// the seven entity_type features (site, parcel, area, tree_canopy, tree, point,
// site_location) the map/table/report consume.  Elements carry their assigned
// Standort (site_fid) and their located cadastral parcel (parcel_fid); the
// Standort–parcel relation is derived from the elements, never stored.  No denormalized data is read
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

// Display address for a Standort.  Prefer the verbatim source string carried
// by the split (address_full); fall back to rejoining the tidy components.  The
// parsed components are best-effort for concatenated multi-building addresses,
// so the verbatim string is the faithful display value.
function _siteAddress(sa) {
  if (sa.address_full != null && sa.address_full !== '') return sa.address_full;
  const line1 = [sa.address_street, sa.address_house_number].filter(Boolean).join(' ');
  const line2 = [sa.address_postal_code, sa.address_locality].filter(Boolean).join(' ');
  const out = [line1, line2].filter(Boolean).join(', ');
  return out || null;
}

// Per-entity-type display constants (mirror the old conversion's derived fields).
const _FEATURE_TYPE = {
  site: 'Standort', site_location: 'Standort', parcel: 'Grundstück', area: 'Pflegefläche',
  tree_canopy: 'Baumkrone', tree: 'Baum', point: 'Punktelement',
};
const _SOURCE_TAG = {
  site: 'GDB:Objekt (Pflegeperimeter)', site_location: 'GDB:Objekt (centroid)',
  parcel: 'AV: Amtliche Vermessung (OpenData-AV, cadastre.ch)',
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

  // Publish the per-profile styles as the global PROFILE_STYLES index that
  // config.js's profilStyle() reads — making care_profiles.json the single
  // runtime source for map/legend/popup/PDF colours.
  const styleIndex = { idPPy: {}, idPP: {} };
  for (const pr of profiles) {
    if (pr.style && styleIndex[pr.code_list]) styleIndex[pr.code_list][pr.code] = pr.style;
  }
  if (typeof globalThis !== 'undefined') globalThis.PROFILE_STYLES = styleIndex;

  // Standorte: a FeatureCollection (sites.geojson) — attributes + perimeter.
  const siteFeats = (sites && sites.features) ? sites.features : [];
  const siteById = {};
  const addrBySite = {};                  // computed once per Standort, reused below
  for (const sf of siteFeats) {
    siteById[sf.properties.fid] = sf.properties;
    addrBySite[sf.properties.fid] = _siteAddress(sf.properties);
  }
  // Cadastral parcels (land_parcels.geojson) — may be empty when not fetched.
  const parcelFeats = (parcels && parcels.features) ? parcels.features : [];
  const parcelById = {};
  for (const pf of parcelFeats) parcelById[pf.properties.fid] = pf.properties;

  // Standort context of an element, through its ASSIGNED site_fid.
  const siteCtx = (siteFid) => {
    const s = siteFid == null ? null : siteById[siteFid];
    if (!s) return { site_oid: null, site_name: null, site_objektnummer: null,
                     site_adresse: null, site_lose: null };
    return {
      site_oid: s.fid,
      site_name: s.name ?? null,
      site_objektnummer: s.legacy_id ?? null,
      site_adresse: addrBySite[s.fid] ?? null,
      site_lose: s.district ?? null,
    };
  };
  // Cadastral context of an element, through its LOCATED parcel_fid.
  const parcelCtx = (parcelFid) => {
    const pa = parcelFid == null ? null : parcelById[parcelFid];
    if (!pa) return { parcel_fid: null, egrid: null, parcel_number: null,
                      municipality_name: null, canton: null, erp_id: null };
    return {
      parcel_fid: pa.fid,
      egrid: pa.egrid ?? null,
      parcel_number: pa.parcel_number ?? null,
      municipality_name: pa.municipality_name ?? null,
      canton: pa.canton ?? null,
      erp_id: pa.erp_id ?? null,
    };
  };

  const features = [];

  // ── Standorte (perimeter polygon) + centroid render-aid ───────────────────
  const siteLocations = [];
  for (const sf of siteFeats) {
    const s = sf.properties;
    const addr = addrBySite[s.fid];
    const base = {
      objectid: s.fid, site_oid: s.fid,
      objektnummer: s.legacy_id ?? null, site_objektnummer: s.legacy_id ?? null,
      name: s.name ?? null, site_name: s.name ?? null,
      adresse: addr, site_adresse: addr,
      parzelle: s.legacy_parcel_numbers ?? null,
      lose: s.district ?? null, site_lose: s.district ?? null,
      erstellungsjahr: s.created_year ?? null,
      erfassungsdatum: s.surveyed_at ?? null,
      bemerkung: s.remarks ?? null,
      shape_length_m: s.perimeter_length_m ?? null, shape_area_m2: s.perimeter_area_m2 ?? null,
      pflegeklasse: decode('idPk', s.maintenance_class),
      eigentuemer: decode('idEg', s.owner),
      pflegeverantwortung: decode('idPv', s.responsible_actor_fid),
      kontrolle: decode('idJn', s.inspection),
      reinigung: decode('idJn', s.cleaning),
      fk_pflegeklasse_raw: s.maintenance_class ?? null,
      fk_eigentuemer_raw: s.owner ?? null,
      fk_pflegeverantwortung_raw: s.responsible_actor_fid ?? null,
      kontrolle_raw: s.inspection ?? null, reinigung_raw: s.cleaning ?? null,
      lv95_east_centroid: s.lv95_east ?? null, lv95_north_centroid: s.lv95_north ?? null,
      area_m2: s.perimeter_area_m2 ?? null,
    };
    features.push({ type: 'Feature', geometry: sf.geometry, properties: {
      ...base, entity_type: 'site', category: 'site_boundary',
      feature_type: _FEATURE_TYPE.site, subtype: 'Pflegeperimeter', source: _SOURCE_TAG.site } });

    // Centroid render-aid (red site marker); reprojected from stored LV95.
    if (s.lv95_east != null && s.lv95_north != null) {
      const [lng, lat] = lv95ToWgs84(s.lv95_east, s.lv95_north);
      siteLocations.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { ...base, entity_type: 'site_location', category: 'site_location',
          feature_type: _FEATURE_TYPE.site_location, subtype: 'Standort',
          source: _SOURCE_TAG.site_location } });
    }
  }

  // Elements per parcel (for the parcel rows below): total and per Standort.
  const perParcel = {};                   // parcel_fid -> { n, bySite: { site_fid: n } }
  const noteParcel = (parcelFid, siteFid) => {
    if (parcelFid == null) return;
    const agg = perParcel[parcelFid] || (perParcel[parcelFid] = { n: 0, bySite: {} });
    agg.n += 1;
    if (siteFid != null) agg.bySite[siteFid] = (agg.bySite[siteFid] || 0) + 1;
  };

  // ── Maintenance polygons → area | tree_canopy ──────────────────────────────
  const areaProfileCodes = new Set();
  const elementFeatures = [];
  for (const f of polygons.features) {
    const g = f.properties;
    const et = g.crown_radius != null ? 'tree_canopy' : 'area';
    const pr = g.care_profile_fid != null ? profById[g.care_profile_fid] : null;
    if (pr) areaProfileCodes.add(pr.code);
    noteParcel(g.parcel_fid, g.site_fid);
    const props = {
      ...siteCtx(g.site_fid),
      ...parcelCtx(g.parcel_fid),
      straddles_parcels: g.straddles_parcels ?? null,
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
    elementFeatures.push({ type: 'Feature', geometry: f.geometry, properties: props });
  }

  // ── Maintenance points → tree | point ──────────────────────────────────────
  for (const f of points.features) {
    const g = f.properties;
    const isTree = (g.species_text != null && g.species_text !== '') || g.species_code != null;
    const et = isTree ? 'tree' : 'point';
    const pr = g.care_profile_fid != null ? profById[g.care_profile_fid] : null;
    noteParcel(g.parcel_fid, g.site_fid);
    const props = {
      ...siteCtx(g.site_fid),
      ...parcelCtx(g.parcel_fid),
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
    elementFeatures.push({ type: 'Feature', geometry: f.geometry, properties: props });
  }

  // ── Cadastral parcels (Grundstücke) ────────────────────────────────────────
  // Standort context = the Standort with most elements on the parcel (for the
  // filter and the table); every Standort it serves is listed in site_names.
  for (const pf of parcelFeats) {
    const pa = pf.properties;
    const agg = perParcel[pa.fid] || { n: 0, bySite: {} };
    const ranked = Object.entries(agg.bySite).sort((a, b) => b[1] - a[1]);
    const primary = ranked.length ? Number(ranked[0][0]) : null;
    const names = ranked.map(([sid]) => (siteById[sid] || {}).name).filter(Boolean);
    const muni = pa.municipality_name || (pa.municipality_bfs != null ? 'BFS ' + pa.municipality_bfs : null);
    features.push({ type: 'Feature', geometry: pf.geometry, properties: {
      ...siteCtx(primary),
      site_names: names.length ? names.join(' · ') : null,
      parcel_fid: pa.fid,
      egrid: pa.egrid ?? null,
      parcel_number: pa.parcel_number ?? null,
      numbering_area: pa.numbering_area ?? null,
      municipality_bfs: pa.municipality_bfs ?? null,
      municipality_name: pa.municipality_name ?? null,
      canton: pa.canton ?? null,
      geoportal_url: pa.geoportal_url ?? null,
      erp_id: pa.erp_id ?? null,
      erp_company_code: pa.erp_company_code ?? null,
      erp_business_entity: pa.erp_business_entity ?? null,
      erp_object: pa.erp_object ?? null,
      erp_name: pa.erp_name ?? null,
      erp_ownership_type: pa.erp_ownership_type ?? null,
      erp_historic_garden: pa.erp_historic_garden ?? null,
      erp_alternatives: Array.isArray(pa.erp_alternatives) && pa.erp_alternatives.length ? pa.erp_alternatives.join(', ') : null,
      eigentuemer: decode('idEg', pa.owner), fk_eigentuemer_raw: pa.owner ?? null,
      area_m2: pa.area_m2 ?? null, shape_length_m: pa.perimeter_m ?? null,
      element_count: agg.n,
      geometry_source: pa.geometry_source ?? null, fetched_at: pa.fetched_at ?? null,
      label_lon: pa.label_lon ?? null, label_lat: pa.label_lat ?? null,
      entity_type: 'parcel', category: 'parcel',
      feature_type: _FEATURE_TYPE.parcel,
      subtype: [muni, pa.parcel_number ? 'Nr. ' + pa.parcel_number : null].filter(Boolean).join(' ') || null,
      source: _SOURCE_TAG.parcel,
    } });
  }

  for (const ef of elementFeatures) features.push(ef);
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

  const parcelMeta = (parcels && parcels.metadata) || {};
  return {
    type: 'FeatureCollection',
    bbox: isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : undefined,
    metadata: {
      source: 'normalized entity files (data/*.geojson, *.json)',
      attribution: DATA_ATTRIBUTION,
      license: DATA_LICENSE,
      out_crs: 'EPSG:4326 (WGS84, RFC 7946)',
      codelists,
      fk_profil_values: [...areaProfileCodes].sort((a, b) => a - b),
      parcels: { count: parcelFeats.length, source: parcelMeta.source || null,
                 attribution: parcelMeta.attribution || null, fetched_at: parcelMeta.fetched_at || null,
                 uncovered_sites: parcelMeta.uncovered_sites || [] },
      // Shown by MapLibre's attribution control (basemap licence terms require
      // the cadastral-survey credit whenever parcels are drawn).
      attribution_html: parcelFeats.length
        ? '© BBL – Bundesgärtnerei · Grundstücke: <a href="https://www.cadastre.ch/de" target="_blank" rel="noopener">AV, cadastre.ch</a>'
        : '© BBL – Bundesgärtnerei',
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
  module.exports = { assembleInventory, loadInventory, _siteAddress, lv95ToWgs84 };
}

// Split data/data.geojson into one file per data-model entity (docs/DATAMODEL.md).
// Output: data/ — spatial entities as GeoJSON, reference entities as JSON,
// alongside the source data.geojson and the cadastral parcels fetched by
// scripts/fetch_parcels.mjs (which must run first; see §6.3 of the model).
// Re-runnable, offline. Reads care schedule + legend categories from js/config.js.
//
// Entities written here: Standort (sites.geojson: attributes + Pflegeperimeter),
// Maintenance Polygon, Maintenance Point (each with the assigned site_fid from
// the survey and the located parcel_fid computed against land_parcels.geojson),
// Care Profile (with Care Tasks nested), plus codelists.json.  Cost rate and
// Image are planned / source-less; Actor and Assignment are intentionally
// omitted (no data held, for data-compliance reasons).
//
// Each Care Profile also gets `geometry_type` (polygon/point) and a `style`
// ({fill, swatchClass?}) seeded from config.js's AREA/POINT_PROFILE_STYLE.
// care_profiles.json is the runtime source the app reads for colours — note
// that re-running this script reseeds `style` from config.js and overwrites
// any hand edits made to care_profiles.json.
//
//   node scripts/split_entities.mjs
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { interiorPoint, forEachVertex, PolygonIndex } from './lib/geo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data');
fs.mkdirSync(OUT, { recursive: true });

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'data.geojson'), 'utf8'));
const codelists = data.metadata.codelists;
const F = data.features;

// Cadastral parcels (Land Parcel) — produced by fetch_parcels.mjs.  Without the
// file every element gets parcel_fid = null and the app shows no parcels.
const PARCELS_PATH = path.join(OUT, 'land_parcels.geojson');
let parcels = { type: 'FeatureCollection', metadata: {}, features: [] };
if (fs.existsSync(PARCELS_PATH)) {
  const pf = JSON.parse(fs.readFileSync(PARCELS_PATH, 'utf8'));
  if ((pf.features || []).every(f => f.properties && f.properties.geometry_source === 'av')) parcels = pf;
  else console.warn('land_parcels.geojson is not the cadastral file (no geometry_source=av) — ignoring it; run fetch_parcels.mjs');
} else {
  console.warn('land_parcels.geojson missing — run scripts/fetch_parcels.mjs first; elements get parcel_fid = null');
}
const parcelIndex = new PolygonIndex(parcels.features);
const locate = (geom) => {
  const pt = interiorPoint(geom);
  const hit = pt ? parcelIndex.find(pt) : null;
  return hit ? hit.properties.fid : null;
};

// ── Pull CARE_CATALOG_* and LEGEND_GROUPS literals out of config.js ──────────
const cfg = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
function literalAfter(src, marker, open, close) {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('not found: ' + marker);
  const s = src.indexOf(open, i);
  let depth = 0, q = null, esc = false;
  for (let j = s; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (q) { if (c === '\\') esc = true; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return src.slice(s, j + 1); }
  }
  throw new Error('unbalanced: ' + marker);
}
const evalLit = (lit) => (0, eval)('(' + lit + ')');
const CARE_AREA  = evalLit(literalAfter(cfg, 'CARE_CATALOG_AREA',  '{', '}'));
const CARE_POINT = evalLit(literalAfter(cfg, 'CARE_CATALOG_POINT', '{', '}'));
const LEGEND     = evalLit(literalAfter(cfg, 'const LEGEND_GROUPS', '[', ']'));
const AREA_STYLE  = evalLit(literalAfter(cfg, 'const AREA_PROFILE_STYLE',  '{', '}'));
const POINT_STYLE = evalLit(literalAfter(cfg, 'const POINT_PROFILE_STYLE', '{', '}'));

// Seed style for a profile code — the curated catalogue entry, else the same
// HSL hash profilStyle() uses, so every profile gets a concrete style.  This
// is the seed baked into care_profiles.json; the app reads it back from there.
function styleFor(domain, code) {
  const seed = domain === 'idPPy' ? AREA_STYLE : POINT_STYLE;
  if (seed[code]) return seed[code];
  const hue = (code * 137) % 360, sat = 55 + (code % 3) * 6, lum = 60 + (code % 2) * 6;
  return { fill: `hsl(${hue}, ${sat}%, ${lum}%)` };
}

// profile code -> category label, by domain (area = idPPy, point = idPP)
const catByCode = { area: {}, point: {} };
for (const g of LEGEND) {
  if (!g.profileCodes) continue;
  const dom = g.entity_type === 'area' ? 'area' : 'point';
  for (const c of g.profileCodes) catByCode[dom][c] = g.label;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const num = (v) => (v === '' || v == null ? null : Number(v));
const str = (v) => (v == null ? null : String(v));
function parseFreq(h) {                       // "16×" -> 16 ; "4–6×"/"laufend" -> 4/null
  if (h == null) return null;
  const m = String(h).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}
function parseAddress(adr) {                   // "Einsteinstrasse 2, Bern" (best effort)
  const out = { address_street: null, address_house_number: null, address_postal_code: null,
                address_locality: null, address_region: null, address_country: null };
  if (!adr) return out;
  const parts = String(adr).split(',').map(s => s.trim()).filter(Boolean);
  let loc = parts.length > 1 ? parts[parts.length - 1] : null;
  if (loc) {
    const pm = loc.match(/^(\d{4})\s+(.*)$/);  // "3003 Bern"
    if (pm) { out.address_postal_code = pm[1]; loc = pm[2]; }
    out.address_locality = loc;
  }
  const street = parts[0] || null;
  if (street) {
    const sm = street.match(/^(.*?)\s+(\d+\w*(?:[-/]\d+\w*)?)$/);
    if (sm) { out.address_street = sm[1]; out.address_house_number = sm[2]; }
    else out.address_street = street;
  }
  return out;
}
const feat = (fid, geometry, properties) => ({ type: 'Feature', id: fid, geometry, properties });
const fc = (features, metadata) => (metadata ? { type: 'FeatureCollection', metadata, features } : { type: 'FeatureCollection', features });
const write = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1));

// ── Care Profiles (from codelists) with Care Tasks nested (from CARE_CATALOG) ──
// Tasks live inside their profile's `tasks` array; the parent fid is the link,
// so the redundant care_profile_fid is dropped in the nested form.
const profiles = [];
const profByFid = {};                          // fid -> profile object (to nest tasks)
const profFid = { idPPy: {}, idPP: {} };       // (domain,code) -> fid
let pf = 0;
for (const [domain, unit] of [['idPPy', 'm²'], ['idPP', 'count']]) {
  const dom = domain === 'idPPy' ? 'area' : 'point';
  for (const [code, label] of Object.entries(codelists[domain] || {})) {
    const fid = ++pf;
    profFid[domain][Number(code)] = fid;
    const prof = { fid, code_list: domain, code: Number(code), label,
      category: catByCode[dom][Number(code)] || null,
      geometry_type: domain === 'idPPy' ? 'polygon' : 'point',
      unit, style: styleFor(domain, Number(code)), description: null,
      leaf_clearing_included: null, tasks: [] };
    profByFid[fid] = prof;
    profiles.push(prof);
  }
}
let tf = 0;
for (const [domain, cat] of [['idPPy', CARE_AREA], ['idPP', CARE_POINT]]) {
  for (const [code, entry] of Object.entries(cat)) {
    const cpf = profFid[domain][Number(code)];
    if (!cpf || !entry.tasks) continue;
    for (const t of entry.tasks)
      profByFid[cpf].tasks.push({ fid: ++tf, task: t.m || null,
        frequency_per_year: parseFreq(t.h), material: t.mat || null });
  }
}

// ── Standorte (the survey's `site` feature: attributes + Pflegeperimeter) ────
// The Standort is the tender unit (DATAMODEL §3.1).  Its polygon is the drawn
// perimeter, kept for display only; the parcel link is NOT stored here — it is
// derived through the elements.
const sites = [];
for (const f of F) {
  const p = f.properties;
  if (p.entity_type !== 'site') continue;
  const siteFid = p.objectid;                  // the survey's object id: stable
  sites.push(feat(siteFid, f.geometry, {
    fid: siteFid,
    legacy_id: str(p.objektnummer),
    legacy_parcel_numbers: str(p.parzelle),
    name: str(p.name || p.site_name),
    ...parseAddress(p.adresse), address_full: str(p.adresse),
    maintenance_class: num(p.fk_pflegeklasse_raw), district: str(p.lose),
    inspection: num(p.kontrolle_raw), cleaning: num(p.reinigung_raw),
    owner: num(p.fk_eigentuemer_raw), responsible_actor_fid: num(p.fk_pflegeverantwortung_raw),
    created_year: num(p.erstellungsjahr), surveyed_at: str(p.erfassungsdatum),
    remarks: str(p.bemerkung),
    lv95_east: num(p.lv95_east_centroid), lv95_north: num(p.lv95_north_centroid),
    perimeter_area_m2: num(p.area_m2), perimeter_length_m: num(p.shape_length_m),
  }));
}

// ── Maintenance Polygons / Maintenance Points ────────────────────────────────
// site_fid   = assigned Standort (the survey's fk_objektbezeichnung)
// parcel_fid = located parcel (point-in-polygon against land_parcels.geojson)
const polygons = [], points = [];
let polyFid = 0, ptFid = 0, located = 0, unlocated = 0, straddling = 0;
const shared = (p, profDomain, geometry) => ({
  site_fid: p.site_oid == null ? null : Number(p.site_oid),
  parcel_fid: locate(geometry),
  care_profile_fid: profFid[profDomain][p.fk_profil] ?? null,
  irrigation: num(p.bewaesserung), effort_factor: num(p.aufwandsfaktor),
  leaf_clearing: num(p.lauben), max_height: num(p.max_hoehe_m), remarks: str(p.bemerkung),
});
// Does a polygon's outline cross into more than one parcel?  Sampled vertices
// (at most ~24) — a flag for the cost split, not a measurement.
function straddles(geometry, parcelFid) {
  if (parcelFid == null || !parcels.features.length) return null;
  const verts = [];
  forEachVertex(geometry, c => verts.push(c));
  const step = Math.max(1, Math.floor(verts.length / 24));
  const seen = new Set([parcelFid]);
  for (let i = 0; i < verts.length; i += step) {
    const hit = parcelIndex.find(verts[i]);
    if (hit) seen.add(hit.properties.fid);
    if (seen.size > 1) return true;
  }
  return false;
}
for (const f of F) {
  const p = f.properties, et = p.entity_type;
  if (et === 'area' || et === 'tree_canopy') {
    const fid = ++polyFid;
    const base = shared(p, 'idPPy', f.geometry);
    const props = { fid, ...base,
      straddles_parcels: straddles(f.geometry, base.parcel_fid),
      area_m2: num(p.area_m2), perimeter: num(p.geom_length_m),
      winter_service: num(p.fk_winterdienst),
      crown_radius: num(p.crown_radius_m), crown_diameter: num(p.crown_diameter_m) };
    if (props.straddles_parcels) straddling++;
    if (p.site_oid == null) props._link_status = 'unassigned';
    if (props.parcel_fid != null) located++; else unlocated++;
    polygons.push(feat(fid, f.geometry, props));
  } else if (et === 'tree' || et === 'point') {
    const fid = ++ptFid;
    const props = { fid, ...shared(p, 'idPP', f.geometry),
      species_text: str(p.baumart), species_code: num(p.fk_baumart),
      tree_number: num(p.baumnummer), count: num(p.ausmass),
      lv95_east: num(p.lv95_east), lv95_north: num(p.lv95_north) };
    if (p.site_oid == null) props._link_status = 'unassigned';
    if (props.parcel_fid != null) located++; else unlocated++;
    points.push(feat(fid, f.geometry, props));
  }
}

// ── write (only the entities we currently hold data for) ─────────────────────
write('sites.geojson', fc(sites, {
  entity: 'Standort (docs/DATAMODEL.md §3.1)',
  source: 'survey GDB layer Objekt via data.geojson',
  geometry: 'Pflegeperimeter drawn for the tender plans — display only, not a legal boundary, not a maintained area',
}));
write('maintenance_polygons.geojson', fc(polygons));
write('maintenance_points.geojson', fc(points));
write('care_profiles.json', profiles);         // Care Tasks nested under each profile
write('codelists.json', codelists);            // 17 field-domain codelists (decode raw codes)
// The Standort file used to be sites.json (attributes only); remove the stale copy.
const legacySites = path.join(OUT, 'sites.json');
if (fs.existsSync(legacySites)) { fs.rmSync(legacySites); console.log('removed stale data/sites.json (replaced by sites.geojson)'); }

const unassigned = [...polygons, ...points].filter(f => f.properties._link_status).length;
const manifest = {
  generated_from: 'data/data.geojson + data/land_parcels.geojson', model: 'docs/DATAMODEL.md',
  files: {
    'sites.geojson': sites.length, 'land_parcels.geojson': parcels.features.length,
    'maintenance_polygons.geojson': polygons.length, 'maintenance_points.geojson': points.length,
    'care_profiles.json': profiles.length,
  },
  care_tasks_nested: tf,
  codelist_domains: Object.keys(codelists).length,
  element_links: {
    assigned_to_site: polygons.length + points.length - unassigned, unassigned_site: unassigned,
    located_on_parcel: located, unlocated_parcel: unlocated, straddling_parcels: straddling,
  },
  parcels: {
    source: (parcels.metadata && parcels.metadata.source) || null,
    fetched_at: (parcels.metadata && parcels.metadata.fetched_at) || null,
    uncovered_sites: (parcels.metadata && parcels.metadata.uncovered_sites) || [],
  },
};
write('_manifest.json', manifest);
console.log(JSON.stringify(manifest.files, null, 2));
console.log('care_tasks (nested in care_profiles):', tf);
console.log('elements: unassigned Standort', unassigned, '| located on a parcel', located, '| unlocated', unlocated, '| straddling', straddling);
console.log('output dir:', path.relative(ROOT, OUT));

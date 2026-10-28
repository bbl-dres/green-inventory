// Fetch the cadastral parcels (Land Parcel, docs/DATAMODEL.md §3.2) that the
// inventory's maintenance elements stand on, from the federal OpenData-AV
// service, and write data/land_parcels.geojson.
//
//   node scripts/fetch_parcels.mjs                         # reuse geometry already in the file
//   node scripts/fetch_parcels.mjs --refresh               # re-fetch every parcel
//   node scripts/fetch_parcels.mjs --erp "D:/export.txt"   # join the ERP real-estate export
//   node scripts/fetch_parcels.mjs --erp … --erp-all       # also add every owned ERP parcel nationwide
//
// Method
//   1. For every Standort in data/data.geojson, one identify request with the
//      envelope of its Pflegeperimeter plus its elements (buffered ~20 m)
//      against ch.swisstopo-vd.amtliche-vermessung, sr=4326, with geometry.
//      That yields every parcel touching the site, including streets and
//      neighbours.
//   2. Locate every element (point: its coordinate; polygon: an interior
//      point) in those candidates.  A parcel is kept when at least one element
//      stands on it — the located relation of §3.3.  Elements get no file
//      here; split_entities.mjs recomputes parcel_fid from the written file
//      with the same helpers (scripts/lib/geo.mjs).
//   3. Optional ERP real-estate export (--erp <path>, see "ERP export" below
//      for the two accepted formats).  Its rows fill erp_* on the parcels the
//      inventory touches and add owned federal parcels at the inventoried
//      sites that host no element yet.  The export is internal: keep it
//      outside the repository; only the matched keys reach the output.
//   4. Municipality names: one identify per BFS number on the municipality
//      layer (the AV layer only delivers the number).
//
// Identity: fid = numeric part of the EGRID (stable across refreshes).  Area
// and perimeter are computed in LV95 from the delivered geometry.
//
// Coverage: OpenData-AV covers only cantons that publish their survey as open
// data.  Standorte with no parcel hit (today the three in canton Vaud) are
// listed in the file's metadata.uncovered_sites and keep their perimeter as
// the only outline in the app.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  emptyBbox, extendBbox, bufferBbox, bboxOfGeometry, interiorPoint, poleOfInaccessibility,
  polygonAreaM2, polygonPerimeterM, PolygonIndex,
} from './lib/geo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'data.geojson');
const OUT = path.join(ROOT, 'data', 'land_parcels.geojson');
const REFRESH = process.argv.includes('--refresh');
const ERP_ALL = process.argv.includes('--erp-all');
const ERP_PATH = (() => {
  const i = process.argv.indexOf('--erp');
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.argv[i + 1]);
  const local = path.join(ROOT, 'data', 'erp_land_objects.csv');
  return fs.existsSync(local) ? local : null;
})();

const API = 'https://api3.geo.admin.ch/rest/services';
const AV_LAYER = 'ch.swisstopo-vd.amtliche-vermessung';
const MUNI_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill';
const BUFFER_DEG = 0.00025;                 // ≈ 20–28 m at 47° N
const CONCURRENCY = 4;

// ── HTTP ───────────────────────────────────────────────────────────────────
async function getJson(url, tries = 3) {
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (t >= tries) throw new Error(`${e.message} for ${url.slice(0, 120)}…`);
      await new Promise(res => setTimeout(res, 800 * t));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const props = (r) => r.properties || r.attributes || {};

// Identify every AV parcel intersecting a WGS84 envelope.
async function identifyEnvelope(bbox) {
  const env = bbox.map(v => v.toFixed(6)).join(',');
  const u = `${API}/all/MapServer/identify?geometry=${env}&geometryType=esriGeometryEnvelope` +
    `&layers=all:${AV_LAYER}&sr=4326&tolerance=0&returnGeometry=true&geometryFormat=geojson` +
    `&mapExtent=${env}&imageDisplay=1000,1000,96&lang=de`;
  const d = await getJson(u);
  return d.results || [];
}

// Geometry + attributes of one parcel by EGRID.
async function findByEgrid(egrid) {
  const u = `${API}/api/MapServer/find?layer=${AV_LAYER}&searchText=${encodeURIComponent(egrid)}` +
    `&searchField=egris_egrid&returnGeometry=true&geometryFormat=geojson&sr=4326`;
  const d = await getJson(u);
  return (d.results || [])[0] || null;
}

// Municipality name at a point (the AV layer carries only the BFS number).
// The municipality layer is time-enabled and answers with every historical
// record first (Ittigen points came back as "Bolligen", valid until 1982), so
// take the current-year record whose BFS number matches the parcel's.
async function municipalityNameAt(pt, bfs) {
  const env = [pt[0] - 0.001, pt[1] - 0.001, pt[0] + 0.001, pt[1] + 0.001].map(v => v.toFixed(6)).join(',');
  const u = `${API}/all/MapServer/identify?geometry=${pt[0].toFixed(6)},${pt[1].toFixed(6)}` +
    `&geometryType=esriGeometryPoint&layers=all:${MUNI_LAYER}&sr=4326&tolerance=0&returnGeometry=false` +
    `&mapExtent=${env}&imageDisplay=100,100,96&lang=de`;
  try {
    const d = await getJson(u, 2);
    const recs = (d.results || []).map(props);
    const current = recs.filter(a => a.is_current_jahr === true || a.is_current_jahr === 'true');
    const hit = current.find(a => Number(a.gde_nr) === Number(bfs)) || current[0]
      || recs.find(a => Number(a.gde_nr) === Number(bfs));
    return hit ? (hit.gemname || hit.name || hit.label || null) : null;
  } catch { return null; }
}

// ── Parcel record from an AV result ────────────────────────────────────────
function parcelFromResult(r, fetchedAt) {
  const a = props(r);
  const egrid = a.egris_egrid;
  if (!egrid || !r.geometry) return null;
  const geometry = r.geometry.type === 'Polygon'
    ? { type: 'MultiPolygon', coordinates: [r.geometry.coordinates] } : r.geometry;
  const label = poleOfInaccessibility(geometry);      // label anchor, computed once
  return {
    type: 'Feature',
    id: Number(String(egrid).replace(/\D/g, '')),
    geometry,
    properties: {
      fid: Number(String(egrid).replace(/\D/g, '')),
      egrid,
      erp_id: null, erp_company_code: null, erp_business_entity: null, erp_object: null,
      erp_name: null, erp_ownership_type: null, erp_historic_garden: null, erp_alternatives: null,
      erp_match_method: null,
      parcel_number: a.number != null ? String(a.number) : null,
      numbering_area: a.identnd || null,
      municipality_bfs: a.bfsnr != null ? Number(a.bfsnr) : null,
      municipality_name: null,
      canton: a.ak || null,
      geoportal_url: a.geoportal_url || null,
      owner: null, responsible_actor_fid: null,
      area_m2: Math.round(polygonAreaM2(geometry) * 10) / 10,
      perimeter_m: Math.round(polygonPerimeterM(geometry) * 100) / 100,
      geometry_source: 'av',
      fetched_at: fetchedAt,
      label_lon: label ? +label[0].toFixed(7) : null,   // pole of inaccessibility (presentation)
      label_lat: label ? +label[1].toFixed(7) : null,
    },
  };
}

// ── ERP export (optional) ──────────────────────────────────────────────────
// Two formats are accepted, detected from the content:
//   • the SAP RE-FX "Dynamische Listenausgabe" print of the land objects: a
//     pipe-separated table with the columns BuKr | WE | Grundstk |
//     Bez. Grundstück | L/R | Rg | … | E-GRID | … | Eigent.art | … |
//     Hist.Gart. | … (page headers repeat and are skipped);
//   • a delimited file with a header row: egrid, company_code,
//     business_entity, object and optionally name, country, canton,
//     ownership_type, historic_garden (';' or ',' separated).
// Only these fields are read; the person columns of the print (Verantw.,
// Ersteller) are never carried into the output.
//
// A row is usable when it carries a valid EGRID (CH + 12 digits) — which also
// restricts the worldwide portfolio to Switzerland, since no EGRID exists
// abroad — and does not describe a parking space (PP, Parkplatz,
// Einstellhalle, …), which data managers have entered as land objects at
// times.  Several rows can share one EGRID (rights of use beside the owned
// parcel, partial areas, duplicates); the owned object (Eigent.art 1) is
// preferred and the other keys are kept in erp_alternatives, so erp_id stays
// one value per parcel.
const PARKING_RE = /(^|[\s,/(])PP([\s,\-/)]|$)|parkpl|parkfeld|parkier|einstellh|abstellpl|garage|stellpl|parking|parcheggi|posteggi/i;
const EGRID_RE = /^CH\d{12}$/;

function parseErpAlv(text) {
  let header = null;
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map(s => s.trim());
    if (cells[0] === 'BuKr') { header = cells; continue; }
    if (!header || cells.length !== header.length) continue;
    const r = {};
    header.forEach((h, i) => { r[h] = cells[i]; });
    rows.push({
      egrid: (r['E-GRID'] || '').replace(/\s+/g, '').toUpperCase(),
      company_code: r.BuKr || null, business_entity: r.WE || null, object: r.Grundstk || null,
      name: r['Bez. Grundstück'] || null, country: r['L/R'] || null, canton: r.Rg || null,
      locality: r.Ort || null, street: r['Straße'] || null, postal_code: r.PLZ || null,
      ownership_type: r['Eigent.art'] || null, historic_garden: r['Hist.Gart.'] || null,
    });
  }
  return rows;
}

// Text normalisation for the designation / address match: lower case, no
// diacritics, "strasse" variants folded, punctuation to spaces.
const normText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/strasse|str\.|str\b/g, 'str').replace(/[^a-z0-9]+/g, ' ').trim();

// Parcel numbers named in an ERP designation, anchored on cadastral keywords
// ("Gbbl.-Nr. 1130", "Parz.-Nr. 322", "Parc. no 955", "Kat.-Nr. AA8045",
// "Gbbl.-Nr. 490, 533, 534"); areas, Kreis / Plan numbers and building-right
// references are ignored.  "04/2132" (Kreis/number) yields 2132.
const PARCEL_KW = /(gbbl\.?\s*-?\s*nr\.?|gbbl\.?|parz\.?\s*-?\s*nr\.?|parz\.|parc\.?\s*no\.?|parc\.?\s*n[°.]?|kat\.?\s*-?\s*nr\.?|gb\s*-?\s*nr\.?|grundst(?:ück|ueck)?\.?\s*-?\s*nr\.?|liegenschaft\s*nr\.?|\bnr\.?)\s*/gi;
function parcelTokens(name) {
  if (!name) return [];
  const s = String(name).replace(/\d[\d’‘'`]*\s*m2/gi, ' ').replace(/kreis\s*[ivx\d]+/gi, ' ')
    .replace(/plan\s*(nr\.?)?\s*[\d.]+/gi, ' ').replace(/\bBR\b[^,]*/g, ' ');
  const out = new Set();
  let m;
  PARCEL_KW.lastIndex = 0;
  while ((m = PARCEL_KW.exec(s)) !== null) {
    const tail = s.slice(m.index + m[0].length, m.index + m[0].length + 60);
    const run = tail.match(/^([A-Z]{0,2}\s?\d[\dA-Z]*(?:\s*(?:,|\+|und|&|\/)\s*[A-Z]{0,2}\s?\d[\dA-Z]*)*)/);
    if (!run) continue;
    for (const tok of run[1].split(/\s*(?:,|\+|und|&)\s*/)) {
      const t = tok.trim();
      if (!t) continue;
      if (/^\d{1,2}\/\d+/.test(t)) { out.add(t.split('/')[1]); continue; }
      for (const part of t.split('/')) { const p = part.replace(/\s+/g, ''); if (/^[A-Z]{0,2}\d{1,6}$/.test(p)) out.add(p); }
    }
  }
  return [...out];
}

function parseErpDelimited(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = lines[0].split(sep).map(h => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  if (col('egrid') < 0) throw new Error('ERP export: no "egrid" column');
  const get = (c, name) => { const i = col(name); return i >= 0 ? (c[i] || null) : null; };
  return lines.slice(1).map(l => {
    const c = l.split(sep).map(s => s.trim());
    return {
      egrid: (get(c, 'egrid') || '').replace(/\s+/g, '').toUpperCase(),
      company_code: get(c, 'company_code'), business_entity: get(c, 'business_entity'), object: get(c, 'object'),
      name: get(c, 'name'), country: get(c, 'country'), canton: get(c, 'canton'),
      locality: get(c, 'locality'), street: get(c, 'street'), postal_code: get(c, 'postal_code'),
      ownership_type: get(c, 'ownership_type') || get(c, 'object_type'), historic_garden: get(c, 'historic_garden'),
    };
  });
}

const erpIdOf = (r) => [r.company_code, r.business_entity, r.object].every(Boolean)
  ? `${r.company_code}/${r.business_entity}/${r.object}` : null;

// Returns { byEgrid: Map<egrid, { primary, alternatives }>, stats } or null.
function readErpExport(file) {
  if (!file) return null;
  if (!fs.existsSync(file)) throw new Error('ERP export not found: ' + file);
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const alv = /^\s*\|\s*BuKr\s*\|/m.test(text);
  const rows = alv ? parseErpAlv(text) : parseErpDelimited(text);
  const stats = { format: alv ? 'sap-alv-list' : 'delimited', rows: rows.length, rows_with_egrid: 0,
                  rows_ch_without_egrid: 0, rows_parking_excluded: 0, parcels: 0, parcels_with_several_objects: 0 };
  const grouped = new Map();
  const noEgrid = [];                 // Swiss rows with the 0000000000 placeholder (designation match only)
  for (const r of rows) {
    if (!EGRID_RE.test(r.egrid)) {
      if (r.country === 'CH' && !PARKING_RE.test(r.name || '')) { noEgrid.push(r); stats.rows_ch_without_egrid++; }
      continue;
    }
    stats.rows_with_egrid++;
    if (PARKING_RE.test(r.name || '')) { stats.rows_parking_excluded++; continue; }
    if (!grouped.has(r.egrid)) grouped.set(r.egrid, []);
    grouped.get(r.egrid).push(r);
  }
  // Owned object first, then the lowest business entity / object number.
  const rank = (r) => [r.ownership_type === '1' ? 0 : 1, Number(r.business_entity) || 0, Number(r.object) || 0];
  const byEgrid = new Map();
  for (const [egrid, list] of grouped) {
    list.sort((a, b) => { const ra = rank(a), rb = rank(b); for (let i = 0; i < 3; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]; return 0; });
    if (list.length > 1) stats.parcels_with_several_objects++;
    byEgrid.set(egrid, { primary: list[0], alternatives: list.slice(1).map(erpIdOf).filter(Boolean) });
  }
  stats.parcels = byEgrid.size;
  return { byEgrid, noEgrid, stats };
}

function applyErp(parcel, entry, method = 'egrid') {
  const r = entry.primary, p = parcel.properties;
  p.erp_match_method = method;
  p.erp_id = erpIdOf(r);
  p.erp_company_code = r.company_code;
  p.erp_business_entity = r.business_entity;
  p.erp_object = r.object;
  p.erp_name = r.name;
  p.erp_ownership_type = r.ownership_type;
  p.erp_historic_garden = r.historic_garden;
  p.erp_alternatives = entry.alternatives.length ? entry.alternatives : null;
}

// ── Main ───────────────────────────────────────────────────────────────────
const fetchedAt = new Date().toISOString().slice(0, 10);
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const F = data.features;
const sites = F.filter(f => f.properties.entity_type === 'site');
const elements = F.filter(f => ['area', 'tree_canopy', 'tree', 'point'].includes(f.properties.entity_type));
console.log(`sites ${sites.length}, elements ${elements.length}`);

// Previously fetched parcels (reused unless --refresh).
const previous = new Map();
if (!REFRESH && fs.existsSync(OUT)) {
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    for (const f of prev.features || []) {
      if (f.properties && f.properties.geometry_source === 'av' && f.properties.egrid) previous.set(f.properties.egrid, f);
    }
    if (previous.size) console.log(`reusing ${previous.size} parcels from the existing file (use --refresh to re-fetch)`);
  } catch { /* ignore a broken file */ }
}

// 1. Candidate parcels per Standort (envelope identify).
const elementsBySite = new Map();
for (const e of elements) {
  const k = e.properties.site_oid;
  if (!elementsBySite.has(k)) elementsBySite.set(k, []);
  elementsBySite.get(k).push(e);
}
const candidates = new Map();        // egrid -> Feature
const siteHits = new Map();          // site objectid -> number of candidate parcels
let requests = 0;
await mapLimit(sites, CONCURRENCY, async (s) => {
  const oid = s.properties.objectid;
  const bb = bboxOfGeometry(s.geometry);
  for (const e of elementsBySite.get(oid) || []) extendBbox(bb, e.geometry.coordinates);
  const results = await identifyEnvelope(bufferBbox(bb, BUFFER_DEG));
  requests++;
  siteHits.set(oid, results.length);
  for (const r of results) {
    const p = parcelFromResult(r, fetchedAt);
    if (p && !candidates.has(p.properties.egrid)) candidates.set(p.properties.egrid, p);
  }
  process.stdout.write(`  ${String(s.properties.objektnummer || oid).padEnd(14)} ${String(s.properties.name).slice(0, 40).padEnd(42)} ${String(results.length).padStart(3)} parcels\n`);
});
// Unassigned elements (no Standort): one envelope over each small cluster is
// overkill — identify at the element itself.
const loose = elementsBySite.get(null) || elementsBySite.get(undefined) || [];
if (loose.length) {
  const bb = emptyBbox();
  for (const e of loose) extendBbox(bb, e.geometry.coordinates);
  // Several loose clusters can be far apart; query each element's own box.
  await mapLimit(loose, CONCURRENCY, async (e) => {
    const ebb = bufferBbox(bboxOfGeometry(e.geometry), BUFFER_DEG);
    const results = await identifyEnvelope(ebb);
    requests++;
    for (const r of results) {
      const p = parcelFromResult(r, fetchedAt);
      if (p && !candidates.has(p.properties.egrid)) candidates.set(p.properties.egrid, p);
    }
  });
}
console.log(`candidates: ${candidates.size} distinct parcels from ${requests} requests`);

// 2. Locate elements; keep parcels that host at least one.
const index = new PolygonIndex([...candidates.values()]);
const hosted = new Map();            // egrid -> element count
const hostSites = new Map();         // egrid -> Set(site objectid) of the elements' assigned Standorte
let located = 0, unlocated = 0;
for (const e of elements) {
  const pt = interiorPoint(e.geometry);
  const hit = pt ? index.find(pt) : null;
  if (hit) {
    located++;
    const eg = hit.properties.egrid;
    hosted.set(eg, (hosted.get(eg) || 0) + 1);
    if (e.properties.site_oid != null) { if (!hostSites.has(eg)) hostSites.set(eg, new Set()); hostSites.get(eg).add(e.properties.site_oid); }
  }
  else unlocated++;
}
const siteByOid = new Map(sites.map(s => [s.properties.objectid, s.properties]));
const kept = new Map();
for (const [egrid, n] of hosted) kept.set(egrid, candidates.get(egrid));
console.log(`located elements ${located}, unlocated ${unlocated}; parcels hosting elements: ${kept.size}`);

// 3. ERP export: fill the ERP keys of the parcels the inventory touches
//    (owned or not — a right of use is the ERP's record of that ground too),
//    and add OWNED federal parcels at the inventoried sites (envelope
//    candidates) that host no element yet.  The rest of the nationwide
//    portfolio is out of scope for this app unless --erp-all is given.
const erp = readErpExport(ERP_PATH);
let erpMatched = 0, erpAdded = 0, erpByDesignation = 0, erpMissing = [];
if (erp) {
  const s = erp.stats;
  console.log(`ERP export (${s.format}): ${s.rows} rows, ${s.rows_with_egrid} with an EGRID, ` +
    `${s.rows_parking_excluded} parking rows excluded, ${s.parcels} parcels (${s.parcels_with_several_objects} with several objects)`);
  const toFetch = [];
  for (const [egrid, entry] of erp.byEgrid) {
    if (kept.has(egrid)) { applyErp(kept.get(egrid), entry); erpMatched++; continue; }
    if (entry.primary.ownership_type !== '1') continue;     // rights on third-party ground: no row of their own
    if (candidates.has(egrid)) { const p = candidates.get(egrid); applyErp(p, entry); kept.set(egrid, p); erpAdded++; }
    else if (!REFRESH && previous.has(egrid)) { const p = previous.get(egrid); applyErp(p, entry); kept.set(egrid, p); erpAdded++; }
    else if (ERP_ALL) toFetch.push([egrid, entry]);
  }
  await mapLimit(toFetch, CONCURRENCY, async ([egrid, entry]) => {
    const r = await findByEgrid(egrid);
    requests++;
    const p = r ? parcelFromResult(r, fetchedAt) : null;
    if (p) { applyErp(p, entry); kept.set(egrid, p); erpAdded++; }
    else erpMissing.push(egrid);
  });
  console.log(`ERP: keys on ${erpMatched} inventory parcels by EGRID; ${erpAdded} owned parcels added at the sites` +
    (ERP_ALL ? `, ${erpMissing.length} without geometry` : ''));
}

// Reuse previously fetched geometry when nothing changed (keeps fetched_at).
if (!REFRESH) {
  for (const [egrid, p] of kept) {
    const old = previous.get(egrid);
    if (old && JSON.stringify(old.geometry) === JSON.stringify(p.geometry)) {
      p.properties.fetched_at = old.properties.fetched_at || p.properties.fetched_at;
      // municipality_name is NOT reused: it is cheap (one lookup per BFS
      // number) and an earlier run stored historical names.
    }
  }
}

// 4. Municipality names, one lookup per BFS number.
const byBfs = new Map();
for (const p of kept.values()) {
  const bfs = p.properties.municipality_bfs;
  if (bfs != null && !p.properties.municipality_name && !byBfs.has(bfs)) byBfs.set(bfs, interiorPoint(p.geometry));
}
const names = new Map();
await mapLimit([...byBfs.entries()], CONCURRENCY, async ([bfs, pt]) => {
  names.set(bfs, pt ? await municipalityNameAt(pt, bfs) : null);
  requests++;
});
for (const p of kept.values()) {
  if (!p.properties.municipality_name && names.has(p.properties.municipality_bfs)) {
    p.properties.municipality_name = names.get(p.properties.municipality_bfs);
  }
}

// 5. ERP rows without an EGRID (the 0000000000 placeholder) can still be tied
//    to a parcel we hold when their designation names the same parcel number
//    in the same municipality AND their street matches a Standort address on
//    that parcel — e.g. "LÖVM, Bern, Gbbl.-Nr. 2595, Kreis 3", Effingerstrasse
//    ↔ Bern 2595 at Effingerstrasse 43.  Needs the municipality names from
//    step 4; applied only when exactly one row qualifies, and the method is
//    recorded on the parcel.
if (erp) {
  for (const p of kept.values()) {
    const pp = p.properties;
    if (pp.erp_id) continue;
    const addrs = [...(hostSites.get(pp.egrid) || [])].map(oid => siteByOid.get(oid)).filter(Boolean)
      .map(s => normText((s.adresse || '') + ' ' + (s.name || '')));
    const muni = normText(pp.municipality_name);
    if (!muni || !addrs.length) continue;
    const cands = erp.noEgrid.filter(r => r.canton === pp.canton
      && parcelTokens(r.name).includes(String(pp.parcel_number))
      && (normText(r.locality) === muni || normText(r.name).startsWith(muni))
      && r.street && normText(r.street).split(' ')[0].length > 4
      && addrs.some(a => a.includes(normText(r.street).split(' ')[0])));
    if (cands.length === 1) { applyErp(p, { primary: cands[0], alternatives: [] }, 'designation+address'); erpByDesignation++; }
  }
  console.log(`ERP: ${erpByDesignation} further key(s) by designation + address on parcels without EGRID in the export`);
}

// 5. Write.
const features = [...kept.values()].sort((a, b) => a.properties.egrid < b.properties.egrid ? -1 : 1);
const uncovered = sites.filter(s => (siteHits.get(s.properties.objectid) || 0) === 0)
  .map(s => ({ fid: s.properties.objectid, legacy_id: s.properties.objektnummer, name: s.properties.name }));
const byCanton = {};
for (const f of features) byCanton[f.properties.canton || '?'] = (byCanton[f.properties.canton || '?'] || 0) + 1;
const out = {
  type: 'FeatureCollection',
  metadata: {
    entity: 'Land Parcel (docs/DATAMODEL.md §3.2)',
    source: 'Amtliche Vermessung (AV) — OpenData-AV service, api3.geo.admin.ch, layer ' + AV_LAYER,
    attribution: 'AV — cadastre.ch',
    attribution_url: 'https://www.cadastre.ch/de',
    method: 'envelope identify per Standort (Pflegeperimeter + elements, buffered), parcels kept when at least one maintenance element is located on them' + (erp ? '; ERP export joined by EGRID' : ''),
    crs: 'EPSG:4326 (WGS84, RFC 7946)',
    measures: 'area_m2 and perimeter_m computed in LV95 (EPSG:2056) from the delivered geometry',
    fetched_at: fetchedAt,
    erp_export: erp ? { file: path.basename(ERP_PATH), ...erp.stats,
                        keys_on_inventory_parcels: erpMatched, keys_by_designation_and_address: erpByDesignation,
                        owned_parcels_added: erpAdded,
                        inventory_parcels_without_erp_object: features.filter(f => !f.properties.erp_id).length } : null,
    counts: { parcels: features.length, by_canton: byCanton, elements_located: located, elements_unlocated: unlocated },
    uncovered_sites: uncovered,
    erp_without_geometry: erpMissing,
  },
  features,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${path.relative(ROOT, OUT)}: ${features.length} parcels`, byCanton);
if (uncovered.length) console.log('no AV coverage for:', uncovered.map(u => `${u.legacy_id} ${u.name}`).join(' | '));

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG — legend groups, palette, expressions, table columns
//
// The GeoJSON loaded by this app comes from scripts/gdb_to_geojson.py and
// contains six entity_types:
//   site            - 73 boundary polygons (Standortfläche)
//   site_location   - 73 centroid dots (one per Standort, useful zoomed out)
//   area            - polygon vegetation/surface (coloured by fk_profil hash)
//   tree_canopy     - circle polygons (tree crowns)
//   tree            - point trees with baumart
//   point           - other points (Kleinstrukturen, lamps, etc.)
// ═══════════════════════════════════════════════════════════════════════════

// ── Number formatting (Swiss style: 1'000.0) ─────────────────────────────
function fmtNum(v, decimals) {
  if (v == null || v === '') return '–';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  const fixed = decimals != null ? n.toFixed(decimals) : String(n);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  return dec != null ? grouped + '.' + dec : grouped;
}

// ── Profile styling ──────────────────────────────────────────────────────
// Explicit colour + swatch-pattern for every GSZ profile.  Sourced from the
// original Grünflächenpflege PDF legend (1602.GR_Mühlestrasse 2-6) so the
// app matches what surveyors are used to.  Codes: idPPy = polygon profiles,
// idPP = point profiles.  swatchClass refers to a CSS pattern class
// (sw-dots, sw-pstripe, sw-xhatch, ...) defined in styles.css.
const AREA_PROFILE_STYLE = {
  // ── Rasen ──
  1:  { fill: '#97e600' },                                // Geb.Rasen kf.
  2:  { fill: '#97e600', swatchClass: 'sw-pstripe' },     // Geb.Rasen gf.  (extrapolated)
  3:  { fill: '#97e600' },                                // Strap./Sportr. kf. (extrapolated)
  4:  { fill: '#97e600', swatchClass: 'sw-pstripe' },     // Strap./Sportr. gf. (extrapolated)
  5:  { fill: '#97e600', swatchClass: 'sw-dots' },        // Blumenrasen
  // ── Wiesen ──
  6:  { fill: '#c6eeab' },                                // Blumenwiese kf.
  7:  { fill: '#c6eeab', swatchClass: 'sw-pstripe' },     // Blumenwiese gf.
  8:  { fill: '#a8e3d9' },                                // Feuchtwiese
  43: { fill: '#f5f579', swatchClass: 'sw-odots' },       // Saumvegetation
  44: { fill: '#f5f579', swatchClass: 'sw-vdots' },       // Magerrasen
  // ── Rabatten ──
  9:  { fill: '#ff73df', swatchClass: 'sw-dots' },        // Wechselflor
  10: { fill: '#ff73df' },                                // Grab (extrapolated)
  11: { fill: '#ff5500' },                                // Beetrosen
  12: { fill: '#5c45a8' },                                // Moorbeet
  13: { fill: '#df73ff' },                                // Stauden ext.
  14: { fill: '#df73ff', swatchClass: 'sw-pstripe' },     // Stauden int.
  15: { fill: '#ffaa00', swatchClass: 'sw-ostripe' },     // Ruderalfl.
  // ── Hecken ──
  16: { fill: '#a86f00' },                                // Formhecke - 1.5 m
  17: { fill: '#a86f00', swatchClass: 'sw-hstripe' },     // Formhecke + 1.5 m
  18: { fill: '#d9d89e' },                                // Wildhecke
  // ── Gehölzflächen ──
  19: { fill: '#718844', swatchClass: 'sw-gdots' },       // Gehölzrabatte
  20: { fill: '#896e44' },                                // Bodendecker
  21: { fill: '#896e44', swatchClass: 'sw-dots' },        // Gehölz & Bodend.
  22: { fill: '#267300', swatchClass: 'sw-dots' },        // Parkwald (extrapolated)
  23: { fill: '#267300' },                                // Wald
  // ── Spezielle Bepflanzungsformen ──
  24: { fill: '#ffbdbd' },                                // Dach: ext. Stauden
  38: { fill: '#ffbdbd', swatchClass: 'sw-dots' },        // Dach: intensiv begrünt (extrapolated)
  39: { fill: '#cccccc' },                                // Flachdach ohne Bewuchs
  40: { fill: '#bfbfbf' },                                // Steildach
  41: { fill: '#e8d4a0' },                                // Dachterrasse
  // ── Beläge ──
  25: { fill: '#686868' },                                // Asphaltbelag
  26: { fill: '#9c9c9c' },                                // Betonpl./Verbund/Naturstein
  27: { fill: '#cd8866' },                                // Chaussierung
  28: { fill: '#e8d4a0' },                                // Sand (extrapolated)
  29: { fill: '#6fa800', swatchClass: 'sw-xhatch' },      // Rasengittersteine
  30: { fill: '#a83800', swatchClass: 'sw-xhatch' },      // Holzhäckselbelag
  31: { fill: '#7a7a7a' },                                // Fallschutzpl./-beläge (extrapolated)
  32: { fill: '#5a5a5a' },                                // Kunststoff/Sportbelag (extrapolated)
  33: { fill: '#7fc858' },                                // Kunstrasen (extrapolated)
  37: { fill: '#4e4e4e', swatchClass: 'sw-gdots' },       // Geröllstreifen/Bollensteine
  42: { fill: '#9c9c9c' },                                // Naturstein-Pflästerung
  // ── Wasserflächen ──
  34: { fill: '#006fff' },                                // Gewässer ruhend
  35: { fill: '#00a9e6' },                                // Brunnen
  // ── Anderes ──
  36: { fill: '#ffff00' },                                // Anderes
};

const POINT_PROFILE_STYLE = {
  // ── Bäume (Laub) ──
  1: { fill: '#38b000', swatchClass: 'sw-circ' },         // Laubb. nat. grossk.
  2: { fill: '#60c800', swatchClass: 'sw-circ' },         // Laubb. nat. kleink.
  3: { fill: '#b0e000', swatchClass: 'sw-circ-cross' },   // Laubb. Kopf-/Form
  // ── Strassenbäume ──
  4: { fill: '#006680', swatchClass: 'sw-circ' },         // Strassenb. Laub nat. grossk.
  5: { fill: '#008aaa', swatchClass: 'sw-circ' },         // Strassenb. Laub nat. kleink.
  6: { fill: '#007a94', swatchClass: 'sw-circ-cross' },   // Strassenb. Laub Kopf/Form
  // ── Bäume (Nadel + Obst) ──
  7: { fill: '#1a7000', swatchClass: 'sw-circ' },         // Nadelb. nat.
  8: { fill: '#60c800', swatchClass: 'sw-circ-cross' },   // Hochstammobst
  // ── Spezielle Bepflanzungsformen (Punkt) ──
  9:  { fill: '#cc0000', swatchClass: 'sw-triangle' },    // Schling-& Kletterpf.
  10: { fill: '#1a1a8a', swatchClass: 'sw-circ' },        // Pflanzgefäss mobil Dauerbepflanzung
  11: { fill: '#cc00cc', swatchClass: 'sw-circ' },        // Pflanzgefäss Wechselflor
  // ── Möbel / Ausstattung ──
  12: { fill: '#666666', swatchClass: 'sw-circ' },        // Abfalleimer
  13: { fill: '#996633', swatchClass: 'sw-circ' },        // Sitzbank
  15: { fill: '#cc6600', swatchClass: 'sw-circ' },        // Spielgerät
  16: { fill: '#888888', swatchClass: 'sw-circ' },        // Ausstattung
  17: { fill: '#ffff00', swatchClass: 'sw-circ' },        // Anderes (Punkt)
  // ── Kleinstrukturen ──
  18: { fill: '#c09060', swatchClass: 'sw-circ' },        // Asthaufen
  19: { fill: '#604020', swatchClass: 'sw-circ' },        // Baumstamm
  20: { fill: '#808080', swatchClass: 'sw-circ' },        // Steinhaufen
  21: { fill: '#804000', swatchClass: 'sw-circ' },        // Wildbienenhotel
  22: { fill: '#a06030', swatchClass: 'sw-circ' },        // Nistkasten
  // ── Solitär ──
  23: { fill: '#5fa84a', swatchClass: 'sw-circ' },        // Solitärstrauch
};

// HSL-hash cache for profile codes outside the curated catalog above.
const _profileColorCache = {};

// Look up the style for a profile code.  Returns {fill, swatchClass} object.
// entity_type discriminates between the polygon (idPPy) and point (idPP)
// catalogs since both start at 1.
function profilStyle(entity_type, code) {
  if (code == null) return { fill: '#bbbbbb' };
  const map = entity_type === 'area' ? AREA_PROFILE_STYLE : POINT_PROFILE_STYLE;
  if (map[code]) return map[code];
  // Fallback: HSL hash for codes outside the curated catalog.
  if (!_profileColorCache[code]) {
    const hue = (code * 137) % 360;
    const sat = 55 + (code % 3) * 6;
    const lum = 60 + (code % 2) * 6;
    _profileColorCache[code] = `hsl(${hue}, ${sat}%, ${lum}%)`;
  }
  return { fill: _profileColorCache[code] };
}

// Backwards-compat shim - existing call sites pass just a code.  Defaults
// to the area catalog because that's where most legacy lookups land.
function profilColor(p) {
  return profilStyle('area', p).fill;
}

// ── Entity-type palette ──────────────────────────────────────────────────
const ENTITY_COLORS = {
  site:          { fill: '#7d8a9c', stroke: '#3d4757' },
  site_location: { fill: '#cc1f1f', stroke: '#7a0d0d' },
  area:          { fill: '#bdbdbd', stroke: 'rgba(0,0,0,0.32)' }, // overridden by profile hash
  tree_canopy:   { fill: '#5fa84a', stroke: '#2f6d20' },
  tree:          { fill: '#2d8000', stroke: '#0e3f00' },
  point:         { fill: '#e08a1c', stroke: '#7a4a06' },
};

// ── GSZ Profilkatalog grouping ──────────────────────────────────────────
// Maps every idPPy (polygon profile) and idPP (point profile) code to a
// human-meaningful category.  This mirrors the original PDF-legend
// structure surveyors / BBL staff are used to.  Codes come from the GDB
// field-domain catalog (see metadata.codelists in data.geojson).
//
// idPPy (polygon profiles, 44 entries):
//   1-5    Rasen           Geb.Rasen kf./gf., Strap./Sportr. kf./gf., Blumenrasen
//   6-8,43-44  Wiesen      Blumenwiese kf./gf., Feuchtwiese, Saumvegetation, Magerrasen
//   9-15   Rabatten        Wechselflor, Grab, Beetrosen, Moorbeet, Stauden ext./int., Ruderalfl.
//   16-18  Hecken          Formhecke +/-1.5m, Wildhecke
//   19-23  Gehölzflächen   Gehölzrabatte, Bodendecker, Gehölz & Bodend., Parkwald, Wald
//   24,38-41  Spezielle Bepflanzungsformen   Dach-Begrünung, Steildach, Dachterrasse
//   25-33,37,42  Beläge    Asphaltbelag, Betonpl./Verbund, Chaussierung, Sand, Rasengittersteine,
//                          Holzhäckselbelag, Fallschutz, Kunststoffbelag, Kunstrasen,
//                          Geröllstreifen, Naturstein-Pflästerung
//   34-35  Wasserflächen   Gewässer ruhend, Brunnen
//   36     Anderes         Anderes
//
// idPP (point profiles, 23 entries):
//   1-3    Bäume Laub      Laubb. nat. grossk./kleink., Laubb. Kopf-/Form
//   4-6    Strassenbäume   Strassenb. Laub nat. grossk./kleink., Strassenb. Kopf/Form
//   7      Bäume Nadel     Nadelb. nat.
//   8      Hochstammobst
//   9-11,23  Spezielle Bepflanzungsformen (Punkt)   Schling-/Kletterpf., Pflanzgefässe, Solitärstrauch
//   12-13,15-16  Möbel/Ausstattung   Abfalleimer, Sitzbank, Spielgerät, Ausstattung
//   17     Anderes (Punkt)
//   18-22  Kleinstrukturen Asthaufen, Baumstamm, Steinhaufen, Wildbienenhotel, Nistkasten
const LEGEND_GROUPS = [
  // ── Top of stack: Standort markers ──────────────────────────────────
  {
    id: 'site_location', label: 'Standort-Markierungen', entity_type: 'site_location',
    items: [
      { label: 'Standort (ein Punkt pro Parzelle)', fill: '#cc1f1f', swatchClass: 'sw-circ' },
    ]
  },

  // ── Baum (Laub + Strasse + Nadel + Obst all in one group, matching
  //    the PDF Grünflächenpflege legend) ─────────────────────────────
  // Items auto-populated by buildLegend from profileCodes + idPP labels;
  // colours and swatches come from POINT_PROFILE_STYLE so the legend's
  // Strassenbäume read teal while regular Laub-/Nadelbäume read green,
  // matching the printed plan.
  { id: 'tree', label: 'Baum', entity_type: 'tree',
    profileCodes: [1, 2, 3, 4, 5, 6, 7, 8] },

  // ── Tree canopies ──
  {
    id: 'tree_canopy', label: 'Baumkronen', entity_type: 'tree_canopy',
    items: [
      { label: 'Kronenfläche (Kreis)', fill: 'rgba(95,168,74,0.45)' },
    ]
  },

  // ── Spezielle Bepflanzungsformen (Punkt) — exactly as PDF ──
  { id: 'pt_special',  label: 'Spezielle Bepflanzungsformen (Punkt)',
    entity_type: 'point', profileCodes: [9, 10, 11] },

  // ── Kleinstrukturen — Asthaufen / Baumstamm / Steinhaufen / etc. ──
  { id: 'pt_kleinstr', label: 'Kleinstrukturen',
    entity_type: 'point', profileCodes: [18, 19, 20, 21, 22] },

  // ── Möbel / Ausstattung — extension for codes the PDF doesn't show
  //    (the source plan was a single garden, our dataset has more) ──
  { id: 'pt_moebel',   label: 'Möbel / Ausstattung',
    entity_type: 'point', profileCodes: [12, 13, 15, 16] },

  // ── Solitärsträucher + point-Anderes (rare codes, kept separate so the
  //    main groups remain clean) ────────────────────────────────────
  { id: 'pt_solitaer', label: 'Solitärsträucher',
    entity_type: 'point', profileCodes: [23] },
  { id: 'pt_anderes',  label: 'Anderes (Punkt)',
    entity_type: 'point', profileCodes: [17] },

  // ── AREAS — GSZ Profilkatalog grouping ────────────────────────────
  // (the user-visible feature these legend changes brought back)
  { id: 'rasen',         label: 'Rasen',                  entity_type: 'area', profileCodes: [1, 2, 3, 4, 5] },
  { id: 'wiesen',        label: 'Wiesen',                 entity_type: 'area', profileCodes: [6, 7, 8, 43, 44] },
  { id: 'rabatten',      label: 'Rabatten',               entity_type: 'area', profileCodes: [9, 10, 11, 12, 13, 14, 15] },
  { id: 'hecken',        label: 'Hecken',                 entity_type: 'area', profileCodes: [16, 17, 18] },
  { id: 'gehoelze',      label: 'Gehölzflächen',          entity_type: 'area', profileCodes: [19, 20, 21, 22, 23] },
  { id: 'special_planting', label: 'Spezielle Bepflanzungsformen', entity_type: 'area', profileCodes: [24, 38, 39, 40, 41] },
  { id: 'belag',         label: 'Beläge',                 entity_type: 'area', profileCodes: [25, 26, 27, 28, 29, 30, 31, 32, 33, 37, 42] },
  { id: 'wasser',        label: 'Wasserflächen',          entity_type: 'area', profileCodes: [34, 35] },
  { id: 'anderes',       label: 'Anderes',                entity_type: 'area', profileCodes: [36] },

  // ── Site boundaries (bottom of stack) ───────────────────────────────
  {
    id: 'site', label: 'Standorte (Parzellen)', entity_type: 'site',
    items: [
      { label: 'Standortgrenze', fill: 'rgba(125,138,156,0.22)' },
    ]
  },
];

// ── Map paint expressions ────────────────────────────────────────────────
// Areas: pick fill colour by hashing fk_profil at runtime.  Built once after
// data loads (see installAreaFillExpr below).
let AREA_FILL_EXPR = ['literal', '#bdbdbd'];

function installAreaFillExpr(profileCodes) {
  const stops = [];
  for (const p of profileCodes) {
    stops.push(p, profilColor(p));
  }
  AREA_FILL_EXPR = ['match', ['get', 'fk_profil'], ...stops, '#bdbdbd'];
}

// ── GeoJSON source path ──────────────────────────────────────────────────
const GEOJSON_PATH = 'data/data.geojson';

// ── Basemap definitions ──────────────────────────────────────────────────
const BASEMAPS = [
  { id: 'positron',    label: 'Hell',   bg: '#f2f0ec',
    thumb: 'https://a.basemaps.cartocdn.com/light_all/7/66/45.png',
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
  { id: 'dark-matter', label: 'Dunkel', bg: '#1c1c24',
    thumb: 'https://a.basemaps.cartocdn.com/dark_all/7/66/45.png',
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
  { id: 'voyager',     label: 'Reise',  bg: '#e8dfd0',
    thumb: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/7/66/45.png',
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
  { id: 'swisstopo',   label: 'Luftbild', bg: '#2a3a2a',
    thumb: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/8/133/91.jpeg',
    url: 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json' },
];

// ── Table column definitions ─────────────────────────────────────────────
// All raw GDB fields are reachable via this list; default-visible ones cover
// the most useful overview.  Toggle the rest in the column dropdown.
const TABLE_COLS = [
  // ── Identity ────────────────────────────────────────────────────────
  { key: '_idx',                  label: '#',                visible: true  },
  { key: 'entity_type',           label: 'Typ',              visible: true  },
  { key: 'feature_type',          label: 'Feature',          visible: false },
  { key: 'subtype',               label: 'Subtyp',           visible: true  },

  // ── Site (mirrored onto site features by the conversion script, so a
  //         single column works for every entity_type) ──────────────────
  { key: 'site_name',             label: 'Standort',         visible: true  },
  { key: 'site_objektnummer',     label: 'Objekt-Nr.',       visible: false },
  { key: 'site_adresse',          label: 'Adresse',          visible: false },
  { key: 'site_lose',             label: 'Los',              visible: false },
  { key: 'parzelle',              label: 'Parzelle',         visible: false },
  { key: 'erstellungsjahr',       label: 'Baujahr',          visible: false },
  { key: 'erfassungsdatum',       label: 'Erfasst',          visible: false },

  // ── Pflege / Klassifikation (decoded labels only — raw fk_* codes are
  //    still on every feature for power users / API access, just hidden
  //    from the column picker to keep it readable) ──────────────────────
  { key: 'profil_label',          label: 'Profil',           visible: true  },
  { key: 'pflegedurchfuehrung',   label: 'Pflege durch',     visible: false },
  { key: 'pflegeklasse',          label: 'Pflegeklasse',     visible: false },
  { key: 'eigentuemer',           label: 'Eigentümer',       visible: false },
  { key: 'pflegeverantwortung',   label: 'Pflegeverantw.',   visible: false },
  { key: 'winterdienst',          label: 'Winterdienst',     visible: false },
  { key: 'bewaesserung_label',    label: 'Bewässerung',      visible: false },
  { key: 'kontrolle',             label: 'Kontrolle',        visible: false },
  { key: 'reinigung',             label: 'Reinigung',        visible: false },
  { key: 'aufwandsfaktor',        label: 'Aufwandsfaktor',   visible: false,
    fmt: v => v == null ? '–' : Number(v).toFixed(2) },

  // ── Tree-specific ──────────────────────────────────────────────────
  { key: 'baumart',               label: 'Baumart',          visible: true  },
  { key: 'baumnummer',            label: 'Baum-Nr.',         visible: false },
  { key: 'lauben',                label: 'Lauben',           visible: false },
  { key: 'max_hoehe_m',           label: 'Max. Höhe m',      visible: false },
  { key: 'ausmass',               label: 'Ausmass',          visible: false },
  { key: 'crown_diameter_m',      label: 'Krone Ø m',        visible: false },
  { key: 'crown_radius_m',        label: 'Krone Radius m',   visible: false },

  // ── Geometry ───────────────────────────────────────────────────────
  { key: 'area_m2',               label: 'Fläche m²',        visible: true,
    fmt: v => fmtNum(v, 1) },
  { key: 'shape_area_m2',         label: 'Standort m²',      visible: false,
    fmt: v => fmtNum(v, 1) },
  { key: 'shape_length_m',        label: 'Standort Umfang m',visible: false,
    fmt: v => fmtNum(v, 1) },
  { key: 'lv95_east',             label: 'LV95 Ost',         visible: false,
    fmt: v => fmtNum(v, 0) },
  { key: 'lv95_north',            label: 'LV95 Nord',        visible: false,
    fmt: v => fmtNum(v, 0) },
  { key: 'lv95_east_centroid',    label: 'LV95 Ost (Z.)',    visible: false,
    fmt: v => fmtNum(v, 0) },
  { key: 'lv95_north_centroid',   label: 'LV95 Nord (Z.)',   visible: false,
    fmt: v => fmtNum(v, 0) },

  // ── Free-form / metadata ──────────────────────────────────────────
  { key: 'bemerkung',             label: 'Bemerkung',        visible: false },
  { key: 'titel_objektblatt',     label: 'Objektblatt',      visible: false },
  { key: 'titel_kalkulation',     label: 'Kalkulation',      visible: false },
  { key: 'source',                label: 'Quelle',           visible: false },
];

// Filter dropdown columns - which columns get a checkbox-list filter.
// Filter on the decoded profile name (44 polygon profiles + 23 point
// profiles ≈ 60 distinct strings) instead of the raw integer.
const FILTER_COLS_DEFAULT = ['entity_type', 'site_lose', 'pflegeklasse',
                             'eigentuemer', 'profil_label', 'pflegedurchfuehrung',
                             'baumart', 'site_name'];

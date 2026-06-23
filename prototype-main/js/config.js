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
// Explicit colour + swatch-pattern for every BBL care profile.  Sourced from
// the original Grünflächenpflege PDF legend (1602.GR_Mühlestrasse 2-6) so the
// app matches what surveyors are used to.  Codes: idPPy = polygon profiles,
// idPP = point profiles.  swatchClass refers to a CSS pattern class
// (sw-dots, sw-pstripe, sw-xhatch, ...) defined in styles.css.
const AREA_PROFILE_STYLE = {
  // ── Rasen ──
  1:  { fill: '#97e600' },                                // Gebrauchsrasen kleinflächig
  2:  { fill: '#97e600', swatchClass: 'sw-pstripe' },     // Gebrauchsrasen grossflächig (extrapolated)
  3:  { fill: '#97e600' },                                // Strapazierrasen / Sportrasen kleinflächig (extrapolated)
  4:  { fill: '#97e600', swatchClass: 'sw-pstripe' },     // Strapazierrasen / Sportrasen grossflächig (extrapolated)
  5:  { fill: '#97e600', swatchClass: 'sw-dots' },        // Blumenrasen
  // ── Wiesen ──
  6:  { fill: '#c6eeab' },                                // Blumenwiese kleinflächig
  7:  { fill: '#c6eeab', swatchClass: 'sw-pstripe' },     // Blumenwiese grossflächig
  8:  { fill: '#a8e3d9' },                                // Feuchtwiese
  43: { fill: '#f5f579', swatchClass: 'sw-odots' },       // Saumvegetation / Säume von Hecken
  44: { fill: '#f5f579', swatchClass: 'sw-vdots' },       // Magerrasen
  // ── Rabatten ──
  9:  { fill: '#ff73df', swatchClass: 'sw-dots' },        // Wechselflor
  10: { fill: '#ff73df' },                                // Grab (extrapolated)
  11: { fill: '#ff5500' },                                // Beetrosen
  12: { fill: '#5c45a8' },                                // Moorbeet
  13: { fill: '#df73ff' },                                // Staudenmischpflanzung, extensiv
  14: { fill: '#df73ff', swatchClass: 'sw-pstripe' },     // Staudenmischpflanzung, intensiv
  15: { fill: '#ffaa00', swatchClass: 'sw-ostripe' },     // Ruderalfläche
  // ── Hecken ──
  16: { fill: '#a86f00' },                                // Formhecke, Höhe unter 1.5 m
  17: { fill: '#a86f00', swatchClass: 'sw-hstripe' },     // Formhecke, Höhe über 1.5 m
  18: { fill: '#d9d89e' },                                // Wildhecke
  // ── Gehölzflächen ──
  19: { fill: '#718844', swatchClass: 'sw-gdots' },       // Gehölzrabatte
  20: { fill: '#896e44' },                                // Bodendecker
  21: { fill: '#896e44', swatchClass: 'sw-dots' },        // Gehölzrabatte mit Bodendecker
  22: { fill: '#267300', swatchClass: 'sw-dots' },        // Parkwald (extrapolated)
  23: { fill: '#267300' },                                // Wald
  // ── Spezielle Bepflanzungsformen ──
  24: { fill: '#ffbdbd' },                                // Dachbegrünung, extensive Staudenmischsaat
  38: { fill: '#ffbdbd', swatchClass: 'sw-dots' },        // Dach, intensiv begrünt (extrapolated)
  39: { fill: '#cccccc' },                                // Flachdach ohne Bewuchs
  40: { fill: '#bfbfbf' },                                // Steildach
  41: { fill: '#e8d4a0' },                                // Dachterrasse
  // ── Beläge ──
  25: { fill: '#686868' },                                // Asphaltbelag
  26: { fill: '#9c9c9c' },                                // Betonplatten, Verbund-, Natursteine
  27: { fill: '#cd8866' },                                // Chaussierung
  28: { fill: '#e8d4a0' },                                // Sand (extrapolated)
  29: { fill: '#6fa800', swatchClass: 'sw-xhatch' },      // Rasengittersteine
  30: { fill: '#a83800', swatchClass: 'sw-xhatch' },      // Holzhäckselbelag
  31: { fill: '#7a7a7a' },                                // Fallschutzplatten / -beläge (extrapolated)
  32: { fill: '#5a5a5a' },                                // Kunststoff- / Sportbelag (extrapolated)
  33: { fill: '#7fc858' },                                // Kunstrasen (extrapolated)
  37: { fill: '#4e4e4e', swatchClass: 'sw-gdots' },       // Geröllstreifen und Bollensteine
  42: { fill: '#9c9c9c' },                                // Naturstein-Pflästerung
  // ── Wasserflächen ──
  34: { fill: '#006fff' },                                // Gewässer, ruhend, naturnah
  35: { fill: '#00a9e6' },                                // Brunnen
  // ── Anderes ──
  36: { fill: '#ffff00' },                                // Anderes
};

const POINT_PROFILE_STYLE = {
  // ── Bäume (Laub) ──
  1: { fill: '#38b000', swatchClass: 'sw-circ' },         // Laubbaum, natürlicher Wuchs, grosskronig
  2: { fill: '#60c800', swatchClass: 'sw-circ' },         // Laubbaum, natürlicher Wuchs, kleinkronig
  3: { fill: '#b0e000', swatchClass: 'sw-circ-cross' },   // Laubbaum, Kopf- / Formschnitt
  // ── Strassenbäume ──
  4: { fill: '#006680', swatchClass: 'sw-circ' },         // Strassenbaum, Laub, natürlicher Wuchs, grosskronig
  5: { fill: '#008aaa', swatchClass: 'sw-circ' },         // Strassenbaum, Laub, natürlicher Wuchs, kleinkronig
  6: { fill: '#007a94', swatchClass: 'sw-circ-cross' },   // Strassenbaum, Laub, Kopf- / Formschnitt
  // ── Bäume (Nadel + Obst) ──
  7: { fill: '#1a7000', swatchClass: 'sw-circ' },         // Nadelbaum, natürlicher Wuchs
  8: { fill: '#60c800', swatchClass: 'sw-circ-cross' },   // Hochstamm-Obstbaum
  // ── Spezielle Bepflanzungsformen (Punkt) ──
  9:  { fill: '#cc0000', swatchClass: 'sw-triangle' },    // Schling- und Kletterpflanze
  10: { fill: '#1a1a8a', swatchClass: 'sw-circ' },        // Mobiles Pflanzgefäss, Dauerbepflanzung
  11: { fill: '#cc00cc', swatchClass: 'sw-circ' },        // Mobiles Pflanzgefäss, Wechselflor
  // ── Möbel / Ausstattung ──
  12: { fill: '#666666', swatchClass: 'sw-circ' },        // Abfalleimer
  13: { fill: '#996633', swatchClass: 'sw-circ' },        // Sitzbank
  15: { fill: '#cc6600', swatchClass: 'sw-circ' },        // Spielgerät
  16: { fill: '#888888', swatchClass: 'sw-circ' },        // Ausstattung
  17: { fill: '#ffff00', swatchClass: 'sw-circ' },        // Anderes (Punkt)
  // ── Kleinstrukturen ──
  18: { fill: '#c09060', swatchClass: 'sw-circ' },        // Asthaufen
  19: { fill: '#604020', swatchClass: 'sw-circ' },        // Liegende Baumstämme
  20: { fill: '#808080', swatchClass: 'sw-circ' },        // Steinhaufen / Steinlinsen
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

// ── Pflegekalender catalog (BBL Standard Grünflächenunterhalt 2020) ───────
// Maintenance schedule per care profile, transcribed from the official BBL
// "Standard Grünflächenunterhalt" (EFD/BBL/Bundesgärtnerei, 2020).  The PDF
// gives, per profile, the Haupttätigkeiten (tasks) + Häufigkeit pro Jahr +
// timing wording embedded in prose.  It does NOT provide a month-by-month
// grid, a Material/Maschinen column, or a short Code — those are derived /
// estimated here (the BBL doc remains the authoritative source for the rest):
//   • h     = Häufigkeit pro Jahr (verbatim from the Standard)
//   • mon   = months a task runs (1=Jan … 12=Dez)
//   • monG  = subset of `mon` whose month is an *educated guess* (the Standard
//             states only a frequency, not the month) — rendered lighter.
//   • mat   = Material/Maschinen — NOT in the Standard; estimated from the
//             task type, flagged with ° in the report.
//   • code  = estimated short code; the report appends the site's Pflege-
//             klasse number (e.g. "BLW 2").  `quelle` = chapter in the PDF.
// Profiles with no chapter in the Standard get a generic fallback row (see
// careProfile + report.js).  Keyed by profile code: AREA = idPPy domain,
// POINT = idPP domain (the two share integers — never merge them).
const CARE_CATALOG_AREA = {
  1:  { code: 'GRK', quelle: '§2.1.1', tasks: [
    { m: 'Mähen', b: 'Schnitthöhe 4–5 cm (Schatten ≥ 6 cm)', h: '16×', mat: 'Rasenmäher', mon: [4,5,6,7,8,9,10], monG: [4,5,6,7,8,9,10] },
    { m: 'Rasen ausputzen', b: 'Annahme 25 cm / m²', h: '16×', mat: 'Rechen', mon: [4,5,6,7,8,9,10], monG: [4,5,6,7,8,9,10] },
    { m: 'Schnittgut zusammennehmen, Grüngut abführen', b: '', h: '16×', mat: 'Fahrzeug', mon: [4,5,6,7,8,9,10], monG: [4,5,6,7,8,9,10] },
  ]},
  5:  { code: 'BLR', quelle: '§2.1.2', tasks: [
    { m: 'Mähen mit hochgestelltem Rasenmäher', b: 'Letzter Durchgang im Oktober', h: '4–6×', mat: 'Rasenmäher', mon: [5,6,7,8,9,10], monG: [5,6,7,8,9] },
    { m: 'Neophyten kontrollieren / jäten + entsorgen', b: 'Schwarze & Watch-Liste, Juni–September', h: '3×', mat: 'Hacke', mon: [6,7,8,9], monG: [] },
    { m: 'Blumenrasen ausputzen', b: '', h: '6×', mat: 'Rechen', mon: [4,5,6,7,8,9], monG: [4,5,6,7,8,9] },
    { m: 'Schnittgut zusammennehmen, Grüngut abführen', b: 'Nach jedem Durchgang', h: 'laufend', mat: 'Fahrzeug', mon: [5,6,7,8,9,10], monG: [5,6,7,8,9,10] },
  ]},
  6:  { code: 'BWK', quelle: '§2.2.1', tasks: [
    { m: 'Mähen (Sense / kleiner Balkenmäher)', b: '1. Schnitt Ende Juni, 2. Schnitt Oktober; 10 % Restfläche stehen lassen', h: '2×', mat: 'Balkenmäher', mon: [6,10], monG: [] },
    { m: 'Neophyten kontrollieren / bekämpfen', b: 'Schwarze & Watch-Liste, Juni–September', h: '3×', mat: 'Stechgabel', mon: [6,7,8,9], monG: [] },
    { m: 'Wiese ausputzen', b: '', h: '2×', mat: 'Rechen', mon: [6,10], monG: [6,10] },
    { m: 'Schnittgut zusammennehmen, Grüngut abführen', b: '', h: '2×', mat: 'Fahrzeug', mon: [6,10], monG: [] },
  ]},
  7:  { code: 'BWG', quelle: '§2.2.2', tasks: [
    { m: 'Mähen (Motormäher / Traktor)', b: '1. Schnitt Ende Juni, 2. Schnitt Oktober; 10 % Restfläche stehen lassen', h: '2×', mat: 'Motormäher', mon: [6,10], monG: [] },
    { m: 'Neophyten kontrollieren / bekämpfen', b: 'Schwarze & Watch-Liste, Juni–September', h: '3×', mat: 'Stechgabel', mon: [6,7,8,9], monG: [] },
    { m: 'Wiese ausputzen', b: '', h: '2×', mat: 'Rechen', mon: [6,10], monG: [6,10] },
    { m: 'Schnittgut zusammennehmen, Grüngut abführen', b: '', h: '2×', mat: 'Fahrzeug', mon: [6,10], monG: [] },
  ]},
  8:  { code: 'FEW', quelle: '§2.2.3', tasks: [
    { m: 'Mähen und Abführen', b: 'ab 15. September (vor erstem Schneefall)', h: '1×', mat: 'Balkenmäher', mon: [9,10], monG: [10] },
    { m: 'Neophyten kontrollieren / bekämpfen', b: 'Juni–September', h: '3×', mat: 'Stechgabel', mon: [6,7,8,9], monG: [] },
    { m: 'Wiese ausputzen', b: '', h: '1×', mat: 'Rechen', mon: [9], monG: [9] },
    { m: 'Schnittgut zusammennehmen, Grüngut abführen', b: '', h: '1×', mat: 'Fahrzeug', mon: [9,10], monG: [10] },
  ]},
  43: { code: 'SAU', quelle: '§2.2.4', tasks: [
    { m: 'Schnitt (Balkenmäher / Handsense)', b: '1× jährlich, September–November; 10 % Restfläche bei > 200 m²', h: '1×', mat: 'Balkenmäher', mon: [9,10,11], monG: [] },
    { m: 'Neophyten kontrollieren / bekämpfen', b: 'Juni–September', h: '3×', mat: 'Stechgabel', mon: [6,7,8,9], monG: [] },
    { m: 'Saum ausputzen, Grüngut abführen', b: '', h: '1×', mat: 'Fahrzeug', mon: [9,10,11], monG: [9,10,11] },
  ]},
  44: { code: 'MAG', quelle: '§2.2.5', tasks: [
    { m: 'Schnitt (Balkenmäher / Handsense)', b: '1× jährlich, September–November; 10 % Restfläche bei > 200 m²', h: '1×', mat: 'Balkenmäher', mon: [9,10,11], monG: [] },
    { m: 'Neophyten kontrollieren / bekämpfen', b: 'Juni–September', h: '3×', mat: 'Stechgabel', mon: [6,7,8,9], monG: [] },
    { m: 'Magerrasen ausputzen, Grüngut abführen', b: '', h: '1×', mat: 'Fahrzeug', mon: [9,10,11], monG: [9,10,11] },
  ]},
  11: { code: 'BER', quelle: '§2.3.1', tasks: [
    { m: 'Pflanzenschutz', b: '', h: '6×', mat: 'Spritze', mon: [4,5,6,7,8,9], monG: [4,5,6,7,8,9] },
    { m: 'Ausschneiden / Blütenschnitt', b: 'verblühte Triebe', h: '2×', mat: 'Gartenschere', mon: [6,8], monG: [6,8] },
    { m: 'Unkraut entfernen', b: '', h: '5×', mat: 'Hacke', mon: [4,5,6,7,9], monG: [4,5,6,7,9] },
    { m: 'Winterschnitt, Winterschutz', b: '', h: '2×', mat: 'Gartenschere', mon: [3,11], monG: [3,11] },
    { m: 'Düngen', b: '', h: '2×', mat: 'Dünger', mon: [4,6], monG: [4,6] },
    { m: 'Grüngut abführen', b: '', h: '8×', mat: 'Fahrzeug', mon: [3,4,5,6,7,8,9,11], monG: [3,4,5,6,7,8,9,11] },
  ]},
  12: { code: 'MOB', quelle: '§2.3.2', tasks: [
    { m: 'Unkraut entfernen', b: '', h: '2×', mat: 'Hacke', mon: [5,8], monG: [5,8] },
    { m: 'Wässern', b: '', h: '1×', mat: 'Schlauch', mon: [7], monG: [7] },
    { m: 'Vegetationsschicht ergänzen', b: 'Moorbeetsubstrat', h: '1×', mat: 'Substrat', mon: [4], monG: [4] },
    { m: 'Rückschnitt', b: 'ca. alle 2 Jahre', h: '0.5×', mat: 'Gartenschere', mon: [3], monG: [3] },
    { m: 'Grüngut abführen', b: '', h: '2×', mat: 'Fahrzeug', mon: [5,8], monG: [5,8] },
  ]},
  13: { code: 'STE', quelle: '§2.3.3', tasks: [
    { m: 'Unkraut entfernen + Neophyten bekämpfen', b: 'Schwarze & Watch-Liste', h: '3×', mat: 'Hacke', mon: [5,7,9], monG: [5,7,9] },
    { m: 'Vegetationsregulierung, Auslichten, Schneiden', b: 'Funktion der Pflanzung erhalten', h: '2×', mat: 'Gartenschere', mon: [3,9], monG: [3,9] },
    { m: 'Grüngut abführen', b: '', h: '3×', mat: 'Fahrzeug', mon: [3,5,9], monG: [3,5,9] },
  ]},
  14: { code: 'STI', quelle: '§2.3.4', tasks: [
    { m: 'Unkraut entfernen + Neophyten bekämpfen', b: 'Schwarze & Watch-Liste', h: '5×', mat: 'Hacke', mon: [4,5,6,7,9], monG: [4,5,6,7,9] },
    { m: 'Düngen', b: '', h: '1×', mat: 'Dünger', mon: [4], monG: [4] },
    { m: 'Remontier-/Rück-/Vorblütenschnitt', b: 'verwelkte Blütenstände entfernen', h: '3×', mat: 'Gartenschere', mon: [3,6,8], monG: [3,6,8] },
    { m: 'Grüngut abführen', b: '', h: '5×', mat: 'Fahrzeug', mon: [3,4,6,8,10], monG: [3,4,6,8,10] },
  ]},
  16: { code: 'FHN', quelle: '§2.4.1', tasks: [
    { m: 'Formschnitt', b: 'Schnittzeitpunkt: Frühsommer', h: '2×', mat: 'Heckenschere', mon: [6,8], monG: [8] },
    { m: 'Jäten + Neophyten bekämpfen', b: 'Juni–September', h: '3×', mat: 'Hacke', mon: [6,7,8,9], monG: [] },
    { m: 'Grüngut abführen', b: '', h: '2×', mat: 'Fahrzeug', mon: [6,8], monG: [6,8] },
  ]},
  17: { code: 'FHU', quelle: '§2.4.2', tasks: [
    { m: 'Formschnitt', b: 'Steighilfen nötig', h: '2×', mat: 'Heckenschere', mon: [6,8], monG: [6,8] },
    { m: 'Jäten + Neophyten bekämpfen', b: 'Juni–September', h: '3×', mat: 'Hacke', mon: [6,7,8,9], monG: [] },
    { m: 'Grüngut abführen', b: '', h: '2×', mat: 'Fahrzeug', mon: [6,8], monG: [6,8] },
  ]},
  19: { code: 'GER', quelle: '§2.5.1', tasks: [
    { m: 'Auslichtungs- / Erhaltungsschnitt', b: 'Winter; Astmaterial als Asthaufen anlegen', h: '1×', mat: 'Gartensäge', mon: [1,2,12], monG: [1,2,12] },
    { m: 'Jäten + Neophyten bekämpfen', b: 'Juni–September', h: '3×', mat: 'Hacke', mon: [6,7,8,9], monG: [] },
    { m: 'Grüngut abführen', b: '', h: '2×', mat: 'Fahrzeug', mon: [2,7], monG: [2,7] },
  ]},
  20: { code: 'BOD', quelle: '§2.5.2', tasks: [
    { m: 'Verjüngungsschnitt', b: 'Winter', h: '1×', mat: 'Gartenschere', mon: [1,2,12], monG: [1,2,12] },
    { m: 'Jäten + Neophyten bekämpfen', b: 'Juni–September', h: '3×', mat: 'Hacke', mon: [6,7,8,9], monG: [] },
    { m: 'Kanten schneiden', b: '', h: '2×', mat: 'Kantenstecher', mon: [5,8], monG: [5,8] },
    { m: 'Grüngut abführen', b: '', h: '1×', mat: 'Fahrzeug', mon: [2], monG: [2] },
  ]},
  21: { code: 'GBD', quelle: '§2.5.3', tasks: [
    { m: 'Auslichtungs-/Erhaltungsschnitt Gehölze', b: 'Winter', h: '1×', mat: 'Gartensäge', mon: [1,2,12], monG: [1,2,12] },
    { m: 'Verjüngungsschnitt Bodendecker', b: 'Winter', h: '1×', mat: 'Gartenschere', mon: [1,2,12], monG: [1,2,12] },
    { m: 'Jäten + Neophyten bekämpfen', b: 'Juni–September', h: '4×', mat: 'Hacke', mon: [6,7,8,9], monG: [] },
    { m: 'Kanten schneiden Bodendecker', b: '', h: '1×', mat: 'Kantenstecher', mon: [5], monG: [5] },
    { m: 'Grüngut abführen', b: '', h: '4×', mat: 'Fahrzeug', mon: [2,6,8,12], monG: [2,6,8,12] },
  ]},
  18: { code: 'WIH', quelle: '§2.5.4', tasks: [
    { m: 'Kontrolle / leitender Schnitt, Wege freischneiden', b: 'ganze Hecke', h: '1×', mat: 'Gartensäge', mon: [1,2], monG: [1,2] },
    { m: 'Selektive Pflege / auf Stock setzen', b: 'jährlich 1/3 der Heckenlänge (Winter)', h: '1×', mat: 'Motorsäge', mon: [12,1,2], monG: [12,1,2] },
    { m: 'Astmaterial als Asthaufen anlegen', b: 'auf 1/3 der Heckenlänge', h: '1×', mat: 'manuell', mon: [1,2], monG: [1,2] },
  ]},
  24: { code: 'DAE', quelle: '§2.6.2', tasks: [
    { m: 'Kontrolle Problempflanzen / Wassereinläufe', b: 'Gehölzsämlinge, Klee, Wicken', h: '1×', mat: 'manuell', mon: [5], monG: [5] },
    { m: 'Neophyten kontrollieren / entfernen', b: 'Mai–September', h: '3×', mat: 'manuell', mon: [5,6,7,8,9], monG: [] },
    { m: 'Rückschnitt (> 5–7 cm)', b: 'bis 30. Mai', h: '1×', mat: 'Sense', mon: [5], monG: [] },
    { m: 'Grüngut abführen', b: '', h: '3×', mat: 'Fahrzeug', mon: [5,7,9], monG: [5,7,9] },
  ]},
  26: { code: 'BVN', quelle: '§2.7.1', tasks: [
    { m: 'Unkraut entfernen', b: 'mechanisch / thermisch (keine Herbizide)', h: '5×', mat: 'Abflammgerät', mon: [4,5,6,7,9], monG: [4,5,6,7,9] },
    { m: 'Grüngut abführen', b: '', h: '5×', mat: 'Fahrzeug', mon: [4,5,6,7,9], monG: [4,5,6,7,9] },
  ]},
  27: { code: 'CHA', quelle: '§2.7.2', tasks: [
    { m: 'Spontanbewuchs mähen', b: 'Schnitt mit Rasenmäher', h: '5×', mat: 'Rasenmäher', mon: [5,6,7,8,9], monG: [5,6,7,8,9] },
    { m: 'Neophyten kontrollieren / entfernen', b: 'vor dem Mähen, Mai–September', h: '5×', mat: 'Hacke', mon: [5,6,7,8,9], monG: [] },
    { m: 'Grüngut abführen', b: '', h: '5×', mat: 'Fahrzeug', mon: [5,6,7,8,9], monG: [5,6,7,8,9] },
  ]},
  29: { code: 'RGS', quelle: '§2.7.3', tasks: [
    { m: 'Mähen', b: '', h: '5×', mat: 'Rasenmäher', mon: [5,6,7,8,9], monG: [5,6,7,8,9] },
    { m: 'Grüngut abführen', b: '', h: '5×', mat: 'Fahrzeug', mon: [5,6,7,8,9], monG: [5,6,7,8,9] },
  ]},
  37: { code: 'GES', quelle: '§2.7.4', tasks: [
    { m: 'Steine reinigen, Laub & Schmutz entfernen', b: 'Fassadenschutz', h: '2×', mat: 'Rechen', mon: [4,10], monG: [4,10] },
    { m: 'Unkraut entfernen + Neophyten bekämpfen', b: 'Juni–September', h: '3×', mat: 'Hacke', mon: [6,7,8,9], monG: [] },
    { m: 'Grüngut abführen', b: '', h: '3×', mat: 'Fahrzeug', mon: [4,7,10], monG: [4,7,10] },
  ]},
  28: { code: 'SAN', quelle: '§2.7.5', tasks: [
    { m: 'Sand reinigen', b: 'Sandkasten', h: '10×', mat: 'Rechen', mon: [3,4,5,6,7,8,9,10], monG: [3,4,5,6,7,8,9,10] },
    { m: 'Sand ergänzen / lockern', b: '', h: '0–1×', mat: 'Schaufel', mon: [4], monG: [4] },
    { m: 'Sand auswechseln', b: '', h: '1×', mat: 'Fahrzeug', mon: [4], monG: [4] },
  ]},
  34: { code: 'GEW', quelle: '§2.8.5', tasks: [
    { m: 'Kontrolle (Wasserstand, Algen, Fischbestand)', b: '', h: '3×', mat: 'manuell', mon: [4,7,10], monG: [4,7,10] },
    { m: 'Vegetation regulieren / Schlamm entfernen', b: 'ca. 1/3 zurückschneiden, Herbst–Winter', h: '0.3×', mat: 'Balkenmäher', mon: [10,11], monG: [11] },
    { m: 'Neophyten kontrollieren / bekämpfen', b: 'Juni–September', h: '3×', mat: 'Stechgabel', mon: [6,7,8,9], monG: [] },
  ]},
  35: { code: 'BRU', quelle: '§2.8.6', tasks: [
    { m: 'Wasser- und Brunnenzustand kontrollieren', b: '', h: '2×', mat: 'manuell', mon: [4,9], monG: [4,9] },
    { m: 'Brunnen reinigen (Algen usw.)', b: '', h: '12×', mat: 'Bürste', mon: [1,2,3,4,5,6,7,8,9,10,11,12], monG: [1,2,3,4,5,6,7,8,9,10,11,12] },
    { m: 'Brunnen reinigen (Wasser ablassen, abspritzen)', b: '', h: '1×', mat: 'Hochdruck', mon: [4], monG: [4] },
  ]},
};

const CARE_CATALOG_POINT = {
  1:  { code: 'LBG', quelle: '§2.9 (analog kleinkronig)', tasks: [
    { m: 'Auslichtungs- / Erhaltungsschnitt', b: 'auf Umgebung (Fassade/Grenze) angepasst', h: '1×', mat: 'Baumpflege', mon: [1,2,12], monG: [1,2,12] },
  ]},
  2:  { code: 'LBK', quelle: '§2.9.5', tasks: [
    { m: 'Auslichtungs- / Erhaltungsschnitt', b: 'auf Umgebung (Fassade/Grenze) angepasst', h: '1×', mat: 'Baumpflege', mon: [1,2,12], monG: [1,2,12] },
  ]},
  7:  { code: 'NAB', quelle: '§2.9.6', tasks: [
    { m: 'Auslichtungs- / Erhaltungsschnitt', b: 'natürliche Wuchsform belassen', h: '1×', mat: 'Baumpflege', mon: [1,2,12], monG: [1,2,12] },
  ]},
  9:  { code: 'SKP', quelle: '§2.6.1', tasks: [
    { m: 'Kontrolle der Kletterhilfen', b: '', h: '1×', mat: 'manuell', mon: [3], monG: [3] },
    { m: 'Schnitt / Eindämmung', b: 'Ausschneiden von Bauwerksteilen', h: '3×', mat: 'Gartenschere', mon: [3,6,9], monG: [3,6,9] },
    { m: 'Grüngut abführen', b: '', h: '1×', mat: 'Fahrzeug', mon: [9], monG: [9] },
  ]},
  10: { code: 'PGD', quelle: '§2.6.3', tasks: [
    { m: 'Jäten', b: '', h: '6×', mat: 'manuell', mon: [4,5,6,7,8,9], monG: [4,5,6,7,8,9] },
    { m: 'Wässern', b: '', h: '12×', mat: 'Giesskanne', mon: [4,5,6,7,8,9,10], monG: [4,5,6,7,8,9,10] },
    { m: 'Gehölzschnitt', b: '', h: '1×', mat: 'Gartenschere', mon: [3], monG: [3] },
    { m: 'Grüngut abführen', b: '', h: '6×', mat: 'Fahrzeug', mon: [4,5,6,7,8,9], monG: [4,5,6,7,8,9] },
  ]},
  18: { code: 'AST', quelle: '§2.10.1', tasks: [
    { m: 'Mit neuem Holz beschichten', b: 'mind. alle 3 Jahre (aus Gehölzpflege)', h: '0.3×', mat: 'manuell', mon: [2], monG: [2] },
  ]},
  19: { code: 'BST', quelle: '§2.10.2', tasks: [
    { m: 'Schonendes Ausmähen', b: '', h: '1×', mat: 'Sense', mon: [7], monG: [7] },
  ]},
  20: { code: 'STH', quelle: '§2.10.3', tasks: [
    { m: 'Brombeeren / krautigen Bewuchs entfernen', b: '1× im Juni, 1× im Oktober', h: '2×', mat: 'manuell', mon: [6,10], monG: [] },
    { m: 'Falls nötig Steine wieder anhäufen', b: '', h: 'n. Bedarf', mat: 'manuell', mon: [10], monG: [10] },
  ]},
  21: { code: 'WBH', quelle: '§2.10.4', tasks: [
    { m: 'Kontrolle / Reinigung der Nisthilfen', b: '', h: '1×', mat: 'manuell', mon: [2,3], monG: [2,3] },
  ]},
};

// Look up the care-catalog entry for a feature.  AREA/idPPy covers `area` and
// `tree_canopy`; POINT/idPP covers `tree` and `point`.  Returns null for
// profiles with no Standard chapter (report.js renders a generic fallback).
function careProfile(entity_type, code) {
  if (code == null) return null;
  const isArea = entity_type === 'area' || entity_type === 'tree_canopy';
  const map = isArea ? CARE_CATALOG_AREA : CARE_CATALOG_POINT;
  return map[code] || null;
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

// ── BBL Standard Grünflächenunterhalt – profile grouping ──────────────────────────────────────────
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

  // ── AREAS — BBL Standard Grünflächenunterhalt – profile grouping ────────────────────────────
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

// ── Data source: the normalized per-entity files (docs/DATAMODEL.md) ───────
// Loaded + joined into one in-memory FeatureCollection by loadInventory()
// (js/data.js).  data.geojson is no longer read by the app.
const DATA_FILES = {
  sites:     'data/sites.json',
  parcels:   'data/land_parcels.geojson',
  polygons:  'data/maintenance_polygons.geojson',
  points:    'data/maintenance_points.geojson',
  profiles:  'data/care_profiles.json',
  codelists: 'data/codelists.json',
};

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
  { key: 'source',                label: 'Quelle',           visible: false },
];

// Default-visible column keys per scope tab.  Switching tabs applies the
// corresponding set; once the user toggles columns via the Spalten
// dropdown, their picks are remembered per scope for the rest of the
// session (state held in table.js _scopeColMemory).
const TABLE_COL_DEFAULTS = {
  sites: [
    '_idx',
    'site_name',
    'site_objektnummer',
    'site_adresse',
    'site_lose',
    'parzelle',
    'pflegeklasse',
    'eigentuemer',
    'erstellungsjahr',
    'area_m2',
  ],
  green: [
    '_idx',
    'entity_type',
    'subtype',
    'site_name',
    'profil_label',
    'baumart',
    'area_m2',
  ],
};

// Filter dropdown columns - which columns get a checkbox-list filter,
// AND in what order they appear in the dropdown.  Order matters: surveyors
// almost always start by narrowing to a specific Standort, then refine by
// what kind of green-area feature they're after.  Putting Standort first
// matches the workflow.
const FILTER_COLS_DEFAULT = [
  'site_name',          // Standort (most common entry point)
  'profil_label',       // Profil (44 polygon + 23 point names)
  'baumart',            // Tree species (430 entries, but searchable)
  'entity_type',        // Typ (broad bucket: site/area/tree/...)
  'site_lose',          // Los (DLZ district)
  'pflegeklasse',       // Pflegeklasse (PK 1/2/3)
  'eigentuemer',        // Eigentümer (Bund/Dritte)
];

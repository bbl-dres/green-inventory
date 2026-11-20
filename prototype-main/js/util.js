// ═══════════════════════════════════════════════════════════════════════════
// UTIL — helpers shared by the map app (index.html) and the Standort detail
// page (standort.html): escaping, formatting, coordinates, icons, swatches,
// toasts, the modal-dialog helper, downloads and the per-Standort
// aggregations.  No map and no page-specific DOM in here.
// Depends on: config.js (fmtNum, profilStyle, profileDomain, TABLE_COLS)
// ═══════════════════════════════════════════════════════════════════════════

// ── HTML escape for safe interpolation into innerHTML ─────────────────────
// GDB attribute strings (Bemerkung, names, ...) are internal but a single
// '<' silently breaks the layout.  Use this for every property value that
// gets templated into a string + assigned via innerHTML.
const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, ch => _ESC_MAP[ch]);
}

// ── Formatting ────────────────────────────────────────────────────────────
// Swiss-style thousand separator (apostrophe), no decimals: 2’600’370
function fmtThousand(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’');
}
// "1’234.5 m²" — one label («Fläche») and one unit everywhere.
function fmtAreaM2(v, decimals) {
  return (v == null || v === '') ? null : fmtNum(v, decimals) + ' m²';
}
// ISO date / datetime → "27.10.2022".  Survey dates are stored as midnight
// UTC, so format in UTC (a local-time format shifts them by a day west of it).
function fmtDate(iso) {
  if (iso == null || iso === '') return null;
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}
function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
// A value the survey left open: null, empty, or the codelists' explicit
// "nicht erfasst" (code 0).  Such values are omitted from compact views.
function isUnset(v) {
  if (v == null) return true;
  const s = String(v).trim();
  return s === '' || s === 'nicht erfasst';
}

// ── Coordinates ───────────────────────────────────────────────────────────
// WGS84 → LV95 (CH1903+): swisstopo's approximate formulas (not the rigorous
// REFRAME transformation), good to about 1 m inside Switzerland (measured
// against the surveyed points of the inventory: 1.0 m at worst).  Read-outs
// built on it are therefore shown to the metre.  The inverse, lv95ToWgs84(),
// lives in js/data.js.  Keeping these inline avoids a 30 KB proj4js dependency.
function wgs84ToLv95(lon, lat) {
  const phiSec = lat * 3600;
  const lamSec = lon * 3600;
  const phip = (phiSec - 169028.66) / 10000;
  const lamp = (lamSec - 26782.5) / 10000;
  const E = 2600072.37
    + 211455.93 * lamp
    - 10938.51 * lamp * phip
    -     0.36 * lamp * phip * phip
    -    44.54 * Math.pow(lamp, 3);
  const N = 1200147.07
    + 308807.95 * phip
    +   3745.25 * Math.pow(lamp, 2)
    +     76.63 * Math.pow(phip, 2)
    -    194.56 * Math.pow(lamp, 2) * phip
    +    119.79 * Math.pow(phip, 3);
  return [E, N];
}
// Both notations of a point, as shown in the maps' context menus.
function coordTexts(lngLat) {
  const [E, N] = wgs84ToLv95(lngLat.lng, lngLat.lat);
  return {
    lv95: fmtThousand(E) + ', ' + fmtThousand(N),
    wgs84: lngLat.lat.toFixed(5) + ', ' + lngLat.lng.toFixed(5),
  };
}

// Bounding box [[minLng, minLat], [maxLng, maxLat]] of a GeoJSON geometry.
function geomBbox(geom) {
  let mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
  function scan(c) {
    if (typeof c[0] === 'number') {
      if (c[0] < mn[0]) mn[0] = c[0]; if (c[0] > mx[0]) mx[0] = c[0];
      if (c[1] < mn[1]) mn[1] = c[1]; if (c[1] > mx[1]) mx[1] = c[1];
    } else c.forEach(scan);
  }
  if (!geom || !geom.coordinates) return [[0, 0], [0, 0]];
  scan(geom.coordinates);
  // Point geometries leave min === max which makes fitBounds collapse.
  if (mn[0] === mx[0] && mn[1] === mx[1]) {
    const eps = 0.0001;
    mn = [mn[0] - eps, mn[1] - eps];
    mx = [mx[0] + eps, mx[1] + eps];
  }
  return [mn, mx];
}
// Bounding box over several features.
function featuresBbox(features) {
  let mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
  for (const f of features) {
    if (!f || !f.geometry) continue;
    const b = geomBbox(f.geometry);
    if (b[0][0] < mn[0]) mn[0] = b[0][0]; if (b[0][1] < mn[1]) mn[1] = b[0][1];
    if (b[1][0] > mx[0]) mx[0] = b[1][0]; if (b[1][1] > mx[1]) mx[1] = b[1][1];
  }
  return isFinite(mn[0]) ? [mn, mx] : null;
}

// ── Icons (16 px default, 14 px in dense rows; stroke 2) ──────────────────
const _ICON_PATHS = {
  eye:       '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>',
  info:      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="11"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  chevRight: '<polyline points="9 18 15 12 9 6"/>',
  chevLeft:  '<polyline points="15 18 9 12 15 6"/>',
  arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  close:     '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  external:  '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  zoomIn:    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
  home:      '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
};
function icon(name, size = 16, strokeWidth = 2) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${_ICON_PATHS[name] || ''}</svg>`;
}

// ── Swatches ──────────────────────────────────────────────────────────────
// One way to show a profile everywhere: a small swatch in the map colour,
// with the pattern where two profiles share a colour.  `style` is the
// { fill, swatchClass } object of a profile (config.js profilStyle).
// swatchClass is either a pattern (sw-dots, sw-xhatch, …) or a point shape
// (sw-circ, sw-circ-cross, sw-triangle).
const _SHAPE_CLASSES = new Set(['sw-circ', 'sw-circ-cross', 'sw-triangle']);
function swatchHtml(style, mini) {
  const cls = (style && style.swatchClass) || '';
  const fill = escapeHtml((style && style.fill) || '');
  if (mini) {
    // Group rows: 8 × 14 px bars; points become round bars, patterns stay.
    const extra = _SHAPE_CLASSES.has(cls) ? ' round' : (cls ? ' ' + cls : '');
    return `<span class="swatch-mini${extra}" style="background-color:${fill}"></span>`;
  }
  return `<span class="swatch${cls ? ' ' + cls : ''}" style="background-color:${fill}"></span>`;
}
// Fixed layers without a profile (legend parts with `swatch`).
function staticSwatchHtml(kind, mini) {
  if (mini) return kind === 'line' ? '' : `<span class="swatch-mini is-${kind}"></span>`;
  if (kind === 'line') return '<span class="swatch-line"></span>';
  if (kind === 'dash') return '<span class="swatch-line dashed"></span>';
  return `<span class="swatch is-${kind}"></span>`;
}
// Swatch of one feature, in the colour it has on the map.
function featureSwatchHtml(p) {
  switch (p.entity_type) {
    case 'site':
    case 'site_location': return '<span class="swatch is-marker"></span>';
    case 'parcel':        return '<span class="swatch is-parcel"></span>';
    default:              return swatchHtml(profilStyle(p.entity_type, p.fk_profil));
  }
}

// ── Toasts ────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.setAttribute('role', 'status');
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
async function copyText(text, okMsg = 'Kopiert') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(okMsg, 'success');
    return true;
  } catch (_) {
    showToast('Kopieren fehlgeschlagen', 'error');
    return false;
  }
}
// System share sheet where available, clipboard otherwise.
async function shareUrl(url, title) {
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; }
    catch (err) { if (err.name === 'AbortError') return; }   // user cancelled; else fall through
  }
  await copyText(url, 'Link kopiert');
}

// ── Modal dialog ──────────────────────────────────────────────────────────
// `scrim` is the full-screen backdrop that contains one [role="dialog"].
// Focus moves into the dialog and is trapped there; ×, a click on the scrim
// and Esc close it; focus returns to `opener` (an element, or a function
// returning one — the legend re-renders its buttons while the dialog is open).
let _dialog = null;
function _focusables(root) {
  return [...root.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
}
function openDialog(scrim, opener, onClose) {
  closeDialog();
  const dlg = scrim.querySelector('[role="dialog"]');
  scrim.hidden = false;
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeDialog(); return; }
    if (e.key !== 'Tab') return;
    const f = _focusables(dlg);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1], cur = document.activeElement;
    if (!dlg.contains(cur)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  };
  const onClick = (e) => {
    if (e.target === scrim || (e.target.closest && e.target.closest('[data-dialog-close]'))) closeDialog();
  };
  // Capture phase: Esc must not also reach the page's own Esc handlers.
  document.addEventListener('keydown', onKey, true);
  scrim.addEventListener('click', onClick);
  _dialog = { scrim, opener, onKey, onClick, onClose };
  const first = dlg.querySelector('[data-dialog-close]') || _focusables(dlg)[0];
  (first || dlg).focus();
}
function closeDialog() {
  if (!_dialog) return;
  const d = _dialog;
  _dialog = null;
  document.removeEventListener('keydown', d.onKey, true);
  d.scrim.removeEventListener('click', d.onClick);
  d.scrim.hidden = true;
  if (typeof d.onClose === 'function') d.onClose();
  const back = typeof d.opener === 'function' ? d.opener() : d.opener;
  if (back && typeof back.focus === 'function') back.focus();
}

// ── Downloads / exports ───────────────────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  // In the document while it is clicked, and the URL released only after the
  // download has started: some browsers cancel it otherwise.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Header + rows with the table's columns (TABLE_COLS) and formatters — the
// one definition behind the CSV / Excel exports of the table and the detail
// page.  `rows` are feature properties.
function tableExportAoa(rows) {
  return [
    TABLE_COLS.map(c => c.label),
    ...rows.map(r => TABLE_COLS.map(c => c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? ''))),
  ];
}
function downloadGeoJSON(features, filename) {
  const fc = { type: 'FeatureCollection', features };
  downloadBlob(new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' }), filename);
}

// ── Standort links ────────────────────────────────────────────────────────
// `siteRef` is the query string data.js puts on every feature with a Standort
// ("id=2052", or "fid=27" where the Objektnummer is not unique).
function standortUrl(siteRef) {
  return siteRef ? 'standort.html?' + siteRef : null;
}
// The map, opened on a Standort (selected + fitted): ?site=<Objektnummer> or
// ?site_fid=<fid>.
function mapUrlForSite(siteRef) {
  if (!siteRef) return 'index.html';
  return 'index.html?' + (siteRef.startsWith('fid=') ? 'site_fid=' + siteRef.slice(4) : 'site=' + siteRef.slice(3));
}
// Resolve a Standort feature from URL parameters (id / fid, or the map's
// site / site_fid).  Returns the `site` feature or null.
function findSiteFeature(features, params) {
  const fid = params.get('fid') ?? params.get('site_fid');
  const id = params.get('id') ?? params.get('site');
  const sites = features.filter(f => f.properties.entity_type === 'site');
  if (fid != null && fid !== '') {
    const hit = sites.find(f => String(f.properties.objectid) === String(fid));
    if (hit) return hit;
  }
  if (id != null && id !== '') {
    return sites.find(f => String(f.properties.objektnummer) === String(id)) || null;
  }
  return null;
}

// ── Per-Standort aggregations ─────────────────────────────────────────────
// Maintenance elements assigned to a Standort (never the perimeter, the
// centroid marker or the parcels).
function siteChildren(features, siteOid) {
  return features.filter(f => {
    const p = f.properties;
    return p.site_oid === siteOid &&
      (p.entity_type === 'area' || p.entity_type === 'tree' || p.entity_type === 'point');
  });
}
// Cadastral parcels the given elements stand on.
function parcelsOf(features, children) {
  const fids = new Set(children.map(f => f.properties.parcel_fid).filter(v => v != null));
  return features.filter(f => f.properties.entity_type === 'parcel' && fids.has(f.properties.parcel_fid));
}
// One row per care profile: polygons (areas) by their idPPy code, points (trees and other points) by their idPP code.  Area
// profiles first, largest area first; then point profiles, most frequent first.
function careProfileRows(children) {
  const groups = {};
  for (const f of children) {
    const p = f.properties;
    const dom = profileDomain(p.entity_type);
    const key = dom + ':' + p.fk_profil;
    let g = groups[key];
    if (!g) {
      g = groups[key] = {
        key, domain: dom, entity_type: dom === 'idPPy' ? 'area' : 'point', code: p.fk_profil,
        label: p.profil_label || (p.fk_profil == null ? 'Ohne Profil' : 'Profil ' + p.fk_profil),
        count: 0, area: 0,
      };
    }
    g.count += 1;
    if (dom === 'idPPy') g.area += Number(p.area_m2) || 0;
  }
  const list = Object.values(groups);
  return [
    ...list.filter(g => g.domain === 'idPPy').sort((a, b) => b.area - a.area),
    ...list.filter(g => g.domain !== 'idPPy').sort((a, b) => b.count - a.count),
  ];
}
// Month states of a set of care tasks, January … December:
//   2 = stated in the BBL Standard, 1 = estimated month (monG), 0 = none.
function monthStates(tasks) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    let st = 0;
    for (const t of tasks) {
      if ((t.mon || []).includes(m)) st = Math.max(st, (t.monG || []).includes(m) ? 1 : 2);
    }
    out.push(st);
  }
  return out;
}

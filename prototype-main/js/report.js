// ═══════════════════════════════════════════════════════════════════════════
// REPORT — per-Standort Pflegebericht (PDF, on demand)
// Triggered by the ⬇ PDF button in a Standort popup (see popupHTML in map.js).
// Renders a 2-page landscape A4 PDF:
//   Page 1 — Situationsplan: a vector map on a grey background showing the
//            green-area profiles (filled by BBL colour), tree dots, the parcel
//            boundary in red, a parcel-ID label at the pole of inaccessibility,
//            plus a colour legend and a metric scale bar (bottom-left).
//   Page 2 — Pflegeübersicht: the Profil-Übersicht (counts + areas) and the
//            Pflegekalender merged into one table — quantities, requirements
//            and intervals per profile.
// Vector map is drawn directly from the GeoJSON (no basemap tiles) so it is
// crisp and fully offline.
// Depends on: config.js (careProfile, CARE_CATALOG_*, AREA/POINT_PROFILE_STYLE,
//   fmtNum), map.js (geojsonData, showToast), jsPDF + jspdf-autotable (CDN).
// ═══════════════════════════════════════════════════════════════════════════

// Month-cell fills: solid = stated in the Standard, light = estimated month.
const RPT_MONTH_SOLID = [0, 94, 168];     // --primary
const RPT_MONTH_GUESS = [180, 205, 230];  // light primary tint
const RPT_MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const RPT_MAP_BG = [228, 228, 228];       // grey "neighbourhood" background
const RPT_PARCEL_RED = [204, 31, 31];     // parcel boundary

// Generic row for profiles with no chapter in the BBL Standard.
const RPT_FALLBACK_TASK = {
  m: 'Unterhalt nach Bedarf', b: 'Kein eigenes Kapitel im BBL Standard – Pflege geschätzt',
  h: 'n. Bedarf', mat: '', mon: [], monG: [],
};

// "#97e600" / "#abc" → [r,g,b]; non-hex (hsl fallback colours) → mid-grey.
function rptHexToRgb(hex) {
  if (typeof hex !== 'string') return [150, 150, 150];
  let h = hex.trim();
  if (h[0] !== '#') return [150, 150, 150];
  h = h.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return [150, 150, 150];
  const n = parseInt(h, 16);
  if (isNaN(n)) return [150, 150, 150];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Pick a readable text colour for a coloured cell background.
function rptTextOn(rgb) {
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return lum > 150 ? [30, 30, 30] : [255, 255, 255];
}

// Profile fill colour for a group (idPPy for area/canopy, idPP for tree/point).
function rptGroupColor(entity_type, code) {
  const isArea = entity_type === 'area' || entity_type === 'tree_canopy';
  const map = isArea ? AREA_PROFILE_STYLE : POINT_PROFILE_STYLE;
  const style = map[code];
  return rptHexToRgb(style && style.fill);
}

// Fallback short code from a profile label: first 3 letters, uppercased.
function rptDeriveCode(label) {
  return (String(label || '').replace(/[^A-Za-zÄÖÜäöü]/g, '').slice(0, 3).toUpperCase()) || '–';
}

// ── Main entry: build + download the report for a site OBJECTID ────────────
async function buildStandortReport(siteOid) {
  if (!geojsonData) return;
  const ns = window.jspdf;
  if (!ns || !ns.jsPDF) { showToast('PDF-Bibliothek nicht geladen', 'error'); return; }

  const site = geojsonData.features.find(
    f => f.properties.entity_type === 'site' && f.properties.objectid === siteOid);
  if (!site) { showToast('Standort nicht gefunden', 'error'); return; }
  const sp = site.properties;

  // Children of this site (its green features), excluding the centroid marker.
  const children = geojsonData.features.filter(f => {
    const p = f.properties;
    return p.site_oid === siteOid &&
           p.entity_type !== 'site' && p.entity_type !== 'site_location';
  });

  // ── Profil-Übersicht: group by entity_type + fk_profil ──
  const groups = {};
  for (const f of children) {
    const p = f.properties;
    const key = p.entity_type + ':' + p.fk_profil;
    if (!groups[key]) {
      groups[key] = {
        entity_type: p.entity_type, code: p.fk_profil,
        label: p.profil_label || p.subtype || ('Profil ' + p.fk_profil),
        count: 0, area: 0,
      };
    }
    groups[key].count += 1;
    groups[key].area += Number(p.area_m2) || 0;
  }
  const groupList = Object.values(groups).sort((a, b) => b.area - a.area);
  const totalArea = groupList.reduce((s, g) => s + g.area, 0);
  const nTree = children.filter(f => f.properties.entity_type === 'tree').length;
  const pkNum = (sp.pflegeklasse && String(sp.pflegeklasse).match(/\d+/))
    ? String(sp.pflegeklasse).match(/\d+/)[0] : '';

  let dateStr;
  try { dateStr = new Date().toLocaleDateString('de-CH'); } catch (_) { dateStr = ''; }

  // ── Document setup ──
  const doc = new ns.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12, STRIP_H = 18;

  const statParts = [
    'Fläche total: ' + fmtNum(totalArea, 1) + ' m²',
    'Features: ' + children.length,
    'Bäume: ' + nTree,
    'Profile: ' + groupList.length,
  ];
  const parcelLabel = sp.parzelle ? 'Parz. ' + sp.parzelle : ('Obj. ' + (sp.objektnummer || '–'));

  // ═══ PAGE 1 — Situationsplan (light basemap) + attribute table ═══
  let y = STRIP_H + 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(30);
  doc.text('Standort: ' + (sp.name || sp.site_name || '–'), M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  doc.text('Objekt-Nr. ' + (sp.objektnummer || '–'), W - M, y, { align: 'right' });

  // Clean key/value attribute table.
  const attrEndY = rptAttrTable(doc, sp, totalArea, children.length, nTree, groupList.length, y + 3, M, W, STRIP_H);

  // Situation map fills the rest of the page (light Positron basemap).
  const mapBox1 = { x: M, y: attrEndY + 4, w: W - 2 * M, h: (H - 12) - (attrEndY + 4) };
  await rptRenderMapPage(doc, site, children, groupList, sp, mapBox1,
    rptBasemapUrl('positron', 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'),
    { fillOpacity: 1, label: parcelLabel });

  // ═══ PAGE 2 — Luftbild (aerial basemap, photo-forward overlay) ═══
  doc.addPage();
  let ya = STRIP_H + 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(30);
  doc.text('Luftbild — ' + (sp.name || sp.site_name || '–'), M, ya);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(140);
  doc.text('Quelle: swisstopo (swissimage)', W - M, ya, { align: 'right' });
  ya += 4;
  doc.setDrawColor(210); doc.setLineWidth(0.3); doc.line(M, ya, W - M, ya);

  const mapBox2 = { x: M, y: ya + 3, w: W - 2 * M, h: (H - 12) - (ya + 3) };
  await rptRenderMapPage(doc, site, children, groupList, sp, mapBox2,
    rptBasemapUrl('swisstopo', 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json'),
    { fillOpacity: 0.55, label: parcelLabel });

  // ═══ PAGE 3 — Pflegeübersicht (combined table) ═══
  doc.addPage();
  let y2 = STRIP_H + 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30);
  doc.text('Pflegeübersicht — ' + (sp.name || sp.site_name || '–'), M, y2);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140);
  doc.text('Quelle: BBL Standard Grünflächenunterhalt 2020', W - M, y2, { align: 'right' });

  y2 += 5;
  doc.setFontSize(9); doc.setTextColor(70);
  doc.text(statParts.join('     ·     '), M, y2);
  y2 += 4;

  // Build body rows + parallel month metadata. Profile (colour + quantities)
  // is the row-spanned left cell; care measures fill the rows to its right.
  const cal_body = [];
  const rowMeta = [];
  if (!groupList.length) {
    cal_body.push([{ content: 'Keine Grünflächen erfasst', colSpan: 19, styles: { textColor: [140, 140, 140] } }]);
    rowMeta.push({ months: new Set(), guess: new Set() });
  }
  for (const g of groupList) {
    const cat = careProfile(g.entity_type, g.code);
    const tasks = (cat && cat.tasks && cat.tasks.length) ? cat.tasks : [RPT_FALLBACK_TASK];
    const codeText = (cat ? cat.code : rptDeriveCode(g.label)) +
                     (pkNum ? ' ' + pkNum : '') + (cat ? '' : ' *');
    const color = rptGroupColor(g.entity_type, g.code);

    tasks.forEach((t, j) => {
      const row = [];
      if (j === 0) {
        // Profile (colour + code + label), then Anz. and Fläche as their own
        // clean row-spanned columns.
        row.push({
          content: codeText + '\n' + g.label,
          rowSpan: tasks.length,
          styles: {
            fillColor: color, textColor: rptTextOn(color),
            fontStyle: 'bold', halign: 'left', valign: 'middle', fontSize: 7,
          },
        });
        row.push({
          content: String(g.count),
          rowSpan: tasks.length,
          styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' },
        });
        row.push({
          content: g.area > 0 ? fmtNum(g.area, 1) : '–',
          rowSpan: tasks.length,
          styles: { halign: 'right', valign: 'middle' },
        });
      }
      row.push(t.m || '');
      row.push(t.b || '–');
      row.push(t.h || '');
      row.push(t.mat ? t.mat + '°' : '–');
      for (let i = 0; i < 12; i++) row.push('');
      cal_body.push(row);
      rowMeta.push({ months: new Set(t.mon || []), guess: new Set(t.monG || []) });
    });
  }

  // Columns: Profil 34, Anz. 12, Fläche 22, Massnahme 44, Bemerkung 42,
  // Häuf 13, Material 18, 12 month cells × 7.3 = 87.6  → ≤ 273mm (W - 2M).
  const calCols = {
    0: { cellWidth: 34 },
    1: { cellWidth: 12, halign: 'center' },
    2: { cellWidth: 22, halign: 'right' },
    3: { cellWidth: 44, halign: 'left' },
    4: { cellWidth: 42, halign: 'left' },
    5: { cellWidth: 13, halign: 'center' },
    6: { cellWidth: 18 },
  };
  for (let c = 7; c <= 18; c++) calCols[c] = { cellWidth: 7.3, halign: 'center' };

  doc.autoTable({
    startY: y2,
    margin: { top: STRIP_H + 4, bottom: 16, left: M, right: M },
    head: [['Profil', 'Anz.', 'Fläche m²', 'Massnahme', 'Bemerkung', 'Häuf./J', 'Material', ...RPT_MONTH_LETTERS]],
    body: cal_body,
    styles: { fontSize: 7, cellPadding: 1.2, lineColor: [222, 222, 222], lineWidth: 0.1, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [60, 70, 80], textColor: 255, fontSize: 7, halign: 'center' },
    columnStyles: calCols,
    didParseCell: (data) => {
      // Paint month cells: solid if the Standard states it, light if estimated.
      if (data.section !== 'body' || data.column.index < 7) return;
      const meta = rowMeta[data.row.index];
      if (!meta) return;
      const mNum = data.column.index - 6;
      if (meta.months.has(mNum)) {
        data.cell.styles.fillColor = meta.guess.has(mNum) ? RPT_MONTH_GUESS : RPT_MONTH_SOLID;
      }
    },
  });

  // Legend under the combined table (new page if it would hit the footer).
  let legendY = doc.lastAutoTable.finalY + 6;
  if (legendY > H - 16) { doc.addPage(); legendY = STRIP_H + 10; }
  rptCalLegend(doc, M, legendY);

  // ── Per-page branding strip + footer (drawn last so totals are known) ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    rptStrip(doc, W, M, STRIP_H, dateStr);
    rptFooter(doc, W, H, M, i, pages);
  }

  const safe = String(sp.objektnummer || sp.name || siteOid).replace(/[^\w.-]+/g, '_');
  doc.save('Pflegebericht_' + safe + '.pdf');
}

// ── Render one map page: basemap capture + vector overlay ───────────────────
// styleUrl picks the basemap; opts = { fillOpacity, label }. On capture failure
// we fall back to a flat-grey vector map with our local projection.
async function rptRenderMapPage(doc, site, children, groupList, sp, box, styleUrl, opts) {
  const bbox = rptBBox([site].concat(children));
  let cap = null;
  try { cap = await rptCaptureBasemap(bbox, box, styleUrl); } catch (_) { cap = null; }
  if (cap && cap.dataUrl) {
    try { doc.addImage(cap.dataUrl, 'PNG', box.x, box.y, box.w, box.h); }
    catch (_) { try { cap.dispose(); } catch (__) {} cap = null; }
  }
  if (cap && cap.project) {
    rptDrawMapVector(doc, site, children, groupList, sp, box, cap.project, cap.mmPerMeter, true, opts);
    try { cap.dispose(); } catch (_) {}
  } else {
    const p = rptBuildProjection([site].concat(children), box);
    rptDrawMapVector(doc, site, children, groupList, sp, box, p.proj, p.mmPerMeter, false, opts);
  }
}

// ── Vector map overlay ──────────────────────────────────────────────────────
// `proj(lng,lat)→[mmX,mmY]` and `mmPerMeter` come either from MapLibre (when a
// basemap image is underneath, hasBasemap=true) or from our local fit.
function rptDrawMapVector(doc, site, children, groupList, sp, box, proj, mmPerMeter, hasBasemap, opts) {
  opts = opts || {};
  const fillOpacity = opts.fillOpacity == null ? 1 : opts.fillOpacity;

  // 1. Flat grey background only when there is no basemap behind it.
  if (!hasBasemap) {
    doc.setFillColor(RPT_MAP_BG[0], RPT_MAP_BG[1], RPT_MAP_BG[2]);
    doc.rect(box.x, box.y, box.w, box.h, 'F');
  }

  // 2. Filled area / canopy polygons (BBL profile colour), optionally
  //    semi-transparent so an aerial photo shows through.
  const setOpacity = rptOpacitySetter(doc);
  if (fillOpacity < 1) setOpacity(fillOpacity);
  const polyKids = children.filter(f =>
    f.geometry && (f.geometry.type === 'MultiPolygon' || f.geometry.type === 'Polygon') &&
    (f.properties.entity_type === 'area' || f.properties.entity_type === 'tree_canopy'));
  for (const f of polyKids) {
    const c = rptGroupColor(f.properties.entity_type, f.properties.fk_profil);
    doc.setFillColor(c[0], c[1], c[2]);
    rptDrawMultiPoly(doc, f.geometry, proj, 'F');
  }
  if (fillOpacity < 1) setOpacity(1);

  // 3. Point features: other points first (small grey), then trees on top.
  doc.setDrawColor(70, 70, 70); doc.setLineWidth(0.12);
  for (const f of children) {
    if (!f.geometry || f.geometry.type !== 'Point') continue;
    if (f.properties.entity_type !== 'point') continue;
    const [mx, my] = proj(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    const c = rptGroupColor('point', f.properties.fk_profil);
    doc.setFillColor(c[0], c[1], c[2]);
    doc.circle(mx, my, 0.7, 'F');
  }
  for (const f of children) {
    if (!f.geometry || f.geometry.type !== 'Point') continue;
    if (f.properties.entity_type !== 'tree') continue;
    const [mx, my] = proj(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    const c = rptGroupColor('tree', f.properties.fk_profil);
    doc.setFillColor(c[0], c[1], c[2]);
    doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.25);
    doc.circle(mx, my, 1.2, 'FD');
  }

  // 4. Parcel boundary in red, on top of the fills.
  doc.setDrawColor(RPT_PARCEL_RED[0], RPT_PARCEL_RED[1], RPT_PARCEL_RED[2]);
  doc.setLineWidth(0.8);
  rptDrawMultiPoly(doc, site.geometry, proj, 'S');

  // 5. Position marker + parcel-ID chip at the pole of inaccessibility.
  const ring = rptLargestRingProjected(site.geometry, proj);
  if (ring && ring.length > 2) {
    const [lx, ly] = rptPolylabel([ring]);
    rptPositionMarker(doc, lx, ly, opts.label || '');
  }

  // 6. Frame around the map.
  doc.setDrawColor(150); doc.setLineWidth(0.3);
  doc.rect(box.x, box.y, box.w, box.h, 'S');

  // 7. Legend + scale bar, bottom-left.
  const scaleBottom = box.y + box.h - 4;
  rptScaleBar(doc, box.x + 5, scaleBottom, mmPerMeter);
  rptMapLegend(doc, box.x + 5, scaleBottom - 13, groupList);
}

// Returns a function that sets fill opacity via jsPDF GState, or a no-op if the
// build lacks GState support.
function rptOpacitySetter(doc) {
  if (typeof doc.GState !== 'function' || typeof doc.setGState !== 'function') return () => {};
  return (o) => { try { doc.setGState(new doc.GState({ opacity: o })); } catch (_) {} };
}

// A clear location marker: a white-ringed red pin with a centre dot pointing at
// (x,y), and the parcel-ID in a rounded chip just above it.
function rptPositionMarker(doc, x, y, label) {
  const R = RPT_PARCEL_RED;
  const r = 2.4, hc = y - 5.5;           // pin head centre, tip at (x,y)
  // Drop stem (triangle from head to the tip).
  doc.setFillColor(R[0], R[1], R[2]);
  doc.triangle(x - 1.6, hc, x + 1.6, hc, x, y, 'F');
  // Head with white outline, then white centre dot.
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.7);
  doc.circle(x, hc, r, 'FD');
  doc.setFillColor(255, 255, 255);
  doc.circle(x, hc, 0.95, 'F');
  // Parcel-ID chip above the head.
  if (label) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    const tw = doc.getTextWidth(label);
    const padX = 2.2, chipH = 5.2, chipW = tw + padX * 2;
    const cx = x - chipW / 2, cyTop = hc - r - 1.4 - chipH;
    doc.setFillColor(255, 255, 255); doc.setDrawColor(R[0], R[1], R[2]); doc.setLineWidth(0.4);
    doc.roundedRect(cx, cyTop, chipW, chipH, 1, 1, 'FD');
    doc.setTextColor(30, 30, 30);
    doc.text(label, x, cyTop + chipH - 1.7, { align: 'center' });
  }
}

// Clean key/value attribute table (page 1). Returns the table's finalY.
function rptAttrTable(doc, sp, totalArea, nFeat, nTree, nProfile, startY, M, W, STRIP_H) {
  const LBL = { fillColor: [238, 240, 242], textColor: [70, 80, 90], fontStyle: 'bold' };
  const v = x => (x == null || x === '') ? '–' : String(x);
  const body = [
    [{ content: 'Adresse', styles: LBL }, { content: v(sp.adresse), colSpan: 3 }],
    [{ content: 'Parzelle', styles: LBL }, v(sp.parzelle), { content: 'Los', styles: LBL }, v(sp.lose)],
    [{ content: 'Pflegeklasse', styles: LBL }, v(sp.pflegeklasse), { content: 'Eigentümer', styles: LBL }, v(sp.eigentuemer)],
    [{ content: 'Pflegeverantwortung', styles: LBL }, v(sp.pflegeverantwortung), { content: 'Kontrolle', styles: LBL }, v(sp.kontrolle)],
    [{ content: 'Fläche total', styles: LBL }, fmtNum(totalArea, 1) + ' m²', { content: 'Features', styles: LBL }, String(nFeat)],
    [{ content: 'Bäume', styles: LBL }, String(nTree), { content: 'Profile', styles: LBL }, String(nProfile)],
  ];
  doc.autoTable({
    startY: startY,
    margin: { top: STRIP_H + 4, left: M, right: M },
    body: body,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: [220, 222, 225], lineWidth: 0.1, textColor: [40, 40, 40], valign: 'middle' },
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 99 }, 2: { cellWidth: 42 }, 3: { cellWidth: 94 } },
  });
  return doc.lastAutoTable.finalY;
}

// Basemap style URL by id from the app's BASEMAPS, with a hardcoded fallback.
function rptBasemapUrl(id, fallback) {
  try {
    const bm = (typeof BASEMAPS !== 'undefined') && BASEMAPS.find(b => b.id === id);
    return (bm && bm.url) || fallback;
  } catch (_) { return fallback; }
}

// Raw lng/lat bbox [minLng,minLat,maxLng,maxLat] over a set of features.
function rptBBox(features) {
  let minLng, minLat, maxLng, maxLat;
  const upd = (lng, lat) => {
    if (minLng == null || lng < minLng) minLng = lng;
    if (maxLng == null || lng > maxLng) maxLng = lng;
    if (minLat == null || lat < minLat) minLat = lat;
    if (maxLat == null || lat > maxLat) maxLat = lat;
  };
  const walk = (g) => {
    if (!g) return;
    if (g.type === 'Point') upd(g.coordinates[0], g.coordinates[1]);
    else if (g.type === 'Polygon') for (const r of g.coordinates) for (const c of r) upd(c[0], c[1]);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) for (const r of p) for (const c of r) upd(c[0], c[1]);
  };
  for (const f of features) walk(f.geometry);
  if (minLng == null) { minLng = 0; minLat = 0; maxLng = 1; maxLat = 1; }
  return [minLng, minLat, maxLng, maxLat];
}

// Render the light basemap for `bbox` into an offscreen MapLibre map and grab
// it as a PNG. Resolves { dataUrl, project(lng,lat)→[mmX,mmY], mmPerMeter,
// dispose() } or null on any failure (offline, tainted canvas, timeout). The
// caller MUST call dispose() once it has finished projecting overlay points.
function rptCaptureBasemap(bbox, box, styleUrl) {
  return new Promise((resolve) => {
    if (typeof maplibregl === 'undefined') { resolve(null); return; }
    const cssW = 1400, cssH = Math.max(1, Math.round(cssW * box.h / box.w));
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + cssW + 'px;height:' + cssH + 'px;';
    document.body.appendChild(div);

    let m = null, settled = false;
    const fail = () => {
      if (settled) return; settled = true;
      try { if (m) m.remove(); } catch (_) {}
      try { document.body.removeChild(div); } catch (_) {}
      resolve(null);
    };
    const timer = setTimeout(fail, 9000);

    try {
      m = new maplibregl.Map({
        container: div,
        style: styleUrl,
        interactive: false, attributionControl: false, fadeDuration: 0,
        preserveDrawingBuffer: true,
        bounds: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        fitBoundsOptions: { padding: Math.round(cssW * 0.06), animate: false },
      });
    } catch (_) { clearTimeout(timer); fail(); return; }

    m.on('error', () => {});  // swallow individual tile errors; idle still fires
    m.once('idle', () => {
      if (settled) return;
      clearTimeout(timer);
      try {
        const dataUrl = m.getCanvas().toDataURL('image/png');
        const sMM = box.w / cssW;  // css-px → mm (uniform: cssH matches box aspect)
        const project = (lng, lat) => {
          const p = m.project([lng, lat]);
          return [box.x + p.x * sMM, box.y + p.y * sMM];
        };
        const midLat = (bbox[1] + bbox[3]) / 2;
        const a = m.project([bbox[0], midLat]);
        const b = m.project([bbox[0], midLat + 0.001]);  // 0.001° lat ≈ 111.32 m
        const mmPerMeter = (Math.hypot(b.x - a.x, b.y - a.y) / 111.32) * sMM;
        const dispose = () => {
          if (settled) return; settled = true;
          try { m.remove(); } catch (_) {}
          try { document.body.removeChild(div); } catch (_) {}
        };
        resolve({ dataUrl, project, mmPerMeter, dispose });
      } catch (_) { fail(); }
    });
  });
}

// Build a local equirectangular projection (lng·cos φ, lat) fitted to `box`,
// preserving aspect ratio. Returns { proj(lng,lat)→[mmX,mmY], mmPerMeter }.
function rptBuildProjection(features, box) {
  let minLng, minLat, maxLng, maxLat;
  const upd = (lng, lat) => {
    if (minLng == null || lng < minLng) minLng = lng;
    if (maxLng == null || lng > maxLng) maxLng = lng;
    if (minLat == null || lat < minLat) minLat = lat;
    if (maxLat == null || lat > maxLat) maxLat = lat;
  };
  const walk = (g) => {
    if (!g) return;
    if (g.type === 'Point') upd(g.coordinates[0], g.coordinates[1]);
    else if (g.type === 'Polygon') for (const r of g.coordinates) for (const c of r) upd(c[0], c[1]);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) for (const r of p) for (const c of r) upd(c[0], c[1]);
  };
  for (const f of features) walk(f.geometry);
  if (minLng == null) { minLng = 0; maxLng = 1; minLat = 0; maxLat = 1; }

  const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180) || 1;
  const px = lng => lng * k;
  const pminX = px(minLng), pmaxX = px(maxLng), pminY = minLat, pmaxY = maxLat;
  const bw = (pmaxX - pminX) || 1e-9, bh = (pmaxY - pminY) || 1e-9;
  const pad = 0.06;
  const s = Math.min(box.w * (1 - 2 * pad) / bw, box.h * (1 - 2 * pad) / bh);
  const cx = (pminX + pmaxX) / 2, cy = (pminY + pmaxY) / 2;

  const proj = (lng, lat) => [
    box.x + box.w / 2 + (px(lng) - cx) * s,
    box.y + box.h / 2 - (lat - cy) * s,   // flip Y (PDF y grows downward)
  ];
  return { proj, mmPerMeter: s / 111320 };
}

// Draw every outer ring of a (Multi)Polygon with the given style ('F'/'S'/'FD').
function rptDrawMultiPoly(doc, geom, proj, style) {
  if (!geom) return;
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates
    : geom.type === 'Polygon' ? [geom.coordinates] : [];
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;
    rptPolyPath(doc, ring.map(c => proj(c[0], c[1])), style);
  }
}

// Stroke/fill a closed polygon from absolute mm points via jsPDF lines().
function rptPolyPath(doc, pts, style) {
  if (pts.length < 2) return;
  const deltas = [];
  for (let i = 1; i < pts.length; i++) deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], style, true);
}

// Largest polygon's outer ring of a (Multi)Polygon, projected to mm.
function rptLargestRingProjected(geom, proj) {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates
    : geom.type === 'Polygon' ? [geom.coordinates] : [];
  let best = null, bestArea = -1;
  for (const poly of polys) {
    const pts = poly[0].map(c => proj(c[0], c[1]));
    const a = Math.abs(rptRingArea(pts));
    if (a > bestArea) { bestArea = a; best = pts; }
  }
  return best;
}

function rptRingArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  }
  return a / 2;
}

// ── Pole of inaccessibility (compact polylabel, mapbox/polylabel algorithm) ──
// `polygon` = [outerRing, ...holes]; rings are arrays of [x,y]. Returns [x,y].
function rptPolylabel(polygon) {
  let minX, minY, maxX, maxY;
  for (const p of polygon[0]) {
    if (minX == null || p[0] < minX) minX = p[0];
    if (minY == null || p[1] < minY) minY = p[1];
    if (maxX == null || p[0] > maxX) maxX = p[0];
    if (maxY == null || p[1] > maxY) maxY = p[1];
  }
  const width = maxX - minX, height = maxY - minY;
  const cellSize = Math.min(width, height);
  if (cellSize === 0) return [minX, minY];
  const precision = Math.max(width, height) / 200;

  let h = cellSize / 2;
  const queue = [];
  for (let x = minX; x < maxX; x += cellSize)
    for (let y = minY; y < maxY; y += cellSize)
      queue.push(rptCell(x + h, y + h, h, polygon));

  let best = rptCell(minX + width / 2, minY + height / 2, 0, polygon);
  let guard = 0;
  while (queue.length && guard++ < 20000) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].max > queue[bi].max) bi = i;
    const cell = queue.splice(bi, 1)[0];
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    h = cell.h / 2;
    queue.push(rptCell(cell.x - h, cell.y - h, h, polygon));
    queue.push(rptCell(cell.x + h, cell.y - h, h, polygon));
    queue.push(rptCell(cell.x - h, cell.y + h, h, polygon));
    queue.push(rptCell(cell.x + h, cell.y + h, h, polygon));
  }
  return [best.x, best.y];
}

function rptCell(x, y, h, polygon) {
  const d = rptPointToPolyDist(x, y, polygon);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

function rptPointToPolyDist(x, y, polygon) {
  let inside = false, minSq = Infinity;
  for (const ring of polygon) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      minSq = Math.min(minSq, rptSegDistSq(x, y, a, b));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minSq);
}

function rptSegDistSq(px, py, a, b) {
  let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}

// ── Map overlays ────────────────────────────────────────────────────────────
// Metric scale bar (two-segment), drawn from baseline `yBottom` upward.
function rptScaleBar(doc, x, yBottom, mmPerMeter) {
  if (!(mmPerMeter > 0)) return;
  const targetMM = 36;
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  let meters = nice[0];
  for (const n of nice) if (n * mmPerMeter <= targetMM) meters = n;
  const barMM = meters * mmPerMeter;
  const half = barMM / 2;

  doc.setFillColor(255, 255, 255); doc.setDrawColor(120); doc.setLineWidth(0.2);
  doc.rect(x - 1.5, yBottom - 8, barMM + 12, 9, 'FD');

  const barY = yBottom - 3;
  doc.setFillColor(40, 40, 40); doc.rect(x, barY, half, 1.6, 'F');
  doc.setFillColor(255, 255, 255); doc.rect(x + half, barY, half, 1.6, 'F');
  doc.setDrawColor(40); doc.setLineWidth(0.2); doc.rect(x, barY, barMM, 1.6, 'S');

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(40);
  doc.text('0', x, barY - 0.8, { align: 'center' });
  doc.text(meters + ' m', x + barMM, barY - 0.8, { align: 'center' });
}

// Colour legend (bottom-left), anchored by its bottom-left corner.
function rptMapLegend(doc, x, yBottom, groupList) {
  const items = groupList.slice(0, 14);
  if (!items.length) return;
  const rowH = 4.2, sq = 3, pad = 2;
  const labels = items.map(g => g.label.length > 30 ? g.label.slice(0, 29) + '…' : g.label);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  let textW = 0;
  for (const l of labels) textW = Math.max(textW, doc.getTextWidth(l));
  const boxW = pad + sq + 1.5 + textW + pad;
  const boxH = pad + items.length * rowH + pad - (rowH - sq);
  const top = yBottom - boxH;

  doc.setFillColor(255, 255, 255); doc.setDrawColor(150); doc.setLineWidth(0.2);
  doc.rect(x, top, boxW, boxH, 'FD');

  let cy = top + pad + sq;
  for (let i = 0; i < items.length; i++) {
    const c = rptGroupColor(items[i].entity_type, items[i].code);
    doc.setFillColor(c[0], c[1], c[2]); doc.setDrawColor(120); doc.setLineWidth(0.1);
    doc.rect(x + pad, cy - sq + 0.5, sq, sq, 'FD');
    doc.setTextColor(60);
    doc.text(labels[i], x + pad + sq + 1.5, cy);
    cy += rowH;
  }
}

// ── Drawing helpers ────────────────────────────────────────────────────────
function rptStrip(doc, W, M, STRIP_H, dateStr) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
  doc.text('Eidg. Finanzdepartement EFD · BBL · Bundesgärtnerei', M, 8);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(40);
  doc.text('PFLEGEBERICHT', W - M, 7, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
  doc.text('Grünflächen Inventar · ' + dateStr, W - M, 12, { align: 'right' });
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(M, STRIP_H, W - M, STRIP_H);
}

function rptFooter(doc, W, H, M, page, pages) {
  const fy = H - 8;
  doc.setDrawColor(225); doc.setLineWidth(0.3); doc.line(M, fy - 3, W - M, fy - 3);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140);
  doc.text('Prototyp – nur zur Demonstration. Fiktive Daten. · Standard: BBL/Bundesgärtnerei 2020', M, fy);
  doc.text('Seite ' + page + ' / ' + pages, W - M, fy, { align: 'right' });
}

// Legend for the combined table (page 2).
function rptCalLegend(doc, x, y) {
  const sq = 3;
  let cx = x;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
  doc.setFillColor(RPT_MONTH_SOLID[0], RPT_MONTH_SOLID[1], RPT_MONTH_SOLID[2]);
  doc.rect(cx, y - sq + 0.5, sq, sq, 'F'); cx += sq + 1.5;
  doc.text('im Standard belegt', cx, y); cx += doc.getTextWidth('im Standard belegt') + 6;
  doc.setFillColor(RPT_MONTH_GUESS[0], RPT_MONTH_GUESS[1], RPT_MONTH_GUESS[2]);
  doc.rect(cx, y - sq + 0.5, sq, sq, 'F'); cx += sq + 1.5;
  doc.text('Monat geschätzt', cx, y); cx += doc.getTextWidth('Monat geschätzt') + 6;
  doc.text('°  Material geschätzt (nicht im Standard)', cx, y);
  cx += doc.getTextWidth('°  Material geschätzt (nicht im Standard)') + 6;
  doc.text('*  Profil ohne Standard-Kapitel (Pflege geschätzt)', cx, y);
}

// ── Delegated click handler for the popup's ⬇ PDF button ───────────────────
// The popup HTML is injected via setHTML(), so we can't bind a closure to the
// button at render time — listen on document and match the button class.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest && e.target.closest('.pu-report-btn');
  if (!btn) return;
  e.stopPropagation();
  const oid = Number(btn.dataset.oid);
  if (isNaN(oid) || btn.dataset.busy === '1') return;

  // Generation is async (basemap capture); guard against double-clicks and
  // give visual feedback while it runs.
  btn.dataset.busy = '1';
  const prev = btn.textContent;
  btn.textContent = '…';
  btn.style.pointerEvents = 'none';
  try {
    await buildStandortReport(oid);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Bericht konnte nicht erstellt werden', 'error');
  } finally {
    btn.dataset.busy = '';
    btn.textContent = prev;
    btn.style.pointerEvents = '';
  }
});

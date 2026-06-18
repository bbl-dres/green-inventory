// ═══════════════════════════════════════════════════════════════════════════
// REPORT — per-Standort Pflegebericht (PDF, on demand)
// Triggered by the ⬇ PDF button in a Standort popup (see popupHTML in map.js).
// Renders a landscape A4 PDF with:
//   1. a Standort header block (from inventory data),
//   2. a Profil-Übersicht (counts + areas per care profile, from data),
//   3. a Pflegekalender (per profile, from the BBL Standard catalog in
//      config.js — months/material partly estimated, see CARE_CATALOG_*).
// Depends on: config.js (careProfile, CARE_CATALOG_*, AREA/POINT_PROFILE_STYLE,
//   fmtNum), map.js (geojsonData, showToast), jsPDF + jspdf-autotable (CDN).
// ═══════════════════════════════════════════════════════════════════════════

// Month-cell fills: solid = stated in the Standard, light = estimated month.
const RPT_MONTH_SOLID = [0, 94, 168];     // --primary
const RPT_MONTH_GUESS = [180, 205, 230];  // light primary tint
const RPT_MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

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
function buildStandortReport(siteOid) {
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

  // ── Standort header block (page 1) ──
  let y = STRIP_H + 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(30);
  doc.text('Standort: ' + (sp.name || sp.site_name || '–'), M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  doc.text('Objekt-Nr. ' + (sp.objektnummer || '–'), W - M, y, { align: 'right' });

  y += 6;
  doc.setFontSize(9); doc.setTextColor(70);
  const metaParts = [
    'Adresse: ' + (sp.adresse || '–'),
    'Los: ' + (sp.lose || '–'),
    'Pflegeklasse: ' + (sp.pflegeklasse || '–'),
    'Eigentümer: ' + (sp.eigentuemer || '–'),
  ];
  doc.text(metaParts.join('     '), M, y);

  y += 5;
  const statParts = [
    'Fläche total: ' + fmtNum(totalArea, 1) + ' m²',
    'Features: ' + children.length,
    'Bäume: ' + nTree,
    'Profile: ' + groupList.length,
  ];
  doc.text(statParts.join('     ·     '), M, y);

  y += 4;
  doc.setDrawColor(210); doc.setLineWidth(0.3); doc.line(M, y, W - M, y);

  // ── Section 1: Profil-Übersicht ──
  y += 7;
  rptSectionTitle(doc, M, y, '1 · Profil-Übersicht', 'aus Inventardaten', W);
  y += 3;

  const ov_body = groupList.length ? groupList.map(g => [
    { content: '', styles: { fillColor: rptGroupColor(g.entity_type, g.code) } },
    g.label,
    g.count,
    g.area > 0 ? fmtNum(g.area, 1) : '–',
    (g.area > 0 && totalArea > 0) ? (100 * g.area / totalArea).toFixed(1) : '–',
  ]) : [[{ content: 'Keine Grünflächen erfasst', colSpan: 5, styles: { textColor: [140, 140, 140] } }]];

  doc.autoTable({
    startY: y,
    margin: { top: STRIP_H + 4, bottom: 14, left: M, right: M },
    head: [['', 'Profil', 'Anz.', 'Fläche m²', '%']],
    body: ov_body,
    styles: { fontSize: 8, cellPadding: 1.4, lineColor: [225, 225, 225], lineWidth: 0.1, valign: 'middle' },
    headStyles: { fillColor: [60, 70, 80], textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 78 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
    },
  });

  // ── Section 2: Pflegekalender ──
  let y2 = doc.lastAutoTable.finalY + 8;
  rptSectionTitle(doc, M, y2, '2 · Pflegekalender',
    'Quelle: BBL Standard Grünflächenunterhalt 2020', W);
  y2 += 3;

  // Build body rows + parallel month metadata.
  const cal_body = [];
  const rowMeta = [];
  if (!groupList.length) {
    cal_body.push([{ content: 'Keine Grünflächen erfasst', colSpan: 17, styles: { textColor: [140, 140, 140] } }]);
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
        row.push({
          content: codeText + '\n' + g.label,
          rowSpan: tasks.length,
          styles: {
            fillColor: color, textColor: rptTextOn(color),
            fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 7,
          },
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

  // Month columns are widths 7.5mm, centred (indices 5..16).
  const calCols = {
    0: { cellWidth: 20 },
    1: { cellWidth: 54, halign: 'left' },
    2: { cellWidth: 56, halign: 'left' },
    3: { cellWidth: 15, halign: 'center' },
    4: { cellWidth: 22 },
  };
  for (let c = 5; c <= 16; c++) calCols[c] = { cellWidth: 7.5, halign: 'center' };

  doc.autoTable({
    startY: y2,
    margin: { top: STRIP_H + 4, bottom: 14, left: M, right: M },
    head: [['Code', 'Massnahme', 'Bemerkung', 'Häuf./J', 'Material', ...RPT_MONTH_LETTERS]],
    body: cal_body,
    styles: { fontSize: 7, cellPadding: 1.2, lineColor: [222, 222, 222], lineWidth: 0.1, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [60, 70, 80], textColor: 255, fontSize: 7, halign: 'center' },
    columnStyles: calCols,
    didParseCell: (data) => {
      // Paint month cells: solid if the Standard states it, light if estimated.
      if (data.section !== 'body' || data.column.index < 5) return;
      const meta = rowMeta[data.row.index];
      if (!meta) return;
      const mNum = data.column.index - 4;
      if (meta.months.has(mNum)) {
        data.cell.styles.fillColor = meta.guess.has(mNum) ? RPT_MONTH_GUESS : RPT_MONTH_SOLID;
      }
    },
  });

  // ── Legend under the calendar (push to a new page if it would collide
  //    with the footer) ──
  let legendY = doc.lastAutoTable.finalY + 6;
  if (legendY > H - 16) { doc.addPage(); legendY = STRIP_H + 10; }
  rptLegend(doc, M, legendY);

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

// ── Drawing helpers ────────────────────────────────────────────────────────
function rptSectionTitle(doc, x, y, title, note, W) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40);
  doc.text(title, x, y);
  if (note) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140);
    doc.text(note, W - 12, y, { align: 'right' });
  }
}

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

function rptLegend(doc, x, y) {
  const sq = 3;
  let cx = x;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
  // solid
  doc.setFillColor(RPT_MONTH_SOLID[0], RPT_MONTH_SOLID[1], RPT_MONTH_SOLID[2]);
  doc.rect(cx, y - sq + 0.5, sq, sq, 'F'); cx += sq + 1.5;
  doc.text('im Standard belegt', cx, y); cx += doc.getTextWidth('im Standard belegt') + 6;
  // guessed
  doc.setFillColor(RPT_MONTH_GUESS[0], RPT_MONTH_GUESS[1], RPT_MONTH_GUESS[2]);
  doc.rect(cx, y - sq + 0.5, sq, sq, 'F'); cx += sq + 1.5;
  doc.text('Monat geschätzt', cx, y); cx += doc.getTextWidth('Monat geschätzt') + 6;
  // material / fallback notes
  doc.text('°  Material geschätzt (nicht im Standard)', cx, y);
  cx += doc.getTextWidth('°  Material geschätzt (nicht im Standard)') + 6;
  doc.text('*  Profil ohne Standard-Kapitel (Pflege geschätzt)', cx, y);
}

// ── Delegated click handler for the popup's ⬇ PDF button ───────────────────
// The popup HTML is injected via setHTML(), so we can't bind a closure to the
// button at render time — listen on document and match the button class.
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('.pu-report-btn');
  if (!btn) return;
  e.stopPropagation();
  const oid = Number(btn.dataset.oid);
  if (!isNaN(oid)) buildStandortReport(oid);
});

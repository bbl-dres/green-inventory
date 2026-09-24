// Tabulate key metrics per device from metrics.json
const m = require(require('path').resolve(process.argv[2] || 'out/metrics.json'));
const rows = [];
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('device', 10), pad('vp', 13), pad('hdrOvf', 6), pad('srchW', 6), pad('mapInit', 9), pad('mapTbl', 9), pad('tblH', 5), pad('barOvf', 6), pad('clipped', 22), pad('cols', 6), pad('tapPop%', 7), pad('legend', 12), pad('filter', 12), pad('t<24', 5), pad('t<44', 5), pad('txt<12', 6), pad('lowCR', 5), 'floatOverlaps');
for (const [id, r] of Object.entries(m)) {
  const s = r.states, d = r.device;
  const i = s.initial, t = s.table, tp = s.tap, f = s.filter;
  const lg = s.legend.layout.legend, fl = f.layout.filter;
  const tgt = (dev) => dev.touch ? [f.targets.under24, f.targets.under44] : [f.targets.under24, '-'];
  const [u24, u44] = tgt(d);
  console.log(pad(id, 10), pad(`${d.w}x${d.h}`, 13), pad(i.header.overflow, 6), pad(i.header.searchInputW, 6),
    pad(`${i.layout.map.w}x${i.layout.map.h}`, 9), pad(`${t.layout.map.h}`, 9), pad(t.layout.table.h, 5),
    pad(t.actionBar ? t.actionBar.overflow : '-', 6), pad(t.actionBar ? t.actionBar.clippedChildren.join(',').slice(0, 21) : '-', 22),
    pad(t.tableBody ? t.tableBody.fullyVisibleCols + '/' + t.tableBody.cols : '-', 6),
    pad(tp.popup ? tp.popup.visiblePct : 'none', 7),
    pad((lg.shown ? (lg.overlay ? 'ovl ' : 'dock ') + lg.w : 'hidden'), 12), pad((fl.shown ? (fl.overlay ? 'ovl ' : 'dock ') + fl.w : 'hidden'), 12),
    pad(u24, 5), pad(u44, 5), pad(i.text.under12, 6), pad(i.text.lowContrastCount, 5), [...new Set([...i.floatOverlaps, ...t.floatOverlaps])].join('; '));
}

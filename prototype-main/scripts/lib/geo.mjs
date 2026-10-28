// Planar geometry helpers shared by the data pipeline (fetch_parcels.mjs,
// split_entities.mjs).  Node ESM, no dependencies.
//
// Coordinates are GeoJSON [lon, lat] in WGS84 unless a name says LV95.  Areas
// and lengths are computed in LV95 metres after a closed-form swisstopo
// transform (sub-metre inside Switzerland), which is exact enough for the
// relative figures we need (areas to 0.1 %, lengths to a few centimetres).

// WGS84 -> LV95 (CH1903+), swisstopo approximation formulas.
export function wgs84ToLv95(lon, lat) {
  const phi = (lat * 3600 - 169028.66) / 10000;
  const lam = (lon * 3600 - 26782.5) / 10000;
  const E = 2600072.37 + 211455.93 * lam - 10938.51 * lam * phi
    - 0.36 * lam * phi * phi - 44.54 * lam ** 3;
  const N = 1200147.07 + 308807.95 * phi + 3745.25 * lam ** 2
    + 76.63 * phi ** 2 - 194.56 * lam ** 2 * phi + 119.79 * phi ** 3;
  return [E, N];
}

// LV95 -> WGS84, the inverse approximation.
export function lv95ToWgs84(E, N) {
  const yp = (E - 2600000) / 1000000;
  const xp = (N - 1200000) / 1000000;
  const lamSec = 2.6779094 + 4.728982 * yp + 0.791484 * yp * xp
    + 0.1306 * yp * xp * xp - 0.0436 * yp ** 3;
  const phiSec = 16.9023892 + 3.238272 * xp - 0.270978 * yp * yp
    - 0.002528 * xp * xp - 0.0447 * yp * yp * xp - 0.0140 * xp ** 3;
  return [lamSec * 100 / 36, phiSec * 100 / 36];
}

// ── Bounding boxes [minX, minY, maxX, maxY] ────────────────────────────────
export function emptyBbox() { return [Infinity, Infinity, -Infinity, -Infinity]; }

export function extendBbox(b, coords) {
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < b[0]) b[0] = c[0]; if (c[0] > b[2]) b[2] = c[0];
      if (c[1] < b[1]) b[1] = c[1]; if (c[1] > b[3]) b[3] = c[1];
    } else for (const x of c) walk(x);
  };
  if (coords) walk(coords);
  return b;
}

export function bboxOfGeometry(geom) {
  return extendBbox(emptyBbox(), geom && geom.coordinates);
}

export function bboxIntersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function bboxContains(b, pt) {
  return pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3];
}

export function bufferBbox(b, d) { return [b[0] - d, b[1] - d, b[2] + d, b[3] + d]; }

// ── Point in polygon (ray casting; boundary points count as inside) ────────
export function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// polygonCoords = [outerRing, ...holes]
export function pointInPolygonCoords(pt, polygonCoords) {
  if (!pointInRing(pt, polygonCoords[0])) return false;
  for (let k = 1; k < polygonCoords.length; k++) if (pointInRing(pt, polygonCoords[k])) return false;
  return true;
}

export function pointInGeometry(pt, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') return pointInPolygonCoords(pt, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(p => pointInPolygonCoords(pt, p));
  return false;
}

// ── Interior point of a (Multi)Polygon ─────────────────────────────────────
// The centroid of the largest outer ring when it lies inside the geometry,
// otherwise the pole of inaccessibility (mapbox/polylabel, compact port).
export function interiorPoint(geom) {
  if (!geom) return null;
  if (geom.type === 'Point') return geom.coordinates;
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates
    : geom.type === 'Polygon' ? [geom.coordinates] : [];
  if (!polys.length) return null;
  let best = null, bestArea = -1;
  for (const p of polys) {
    const a = Math.abs(ringSignedArea(p[0]));
    if (a > bestArea) { bestArea = a; best = p; }
  }
  const c = ringCentroid(best[0]);
  if (c && pointInPolygonCoords(c, best)) return c;
  return polylabel(best);
}

export function ringSignedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return a / 2;
}

export function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-18) return ring[0] ? [ring[0][0], ring[0][1]] : null;
  return [cx / (3 * a), cy / (3 * a)];
}

// Pole of inaccessibility of a (Multi)Polygon: the point of its largest part
// farthest from any edge — the label anchor (unlike a centroid it is always
// inside, and unlike MapLibre's per-tile placement it is computed once).
export function poleOfInaccessibility(geom) {
  if (!geom) return null;
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates
    : geom.type === 'Polygon' ? [geom.coordinates] : [];
  if (!polys.length) return null;
  let best = null, bestArea = -1;
  for (const p of polys) {
    const a = Math.abs(ringSignedArea(p[0]));
    if (a > bestArea) { bestArea = a; best = p; }
  }
  return polylabel(best);
}

function polylabel(polygon) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon[0]) {
    if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
  }
  const width = maxX - minX, height = maxY - minY;
  const cellSize = Math.min(width, height);
  if (cellSize === 0) return [minX, minY];
  const precision = Math.max(width, height) / 200;
  const cell = (x, y, h) => { const d = pointToPolyDist(x, y, polygon); return { x, y, h, d, max: d + h * Math.SQRT2 }; };
  let h = cellSize / 2;
  const queue = [];
  for (let x = minX; x < maxX; x += cellSize) for (let y = minY; y < maxY; y += cellSize) queue.push(cell(x + h, y + h, h));
  let best = cell(minX + width / 2, minY + height / 2, 0);
  let guard = 0;
  while (queue.length && guard++ < 20000) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].max > queue[bi].max) bi = i;
    const c = queue.splice(bi, 1)[0];
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2;
    queue.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
  }
  return [best.x, best.y];
}

function pointToPolyDist(x, y, polygon) {
  let inside = false, minSq = Infinity;
  for (const ring of polygon) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      minSq = Math.min(minSq, segDistSq(x, y, a, b));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minSq);
}

function segDistSq(px, py, a, b) {
  let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}

// ── Metric measures (LV95) ─────────────────────────────────────────────────
const toLv = (ring) => ring.map(c => wgs84ToLv95(c[0], c[1]));

export function polygonAreaM2(geom) {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates
    : geom.type === 'Polygon' ? [geom.coordinates] : [];
  let a = 0;
  for (const p of polys) {
    a += Math.abs(ringSignedArea(toLv(p[0])));
    for (let k = 1; k < p.length; k++) a -= Math.abs(ringSignedArea(toLv(p[k])));
  }
  return a;
}

// Outer-ring lengths only (holes excluded), in metres.
export function polygonPerimeterM(geom) {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates
    : geom.type === 'Polygon' ? [geom.coordinates] : [];
  let len = 0;
  for (const p of polys) {
    const r = toLv(p[0]);
    for (let i = 1; i < r.length; i++) len += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
  }
  return len;
}

// Visit every vertex of a geometry.
export function forEachVertex(geom, fn) {
  const walk = (c) => { if (typeof c[0] === 'number') fn(c); else for (const x of c) walk(x); };
  if (geom && geom.coordinates) walk(geom.coordinates);
}

// ── Spatial index: parcels by bbox, point -> containing parcel ─────────────
export class PolygonIndex {
  constructor(features) {
    this.items = features.map(f => ({ f, bbox: bboxOfGeometry(f.geometry) }));
  }
  // First feature whose geometry contains the point (bbox pre-filter).
  find(pt) {
    for (const it of this.items) {
      if (bboxContains(it.bbox, pt) && pointInGeometry(pt, it.f.geometry)) return it.f;
    }
    return null;
  }
}

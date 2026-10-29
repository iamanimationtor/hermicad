import type { Rect, Vec2 } from "./types";

export const EPS = 1e-9;

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polygonArea(poly: Vec2[]): number {
  return Math.abs(signedArea(poly));
}

export function perimeter(poly: Vec2[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) p += dist(poly[i], poly[(i + 1) % poly.length]);
  return p;
}

export function ensureCCW(poly: Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

export function centroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    const x = poly.reduce((s, p) => s + p.x, 0) / Math.max(1, poly.length);
    const y = poly.reduce((s, p) => s + p.y, 0) / Math.max(1, poly.length);
    return { x, y };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function bbox(pts: Vec2[]): Rect {
  if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export const rectArea = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h);
export const rectRight = (r: Rect): number => r.x + r.w;
export const rectTop = (r: Rect): number => r.y + r.h;

export function rectToPoly(r: Rect): Vec2[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export function rectContains(r: Rect, p: Vec2, tol = 1e-6): boolean {
  return (
    p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol
  );
}

export function rectOverlapArea(a: Rect, b: Rect): number {
  const w = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  const h = Math.min(rectTop(a), rectTop(b)) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersect =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointOnSegment(p: Vec2, a: Vec2, b: Vec2, tol = 1e-6): boolean {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const c = Math.abs(cross(ab, ap));
  const len = Math.hypot(ab.x, ab.y);
  if (len < EPS) return false;
  if (c / len > tol) return false;
  const d = dot(ap, ab) / (len * len);
  return d >= -tol && d <= 1 + tol;
}

export function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d1 = cross(sub(a2, a1), sub(b1, a1));
  const d2 = cross(sub(a2, a1), sub(b2, a1));
  const d3 = cross(sub(b2, b1), sub(a1, b1));
  const d4 = cross(sub(b2, b1), sub(a2, b1));
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/**
 * Simple-polygon test: no self intersections. Area is deliberately NOT checked
 * here — a 0.4 m² parcel is geometrically simple, it is simply too small for
 * the programme. Conflating the two used to reject valid narrow test parcels.
 */
export function polygonIsSimple(poly: Vec2[]): boolean {
  if (poly.length < 3) return false;
  for (let i = 0; i < poly.length; i++) {
    const a1 = poly[i];
    const a2 = poly[(i + 1) % poly.length];
    for (let j = i + 2; j < poly.length; j++) {
      if (i === j) continue;
      const b1 = poly[j];
      const b2 = poly[(j + 1) % poly.length];
      if ((i === 0 && j === poly.length - 1) || j === i + 1) continue;
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/**
 * Sutherland–Hodgman clip of a subject polygon against a *convex* clip polygon.
 * The subject may be non-convex (every room clipped against a wing rectangle).
 */
export function clipPolygon(subject: Vec2[], clip: Vec2[]): Vec2[] {
  let output = subject;
  const ccwClip = ensureCCW(clip);
  for (let i = 0; i < ccwClip.length; i++) {
    const a = ccwClip[i];
    const b = ccwClip[(i + 1) % ccwClip.length];
    const input = output;
    output = [];
    if (input.length === 0) return [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const curInside = cross(sub(b, a), sub(cur, a)) >= -1e-9;
      const prevInside = cross(sub(b, a), sub(prev, a)) >= -1e-9;
      if (curInside) {
        if (!prevInside) output.push(lineIntersection(prev, cur, a, b));
        output.push(cur);
      } else if (prevInside) {
        output.push(lineIntersection(prev, cur, a, b));
      }
    }
  }
  return dedupe(output);
}

function lineIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 {
  const d = cross(sub(p2, p1), sub(p4, p3));
  if (Math.abs(d) < EPS) return p2;
  const t = cross(sub(p3, p1), sub(p4, p3)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

export function dedupe(poly: Vec2[], tol = 1e-6): Vec2[] {
  const out: Vec2[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > tol) out.push(p);
  }
  if (out.length > 1 && dist(out[0], out[out.length - 1]) < tol) out.pop();
  return out;
}

export function clipRectByPolygon(poly: Vec2[], r: Rect): Vec2[] {
  return clipPolygon(rectToPoly(r), poly);
}

export function polygonInsideRect(poly: Vec2[], r: Rect, tol = 1e-6): boolean {
  return poly.every((p) => rectContains(r, p, tol));
}

/** Edge normal (outward for CCW polygons). */
function edgeOutwardNormal(a: Vec2, b: Vec2): Vec2 {
  const d = sub(b, a);
  const len = Math.hypot(d.x, d.y) || 1;
  return { x: d.y / len, y: -d.x / len };
}

/**
 * Directional setback: each boundary edge is pushed inward by the setback that
 * applies to the cardinal direction of its outward normal (north-aligned frame).
 * Implemented as half-plane clipping, therefore the result is the *convex*
 * buildable region. This is deliberately conservative: it can never over-claim
 * buildable area on a concave parcel. Documented as an engine assumption.
 */
export function applySetbacks(
  boundary: Vec2[],
  setbacks: { north: number; east: number; south: number; west: number },
): Vec2[] {
  const ccw = ensureCCW(boundary);
  let result: Vec2[] = ccw;
  for (let i = 0; i < ccw.length; i++) {
    const a = ccw[i];
    const b = ccw[(i + 1) % ccw.length];
    const n = edgeOutwardNormal(a, b);
    const angle = (Math.atan2(n.y, n.x) * 180) / Math.PI;
    let sb: number;
    if (angle >= -45 && angle < 45) sb = setbacks.east;
    else if (angle >= 45 && angle < 135) sb = setbacks.north;
    else if (angle >= -135 && angle < -45) sb = setbacks.south;
    else sb = setbacks.west;
    // `n` is the outward normal (CCW polygon), so the setback is applied by
    // moving the edge in the *opposite* direction. Keeping the inward side of
    // the translated edge is therefore the buildable half-plane.
    const aIn = { x: a.x - n.x * sb, y: a.y - n.y * sb };
    const bIn = { x: b.x - n.x * sb, y: b.y - n.y * sb };
    const clipped: Vec2[] = [];
    for (let j = 0; j < result.length; j++) {
      const cur = result[j];
      const prev = result[(j + result.length - 1) % result.length];
      const curInside = cross(sub(bIn, aIn), sub(cur, aIn)) >= -1e-9;
      const prevInside = cross(sub(bIn, aIn), sub(prev, aIn)) >= -1e-9;
      if (curInside) {
        if (!prevInside) clipped.push(lineIntersection(prev, cur, aIn, bIn));
        clipped.push(cur);
      } else if (prevInside) {
        clipped.push(lineIntersection(prev, cur, aIn, bIn));
      }
    }
    result = dedupe(clipped);
    if (result.length < 3) return [];
  }
  // Relative tolerance: a narrow but valid strip must survive.
  const original = polygonArea(ccw);
  return polygonArea(result) > Math.max(1e-6, original * 1e-6) ? result : [];
}

export function polygonIsConvex(poly: Vec2[]): boolean {
  const pts = dedupe(ensureCCW(poly));
  if (pts.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const z = cross(sub(b, a), sub(c, b));
    if (Math.abs(z) < 1e-9) continue;
    const current = Math.sign(z);
    if (sign === 0) sign = current;
    else if (current !== sign) return false;
  }
  return true;
}

export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 < EPS) return dist(p, a);
  let t = dot(sub(p, a), ab) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

/** Minimum distance from a point to the polygon outline (0 when on/inside an edge). */
export function distanceToPolygonOutline(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, pointSegmentDistance(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return best;
}

/** Signed depth of a point below the polygon outline (negative = outside). */
export function signedDistanceToOutline(p: Vec2, poly: Vec2[]): number {
  const d = distanceToPolygonOutline(p, poly);
  return pointInPolygon(p, poly) ? d : -d;
}

/**
 * Containment test used by the model invariants: every vertex of `inner` must
 * be inside `outer` and no edge of `inner` may cross an edge of `outer`.
 */
export function polygonInsidePolygon(inner: Vec2[], outer: Vec2[], tol = 1e-6): boolean {
  if (inner.length < 3 || outer.length < 3) return false;
  for (const p of inner) {
    if (!pointInPolygon(p, outer) && distanceToPolygonOutline(p, outer) > tol) return false;
  }
  for (let i = 0; i < inner.length; i++) {
    const a1 = inner[i];
    const a2 = inner[(i + 1) % inner.length];
    for (let j = 0; j < outer.length; j++) {
      const b1 = outer[j];
      const b2 = outer[(j + 1) % outer.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/** Perpendicular setback actually achieved by the directional half-plane step. */
export function effectiveSetbackForEdge(a: Vec2, b: Vec2): { normalAngleDeg: number; direction: "north" | "east" | "south" | "west" } {
  const d = sub(b, a);
  const len = Math.hypot(d.x, d.y) || 1;
  const n = { x: d.y / len, y: -d.x / len };
  const angle = (Math.atan2(n.y, n.x) * 180) / Math.PI;
  const direction = angle >= -45 && angle < 45 ? "east" : angle >= 45 && angle < 135 ? "north" : angle >= -135 && angle < -45 ? "south" : "west";
  return { normalAngleDeg: Number(angle.toFixed(2)), direction };
}

/** Inside the polygon or within 1e-6 m of its outline. */
export function insideOrOnBoundary(p: Vec2, poly: Vec2[], tol = 1e-6): boolean {
  return pointInPolygon(p, poly) || distanceToPolygonOutline(p, poly) <= tol;
}

export interface GridMask {
  origin: Vec2;
  step: number;
  w: number;
  h: number;
  cells: Uint8Array;
}

/** Cell is valid only when its centre and all 4 corners are inside the polygon. */
export function buildMask(poly: Vec2[], step = 1): GridMask {
  const box = bbox(poly);
  const w = Math.max(1, Math.ceil(box.w / step));
  const h = Math.max(1, Math.ceil(box.h / step));
  const cells = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x0 = box.x + i * step;
      const y0 = box.y + j * step;
      // A corner exactly on the boundary must not invalidate the cell (that
      // used to lose up to one grid step per side for axis-aligned parcels).
      const inside =
        insideOrOnBoundary({ x: x0 + step / 2, y: y0 + step / 2 }, poly) &&
        insideOrOnBoundary({ x: x0, y: y0 }, poly) &&
        insideOrOnBoundary({ x: x0 + step, y: y0 }, poly) &&
        insideOrOnBoundary({ x: x0, y: y0 + step }, poly) &&
        insideOrOnBoundary({ x: x0 + step, y: y0 + step }, poly);
      cells[j * w + i] = inside ? 1 : 0;
    }
  }
  return { origin: { x: box.x, y: box.y }, step, w, h, cells };
}

export function maskCell(mask: GridMask, i: number, j: number): boolean {
  if (i < 0 || j < 0 || i >= mask.w || j >= mask.h) return false;
  return mask.cells[j * mask.w + i] === 1;
}

export function maskRectToRect(mask: GridMask, x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    x: mask.origin.x + x0 * mask.step,
    y: mask.origin.y + y0 * mask.step,
    w: (x1 - x0 + 1) * mask.step,
    h: (y1 - y0 + 1) * mask.step,
  };
}

/** Maximal all-valid rectangle (histogram method, O(w*h)). */
export function largestInscribedRect(mask: GridMask, allow: (i: number, j: number) => boolean = () => true): Rect | null {
  const heights = new Array<number>(mask.w).fill(0);
  let best = { area: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
  for (let j = 0; j < mask.h; j++) {
    for (let i = 0; i < mask.w; i++) {
      heights[i] = maskCell(mask, i, j) && allow(i, j) ? heights[i] + 1 : 0;
    }
    const stack: number[] = [];
    for (let i = 0; i <= mask.w; i++) {
      const cur = i === mask.w ? 0 : heights[i];
      while (stack.length && heights[stack[stack.length - 1]] >= cur) {
        const top = stack.pop() as number;
        const height = heights[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = height * (i - left);
        if (area > best.area) {
          best = { area, x0: left, x1: i - 1, y0: j - height + 1, y1: j };
        }
      }
      stack.push(i);
    }
  }
  if (best.area <= 0) return null;
  return maskRectToRect(mask, best.x0, best.y0, best.x1, best.y1);
}

/** Length of polygon edges lying on the boundary of the given rectangles. */
export function facadeLength(room: Vec2[], plates: Rect[], tol = 0.02): number {
  let total = 0;
  for (let i = 0; i < room.length; i++) {
    const a = room[i];
    const b = room[(i + 1) % room.length];
    for (const r of plates) {
      const onX = Math.abs(a.x - b.x) < tol && (Math.abs(a.x - r.x) < tol || Math.abs(a.x - (r.x + r.w)) < tol);
      const onY = Math.abs(a.y - b.y) < tol && (Math.abs(a.y - r.y) < tol || Math.abs(a.y - (r.y + r.h)) < tol);
      if (onX) {
        const lo = Math.min(r.y, r.y + r.h);
        const hi = Math.max(r.y, r.y + r.h);
        const s = Math.max(Math.min(a.y, b.y), lo);
        const e = Math.min(Math.max(a.y, b.y), hi);
        if (e > s) total += e - s;
      } else if (onY) {
        const lo = Math.min(r.x, r.x + r.w);
        const hi = Math.max(r.x, r.x + r.w);
        const s = Math.max(Math.min(a.x, b.x), lo);
        const e = Math.min(Math.max(a.x, b.x), hi);
        if (e > s) total += e - s;
      }
    }
  }
  return total;
}

export function distanceToNearestRectBorder(p: Vec2, r: Rect): number {
  return Math.min(Math.abs(p.x - r.x), Math.abs(p.x - rectRight(r)), Math.abs(p.y - r.y), Math.abs(p.y - rectTop(r)));
}

/** Deterministic 32-bit PRNG (mulberry32) so every run is reproducible. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Signed distance along a direction to the parcel boundary (ray casting). */
export function raycastDistance(origin: Vec2, dir: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = cross(sub(b, a), dir);
    if (Math.abs(d) < EPS) continue;
    const t = cross(sub(a, origin), sub(b, a)) / d;
    const u = cross(sub(a, origin), dir) / d;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 0;
}

/** Explicit alias kept for readability at call sites outside the engine. */
export const polygonInPolygonCheck = polygonInsidePolygon;

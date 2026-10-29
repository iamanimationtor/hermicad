import {
  distanceToPolygonOutline,
  effectiveSetbackForEdge,
  pointInPolygon,
  polygonArea,
  rectArea,
  round,
} from "../geometry";
import { EXTERIOR_WALL_THICKNESS_M, SETBACK_REFERENCE, SETBACK_REFERENCE_NOTE } from "../constants";
import type {
  CanonicalScheme,
  Level,
  Opening,
  Rect,
  Room,
  Vec2,
  Wall,
  DwellingType,
} from "../types";

/**
 * INDEPENDENT geometry / plan audit.
 *
 * This module deliberately re-derives everything from the canonical model and
 * from the raw parcel boundary. It never calls the layout or plan builders, so a
 * bug in those builders cannot "validate itself".
 *
 * Convention (see constants.ts): `setbacks` in the project input are measured
 * from the parcel boundary to the OUTER FACE of the exterior wall. Walls are
 * centred on the room/plate edges, so the wall-centreline envelope is inset by
 * `setback + EXTERIOR_WALL_THICKNESS_M / 2`.
 */

export type AuditStatus = "pass" | "warning" | "fail" | "insufficient";

export interface AuditFinding {
  id: string;
  title: string;
  status: AuditStatus;
  value: string;
  requirement: string;
  detail: string;
  roomIds?: string[];
  wallIds?: string[];
  openingIds?: string[];
}

export interface ClearanceRow {
  wallId: string;
  side: string;
  axis: number;
  thicknessM: number;
  outerFaceCoordinate: number;
  distanceToBoundaryM: number;
  requestedM: number;
  surplusM: number;
}

export interface RoomDaylightRow {
  roomId: string;
  label: string;
  kind: string;
  validWindows: number;
  windowIds: string[];
  facadeM: number;
  requirement: string;
  status: AuditStatus;
  reason: string;
}

export interface LevelAudit {
  level: number;
  name: string;
  findings: AuditFinding[];
  clearances: ClearanceRow[];
  minClearanceM: number | null;
  daylight: {
    habitable: number;
    withValidWindow: number;
    rejected: RoomDaylightRow[];
    rows: RoomDaylightRow[];
  };
  topology: {
    roomOverlapM2: number;
    unitCoverage: { unitIndex: number; grossM2: number; netM2: number; gapM2: number }[];
    orphanWalls: string[];
    floatingWalls: string[];
    openingsOutsideWalls: string[];
    openingsOverlapping: string[];
    plateAreaM2: number;
    roomAreaM2: number;
  };
  areaAccounting: {
    grossPlateM2: number;
    sumRoomsM2: number;
    wallAreaNotDeductedM2: number;
    exteriorThicknessM: number;
    explanation: string;
  };
}

export interface SchemeAudit {
  schemeId: string;
  schemeCode: string;
  setbackReference: typeof SETBACK_REFERENCE;
  setbackReferenceNote: string;
  levels: LevelAudit[];
  passed: number;
  warnings: number;
  failed: number;
  insufficient: number;
  planValid: boolean;
  disclaimer: string;
}

export interface PatternAuditRow {
  patternId: string;
  label: string;
  rooms: number;
  overlapM2: number;
  outsideUnitRooms: number;
  coverageRatio: number;
  facadeRooms: number;
  windowableRooms: number;
  feasible: boolean;
  issues: string[];
}

const INTERNAL_DAYLIGHT_NOTE =
  "آستانه ۱٫۲ m نمای مفید برای فضای قابل سکونت یک معیار داخلی HERMICAD است و ضابطه رسمی تأییدشده نیست.";

const rayToBoundary = (origin: Vec2, dir: Vec2, poly: Vec2[]): number => {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = (b.x - a.x) * dir.y - (b.y - a.y) * dir.x;
    if (Math.abs(d) < 1e-9) continue;
    const t = ((a.x - origin.x) * (b.y - a.y) - (a.y - origin.y) * (b.x - a.x)) / d;
    const u = ((a.x - origin.x) * dir.y - (a.y - origin.y) * dir.x) / d;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 0;
};

/** Outward normal of an axis-aligned wall, pointing away from the plate. */
function outwardNormal(wall: Wall, plates: Rect[]): Vec2 {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.max(1e-9, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const inside = plates.some(
    (plate) =>
      mid.x >= plate.x - 1e-6 &&
      mid.x <= plate.x + plate.w + 1e-6 &&
      mid.y >= plate.y - 1e-6 &&
      mid.y <= plate.y + plate.h + 1e-6,
  );
  // Prefer the direction whose probe point leaves the plate.
  const probePlus = { x: mid.x + nx * 0.6, y: mid.y + ny * 0.6 };
  const probeMinus = { x: mid.x - nx * 0.6, y: mid.y - ny * 0.6 };
  const plusInside = plates.some(
    (plate) =>
      probePlus.x >= plate.x - 1e-6 &&
      probePlus.x <= plate.x + plate.w + 1e-6 &&
      probePlus.y >= plate.y - 1e-6 &&
      probePlus.y <= plate.y + plate.h + 1e-6,
  );
  const minusInside = plates.some(
    (plate) =>
      probeMinus.x >= plate.x - 1e-6 &&
      probeMinus.x <= plate.x + plate.w + 1e-6 &&
      probeMinus.y >= plate.y - 1e-6 &&
      probeMinus.y <= plate.y + plate.h + 1e-6,
  );
  if (inside && !plusInside && minusInside) return { x: nx, y: ny };
  if (inside && !minusInside && plusInside) return { x: -nx, y: -ny };
  // Unknown: choose the direction pointing away from the plate centre.
  const centre = plates.reduce(
    (acc, plate) => ({
      x: acc.x + (plate.x + plate.w / 2) / Math.max(1, plates.length),
      y: acc.y + (plate.y + plate.h / 2) / Math.max(1, plates.length),
    }),
    { x: 0, y: 0 },
  );
  return (mid.x - centre.x) * nx + (mid.y - centre.y) * ny >= 0 ? { x: nx, y: ny } : { x: -nx, y: -ny };
}

function sideLabel(normal: Vec2): string {
  if (Math.abs(normal.x) >= Math.abs(normal.y)) return normal.x > 0 ? "شرق" : "غرب";
  return normal.y > 0 ? "شمال" : "جنوب";
}

function requestedForSide(
  side: string,
  setbacks: { north: number; east: number; south: number; west: number },
): number {
  if (side === "شمال") return setbacks.north;
  if (side === "جنوب") return setbacks.south;
  if (side === "شرق") return setbacks.east;
  return setbacks.west;
}

/**
 * Distance from a wall's OUTER FACE to the nearest parcel-boundary point.
 *
 * The previous version cast a ray along a guessed outward normal and returned 0
 * when the ray missed, which produced false "clearance 0" reports on irregular
 * parcels. The nearest-point measurement is direction-independent, works on
 * slanted edges, and is compared against the setback of the boundary edge that
 * point belongs to (the same directional rule the engine uses).
 */
export function measureWallClearance(
  wall: Wall,
  plates: Rect[],
  boundary: Vec2[],
): { normal: Vec2; side: string; outerFaceDistanceM: number; boundaryEdge: number } {
  const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const centre = plates.length
    ? plates.reduce(
        (acc, plate) => ({
          x: acc.x + (plate.x + plate.w / 2) / plates.length,
          y: acc.y + (plate.y + plate.h / 2) / plates.length,
        }),
        { x: 0, y: 0 },
      )
    : mid;
  const away = { x: mid.x - centre.x, y: mid.y - centre.y };
  const awayLength = Math.hypot(away.x, away.y);
  const guess = awayLength > 1e-6 ? { x: away.x / awayLength, y: away.y / awayLength } : { x: 0, y: 1 };

  // Nearest boundary point to the outer face, searched along the boundary edges.
  const face = { x: mid.x + guess.x * (wall.thicknessM / 2), y: mid.y + guess.y * (wall.thicknessM / 2) };
  let best = { distance: Infinity, edge: 0, point: face };
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((face.x - a.x) * abx + (face.y - a.y) * aby) / len2));
    const point = { x: a.x + abx * t, y: a.y + aby * t };
    const distance = Math.hypot(face.x - point.x, face.y - point.y);
    if (distance < best.distance) best = { distance, edge: i, point };
  }

  const a = boundary[best.edge];
  const b = boundary[(best.edge + 1) % boundary.length];
  const { direction } = effectiveSetbackForEdge(a, b);
  const outward = { x: face.x - best.point.x, y: face.y - best.point.y };
  const outwardLength = Math.hypot(outward.x, outward.y);
  const normal = outwardLength > 1e-6 ? { x: outward.x / outwardLength, y: outward.y / outwardLength } : guess;
  const sideByDirection: Record<string, string> = { north: "شمال", east: "شرق", south: "جنوب", west: "غرب" };
  return {
    normal,
    side: sideByDirection[direction] ?? "نامشخص",
    outerFaceDistanceM: round(best.distance, 3),
    boundaryEdge: best.edge,
  };
}

function roomsOverlapArea(rooms: Room[]): number {
  let total = 0;
  const boxes = rooms.map((room) => {
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const w = Math.min(boxes[i].x + boxes[i].w, boxes[j].x + boxes[j].w) - Math.max(boxes[i].x, boxes[j].x);
      const h = Math.min(boxes[i].y + boxes[i].h, boxes[j].y + boxes[j].h) - Math.max(boxes[i].y, boxes[j].y);
      if (w > 0.02 && h > 0.02) total += w * h;
    }
  }
  return round(total, 2);
}

function pointOnSegment(point: Vec2, a: Vec2, b: Vec2, tol = 0.02): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(point.x - a.x, point.y - a.y) <= tol;
  const cross = Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx) / len;
  if (cross > tol) return false;
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (len * len);
  return t >= -0.02 && t <= 1.02;
}

/**
 * A window counts as VALID only when all of the following hold:
 *  1. its wall exists and is tagged as an envelope (exterior) wall;
 *  2. that wall explicitly owns the room (roomIds), not just a neighbouring room;
 *  3. the opening's centre lies geometrically on that wall segment;
 *  4. the opening fits inside the wall length with ≥0.15 m of jamb each side;
 *  5. it does not overlap another opening on the same wall;
 *  6. the room actually touches the plate edge on that wall (real facade).
 */
export function auditRoomDaylight(
  level: Level,
  requestedSetback: number,
  minFacadeM = 1.2,
): LevelAudit["daylight"] {
  const walls = new Map((level.walls ?? []).map((wall) => [wall.id, wall]));
  const openings = level.openings ?? [];
  const habitable = level.rooms.filter((room) => room.habitable);
  const rows: RoomDaylightRow[] = [];

  for (const room of habitable) {
    const candidates = openings.filter(
      (opening) => opening.kind === "window" && opening.roomIds.includes(room.id),
    );
    const valid: Opening[] = [];
    const reasons: string[] = [];
    for (const opening of candidates) {
      const wall = walls.get(opening.wallId);
      if (!wall) {
        reasons.push(`${opening.id}: دیوار میزبان وجود ندارد`);
        continue;
      }
      if (!wall.envelope) {
        reasons.push(`${opening.id}: دیوار ${wall.id} پیرامونی نیست`);
        continue;
      }
      if (!pointOnSegment(opening.center, wall.start, wall.end, 0.03)) {
        reasons.push(`${opening.id}: مرکز پنجره روی محور دیوار نیست`);
        continue;
      }
      const half = opening.widthM / 2;
      const jamb = opening.stationM - half;
      const tail = wall.lengthM - (opening.stationM + half);
      if (jamb < 0.15 - 1e-6 || tail < 0.15 - 1e-6) {
        reasons.push(`${opening.id}: فاصله تا جرز ${Math.min(jamb, tail).toFixed(2)} m`);
        continue;
      }
      const clashes = (level.openings ?? []).filter(
        (other) =>
          other.id !== opening.id &&
          other.wallId === opening.wallId &&
          Math.min(other.stationM + other.widthM / 2, opening.stationM + opening.widthM / 2) -
            Math.max(other.stationM - other.widthM / 2, opening.stationM - opening.widthM / 2) >
            0.02,
      );
      if (clashes.length > 0) {
        reasons.push(`${opening.id}: همپوشانی با ${clashes[0].id}`);
        continue;
      }
      // Real facade check: the room must actually reach the plate edge that
      // carries this wall, otherwise the "window" faces an internal shaft.
      const plate = level.plateRects.find(
        (candidate) =>
          wall.start.x >= candidate.x - 0.3 &&
          wall.start.x <= candidate.x + candidate.w + 0.3 &&
          wall.start.y >= candidate.y - 0.3 &&
          wall.start.y <= candidate.y + candidate.h + 0.3,
      );
      const touchesEdge = plate
        ? [
            Math.abs(Math.min(...room.polygon.map((p) => p.x)) - plate.x),
            Math.abs(Math.max(...room.polygon.map((p) => p.x)) - (plate.x + plate.w)),
            Math.abs(Math.min(...room.polygon.map((p) => p.y)) - plate.y),
            Math.abs(Math.max(...room.polygon.map((p) => p.y)) - (plate.y + plate.h)),
          ].some((distance) => distance <= 0.35)
        : true;
      if (!touchesEdge) {
        reasons.push(`${opening.id}: فضای ${room.label} به لبه بلوک روی این دیوار نمی‌رسد`);
        continue;
      }
      if (room.facadeM < minFacadeM) {
        reasons.push(`نمای فضای ${room.label} ${room.facadeM} m کمتر از ${minFacadeM} m است`);
        continue;
      }
      valid.push(opening);
    }
    rows.push({
      roomId: room.id,
      label: room.label,
      kind: room.kind,
      validWindows: valid.length,
      windowIds: valid.map((opening) => opening.id),
      facadeM: room.facadeM,
      requirement: `≥۱ پنجره معتبر روی دیوار پیرامونی و نمای ≥ ${minFacadeM} m (معیار داخلی)`,
      status: valid.length > 0 ? "pass" : room.facadeM > 0 ? "warning" : "fail",
      reason: valid.length > 0 ? "" : reasons.join(" · ") || "هیچ بازشویی به این فضا نسبت داده نشده است",
    });
  }

  return {
    habitable: habitable.length,
    withValidWindow: rows.filter((row) => row.validWindows > 0).length,
    rejected: rows.filter((row) => row.validWindows === 0),
    rows,
  };
}

export function auditLevel(
  scheme: CanonicalScheme,
  level: Level,
  boundary: Vec2[],
  setbacks: { north: number; east: number; south: number; west: number },
  minFacadeM = 1.2,
): LevelAudit {
  const findings: AuditFinding[] = [];
  const plates = level.plateRects;
  const walls = level.walls ?? [];
  const openings = level.openings ?? [];

  // ---- 1) setbacks / clearances -----------------------------------------
  const exterior = walls.filter((wall) => wall.envelope);
  const clearances: ClearanceRow[] = [];
  for (const wall of exterior) {
    const measured = measureWallClearance(wall, plates, boundary);
    const requested = requestedForSide(measured.side, setbacks);
    const axis = Math.abs(wall.start.x - wall.end.x) < 1e-6 ? wall.start.x : wall.start.y;
    const outerFaceCoordinate =
      Math.abs(wall.start.x - wall.end.x) < 1e-6
        ? wall.start.x + measured.normal.x * (wall.thicknessM / 2)
        : wall.start.y + measured.normal.y * (wall.thicknessM / 2);
    clearances.push({
      wallId: wall.id,
      side: measured.side,
      axis: round(axis, 3),
      thicknessM: wall.thicknessM,
      outerFaceCoordinate: round(outerFaceCoordinate, 3),
      distanceToBoundaryM: measured.outerFaceDistanceM,
      requestedM: requested,
      surplusM: round(measured.outerFaceDistanceM - requested, 3),
    });
  }
  const minClearance = clearances.length > 0 ? Math.min(...clearances.map((row) => row.surplusM)) : null;
  findings.push({
    id: "AUDIT-SETBACK-FACE",
    title: "فاصله سطح خارجی دیوار پیرامونی تا مرز زمین",
    status: minClearance === null ? "insufficient" : minClearance >= -0.01 ? "pass" : "fail",
    value: minClearance === null ? "دیوار پیرامونی وجود ندارد" : `کمینه اختلاف ${minClearance.toFixed(3)} m نسبت به درخواست`,
    requirement: "سطح خارجی دیوار ≥ عقب‌نشینی درخواستی (مرجع: outer-wall-face)",
    detail:
      SETBACK_REFERENCE_NOTE +
      (clearances.length > 0
        ? ` نمونه: دیوار ${clearances[0].wallId} در سمت ${clearances[0].side} با فاصله ${clearances[0].distanceToBoundaryM} m از مرز (درخواست ${clearances[0].requestedM} m).`
        : ""),
    wallIds: clearances.filter((row) => row.surplusM < -0.01).map((row) => row.wallId),
  });

  // Every part of the plan inside the boundary (sampled corners).
  const outsideRooms = level.rooms.filter(
    (room) => !room.polygon.every((point) => pointInPolygon(point, boundary) || distanceToPolygonOutline(point, boundary) <= 0.02),
  );
  findings.push({
    id: "AUDIT-INSIDE-PARCEL",
    title: "استقرار فضاها داخل مرز زمین",
    status: outsideRooms.length === 0 ? "pass" : "fail",
    value: `${level.rooms.length - outsideRooms.length} از ${level.rooms.length} فضا`,
    requirement: "همه فضاها داخل مرز زمین",
    detail: outsideRooms.length === 0 ? "همه فضاهای طبقه داخل مرز زمین هستند." : `${outsideRooms.length} فضا بیرون از مرز زمین است.`,
    roomIds: outsideRooms.map((room) => room.id),
  });

  // ---- 2) daylight ------------------------------------------------------
  const daylight = auditRoomDaylight(level, setbacks.north, minFacadeM);
  findings.push({
    id: "AUDIT-DAYLIGHT-VALID",
    title: "پنجره معتبر روی دیوار پیرامونی برای هر فضای قابل سکونت",
    status:
      daylight.habitable === 0
        ? "insufficient"
        : daylight.withValidWindow === daylight.habitable
          ? "pass"
          : daylight.rejected.some((row) => row.facadeM > 0)
            ? "warning"
            : "fail",
    value: `${daylight.withValidWindow} از ${daylight.habitable} فضای قابل سکونت`,
    requirement: INTERNAL_DAYLIGHT_NOTE,
    detail:
      daylight.rejected.length === 0
        ? "همه فضاهای قابل سکونت پنجره معتبر دارند."
        : daylight.rejected.map((row) => `${row.label}: ${row.reason}`).join(" | "),
    roomIds: daylight.rejected.map((row) => row.roomId),
  });

  // ---- 3) topology ------------------------------------------------------
  const overlappingNames = new Set<string>();
  for (let i = 0; i < level.rooms.length; i++) {
    for (let j = i + 1; j < level.rooms.length; j++) {
      const a = level.rooms[i];
      const b = level.rooms[j];
      const axs = a.polygon.map((p) => p.x);
      const ays = a.polygon.map((p) => p.y);
      const bxs = b.polygon.map((p) => p.x);
      const bys = b.polygon.map((p) => p.y);
      const w = Math.min(Math.max(...axs), Math.max(...bxs)) - Math.max(Math.min(...axs), Math.min(...bxs));
      const h = Math.min(Math.max(...ays), Math.max(...bys)) - Math.max(Math.min(...ays), Math.min(...bys));
      if (w > 0.02 && h > 0.02) overlappingNames.add(`${a.id}/${b.id}`);
    }
  }
  const overlapM2 = roomsOverlapArea(level.rooms);
  findings.push({
    id: "AUDIT-ROOM-OVERLAP",
    title: "هم‌پوشانی فضاها",
    status: overlapM2 <= 0.05 ? "pass" : "fail",
    value: `${overlapM2} m² در ${overlappingNames.size} جفت`,
    requirement: "≤ ۰٫۰۵ m²",
    detail: overlappingNames.size === 0 ? "هیچ همپوشانی فضایی یافت نشد." : [...overlappingNames].slice(0, 5).join(" · "),
    roomIds: level.rooms.filter((room) => [...overlappingNames].some((pair) => pair.includes(room.id))).map((room) => room.id),
  });

  const unitCoverage = scheme.units.map((unit) => {
    const rooms = level.rooms.filter((room) => room.unitIndex === unit.index);
    const net = round(rooms.reduce((sum, room) => sum + room.areaM2, 0), 2);
    const gross = round(rectArea(unit.rect), 2);
    return { unitIndex: unit.index, grossM2: gross, netM2: net, gapM2: round(Math.max(0, gross - net), 2) };
  });
  const worstGap = unitCoverage.reduce((max, row) => Math.max(max, row.gapM2), 0);
  findings.push({
    id: "AUDIT-UNIT-COVERAGE",
    title: "پوشش مستطیل هر واحد توسط فضاها (شکاف ناخواسته)",
    status: unitCoverage.length === 0 ? "insufficient" : worstGap <= Math.max(0.5, 0.02 * Math.max(...unitCoverage.map((r) => r.grossM2))) ? "pass" : "warning",
    value: `بیشترین شکاف ${worstGap} m²`,
    requirement: "شکاف ≤ ۲٪ سطح ناخالص واحد (یا ۰٫۵ m²)",
    detail: unitCoverage
      .filter((row) => row.gapM2 > 0.5)
      .map((row) => `واحد ${row.unitIndex}: ناخالص ${row.grossM2} / خالص ${row.netM2} / شکاف ${row.gapM2}`)
      .join(" · ") || "همه واحدها کامل پوشش داده شده‌اند.",
  });

  // A wall may legitimately be owned by a circulation space (corridor core) that
  // is not a Room instance; only walls with no owner at all are orphaned.
  const orphanWalls = walls
    .filter((wall) => wall.roomIds.length === 0)
    .map((wall) => wall.id);
  // A wall is "floating" only when NEITHER of its endpoints touches any other
  // wall — an endpoint landing on the middle of another wall (T-junction) is a
  // valid connection, which the previous exact-endpoint test missed.
  const floatingWalls = walls
    .filter((wall) =>
      [wall.start, wall.end].every(
        (point) =>
          !walls.some(
            (other) =>
              other.id !== wall.id &&
              (pointOnSegment(point, other.start, other.end, 0.03) ||
                Math.hypot(point.x - other.start.x, point.y - other.start.y) <= 0.03 ||
                Math.hypot(point.x - other.end.x, point.y - other.end.y) <= 0.03),
          ),
      ),
    )
    .map((wall) => wall.id);
  findings.push({
    id: "AUDIT-WALL-TOPOLOGY",
    title: "دیوارهای معلق و بدون فضای مالک",
    status: walls.length === 0 ? "insufficient" : orphanWalls.length + floatingWalls.length === 0 ? "pass" : "warning",
    value: `${orphanWalls.length} بدون مالک · ${floatingWalls.length} معلق`,
    requirement: "۰ بدون مالک · ۰ معلق",
    detail:
      orphanWalls.length + floatingWalls.length === 0
        ? "هر دیوار حداقل یک فضای مالک دارد و به شبکه دیوارها متصل است."
        : `بدون مالک: ${orphanWalls.slice(0, 4).join(",") || "—"} · معلق: ${floatingWalls.slice(0, 4).join(",") || "—"}`,
    wallIds: [...orphanWalls, ...floatingWalls],
  });

  const wallIds = new Set(walls.map((wall) => wall.id));
  const openingsOutsideWalls = openings
    .filter((opening) => {
      const wall = walls.find((candidate) => candidate.id === opening.wallId);
      if (!wall) return true;
      const start = opening.stationM - opening.widthM / 2;
      const end = opening.stationM + opening.widthM / 2;
      return start < -1e-6 || end > wall.lengthM + 1e-6 || !pointOnSegment(opening.center, wall.start, wall.end, 0.05);
    })
    .map((opening) => opening.id);
  findings.push({
    id: "AUDIT-OPENINGS-IN-WALLS",
    title: "بازشوهای خارج از دیوار میزبان",
    status: openings.length === 0 ? "insufficient" : openingsOutsideWalls.length === 0 ? "pass" : "fail",
    value: `${openingsOutsideWalls.length} از ${openings.length}`,
    requirement: "۰ بازشو بیرون دیوار",
    detail: openingsOutsideWalls.length === 0 ? "همه بازشوها داخل دیوار خود هستند." : openingsOutsideWalls.slice(0, 6).join(", "),
    openingIds: openingsOutsideWalls,
  });

  const openingsOverlapping: string[] = [];
  for (const wallId of wallIds) {
    const list = openings.filter((opening) => opening.wallId === wallId).sort((a, b) => a.stationM - b.stationM);
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].stationM - list[i].widthM / 2 - (list[i - 1].stationM + list[i - 1].widthM / 2);
      if (gap < 0.15 - 1e-6) openingsOverlapping.push(`${list[i - 1].id}↔${list[i].id} (${gap.toFixed(2)} m)`);
    }
  }
  findings.push({
    id: "AUDIT-OPENING-SPACING",
    title: "فاصله بازشوها روی یک دیوار",
    status: openingsOverlapping.length === 0 ? "pass" : "fail",
    value: `${openingsOverlapping.length} تعارض`,
    requirement: "≥ ۰٫۱۵ m جرز بین بازشوها (معیار داخلی)",
    detail: openingsOverlapping.length === 0 ? "بازشوها بدون تعارض هندسی‌اند." : openingsOverlapping.slice(0, 4).join(" · "),
  });

  // ---- 4) area accounting ----------------------------------------------
  const grossPlate = round(plates.reduce((sum, plate) => sum + rectArea(plate), 0), 2);
  const sumRooms = round(level.rooms.filter((room) => room.unitIndex >= 0).reduce((sum, room) => sum + room.areaM2, 0), 2);
  findings.push({
    id: "AUDIT-AREA-ACCOUNTING",
    title: "تفکیک سطح ناخالص و خالص و جایگاه ضخامت دیوار",
    status: "pass",
    value: `ناخالص ${grossPlate} m² · جمع فضاها ${sumRooms} m²`,
    requirement: "شفاف‌سازی روش، نه ادعای دقت اجرایی",
    detail:
      "مساحت فضاها از مرز مشترک (محور دیوار) اندازه‌گیری می‌شود؛ ضخامت دیوار از سطح هیچ فضایی کسر نشده است. " +
      "سطح «خالص» مدل = جمع مساحت فضاها × ۰٫۸۸ (۱۲٪ افت فرضی دیوار/شفت/تأسیسات). " +
      "بنابراین سطح ناخالص بلوک، ضخامت دیوار را در بر می‌گیرد و سطح قابل استفاده واقعی بین این دو مقدار است.",
    wallIds: [],
  });

  return {
    level: level.index,
    name: level.name,
    findings,
    clearances,
    minClearanceM: minClearance,
    daylight,
    topology: {
      roomOverlapM2: overlapM2,
      unitCoverage,
      orphanWalls,
      floatingWalls,
      openingsOutsideWalls,
      openingsOverlapping,
      plateAreaM2: grossPlate,
      roomAreaM2: sumRooms,
    },
    areaAccounting: {
      grossPlateM2: grossPlate,
      sumRoomsM2: sumRooms,
      wallAreaNotDeductedM2: round(Math.max(0, grossPlate - sumRooms), 2),
      exteriorThicknessM: EXTERIOR_WALL_THICKNESS_M,
      explanation:
        "پلان بر مبنای محور دیوار اندازه‌گیری می‌شود؛ ضخامت دیوار نه از فضاها کسر شده و نه به آن‌ها افزوده شده است. " +
        "مرجع عقب‌نشینی، سطح خارجی دیوار است و محدوده ساخت‌پذیر به اندازه نیم‌ضخامت دیوار پیرامونی بیشتر عقب رفته است.",
    },
  };
}

export function auditScheme(scheme: CanonicalScheme): SchemeAudit {
  const boundary = scheme.site.boundary;
  const levels = scheme.levels.map((level) => auditLevel(scheme, level, boundary, scheme.site.setbacks));
  const all = levels.flatMap((level) => level.findings);
  const count = (status: AuditStatus) => all.filter((finding) => finding.status === status).length;
  return {
    schemeId: scheme.id,
    schemeCode: scheme.code,
    setbackReference: SETBACK_REFERENCE,
    setbackReferenceNote: SETBACK_REFERENCE_NOTE,
    levels,
    passed: count("pass"),
    warnings: count("warning"),
    failed: count("fail"),
    insufficient: count("insufficient"),
    planValid: count("fail") === 0,
    disclaimer:
      "این بازبینی مستقل از مدل مرکزی و مرز زمین انجام شده است. معیارهای ابعادی/نوری داخلی‌اند و انطباق با ضوابط رسمی یا اعتبار BIM/IFC را اثبات نمی‌کنند.",
  };
}

export { INTERNAL_DAYLIGHT_NOTE };

/**
 * Audits EVERY generated pattern for a unit, not only the chosen one, so a
 * broken alternative cannot hide behind a good selection.
 */
export function auditPatterns(
  levels: Level[],
  units: { index: number; type: DwellingType; rect: Rect }[],
  collect: (
    rect: Rect,
    type: DwellingType,
    ctx: {
      unitIndex: number;
      level: number;
      accessNorth: boolean;
      plateRects: Rect[];
      suffix: string;
      sideFacadeEast?: boolean;
      sideFacadeWest?: boolean;
    },
  ) => {
    candidates: { id: string; label: string; rooms: Room[]; evaluation: { feasible: boolean } }[];
  },
): PatternAuditRow[] {
  const rows: PatternAuditRow[] = [];
  for (const level of levels.slice(0, 1)) {
    const plate = level.plateRects[0];
    for (const unit of units) {
      const { candidates } = collect(unit.rect, unit.type, {
        unitIndex: unit.index,
        level: 0,
        accessNorth: true,
        plateRects: level.plateRects,
        suffix: `audit-${unit.index}`,
        sideFacadeEast: true,
      });
      for (const candidate of candidates) {
        const rooms = candidate.rooms;
        const covered = rooms.reduce((sum, room) => sum + room.areaM2, 0);
        const gross = rectArea(unit.rect);
        const outside = rooms.filter((room) =>
          room.polygon.some(
            (point) =>
              point.x < unit.rect.x - 0.05 ||
              point.x > unit.rect.x + unit.rect.w + 0.05 ||
              point.y < unit.rect.y - 0.05 ||
              point.y > unit.rect.y + unit.rect.h + 0.05,
          ),
        );
        const facadeRooms = rooms.filter((room) => room.facadeM > 0).length;
        const habitable = rooms.filter((room) => room.habitable);
        const windowable = habitable.filter((room) => {
          const xs = room.polygon.map((p) => p.x);
          const ys = room.polygon.map((p) => p.y);
          if (!plate) return room.facadeM >= 1.2;
          return (
            Math.abs(Math.min(...ys) - plate.y) < 0.3 ||
            Math.abs(Math.max(...ys) - (plate.y + plate.h)) < 0.3 ||
            Math.abs(Math.min(...xs) - plate.x) < 0.3 ||
            Math.abs(Math.max(...xs) - (plate.x + plate.w)) < 0.3
          );
        }).length;
        const issues: string[] = [];
        if (outside.length > 0) issues.push(`${outside.length} فضای بیرون واحد`);
        if (covered > gross + 1) issues.push(`سطح پوشش ${covered.toFixed(1)} > ناخالص ${gross.toFixed(1)}`);
        rows.push({
          patternId: candidate.id,
          label: candidate.label,
          rooms: rooms.length,
          overlapM2: roomsOverlapArea(rooms),
          outsideUnitRooms: outside.length,
          coverageRatio: gross > 0 ? round(covered / gross, 3) : 0,
          facadeRooms,
          windowableRooms: windowable,
          feasible: candidate.evaluation.feasible,
          issues,
        });
      }
    }
  }
  return rows;
}

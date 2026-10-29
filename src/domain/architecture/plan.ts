import { distanceToPolygonOutline, pointInPolygon, rectArea, round } from "../geometry";
import { EXTERIOR_WALL_THICKNESS_M } from "../constants";
import type {
  Core,
  DimensionLine,
  Level,
  LevelPlanCheck,
  Opening,
  Rect,
  Room,
  StairSummary,
  Vec2,
  Wall,
  WallKind,
} from "../types";

/**
 * Architectural plan layer (stage A).
 *
 * Turns the room/cores tiling into a *buildable drawing*: wall centrelines with
 * real thickness, openings with dimension and sill, dimension strings and a
 * stair/elevator check. Everything is derived deterministically from the CEM —
 * no invented geometry — and every derived value is reported as a check so the
 * UI can show it instead of implying the plan is construction-ready.
 */

const THICKNESS: Record<WallKind, number> = {
  exterior: EXTERIOR_WALL_THICKNESS_M,
  party: 0.2,
  interior: 0.1,
  shaft: 0.2,
};

const MIN_WALL_COVERAGE = 0.98;

interface Segment {
  a: Vec2;
  b: Vec2;
  rooms: string[];
}

const key = (p: Vec2): string => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

function isAxisAligned(a: Vec2, b: Vec2, tol = 1e-6): boolean {
  return Math.abs(a.x - b.x) < tol || Math.abs(a.y - b.y) < tol;
}

/** Splits axis-aligned edges at every vertex coordinate so shared walls match. */
function splitSegments(rooms: Room[], shafts: Rect[]): Segment[] {
  const edges: { a: Vec2; b: Vec2; room: string }[] = [];
  const addRect = (id: string, polygon: Vec2[]) => {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (isAxisAligned(a, b)) edges.push({ a, b, room: id });
    }
  };
  for (const room of rooms) addRect(room.id, room.polygon);
  shafts.forEach((rect, index) =>
    addRect(
      `corridor-${index}`,
      [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.w, y: rect.y },
        { x: rect.x + rect.w, y: rect.y + rect.h },
        { x: rect.x, y: rect.y + rect.h },
      ],
    ),
  );

  // Breakpoints must be vertices lying ON the edge line. Splitting at every
  // global coordinate produced artificial 0.14–0.44 m facade fragments, which
  // then received no window and made the plan look partly blind.
  const xByY = new Map<number, Set<number>>();
  const yByX = new Map<number, Set<number>>();
  const addBreak = (map: Map<number, Set<number>>, line: number, value: number) => {
    const set = map.get(line) ?? new Set<number>();
    set.add(value);
    map.set(line, set);
  };
  for (const edge of edges) {
    const horizontal = Math.abs(edge.a.y - edge.b.y) < 1e-6;
    if (horizontal) {
      addBreak(xByY, round(edge.a.y, 3), round(edge.a.x, 3));
      addBreak(xByY, round(edge.b.y, 3), round(edge.b.x, 3));
    } else {
      addBreak(yByX, round(edge.a.x, 3), round(edge.a.y, 3));
      addBreak(yByX, round(edge.b.x, 3), round(edge.b.y, 3));
    }
  }

  const map = new Map<string, Segment>();
  for (const edge of edges) {
    const horizontal = Math.abs(edge.a.y - edge.b.y) < 1e-6;
    const line = horizontal ? round(edge.a.y, 3) : round(edge.a.x, 3);
    const cuts = Array.from((horizontal ? xByY.get(line) : yByX.get(line)) ?? []).sort((p, q) => p - q);
    const from = horizontal ? Math.min(edge.a.x, edge.b.x) : Math.min(edge.a.y, edge.b.y);
    const to = horizontal ? Math.max(edge.a.x, edge.b.x) : Math.max(edge.a.y, edge.b.y);
    const station = horizontal ? edge.a.y : edge.a.x;
    const points: number[] = [];
    for (const cut of cuts) if (cut > from + 1e-6 && cut < to - 1e-6) points.push(cut);
    const stations = [from, ...points, to];
    for (let i = 0; i < stations.length - 1; i++) {
      const start = stations[i];
      const end = stations[i + 1];
      if (end - start < 0.05) continue;
      const a = horizontal ? { x: start, y: station } : { x: station, y: start };
      const b = horizontal ? { x: end, y: station } : { x: station, y: end };
      const lo = key(a) < key(b) ? a : b;
      const hi = key(a) < key(b) ? b : a;
      const id = `${key(lo)}|${key(hi)}`;
      const existing = map.get(id);
      if (existing) {
        if (!existing.rooms.includes(edge.room)) existing.rooms.push(edge.room);
      } else {
        map.set(id, { a: lo, b: hi, rooms: [edge.room] });
      }
    }
  }
  return [...map.values()];
}

/**
 * Envelope test. Rooms can stop a few centimetres short of the slab edge (the
 * generator insets bands), so owner counting alone mislabels facade walls as
 * interior partitions. A wall is on the envelope when its centreline runs along
 * any plate edge within a small tolerance.
 */
function onPlateBoundary(segment: Segment, plates: Rect[], tol = 0.25): boolean {
  const horizontal = Math.abs(segment.a.y - segment.b.y) < 1e-6;
  for (const plate of plates) {
    if (horizontal) {
      const onEdge =
        Math.abs(segment.a.y - plate.y) <= tol || Math.abs(segment.a.y - (plate.y + plate.h)) <= tol;
      const overlap =
        Math.min(Math.max(segment.a.x, segment.b.x), plate.x + plate.w) - Math.max(Math.min(segment.a.x, segment.b.x), plate.x);
      if (onEdge && overlap > 0.01) return true;
    } else {
      const onEdge =
        Math.abs(segment.a.x - plate.x) <= tol || Math.abs(segment.a.x - (plate.x + plate.w)) <= tol;
      const overlap =
        Math.min(Math.max(segment.a.y, segment.b.y), plate.y + plate.h) - Math.max(Math.min(segment.a.y, segment.b.y), plate.y);
      if (onEdge && overlap > 0.01) return true;
    }
  }
  return false;
}

function wallKind(
  segment: Segment,
  roomsById: Map<string, Room>,
  coreIds: Set<string>,
  plates: Rect[],
): WallKind {
  const owners = segment.rooms.filter((id) => !id.startsWith("corridor-"));
  const touchesCore = segment.rooms.some((id) => coreIds.has(id));
  if (onPlateBoundary(segment, plates) && owners.length <= 1) {
    return touchesCore ? "shaft" : "exterior";
  }
  if (owners.length <= 1) return touchesCore ? "shaft" : "interior";
  const units = new Set(owners.map((id) => roomsById.get(id)?.unitIndex ?? -1));
  if (units.size > 1) return "party";
  return "interior";
}

function openingFits(station: number, width: number, wallLength: number): boolean {
  return station - width / 2 >= 0.25 && station + width / 2 <= wallLength - 0.25;
}

function pointAt(wall: Wall, station: number): Vec2 {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.max(1e-6, wall.lengthM);
  return { x: wall.start.x + (dx / len) * station, y: wall.start.y + (dy / len) * station };
}

/** Windows are placed on the envelope for light-needing rooms only. */
function wantsWindow(room: Room | undefined): boolean {
  if (!room) return false;
  return room.habitable || room.kind === "kitchen" || room.kind === "living" || room.kind === "balcony";
}

function doorWidthFor(roomA: Room | undefined, roomB: Room | undefined): number {
  const wet = (room?: Room) => room?.kind === "bath" || room?.kind === "wc" || room?.kind === "storage";
  if (wet(roomA) || wet(roomB)) return 0.7;
  return 0.8;
}

function minDimensionFor(kind: string): number {
  // Keep in sync with layoutEngine.minDimensionFor (internal assumptions).
  if (kind === "balcony") return 1.0;
  if (kind === "bath" || kind === "wc" || kind === "storage" || kind === "entry" || kind === "hall") return 1.2;
  if (kind === "kitchen") return 1.6;
  return 1.9;
}

function statusOf(passed: boolean, severity: "integrity" | "quality"): LevelPlanCheck["status"] {
  return passed ? "pass" : severity === "integrity" ? "fail" : "warning";
}

export function buildLevelPlan(
  level: {
    index: number;
    rooms: Room[];
    cores: Core[];
    corridors: Rect[];
    plateRects: Rect[];
    corridorWidthM: number;
  },
  floorHeightM: number,
): {
  walls: Wall[];
  openings: Opening[];
  dimensions: DimensionLine[];
  stair: StairSummary;
  checks: LevelPlanCheck[];
} {
  const prefix = `L${level.index}`;
  const roomsById = new Map(level.rooms.map((room) => [room.id, room]));
  const coreIds = new Set(level.rooms.filter((room) => room.kind === "core").map((room) => room.id));
  const corridorRects = level.corridors;

  const segments = splitSegments(level.rooms, corridorRects);
  const walls: Wall[] = segments.map((segment, index) => {
    const kind = wallKind(segment, roomsById, coreIds, level.plateRects);
    const length = Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
    return {
      id: `${prefix}-W${String(index + 1).padStart(3, "0")}`,
      kind,
      start: segment.a,
      end: segment.b,
      thicknessM: THICKNESS[kind],
      lengthM: round(length, 3),
      // Corridor-owned walls keep a stable non-room owner id; dropping it made
      // the independent topology audit report them as "walls without a room".
      roomIds: segment.rooms,
      envelope: kind === "exterior",
    };
  });

  const openings: Opening[] = [];
  let openingSeq = 0;
  const pushOpening = (wall: Wall, kind: Opening["kind"], width: number, height: number, sill: number, station: number, note: string) => {
    openingSeq += 1;
    openings.push({
      id: `${prefix}-O${String(openingSeq).padStart(3, "0")}`,
      wallId: wall.id,
      kind,
      widthM: round(width, 2),
      heightM: round(height, 2),
      sillM: round(sill, 2),
      center: pointAt(wall, station),
      stationM: round(station, 3),
      roomIds: wall.roomIds,
      note,
    });
  };

  for (const wall of walls) {
    if (wall.kind === "shaft") continue;
    const owners = wall.roomIds.map((id) => roomsById.get(id)).filter((r): r is Room => !!r);

    if (wall.envelope) {
      const lightRoom = owners.find(wantsWindow);
      if (lightRoom && wall.lengthM >= 1.2) {
        // Narrow facade segments (1.1–1.6 m are common in a 3-unit band) must
        // still receive a window, otherwise a habitable room ends up windowless.
        // The 0.25 m jamb on each side is preserved by openingFits().
        const width = round(Math.min(2.4, Math.max(0.6, wall.lengthM - 0.7)), 2);
        const station = wall.lengthM / 2;
        if (openingFits(station, width, wall.lengthM)) {
          const tall = lightRoom.kind === "living" || lightRoom.kind === "balcony";
          pushOpening(
            wall,
            "window",
            width,
            tall ? 1.9 : 1.5,
            tall ? 0.4 : 0.9,
            station,
            `${lightRoom.label} — پنجره نورگیری روی جبهه`,
          );
        }
      }
      continue;
    }

    if (wall.lengthM < 1.1) continue;
    const unitIndexes = new Set(owners.map((r) => r.unitIndex));
    const corridorOwner = owners.find((r) => r.kind === "corridor");
    const coreOwner = owners.find((r) => r.kind === "core");
    const unitOwner = owners.find((r) => r.unitIndex >= 0);

    if (corridorOwner && unitOwner) {
      // Unit entrance: needs a lockable door on the corridor wall.
      const width = 1.0;
      const station = wall.lengthM / 2;
      if (openingFits(station, width, wall.lengthM)) {
        pushOpening(wall, "entryDoor", width, 2.2, 0, station, "درِ ورودی واحد از راهروی مشترک");
      }
      continue;
    }
    if (corridorOwner && coreOwner) {
      const width = 0.9;
      const station = wall.lengthM / 2;
      if (openingFits(station, width, wall.lengthM)) {
        pushOpening(wall, "door", width, 2.1, 0, station, "درِ هسته به راهروی مشترک");
      }
      continue;
    }
    if (unitIndexes.size > 1) continue; // party wall: intentionally sealed
    if (owners.length < 2) continue;

    const width = doorWidthFor(owners[0], owners[1]);
    const station = wall.lengthM / 2;
    if (openingFits(station, width, wall.lengthM)) {
      pushOpening(wall, "door", width, 2.1, 0, station, `${owners[0].label} ↔ ${owners[1].label}`);
    }
  }

  // Second pass: any habitable room that still lacks a window gets the longest
  // available envelope segment of its own (including short segments produced by
  // subdivision), so daylight is not lost to ordering artefacts.
  const windowRoomIds = () =>
    new Set(openings.filter((opening) => opening.kind === "window").flatMap((opening) => opening.roomIds));
  for (const room of level.rooms) {
    if (!room.habitable) continue;
    if (windowRoomIds().has(room.id)) continue;
    const candidates = walls
      .filter((wall) => wall.envelope && wall.roomIds.includes(room.id) && wall.lengthM >= 0.95)
      .sort((a, b) => b.lengthM - a.lengthM);
    const wall = candidates[0];
    if (!wall) continue;
    // Narrow segments keep a 0.20 m jamb; wide ones keep 0.35 m.
    const jamb = wall.lengthM >= 1.6 ? 0.35 : 0.2;
    const width = round(Math.min(2.4, Math.max(0.5, wall.lengthM - jamb * 2)), 2);
    const station = wall.lengthM / 2;
    if (station - width / 2 < jamb - 1e-6 || station + width / 2 > wall.lengthM - jamb + 1e-6) continue;
    pushOpening(wall, "window", width, room.kind === "living" ? 1.9 : 1.5, room.kind === "living" ? 0.4 : 0.9, station, `${room.label} — پنجره نورگیری جبرانی روی جبهه`);
  }

  // Overlap guard: openings that are closer than 0.6 m on the same wall are dropped.
  const byWall = new Map<string, Opening[]>();
  for (const opening of openings) {
    const list = byWall.get(opening.wallId) ?? [];
    list.push(opening);
    byWall.set(opening.wallId, list);
  }
  const kept: Opening[] = [];
  for (const list of byWall.values()) {
    list.sort((a, b) => a.stationM - b.stationM);
    let lastEnd = -Infinity;
    for (const opening of list) {
      const start = opening.stationM - opening.widthM / 2;
      if (start - lastEnd < 0.6 && lastEnd > -Infinity) continue;
      lastEnd = opening.stationM + opening.widthM / 2;
      kept.push(opening);
    }
  }

  const dimensions = buildDimensions(level, walls);
  const stair = buildStair(level, floorHeightM);
  const checks = buildPlanChecks(
    { rooms: level.rooms, plateRects: level.plateRects, cores: level.cores, corridors: level.corridors },
    walls,
    kept,
    stair,
  );

  return { walls, openings: kept, dimensions, stair, checks };
}

function buildDimensions(
  level: { rooms: Room[]; plateRects: Rect[]; cores: Core[] },
  walls: Wall[],
): DimensionLine[] {
  const dims: DimensionLine[] = [];
  const plates = level.plateRects;
  if (plates.length === 0) return dims;

  const minX = Math.min(...plates.map((p) => p.x));
  const maxX = Math.max(...plates.map((p) => p.x + p.w));
  const minY = Math.min(...plates.map((p) => p.y));
  const maxY = Math.max(...plates.map((p) => p.y + p.h));

  dims.push({
    id: "D-overall-w",
    kind: "overall",
    start: { x: minX, y: minY },
    end: { x: maxX, y: minY },
    offsetM: -2.2,
    valueM: round(maxX - minX, 2),
    label: `عرض کل ساختمان`,
  });
  dims.push({
    id: "D-overall-d",
    kind: "overall",
    start: { x: minX, y: minY },
    end: { x: minX, y: maxY },
    offsetM: -2.2,
    valueM: round(maxY - minY, 2),
    label: `عمق کل ساختمان`,
  });

  const seen = new Set<string>();
  for (const wall of walls) {
    if (wall.kind !== "exterior" || wall.lengthM < 1.5) continue;
    const horizontal = Math.abs(wall.start.y - wall.end.y) < 1e-6;
    const id = `${horizontal ? "H" : "V"}-${round(wall.lengthM, 2)}-${Math.min(wall.start.x, wall.end.x)}-${Math.min(wall.start.y, wall.end.y)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    dims.push({
      id: `D-e-${dims.length}`,
      kind: "room",
      start: wall.start,
      end: wall.end,
      offsetM: horizontal ? 0.9 : 0.9,
      valueM: round(wall.lengthM, 2),
      label: horizontal ? "طول جبهه" : "طول جبهه",
    });
    if (dims.length > 26) break;
  }
  return dims;
}

export function buildStair(
  level: { cores: Core[]; plateRects: Rect[] },
  floorHeightM: number,
): StairSummary {
  const core = level.cores[0];
  const landing = 1.2;
  const going = 0.28;
  const maxRiser = 0.18;
  const minStairWidth = 1.2;
  const riserCount = Math.max(2, Math.ceil(floorHeightM / maxRiser));
  const riserHeight = floorHeightM / riserCount;
  const treadsPerFlight = Math.ceil(riserCount / 2);
  const requiredDepth = treadsPerFlight * going + landing;
  const availableDepth = core ? round(core.rect.h, 2) : 0;
  const availableWidth = core ? round(core.rect.w, 2) : 0;
  // Required core width is derived, not a magic number:
  // stair clear width + lift shaft + two shaft walls + a service gap.
  const liftW = 1.6;
  const liftH = 1.4;
  const shaftWall = 0.1;
  const serviceGap = 0.1;
  const requiredCoreWidth = minStairWidth + liftW + 2 * shaftWall + serviceGap;
  const stairWidth = core ? round(Math.max(0, availableWidth - (liftW + 2 * shaftWall + serviceGap)), 2) : 0;
  const elevator = { w: liftW, h: liftH, requiredW: liftW, requiredH: liftH };
  const notes: string[] = [];
  if (!core) notes.push("هسته دسترسی مدل نشده است؛ پله محاسبه نشد.");
  else {
    notes.push(
      `ارتفاع طبقه ${floorHeightM.toFixed(2)} m ÷ حداکثر ارتفاع پله ۰٫۱۸ m ⇒ ${riserCount} ارتفاع (${riserHeight.toFixed(3)} m).`,
    );
    notes.push(
      `پرواز U شکل: ${treadsPerFlight} کف‌پله در هر پرواز × ${going} m + ${landing} m پاگرد ⇒ عمق لازم ${round(requiredDepth, 2)} m.`,
    );
    if (stairWidth < minStairWidth) notes.push(`عرض مفید پله ${stairWidth.toFixed(2)} m کمتر از حداقل ${minStairWidth} m است.`);
    if (availableDepth < requiredDepth) notes.push(`عمق هسته ${availableDepth} m کمتر از عمق لازم پله ${round(requiredDepth, 2)} m است.`);
    notes.push(
      `عرض لازم هسته = عرض مفید پله ${minStairWidth} + آسانسور ${liftW} + دو دیوار شفت ${2 * shaftWall} + فاصله سرویس ${serviceGap} = ${round(requiredCoreWidth, 2)} m (موجود ${availableWidth} m).`,
    );
    notes.push("ابعاد آسانسور به‌صورت الزام هندسی متعارف بررسی شده، نه انتخاب سازنده.");
  }
  const fits =
    !!core &&
    availableDepth >= requiredDepth &&
    stairWidth >= minStairWidth &&
    availableWidth >= requiredCoreWidth;
  return {
    floorToFloorM: round(floorHeightM, 2),
    riserCount,
    riserHeightM: round(riserHeight, 3),
    treadCount: riserCount,
    goingM: going,
    stairWidthM: stairWidth,
    requiredDepthM: round(requiredDepth, 2),
    availableDepthM: availableDepth,
    landingM: landing,
    elevatorShaftM: elevator,
    fits,
    notes,
  };
}

function buildPlanChecks(
  level: { rooms: Room[]; plateRects: Rect[]; cores: Core[]; corridors?: Rect[] },
  walls: Wall[],
  openings: Opening[],
  stair: StairSummary,
): LevelPlanCheck[] {
  const checks: LevelPlanCheck[] = [];

  // 1) wall coverage of the *unique* room boundary.
  // Shared partitions belong to two rooms, so a per-room perimeter sum double
  // counts them and made a correct plan look like it covered only ~64%.
  const uniqueEdges = splitSegments(level.rooms, level.corridors ?? []);
  const perimeter = uniqueEdges.reduce(
    (sum, edge) => sum + Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y),
    0,
  );
  const wallLength = walls.reduce((sum, wall) => sum + wall.lengthM, 0);
  const coverage = perimeter > 0 ? Math.min(1, wallLength / perimeter) : 0;
  checks.push({
    id: "PLAN-WALL-COVERAGE",
    severity: "integrity",
    title: "پوشش دیوار روی مرز فضاها",
    passed: coverage >= MIN_WALL_COVERAGE,
    value: `${(coverage * 100).toFixed(1)}٪ از ${round(perimeter, 1)} m`,
    requirement: `≥ ${MIN_WALL_COVERAGE * 100}٪`,
    status: "pass",
    reason: coverage >= MIN_WALL_COVERAGE ? undefined : "بخشی از مرز فضاها با دیوار پوشش داده نشده است.",
  });

  // 2) opening containment
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const outside = openings.filter((opening) => {
    const wall = wallById.get(opening.wallId);
    if (!wall) return true;
    return opening.stationM - opening.widthM / 2 < -1e-6 || opening.stationM + opening.widthM / 2 > wall.lengthM + 1e-6;
  });
  checks.push({
    id: "PLAN-OPENING-CONTAINMENT",
    severity: "integrity",
    title: "استقرار بازشوها داخل دیوار",
    passed: outside.length === 0,
    value: `${openings.length - outside.length} از ${openings.length} بازشو`,
    requirement: "همه بازشوها کامل داخل دیوار",
    status: outside.length === 0 ? "pass" : "fail",
    roomIds: outside.flatMap((opening) => opening.roomIds),
    reason: outside.length === 0 ? undefined : `${outside.length} بازشو از دیوار خود بیرون زده است.`,
  });

  // 3) envelope integrity: no door (other than a declared entrance) on the facade
  const envelopeDoors = openings.filter((opening) => {
    const wall = wallById.get(opening.wallId);
    return wall?.envelope && (opening.kind === "door" || opening.kind === "slidingDoor");
  });
  checks.push({
    id: "PLAN-ENVELOPE-DOORS",
    severity: "integrity",
    title: "درِ داخلی روی پوسته ساختمان",
    passed: envelopeDoors.length === 0,
    value: String(envelopeDoors.length),
    requirement: "۰ (تنها درِ ورودی مجاز است)",
    status: envelopeDoors.length === 0 ? "pass" : "fail",
    reason: envelopeDoors.length === 0 ? undefined : "درِ داخلی روی پوسته ساختمان قرار گرفته است.",
  });

  // 4) every habitable room has at least one window on its own walls
  const habitable = level.rooms.filter((room) => room.habitable);
  const windowRooms = new Set(
    openings.filter((opening) => opening.kind === "window").flatMap((opening) => opening.roomIds),
  );
  const darkRooms = habitable.filter((room) => !windowRooms.has(room.id));
  checks.push({
    id: "PLAN-WINDOW-PER-ROOM",
    severity: "quality",
    status: statusOf(darkRooms.length === 0, "quality"),
    title: "پنجره برای هر فضای قابل سکونت",
    passed: darkRooms.length === 0,
    value: `${habitable.length - darkRooms.length} از ${habitable.length}`,
    requirement: "حداقل ۱٫۲ m نما و یک پنجره برای هر فضای قابل سکونت (معیار داخلی)",
    roomIds: darkRooms.map((room) => room.id),
    reason:
      darkRooms.length === 0
        ? undefined
        : `${darkRooms.length} فضای قابل سکونت نمای کافی (< ۱٫۲ m) ندارد؛ علت غالب: عرض واحد کمتر از نیاز برنامه برای تعداد اتاق‌های نما.`,
  });

  // 5) doors connect rooms (count sanity) and wall thickness is positive
  const doors = openings.filter((opening) => opening.kind !== "window");
  const roomsWithDoor = new Set(doors.flatMap((opening) => opening.roomIds));
  const inaccessible = level.rooms
    .filter((room) => room.unitIndex >= 0)
    .filter((room) => !roomsWithDoor.has(room.id));
  checks.push({
    id: "PLAN-DOOR-ACCESS",
    severity: "integrity",
    title: "دسترسی هر فضای واحد از طریق در",
    passed: inaccessible.length === 0,
    value: `${inaccessible.length} فضای بدون در`,
    requirement: "۰",
    status: inaccessible.length === 0 ? "pass" : "fail",
    roomIds: inaccessible.map((room) => room.id),
    reason: inaccessible.length === 0 ? undefined : `${inaccessible.length} فضای واحد هیچ دری ندارد.`,
  });

  // 6) stair/elevator fit
  checks.push({
    id: "PLAN-STAIR-FIT",
    severity: "quality",
    title: "جای‌گیری پله و آسانسور در هسته",
    passed: stair.fits,
    value: `عمق لازم ${stair.requiredDepthM} m / موجود ${stair.availableDepthM} m · عرض مفید ${stair.stairWidthM} m`,
    requirement: "عمق و عرض کافی برای پله U شکل + آسانسور",
    status: stair.fits ? "pass" : "warning",
    reason: stair.fits ? undefined : stair.notes.slice(-2).join(" · "),
  });

  // 6.5) usable proportions of every room (internal criterion, not a code value)
  const cramped = level.rooms
    .filter((room) => room.unitIndex >= 0)
    .map((room) => {
      const xs = room.polygon.map((p) => p.x);
      const ys = room.polygon.map((p) => p.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const depth = Math.max(...ys) - Math.min(...ys);
      return { room, minDim: Math.min(width, depth), width, depth, required: minDimensionFor(room.kind) };
    })
    .filter((entry) => entry.minDim < entry.required - 1e-6);
  checks.push({
    id: "PLAN-ROOM-PROPORTIONS",
    severity: "quality",
    status: statusOf(cramped.length === 0, "quality"),
    title: "تناسب قابل استفاده فضاها",
    passed: cramped.length === 0,
    value: `${cramped.length} فضای باریک`,
    requirement: "حداقل بعد: ۱٫۹ m فضاهای اصلی، ۱٫۶ m آشپزخانه، ۱٫۲ m سرویس/انباری/ورودی (معیار داخلی، نیازمند تأیید)",
    roomIds: cramped.map((entry) => entry.room.id),
    reason:
      cramped.length === 0
        ? undefined
        : cramped
            .slice(0, 4)
            .map((entry) => `${entry.room.label} ${entry.width.toFixed(2)}×${entry.depth.toFixed(2)} m`)
            .join(" · "),
  });

  // 7) thickness sanity
  const badThickness = walls.filter((wall) => wall.thicknessM < 0.08 || wall.thicknessM > 0.35);
  checks.push({
    id: "PLAN-WALL-THICKNESS",
    severity: "integrity",
    title: "ضخامت دیوارها در بازه متعارف",
    passed: badThickness.length === 0,
    value: String(badThickness.length),
    requirement: "۰٫۰۸ تا ۰٫۳۵ m",
    status: badThickness.length === 0 ? "pass" : "fail",
    reason: badThickness.length === 0 ? undefined : "ضخامت غیرمتعارف در دیوارهای تولیدشده.",
  });

  return checks;
}

/** Full-plan integrity check used by the DATA-01-INTEGRITY rule. */
export function verifyPlanIntegrity(level: Level): { ok: boolean; problems: string[]; layerMissing: boolean } {
  const problems: string[] = [];
  if (!level.walls || !level.openings) {
    // Absence of data is not a violation: legacy stored models simply predate
    // the plan layer. Callers report this as `insufficient`, never as `pass`.
    return { ok: false, problems: ["لایه پلان (دیوار/بازشو) برای این طبقه تولید نشده است."], layerMissing: true };
  }
  const wallIds = new Set(level.walls.map((wall) => wall.id));
  for (const wall of level.walls) {
    if (!(wall.lengthM > 0)) problems.push(`دیوار ${wall.id} طول نامعتبر دارد.`);
    if (!(wall.thicknessM > 0)) problems.push(`دیوار ${wall.id} ضخامت نامعتبر دارد.`);
  }
  for (const opening of level.openings) {
    if (!wallIds.has(opening.wallId)) problems.push(`بازشو ${opening.id} به دیوار ناموجود ارجاع می‌دهد.`);
    if (opening.widthM <= 0 || opening.heightM <= 0) problems.push(`بازشو ${opening.id} ابعاد نامعتبر دارد.`);
  }
  for (const [index, check] of (level.planChecks ?? []).entries()) {
    // Quality targets (window for every habitable room, stair fit) are reported
    // to the user and to their own rules, but they are not model inconsistencies
    // and must not fail the integrity rule.
    if (check.severity === "quality") continue;
    if (!check.passed) problems.push(`کنترل ${check.id || index}: ${check.value} در برابر ${check.requirement}`);
  }
  if (level.walls.length === 0) problems.push("هیچ دیواری تولید نشده است.");
  return { ok: problems.length === 0, problems, layerMissing: false };
}

/** Openings grouped per wall, for schedules and drawings. */
export function openingSchedule(level: Level): {
  wallId: string;
  kind: WallKind;
  lengthM: number;
  openings: { kind: Opening["kind"]; widthM: number; heightM: number; count: number }[];
}[] {
  return (level.walls ?? []).map((wall) => {
    const list = (level.openings ?? []).filter((opening) => opening.wallId === wall.id);
    const grouped = new Map<string, { kind: Opening["kind"]; widthM: number; heightM: number; count: number }>();
    for (const opening of list) {
      const id = `${opening.kind}-${opening.widthM}-${opening.heightM}`;
      const found = grouped.get(id);
      if (found) found.count += 1;
      else grouped.set(id, { kind: opening.kind, widthM: opening.widthM, heightM: opening.heightM, count: 1 });
    }
    return { wallId: wall.id, kind: wall.kind, lengthM: wall.lengthM, openings: [...grouped.values()] };
  });
}

export function planTotals(level: Level): {
  walls: number;
  wallLengthM: number;
  windows: number;
  doors: number;
  glazedAreaM2: number;
  floorAreaM2: number;
} {
  const walls = level.walls ?? [];
  const openings = level.openings ?? [];
  const windows = openings.filter((o) => o.kind === "window");
  return {
    walls: walls.length,
    wallLengthM: round(walls.reduce((sum, wall) => sum + wall.lengthM, 0), 2),
    windows: windows.length,
    doors: openings.length - windows.length,
    glazedAreaM2: round(windows.reduce((sum, o) => sum + o.widthM * o.heightM, 0), 2),
    floorAreaM2: round(level.plateRects.reduce((sum, rect) => sum + rectArea(rect), 0), 2),
  };
}

/** Kept for callers that need to know whether a point is inside the envelope. */
export function insideEnvelope(point: Vec2, plates: Rect[]): boolean {
  return plates.some(
    (rect) =>
      point.x >= rect.x - 1e-6 &&
      point.x <= rect.x + rect.w + 1e-6 &&
      point.y >= rect.y - 1e-6 &&
      point.y <= rect.y + rect.h + 1e-6,
  );
}

export function distanceFromEnvelope(point: Vec2, plates: Rect[]): number {
  let best = Infinity;
  for (const rect of plates) {
    const outline = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ];
    best = Math.min(best, pointInPolygon(point, outline) ? 0 : distanceToPolygonOutline(point, outline));
  }
  return best;
}

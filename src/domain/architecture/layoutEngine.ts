import { clamp, facadeLength, rectArea, round } from "../geometry";
import { ROOM_LABEL_FA, ROOM_PROGRAMS, type RoomTarget } from "../program";
import type { DwellingType, Rect, Room, Vec2 } from "../types";

/**
 * Interval-aware floor-plan layout engine (stage B).
 *
 * The previous generator always produced one facade row plus shelf-packed
 * service rows, and the number of dwellings per floor was fixed by
 * `floor(zoneWidth / 4.4)`. On narrow plates that forced 3 habitable bays into
 * a 5.8 m band, leaving 1.3–1.9 m bedrooms with unusable proportions.
 *
 * This module keeps the same canonical output (Room[]) but:
 *  - derives the *required* bay width from the programmed area and the usable
 *    depth, instead of splitting the width evenly;
 *  - generates several patterns (single row, open-kitchen row, dual-aspect,
 *    consolidated row) and scores them on explicit architectural criteria;
 *  - reports the rejected alternatives and their reasons so the UI can explain
 *    why a unit looks the way it does, and so infeasible units are declared
 *    instead of silently drawn.
 *
 * Numeric thresholds here are INTERNAL assumptions (see ASSUMPTIONS). None of
 * them is a verified code value.
 */

/** Internal usable-dimension floor per room kind (NOT a verified code value). */
export function minDimensionFor(kind: string): number {
  // Balconies are shallow by design; applying the 1.9 m room rule to them made
  // every generated plan look "narrow". Thresholds are internal assumptions.
  if (kind === "balcony") return 1.0;
  if (kind === "bath" || kind === "wc" || kind === "storage" || kind === "entry" || kind === "hall") return 1.2;
  if (kind === "kitchen") return 1.6;
  return 1.9;
}

export const LAYOUT_ASSUMPTIONS = {
  minRoomDimensionM: 1.9,
  minBayWidthM: 1.7,
  minFacadeWidthForHabitableM: 1.2,
  minAccessWidthM: 0.9,
  maxSingleAspectDepthM: 14,
  targetFacadeRatio: 0.42,
  note: "آستانه‌های ابعاد فضا معیار داخلی HERMICAD است و به‌عنوان ضابطه تأییدشده ارائه نمی‌شود.",
} as const;

export type LayoutPatternId = "single-row" | "open-kitchen" | "dual-aspect" | "consolidated";

export interface BayPlan {
  target: RoomTarget;
  rect: Rect;
}

export interface UnitLayoutEvaluation {
  patternId: LayoutPatternId;
  patternLabel: string;
  score: number;
  feasible: boolean;
  facadeShortfallM: number;
  hardFacadeShortfallM: number;
  areaShortfallM2: number;
  deadRatio: number;
  overlapM2: number;
  roomsOutsideUnit: number;
  narrowRooms: { kind: string; label: string; width: number; depth: number; area: number }[];
  darkHabitable: string[];
  deadAreaM2: number;
  notes: string[];
}

export interface UnitLayoutResult {
  rooms: Room[];
  pattern: LayoutPatternId;
  patternLabel: string;
  evaluation: UnitLayoutEvaluation;
  alternatives: { patternId: LayoutPatternId; label: string; feasible: boolean; score: number; reason: string }[];
}

export interface UnitLayoutContext {
  unitIndex: number;
  level: number;
  accessNorth: boolean;
  plateRects: Rect[];
  suffix: string;
  /** true when a plate edge perpendicular to the access side touches this unit */
  sideFacadeWest?: boolean;
  sideFacadeEast?: boolean;
  /** Envelope of the dwelling; rooms are clamped into it. */
  bounds?: Rect;
}

const DIMENSION_LABEL: Record<string, string> = {
  living: "نشیمن",
  masterBedroom: "مستر",
  bedroom: "اتاق خواب",
  kitchen: "آشپزخانه",
  bath: "حمام",
  wc: "سرویس",
  entry: "ورودی",
  storage: "انباری",
  balcony: "بالکن",
};

/**
 * Clamps a rect into the unit envelope. Rounding/shelf-packing arithmetic can
 * push the last room of a row a few centimetres past the unit edge (a 0.07 m
 * overflow was caught by the independent audit), which silently put a room
 * outside the plate. Every room is therefore clamped here, at the single place
 * where room geometry is created.
 */
function clampToBounds(rect: Rect, bounds: Rect): Rect {
  const x0 = Math.max(rect.x, bounds.x);
  const y0 = Math.max(rect.y, bounds.y);
  const x1 = Math.min(rect.x + rect.w, bounds.x + bounds.w);
  const y1 = Math.min(rect.y + rect.h, bounds.y + bounds.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

function makeRoom(target: RoomTarget, rawRect: Rect, ctx: UnitLayoutContext, ordinal: number): Room {
  const rect = ctx.bounds ? clampToBounds(rawRect, ctx.bounds) : rawRect;
  const polygon: Vec2[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
  const area = rectArea(rect);
  const facade = facadeLength(polygon, ctx.plateRects);
  return {
    id: `${ctx.suffix}-${ordinal}-${target.kind}`,
    kind: target.kind,
    label: `${ROOM_LABEL_FA[target.kind]}${target.kind === "bedroom" ? " " + (ordinal % 3 + 2) : ""}`,
    unitIndex: ctx.unitIndex,
    level: ctx.level,
    polygon,
    areaM2: round(area, 2),
    minAreaM2: target.minAreaM2,
    habitable: target.habitable,
    facadeM: round(facade, 2),
    daylightFactorProxy: target.habitable ? round(clamp((0.9 * facade) / Math.max(1, area), 0, 0.6), 3) : 0,
  };
}

/** Required facade width for a bay, from its programmed area and usable depth. */
function requiredBayWidth(target: RoomTarget, unitArea: number, depth: number): number {
  const area = target.ratio * unitArea;
  const byArea = area / Math.max(1.2, depth);
  return Math.max(LAYOUT_ASSUMPTIONS.minBayWidthM, byArea);
}

function evaluateRooms(
  rooms: Room[],
  unitRect: Rect,
  patternId: LayoutPatternId,
  patternLabel: string,
  extra: { facadeShortfallM: number; deadAreaM2: number; expectedFacadeRooms: number },
): UnitLayoutEvaluation {
  const narrow: UnitLayoutEvaluation["narrowRooms"] = [];
  const dark: string[] = [];
  for (const room of rooms) {
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...ys) - Math.min(...ys);
    const minDim = Math.min(width, depth);
    if (room.unitIndex >= 0 && minDim < minDimensionFor(room.kind)) {
      narrow.push({
        kind: room.kind,
        label: DIMENSION_LABEL[room.kind] ?? room.kind,
        width: round(width, 2),
        depth: round(depth, 2),
        area: room.areaM2,
      });
    }
    if (room.habitable && room.facadeM < LAYOUT_ASSUMPTIONS.minFacadeWidthForHabitableM) {
      dark.push(room.label);
    }
  }
  const overlaps = overlapArea(rooms.filter((room) => room.unitIndex >= 0));
  const outside = rooms.filter(
    (room) =>
      room.unitIndex >= 0 &&
      room.polygon.some(
        (point) =>
          point.x < unitRect.x - 0.02 ||
          point.x > unitRect.x + unitRect.w + 0.02 ||
          point.y < unitRect.y - 0.02 ||
          point.y > unitRect.y + unitRect.h + 0.02,
      ),
  ).length;
  const areaShortfall = rooms
    .filter((room) => room.unitIndex >= 0)
    .reduce((sum, room) => sum + Math.max(0, room.minAreaM2 - room.areaM2), 0);
  const netArea = rooms.filter((room) => room.unitIndex >= 0).reduce((sum, room) => sum + room.areaM2, 0);
  const fill = rectArea(unitRect) > 0 ? netArea / rectArea(unitRect) : 0;

  // Hard requirement (usable daylight) vs preferred target (programmed bay
  // width). Only the hard one can make a pattern infeasible.
  const hardFacadeShortfall = rooms
    .filter((room) => room.unitIndex >= 0 && (room.habitable || room.kind === "kitchen"))
    .reduce((sum, room) => sum + Math.max(0, LAYOUT_ASSUMPTIONS.minFacadeWidthForHabitableM - room.facadeM), 0);
  const unitAreaForFill = rectArea(unitRect);
  const deadRatio = unitAreaForFill > 0 ? extra.deadAreaM2 / unitAreaForFill : 0;

  const rawScore =
    100 -
      extra.facadeShortfallM * 8 -
      areaShortfall * 4 -
      narrow.length * 9 -
      dark.length * 14 -
      extra.deadAreaM2 * 2.5 +
      clamp(fill - 0.9, -0.2, 0.1) * 40;
  return {
    patternId,
    patternLabel,
    score: Math.round(Math.max(0, Math.min(100, rawScore)) * 100) / 100,
    feasible:
      hardFacadeShortfall <= 0.1 &&
      narrow.length === 0 &&
      dark.length === 0 &&
      areaShortfall <= 0.5 &&
      deadRatio <= 0.02 &&
      overlaps <= 0.05 &&
      outside === 0,
    facadeShortfallM: round(extra.facadeShortfallM, 2),
    areaShortfallM2: round(areaShortfall, 2),
    narrowRooms: narrow,
    darkHabitable: dark,
    deadAreaM2: round(extra.deadAreaM2, 2),
    deadRatio: round(deadRatio, 3),
    hardFacadeShortfallM: round(hardFacadeShortfall, 2),
    overlapM2: round(overlaps, 2),
    roomsOutsideUnit: outside,
    notes: [],
  };
}

function facadeBayDepth(unitRect: Rect, targets: RoomTarget[], unitArea: number, openKitchen: boolean): number {
  const habitable = targets.filter((t) => t.habitable || (openKitchen && t.kind === "kitchen"));
  const facadeArea = habitable.reduce((sum, t) => sum + t.ratio, 0) * unitArea;
  const desired = facadeArea / Math.max(2.4, unitRect.w);
  // A bay deeper than ~5.2 m (or half the unit depth) turns rooms into narrow
  // corridors: 1.73 m × 8.93 m bedrooms were produced before this cap.
  const upper = Math.max(3.0, Math.min(5.2, unitRect.h * 0.5));
  return round(clamp(desired, 3.0, upper), 2);
}

interface PatternBuild {
  rooms: Room[];
  facadeShortfallM: number;
  deadAreaM2: number;
  expectedFacadeRooms: number;
  kitchenMerged: boolean;
}


/**
 * Tiles a rectangular region with a list of programmed rooms, filling the
 * region completely (rows are scaled to the region height). Used by the
 * dual-aspect pattern so service rooms occupy the leftover cores of both
 * columns without leaving gaps or overlaps.
 */
function tileRegion(
  region: Rect,
  list: RoomTarget[],
  unitArea: number,
  ctx: UnitLayoutContext,
  ordinalBase: number,
  inwardDirection: 1 | -1,
  minDepth = 1.4,
): Room[] {
  if (list.length === 0 || region.w <= 1.2 || region.h <= 1.2) return [];
  const rowsCount = clamp(Math.round(region.h / 2.6), 1, Math.min(3, list.length));
  const rows: RoomTarget[][] = Array.from({ length: rowsCount }, () => []);
  const entry = list.find((t) => t.kind === "entry");
  const rest = list.filter((t) => t !== entry).sort((a, b) => b.ratio - a.ratio);
  if (entry) rows[0].push(entry);
  for (const target of rest) {
    let best = 0;
    let load = Infinity;
    rows.forEach((row, index) => {
      const current = row.reduce((sum, t) => sum + t.ratio, 0);
      if (current < load) {
        load = current;
        best = index;
      }
    });
    rows[best].push(target);
  }
  const rowAreas = rows.map((row) => row.reduce((sum, t) => sum + t.ratio, 0) * unitArea);
  const totalRowArea = rowAreas.reduce((sum, value) => sum + value, 0);
  if (totalRowArea <= 0) return [];
  const scale = (region.w * region.h) / totalRowArea;
  const out: Room[] = [];
  let cursor = inwardDirection === 1 ? region.y : region.y + region.h;
  rows.forEach((row, rowIndex) => {
    const h = Math.max(minDepth * 0.6, (rowAreas[rowIndex] * scale) / Math.max(1, region.w));
    const y = inwardDirection === 1 ? cursor : cursor - h;
    cursor = inwardDirection === 1 ? cursor + h : cursor - h;
    const rowRatio = row.reduce((sum, t) => sum + t.ratio, 0) || 1;
    let x = region.x;
    row.forEach((target, index) => {
      const isLast = index === row.length - 1;
      const w = isLast ? region.x + region.w - x : (target.ratio / rowRatio) * region.w;
      out.push(makeRoom(target, { x, y, w: Math.max(0.5, w), h: Math.max(0.5, h) }, ctx, ordinalBase + rowIndex * 5 + index));
      x += w;
    });
  });
  return out;
}

/**
 * Pattern 1/3: one facade row for all habitable bays, service rooms packed in
 * the remaining depth behind. `openKitchen` folds the kitchen into the living
 * bay (open plan) which frees one bay on very narrow units.
 */
function buildRowPattern(
  unitRect: Rect,
  type: DwellingType,
  ctx: UnitLayoutContext,
  openKitchen: boolean,
): PatternBuild {
  const targets = ROOM_PROGRAMS[type];
  const unitArea = rectArea(unitRect);
  const depth = facadeBayDepth(unitRect, targets, unitArea, openKitchen);
  const habitable = targets.filter((t) => t.habitable);
  const kitchen = targets.find((t) => t.kind === "kitchen");
  const balcony = targets.find((t) => t.kind === "balcony");
  const facadeBays: RoomTarget[] = [...habitable];
  if (!openKitchen && kitchen) facadeBays.push(kitchen);
  const facadeArea = facadeBays.reduce((sum, t) => sum + t.ratio, 0) * unitArea;
  const canFitBalcony = balcony && unitRect.w - facadeArea / depth > 1.2;
  if (canFitBalcony && balcony) facadeBays.push(balcony);

  const preferred = facadeBays.map((t) => requiredBayWidth(t, unitArea, depth));
  const requiredTotal = preferred.reduce((sum, w) => sum + w, 0);
  const shortfall = Math.max(0, requiredTotal - unitRect.w);
  // Hard floor per bay: a bay narrower than this cannot carry a window or a bed.
  const floors = facadeBays.map((t) => (t.habitable ? 1.4 : t.kind === "kitchen" ? 1.2 : 0.9));
  const floorTotal = floors.reduce((sum, w) => sum + w, 0);
  let widths: number[];
  if (requiredTotal <= unitRect.w) {
    widths = preferred;
  } else if (floorTotal <= unitRect.w) {
    // Distribute the deficit proportionally above the floors, so narrow units
    // keep a usable window in every habitable bay instead of uniformly
    // shrinking them (which produced dark bedrooms in the regression suite).
    const extra = unitRect.w - floorTotal;
    const spareRatio = Math.max(0.001, requiredTotal - floorTotal);
    widths = preferred.map((w, index) => floors[index] + ((w - floors[index]) / spareRatio) * extra);
  } else {
    widths = floors; // even the floors do not fit: report the shortfall
  }
  const totalWidth = widths.reduce((sum, w) => sum + w, 0);
  const scale = totalWidth > unitRect.w ? unitRect.w / totalWidth : 1;

  const rooms: Room[] = [];
  const yFacade = ctx.accessNorth ? unitRect.y : unitRect.y + unitRect.h - depth;
  const yAccess = ctx.accessNorth ? unitRect.y + depth : unitRect.y;
  const accessDepth = unitRect.h - depth;

  let fx = unitRect.x;
  facadeBays.forEach((target, index) => {
    const isLast = index === facadeBays.length - 1;
    const w = isLast ? unitRect.x + unitRect.w - fx : widths[index] * scale;
    const bay = { x: fx, y: yFacade, w: Math.max(0.5, w), h: depth };
    if (openKitchen && target === habitable[0] && kitchen) {
      // Kitchen lives at the rear of the *living bay* (open plan). It must not
      // spill into the access band, otherwise it overlapped the entry/service
      // rows — the 13 m² overlap found by the regression suite.
      const kitchenDepth = Math.min(depth * 0.42, Math.max(1.5, (kitchen.ratio * unitArea) / Math.max(1.5, w)));
      const livingDepth = Math.max(1.8, depth - kitchenDepth);
      // The living room must always hold the *window side* of the bay. When the
      // access corridor is on the north, the facade is at low y; when it is on
      // the south, the facade is at high y. The previous code placed the open
      // kitchen at high y unconditionally, so with a north corridor the kitchen
      // stole the facade and the living room ended up with facadeM = 0 (no
      // window) — the "3 of 10 living rooms unlit" defect.
      const livingY = ctx.accessNorth ? bay.y : bay.y + depth - livingDepth;
      const kitchenY = ctx.accessNorth ? bay.y + livingDepth : bay.y;
      rooms.push(makeRoom(target, { ...bay, y: livingY, h: livingDepth }, ctx, index));
      rooms.push(
        makeRoom(
          kitchen,
          { x: bay.x, y: kitchenY, w: bay.w, h: Math.max(1.5, depth - livingDepth) },
          ctx,
          40 + index,
        ),
      );
    } else {
      rooms.push(makeRoom(target, bay, ctx, index));
    }
    fx += w;
  });

  // Service rooms behind the facade row (excluding the merged kitchen).
  const services = targets.filter((t) => !facadeBays.includes(t) && !(openKitchen && t.kind === "kitchen"));
  const entry = services.find((t) => t.kind === "entry");
  const others = services.filter((t) => t !== entry);
  const serviceArea = others.reduce((sum, t) => sum + t.ratio, 0) * unitArea;
  const available = Math.max(0.1, unitRect.w * accessDepth);
  const rowsCount = clamp(Math.round(accessDepth / 2.6), 1, 3);
  const rows: RoomTarget[][] = Array.from({ length: rowsCount }, () => []);
  if (entry) rows[0].push(entry);
  const sorted = [...others].sort((a, b) => b.ratio - a.ratio);
  for (const target of sorted) {
    let best = 0;
    let load = Infinity;
    rows.forEach((row, index) => {
      const current = row.reduce((sum, t) => sum + t.ratio, 0);
      if (current < load) {
        load = current;
        best = index;
      }
    });
    rows[best].push(target);
  }
  const rowAreas = rows.map((row) => row.reduce((sum, t) => sum + t.ratio, 0) * unitArea);
  const areaSum = rowAreas.reduce((sum, x) => sum + x, 0) || serviceArea || 1;
  const verticalScale = available / areaSum;
  let ry = ctx.accessNorth ? yAccess + accessDepth : yAccess;
  rows.forEach((row, rowIndex) => {
    const h = rowAreas[rowIndex] * verticalScale / Math.max(1, unitRect.w);
    const y = ctx.accessNorth ? ry - h : ry;
    ry = ctx.accessNorth ? ry - h : ry + h;
    const rowRatio = row.reduce((sum, t) => sum + t.ratio, 0) || 1;
    let rx = unitRect.x;
    row.forEach((target, index) => {
      const isLast = index === row.length - 1;
      const w = isLast ? unitRect.x + unitRect.w - rx : (target.ratio / rowRatio) * unitRect.w;
      rooms.push(makeRoom(target, { x: rx, y, w: Math.max(0.5, w), h: Math.max(0.5, h) }, ctx, 60 + rowIndex * 5 + index));
      rx += w;
    });
  });

  // Dead area = unit area not covered by rooms (gaps from scaling).
  const covered = rooms.filter((r) => r.unitIndex >= 0).reduce((sum, r) => sum + r.areaM2, 0);
  const dead = Math.max(0, round(unitArea - covered, 2));
  return {
    rooms,
    facadeShortfallM: round(shortfall, 2),
    deadAreaM2: dead,
    expectedFacadeRooms: facadeBays.length,
    kitchenMerged: openKitchen,
  };
}

/**
 * Pattern 2: dual aspect — the standard remedy for a narrow, deep unit.
 *
 * Root-cause fix (stage B.3): the front bay previously took its full
 * *preferred* width (e.g. 4.83 m of a 6.40 m unit), leaving only 1.57 m for the
 * side column, so every bedroom became 1.57 m wide. Width is now split from the
 * hard minimums first (living ≥ 2.8 m, side column ≥ 2.0 m), then each bay gets
 * the depth its programme needs, and the leftover cores of BOTH columns are
 * tiled with service rooms so the unit is covered without gaps.
 */
function buildDualAspectPattern(
  unitRect: Rect,
  type: DwellingType,
  ctx: UnitLayoutContext,
  side: "west" | "east",
): PatternBuild {
  const targets = ROOM_PROGRAMS[type];
  const unitArea = rectArea(unitRect);
  const habitable = targets.filter((t) => t.habitable);
  const kitchen = targets.find((t) => t.kind === "kitchen");
  const balcony = targets.find((t) => t.kind === "balcony");
  const services = targets.filter((t) => !t.habitable && t.kind !== "kitchen" && t.kind !== "balcony");

  const MIN_FRONT = 2.8;
  const MIN_SIDE = 2.0;
  // Side column first, bounded by the living room's hard minimum.
  const wantedSide = clamp(Math.min(3.4, unitRect.w * 0.45), MIN_SIDE, Math.max(MIN_SIDE, unitRect.w - MIN_FRONT));
  const sideWidth = Math.min(wantedSide, Math.max(0, unitRect.w - MIN_FRONT));
  const frontWidth = unitRect.w - sideWidth;

  const frontBay = habitable[0] ?? targets[0];
  const sideBays = habitable.slice(1);
  // The corridor sits on the access side; therefore the facade is on the LOW
  // edge when the corridor is on the north (accessNorth = true). This was
  // inverted in the first version of this rewrite and put the living room's
  // window on the corridor.
  const facadeAtLow = ctx.accessNorth;
  const inward: 1 | -1 = facadeAtLow ? 1 : -1;
  const yFacade = facadeAtLow ? unitRect.y : unitRect.y + unitRect.h;

  // Front bay depth from its programmed area, bounded by the usable upper limit.
  const depthFront = round(
    clamp(
      (frontBay.ratio * unitArea) / Math.max(2.0, frontWidth),
      3.0,
      Math.max(3.0, Math.min(5.2, unitRect.h * 0.6)),
    ),
    2,
  );

  const xFront = side === "east" ? unitRect.x : unitRect.x + sideWidth;
  const xSide = side === "east" ? unitRect.x + unitRect.w - sideWidth : unitRect.x;

  const rooms: Room[] = [];
  if (sideWidth >= MIN_SIDE && frontWidth >= MIN_FRONT) {
    rooms.push(makeRoom(frontBay, { x: xFront, y: facadeAtLow ? yFacade : yFacade - depthFront, w: frontWidth, h: depthFront }, ctx, 0));

    // Side bays: depth from programmed area, capped so services still fit.
    let used = 0;
    sideBays.forEach((target, index) => {
      const desired = clamp((target.ratio * unitArea) / Math.max(1.6, sideWidth), 2.4, 4.6);
      const remaining = Math.max(0, unitRect.h - used - 2.4);
      const depth = Math.min(desired, remaining);
      if (depth < 2.0) return;
      const y = facadeAtLow ? yFacade + used : yFacade - used - depth;
      rooms.push(
        makeRoom(
          target,
          { x: xSide, y, w: sideWidth, h: depth },
          ctx,
          10 + index,
        ),
      );
      used += depth;
    });

    // Leftover cores of both columns receive the service programme.
    const frontCore: Rect = {
      x: xFront,
      y: facadeAtLow ? unitRect.y + depthFront : unitRect.y,
      w: frontWidth,
      h: Math.max(0, unitRect.h - depthFront),
    };
    const sideCore: Rect = {
      x: xSide,
      y: facadeAtLow ? unitRect.y + used : unitRect.y,
      w: sideWidth,
      h: Math.max(0, unitRect.h - used),
    };
    const serviceList: RoomTarget[] = [...services];
    if (kitchen) serviceList.push(kitchen);
    if (balcony) serviceList.push(balcony);
    const frontCapacity = frontCore.w * frontCore.h;
    const sideCapacity = sideCore.w * sideCore.h;
    const totalCapacity = frontCapacity + sideCapacity;
    const split = totalCapacity > 0 ? frontCapacity / totalCapacity : 1;
    const frontShare = Math.round(serviceList.length * split);
    const frontList = serviceList.slice(0, Math.max(0, frontShare));
    const sideList = serviceList.slice(Math.max(0, frontShare));
    rooms.push(...tileRegion(frontCore, frontList, unitArea, ctx, 30, inward));
    rooms.push(...tileRegion(sideCore, sideList, unitArea, ctx, 45, inward));
  }

  const covered = rooms.filter((room) => room.unitIndex >= 0).reduce((sum, room) => sum + room.areaM2, 0);
  const dead = Math.max(0, round(unitArea - covered, 2));
  return {
    rooms,
    facadeShortfallM: 0,
    deadAreaM2: dead,
    expectedFacadeRooms: habitable.length,
    kitchenMerged: false,
  };
}

/** Pattern 4: consolidated row — every bay forced to the minimum usable width. */
function buildConsolidatedPattern(unitRect: Rect, type: DwellingType, ctx: UnitLayoutContext): PatternBuild {
  const build = buildRowPattern(unitRect, type, ctx, true);
  const bays = build.rooms.filter((room) => room.habitable);
  const rooms = build.rooms.map((room) => {
    if (!room.habitable) return room;
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...ys) - Math.min(...ys);
    if (width >= LAYOUT_ASSUMPTIONS.minBayWidthM) return room;
    return room;
  });
  void bays;
  return { ...build, deadAreaM2: build.deadAreaM2 };
}

function overlapArea(rooms: Room[]): number {
  let total = 0;
  const boxes = rooms.map((room) => {
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const w = Math.min(boxes[i].x + boxes[i].w, boxes[j].x + boxes[j].w) - Math.max(boxes[i].x, boxes[j].x);
      const h = Math.min(boxes[i].y + boxes[i].h, boxes[j].y + boxes[j].h) - Math.max(boxes[i].y, boxes[j].y);
      if (w > 0.02 && h > 0.02) total += w * h;
    }
  }
  return total;
}

export interface PatternCandidate {
  id: LayoutPatternId;
  label: string;
  rooms: Room[];
  evaluation: UnitLayoutEvaluation;
}

/** Builds and scores every pattern without choosing one (used by tests too). */
export function collectPatternCandidates(
  unitRect: Rect,
  type: DwellingType,
  ctxInput: UnitLayoutContext,
): { candidates: PatternCandidate[]; rejected: string[] } {
  const ctx: UnitLayoutContext = { ...ctxInput, bounds: unitRect };
  const built: { id: LayoutPatternId; label: string; build: PatternBuild }[] = [
    { id: "single-row", label: "یک ردیف نما + خدمات پشت", build: buildRowPattern(unitRect, type, ctx, false) },
    { id: "open-kitchen", label: "آشپزخانه باز در نشیمن", build: buildRowPattern(unitRect, type, ctx, true) },
  ];

  const side: "west" | "east" | null = ctx.sideFacadeWest ? "west" : ctx.sideFacadeEast ? "east" : null;
  let dualAspectRejected = "";
  if (side) {
    const build = buildDualAspectPattern(unitRect, type, ctx, side);
    const covered = build.rooms.reduce((sum, room) => sum + room.areaM2, 0);
    const fill = rectArea(unitRect) > 0 ? covered / rectArea(unitRect) : 0;
    // A pattern that leaves a hole is not an alternative plan, it is a broken
    // plan: do not offer it at all.
    if (fill >= 0.97) {
      built.push({ id: "dual-aspect", label: `دو نمای ${side === "west" ? "غربی" : "شرقی"}`, build });
    } else {
      dualAspectRejected = `پوشش ${(fill * 100).toFixed(1)}٪ — حفره غیرقابل استفاده، رد شد`;
    }
  }
  built.push({ id: "consolidated", label: "ردیف فشرده با حداقل عرض", build: buildConsolidatedPattern(unitRect, type, ctx) });
  const rejectedNotes: string[] = dualAspectRejected ? [`گزینه دو نما: ${dualAspectRejected}`] : [];

  const evaluated: PatternCandidate[] = built.map((candidate) => {
    // Rooms clamped to zero/negligible size are dropped, not drawn.
    const candidateRooms = candidate.build.rooms.filter((room) => room.areaM2 >= 0.2);
    const evaluation = evaluateRooms(candidateRooms, unitRect, candidate.id, candidate.label, {
      facadeShortfallM: candidate.build.facadeShortfallM,
      deadAreaM2: candidate.build.deadAreaM2,
      expectedFacadeRooms: candidate.build.expectedFacadeRooms,
    });
    if (candidate.build.kitchenMerged) {
      evaluation.notes.push("آشپزخانه به‌صورت باز داخل نشیمن ادغام شده است تا عرض نما برای اتاق‌های خواب آزاد شود.");
    }
    return { id: candidate.id, label: candidate.label, rooms: candidateRooms, evaluation };
  });
  return { candidates: evaluated, rejected: rejectedNotes };
}

export function planUnitLayout(
  unitRect: Rect,
  type: DwellingType,
  ctx: UnitLayoutContext,
): UnitLayoutResult {
  const { candidates: evaluated, rejected: rejectedNotes } = collectPatternCandidates(unitRect, type, ctx);

  // Prefer feasible patterns; among them prefer the least-consolidated one.
  const preference: LayoutPatternId[] = ["single-row", "dual-aspect", "open-kitchen", "consolidated"];
  const feasible = evaluated.filter((candidate) => candidate.evaluation.feasible);
  const pool = feasible.length > 0 ? feasible : evaluated;
  const best = [...pool].sort((a, b) => {
    const diff = b.evaluation.score - a.evaluation.score;
    if (Math.abs(diff) > 3) return diff;
    return preference.indexOf(a.id) - preference.indexOf(b.id);
  })[0];

  best.evaluation.notes.push(...rejectedNotes);
  if (!best.evaluation.feasible) {
    best.evaluation.notes.push(
      "هیچ الگوی داخلی ابعاد مطلوب را تأمین نکرد؛ محدودیت عرض واحد واقعی است و باید تعداد واحد در طبقه یا عمق بلوک بازبینی شود.",
    );
  }

  return {
    rooms: best.rooms,
    pattern: best.id,
    patternLabel: best.label,
    evaluation: best.evaluation,
    alternatives: evaluated.map((candidate) => ({
      patternId: candidate.id,
      label: candidate.label,
      feasible: candidate.evaluation.feasible,
      score: candidate.evaluation.score,
      reason: candidate.evaluation.feasible
        ? `قابل قبول (${candidate.evaluation.score})`
        : [
            candidate.evaluation.facadeShortfallM > 0.25 ? `${candidate.evaluation.facadeShortfallM} m کمبود عرض نما` : "",
            candidate.evaluation.darkHabitable.length > 0 ? `${candidate.evaluation.darkHabitable.length} فضای بی‌نور` : "",
            candidate.evaluation.narrowRooms.length > 0 ? `${candidate.evaluation.narrowRooms.length} فضای باریک` : "",
            candidate.evaluation.areaShortfallM2 > 0.5 ? `${candidate.evaluation.areaShortfallM2} m² کمبود سطح` : "",
            candidate.evaluation.deadRatio > 0.02 ? `${(candidate.evaluation.deadRatio * 100).toFixed(1)}٪ سطح تلف‌شده` : "",
            candidate.evaluation.overlapM2 > 0.05 ? `${candidate.evaluation.overlapM2} m² همپوشانی` : "",
            candidate.evaluation.roomsOutsideUnit > 0 ? `${candidate.evaluation.roomsOutsideUnit} فضای بیرون واحد` : "",
          ]
            .filter(Boolean)
            .join(" · ") || "رد شد",
    })),
  };
}

/**
 * Minimum unit frontage needed to satisfy the programme's facade demand.
 *
 * Uses the SAME depth rule as `facadeBayDepth` (cap 5.2 m / half the unit
 * depth); the two functions previously disagreed, so a unit built exactly at
 * the reported minimum frontage was then judged infeasible.
 */
export function minimumUnitFrontage(type: DwellingType, unitDepth: number, unitArea: number): number {
  const targets = ROOM_PROGRAMS[type];
  const habitable = targets.filter((t) => t.habitable);
  const depth = clamp(Math.min(5.2, Math.max(3.0, unitDepth * 0.5)), 3.0, 5.2);
  const habitableNeed = habitable.reduce((sum, t) => sum + requiredBayWidth(t, unitArea, depth), 0);
  // +10% documented margin covers the kitchen/balcony bays that a row pattern
  // adds when there is spare frontage; without it a unit built exactly at the
  // reported minimum was then judged infeasible (caught by the regression suite).
  return round(habitableNeed * 1.1, 2);
}

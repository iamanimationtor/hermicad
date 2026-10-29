import { round } from "../geometry";
import { SETBACK_REFERENCE } from "../constants";
import type { CanonicalScheme, Level, Opening, Wall } from "../types";
import type { DrawingIssue, DrawingLayerId, DrawingScene, Primitive, SheetFormat } from "./scene";
import { DRAWING_LAYERS, SHEET_FORMATS, chooseScale } from "./scene";

/**
 * ARCHITECTURAL ELEVATIONS & SECTIONS (stage C).
 *
 * Both are built from the shared canonical model only. The drawing plane is
 * still (x, y) but it means (u = horizontal metres, v = height metres above the
 * project datum). No renderer change is required: the same sheet transform,
 * dimension primitives and DXF writer apply.
 *
 * HONESTY RULES
 * -------------
 * The model does NOT contain: roof form, parapet, ground/terrain profile,
 * balconies, canopies, finish layers, foundation, or beam depths. Those are
 * therefore NOT drawn. They are reported in `missingData` and, where relevant,
 * shown as a dashed "not defined" line so the drawing is never mistaken for a
 * complete elevation.
 */

export type FacadeSide = "north" | "south" | "east" | "west";

export interface MissingDataRow {
  item: string;
  reason: string;
  impact: string;
  blocking: boolean;
}

export interface ElevationScene extends DrawingScene {
  space: "elevation";
  side: FacadeSide;
  missingData: MissingDataRow[];
}

export interface SectionScene extends DrawingScene {
  space: "section";
  cutAxis: "x" | "y";
  cutCoordinateM: number;
  missingData: MissingDataRow[];
}

export const SIDE_LABEL_FA: Record<FacadeSide, string> = {
  north: "شمال",
  south: "جنوب",
  east: "شرق",
  west: "غرب",
};

const MISSING_COMMON: MissingDataRow[] = [
  {
    item: "فرم بام و پاراپت",
    reason: "در مدل مرکزی موجودیت بام/پاراپت تعریف نشده است.",
    impact: "خط بام به‌صورت خط‌چین «تعریف‌نشده» ترسیم می‌شود؛ ارتفاع بام ادعا نمی‌شود.",
    blocking: false,
  },
  {
    item: "تراز زمین و توپوگرافی",
    reason: "تراز نقاط زمین (spotLevels) در مدل هست، اما نگاشت آن به تراز نسبی نما تعریف نشده است.",
    impact: "تراز ±۰٫۰۰ نسبی است؛ خط زمین طبیعی ترسیم نمی‌شود.",
    blocking: false,
  },
  {
    item: "بالکن، سایبان و عناصر الحاقی",
    reason: "این اجزا موجودیت مدل نیستند.",
    impact: "در نما ترسیم نمی‌شوند؛ نبودشان به‌معنی نبود طراحی نیست.",
    blocking: false,
  },
  {
    item: "لایه‌های تکمیلی و مصالح نما",
    reason: "مدل فقط ضخامت دیوار سازه‌ای/معماری را دارد.",
    impact: "هیچ الگوی مصالح یا ضخامت تکمیلی نمایش داده نمی‌شود.",
    blocking: false,
  },
];

function levelElevation(scheme: CanonicalScheme, levelIndex: number): number {
  return round(levelIndex * scheme.floorHeightM, 3);
}

/** Direction of the facade normal for each side, in model coordinates. */
function sideNormal(side: FacadeSide): { x: number; y: number } {
  switch (side) {
    case "north":
      return { x: 0, y: 1 };
    case "south":
      return { x: 0, y: -1 };
    case "east":
      return { x: 1, y: 0 };
    case "west":
      return { x: -1, y: 0 };
  }
}

interface ProjectedWall {
  wall: Wall;
  uStart: number;
  uEnd: number;
  openings: Opening[];
  outwardOffset: number;
}

/** Projects exterior walls that face `side` onto the elevation u-axis. */
function projectFacade(scheme: CanonicalScheme, level: Level, side: FacadeSide): ProjectedWall[] {
  const normal = sideNormal(side);
  const horizontal = side === "north" || side === "south";
  const walls = (level.walls ?? []).filter((wall) => wall.envelope);
  const result: ProjectedWall[] = [];
  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.max(1e-9, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const aligned = Math.abs(Math.abs(nx * normal.x + ny * normal.y) - 1) < 0.05;
    const axisAligned = Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6;
    if (horizontal && Math.abs(dy) > 1e-6) continue;
    if (!horizontal && Math.abs(dx) > 1e-6) continue;
    if (!axisAligned) continue;
    // A wall belongs to this elevation only if it lies on that side of the block
    // (its coordinate is the extreme one in the normal direction).
    const plates = level.plateRects;
    if (plates.length === 0) continue;
    // An envelope wall belongs to this elevation when it lies on the extreme
    // plate edge in the normal direction. Multi-block / L-shaped plates have
    // more than one such plane per side, so the test is per plate, not global.
    const coordinate = horizontal ? wall.start.y : wall.start.x;
    const onEdge = plates.some((plate) => {
      if (horizontal) {
        const edges = [plate.y, plate.y + plate.h];
        const overlaps =
          Math.min(wall.end.x, wall.start.x) >= plate.x - 0.3 &&
          Math.max(wall.end.x, wall.start.x) <= plate.x + plate.w + 0.3;
        return overlaps && edges.some((edge) => Math.abs(coordinate - edge) <= 0.3);
      }
      const edges = [plate.x, plate.x + plate.w];
      const overlaps =
        Math.min(wall.end.y, wall.start.y) >= plate.y - 0.3 &&
        Math.max(wall.end.y, wall.start.y) <= plate.y + plate.h + 0.3;
      return overlaps && edges.some((edge) => Math.abs(coordinate - edge) <= 0.3);
    });
    if (!onEdge) continue;
    // Keep only walls whose outward normal points to the requested side.
    if (nx * normal.x + ny * normal.y > -0.5) {
      // normal may be parallel (±) — accept either sign only when unambiguous
      const outward = horizontal ? Math.sign(wall.start.y - (plates[0].y + plates[0].h / 2)) : Math.sign(wall.start.x - (plates[0].x + plates[0].w / 2));
      const wanted = horizontal ? normal.y : normal.x;
      if (outward !== wanted) continue;
    }
    const uStart = horizontal ? Math.min(wall.start.x, wall.end.x) : Math.min(wall.start.y, wall.end.y);
    const uEnd = horizontal ? Math.max(wall.start.x, wall.end.x) : Math.max(wall.start.y, wall.end.y);
    const openings = (level.openings ?? []).filter((opening) => opening.wallId === wall.id);
    result.push({ wall, uStart, uEnd, openings, outwardOffset: coordinate });
    void aligned;
  }
  return result.sort((a, b) => a.uStart - b.uStart);
}

function sceneFrame(format: SheetFormat) {
  const size = SHEET_FORMATS[format];
  const margin = 12;
  const titleBlock = { x: margin, y: margin, w: 118, h: 44 };
  return {
    size,
    margin,
    titleBlock,
    frameMm: {
      x: margin,
      y: margin + titleBlock.h + 4,
      w: size.widthMm - margin * 2,
      h: size.heightMm - margin * 2 - titleBlock.h - 4,
    },
  };
}

function dimensionV(
  id: string,
  v0: number,
  v1: number,
  u: number,
  label: string,
): Primitive[] {
  // vertical dimension string (heights)
  return [
    { kind: "line", layer: "dimension", id: `${id}-main`, from: { x: u, y: v0 }, to: { x: u, y: v1 } },
    { kind: "line", layer: "dimension", id: `${id}-t0`, from: { x: u - 0.25, y: v0 }, to: { x: u + 0.25, y: v0 } },
    { kind: "line", layer: "dimension", id: `${id}-t1`, from: { x: u - 0.25, y: v1 }, to: { x: u + 0.25, y: v1 } },
    {
      kind: "text",
      layer: "dimension",
      id: `${id}-label`,
      at: { x: u - 0.35, y: (v0 + v1) / 2 },
      text: label,
      heightM: 0.32,
      anchor: "middle",
      rotateDeg: -90,
    },
  ];
}

function dimensionH(id: string, u0: number, u1: number, v: number, label: string): Primitive[] {
  return [
    { kind: "line", layer: "dimension", id: `${id}-main`, from: { x: u0, y: v }, to: { x: u1, y: v } },
    { kind: "line", layer: "dimension", id: `${id}-t0`, from: { x: u0, y: v - 0.25 }, to: { x: u0, y: v + 0.25 } },
    { kind: "line", layer: "dimension", id: `${id}-t1`, from: { x: u1, y: v - 0.25 }, to: { x: u1, y: v + 0.25 } },
    {
      kind: "text",
      layer: "dimension",
      id: `${id}-label`,
      at: { x: (u0 + u1) / 2, y: v - 0.4 },
      text: label,
      heightM: 0.32,
      anchor: "middle",
    },
  ];
}

export function buildElevationScene(
  scheme: CanonicalScheme,
  side: FacadeSide,
  options: { format?: SheetFormat; levelIndex?: number } = {},
): ElevationScene {
  const format: SheetFormat = options.format ?? "A2";
  const frame = sceneFrame(format);
  const level = scheme.levels[(options.levelIndex ?? 0) % scheme.levels.length];
  const facade = projectFacade(scheme, level, side);
  const floorHeight = scheme.floorHeightM;
  const levels = scheme.levels.length;
  const totalHeight = round(levels * floorHeight, 3);

  const primitives: Primitive[] = [];
  const openingRows: string[] = [];
  const windowsTotal: { u: number; v: number; w: number; h: number; sill: number; id: string }[] = [];

  if (facade.length === 0) {
    // Nothing to draw: declare it rather than fabricating a facade.
    primitives.push({
      kind: "text",
      layer: "annotation",
      id: "elevation-empty",
      at: { x: 0, y: totalHeight / 2 },
      text: "برای این جبهه دیوار پیرامونی مدل‌شده‌ای وجود ندارد",
      heightM: 0.6,
      anchor: "middle",
    });
  }

  // ground / datum
  const uMin = facade.length > 0 ? Math.min(...facade.map((entry) => entry.uStart)) : 0;
  const uMax = facade.length > 0 ? Math.max(...facade.map((entry) => entry.uEnd)) : 10;
  primitives.push({ kind: "line", layer: "parcel", id: "elev-datum", from: { x: uMin - 1, y: 0 }, to: { x: uMax + 1, y: 0 } });
  primitives.push({
    kind: "text",
    layer: "annotation",
    id: "elev-datum-label",
    at: { x: uMin - 1, y: -0.55 },
    text: "±0.00 (تراز نسبی)",
    heightM: 0.34,
    anchor: "start",
  });

  // per-level wall panels + openings
  for (let floor = 0; floor < levels; floor++) {
    const v0 = levelElevation(scheme, floor);
    const v1 = round(v0 + floorHeight, 3);
    for (const entry of facade) {
      primitives.push({
        kind: "polygon",
        layer: "wall-exterior",
        id: `elev-wall-${side}-${floor}-${entry.wall.id}`,
        points: [
          { x: entry.uStart, y: v0 },
          { x: entry.uEnd, y: v0 },
          { x: entry.uEnd, y: v1 },
          { x: entry.uStart, y: v1 },
        ],
        fill: "#f1f5f9",
      });
      for (const opening of entry.openings) {
        const half = opening.widthM / 2;
        const uCenter = horizontalCenter(entry, opening);
        const o0 = round(v0 + opening.sillM, 3);
        const o1 = round(o0 + opening.heightM, 3);
        if (o1 > v1 + 1e-6) {
          openingRows.push(`${opening.id}: ارتفاع بازشو از تراز طبقه بیرون می‌زند`);
        }
        const isWindow = opening.kind === "window";
        primitives.push({
          kind: "polygon",
          layer: isWindow ? "opening-window" : "opening-door",
          id: `elev-opening-${side}-${floor}-${opening.id}`,
          points: [
            { x: uCenter - half, y: o0 },
            { x: uCenter + half, y: o0 },
            { x: uCenter + half, y: o1 },
            { x: uCenter - half, y: o1 },
          ],
          fill: "#ffffff",
        });
        primitives.push({
          kind: "line",
          layer: isWindow ? "opening-window" : "opening-door",
          id: `elev-opening-frame-${side}-${floor}-${opening.id}`,
          from: { x: uCenter, y: o0 },
          to: { x: uCenter, y: o1 },
        });
        primitives.push({
          kind: "text",
          layer: "room-label",
          id: `elev-opening-label-${side}-${floor}-${opening.id}`,
          at: { x: uCenter, y: o1 + 0.35 },
          text: `${opening.kind === "window" ? "W" : "D"} ${opening.widthM.toFixed(2)}×${opening.heightM.toFixed(2)}`,
          heightM: 0.3,
          anchor: "middle",
        });
        if (isWindow) windowsTotal.push({ u: uCenter, v: o0, w: opening.widthM, h: opening.heightM, sill: opening.sillM, id: opening.id });
      }
    }
    // floor line across the whole elevation
    primitives.push({ kind: "line", layer: "dimension", id: `elev-floorline-${floor}`, from: { x: uMin - 0.8, y: v0 }, to: { x: uMax + 0.8, y: v0 } });
    primitives.push({
      kind: "text",
      layer: "annotation",
      id: `elev-floorlevel-${floor}`,
      at: { x: uMin - 0.9, y: v0 + 0.25 },
      text: `${v0 === 0 ? "±0.00" : `+${v0.toFixed(2)}`}`,
      heightM: 0.3,
      anchor: "end",
    });
  }

  // roof/parapet NOT in model → dashed undefined line + explicit note
  primitives.push({
    kind: "line",
    layer: "issue",
    id: "elev-roof-undefined",
    from: { x: uMin - 0.8, y: totalHeight },
    to: { x: uMax + 0.8, y: totalHeight },
    dashed: true,
  });
  primitives.push({
    kind: "text",
    layer: "issue",
    id: "elev-roof-note",
    at: { x: (uMin + uMax) / 2, y: totalHeight + 0.5 },
    text: "خط بام/پاراپت در مدل تعریف نشده — ارتفاع بام ادعا نمی‌شود",
    heightM: 0.34,
    anchor: "middle",
  });

  // dimensions: total width + per-storey heights
  primitives.push(...dimensionH("elev-dim-w", uMin, uMax, -1.4, `${(uMax - uMin).toFixed(2)} m`));
  for (let floor = 0; floor < levels; floor++) {
    primitives.push(
      ...dimensionV(
        `elev-dim-h-${floor}`,
        levelElevation(scheme, floor),
        levelElevation(scheme, floor) + floorHeight,
        uMin - 1.6,
        `${floorHeight.toFixed(2)}`,
      ),
    );
  }
  primitives.push(...dimensionV("elev-dim-total", 0, totalHeight, uMin - 2.8, `${totalHeight.toFixed(2)} m`));

  const modelBox = { x: uMin - 3.4, y: -2.4, w: uMax - uMin + 4.6, h: totalHeight + 4.2 };
  const { scaleDenominator, mmPerMetre } = chooseScale(modelBox, frame.frameMm);
  const issues: DrawingIssue[] = [];
  if (facade.length === 0) {
    issues.push({
      id: "ELEV-NO-FACADE",
      severity: "fail",
      title: "جبهه بدون دیوار پیرامونی",
      detail: `برای جبهه ${SIDE_LABEL_FA[side]} دیوار پیرامونی در مدل وجود ندارد؛ نما تولید نشد.`,
      at: { x: 0, y: totalHeight / 2 },
      roomIds: [],
      layer: "issue",
    });
  }
  if (openingRows.length > 0) {
    issues.push({
      id: "ELEV-OPENING-DATA",
      severity: "warning",
      title: "بازشو خارج از تراز طبقه",
      detail: openingRows.slice(0, 4).join(" · "),
      at: { x: uMin, y: totalHeight },
      roomIds: [],
      layer: "issue",
    });
  }

  return {
    kind: "floor-plan" as const,
    space: "elevation",
    side,
    schemeCode: scheme.code,
    schemeId: scheme.id,
    levelIndex: level.index,
    levelName: `نمای ${SIDE_LABEL_FA[side]}`,
    engineVersion: scheme.engineVersion,
    units: "metre",
    // the base Scene has no `space`; the elevation scene adds it
    sheet: {
      format,
      widthMm: frame.size.widthMm,
      heightMm: frame.size.heightMm,
      marginMm: frame.margin,
      frameMm: frame.frameMm,
      scaleDenominator,
      mmPerMetre,
      modelBox,
      titleBlock: frame.titleBlock,
    },
    layers: DRAWING_LAYERS,
    primitives,
    issues,
    consistency: {
      modelRoomAreaM2: 0,
      drawnRoomAreaM2: 0,
      modelWallLengthM: round((level.walls ?? []).filter((wall) => wall.envelope).reduce((sum, wall) => sum + wall.lengthM, 0), 2),
      drawnWallLengthM: round(facade.reduce((sum, entry) => sum + (entry.uEnd - entry.uStart), 0), 2),
      openingsOnWalls: facade.reduce((sum, entry) => sum + entry.openings.length, 0),
      unresolvedOpenings: [],
      ok: facade.length > 0,
    },
    readiness: {
      status: facade.length === 0 ? "blocked" : "review-required",
      label: facade.length === 0 ? "نما تولید نشد" : "نمای قابل بازبینی کارشناسی",
      reason:
        facade.length === 0
          ? "مدل برای این جبهه دیوار پیرامونی ندارد."
          : `${windowsTotal.length} بازشو روی ${facade.length} دیوار پیرامونی ترسیم شد؛ بام/پاراپت تعریف نشده است.`,
      disclaimer:
        "نما از مدل مرکزی تولید شده است؛ عناصر تعریف‌نشده (بام، بالکن، زمین طبیعی) ادعا نمی‌شوند و خروجی جایگزین بازبینی مهندس دارای صلاحیت نیست.",
    },
    meta: {
      plotAreaM2: scheme.plotAreaM2,
      plateAreaM2: level.plateAreaM2,
      wallCount: facade.length,
      openingCount: facade.reduce((sum, entry) => sum + entry.openings.length, 0),
      setbackReference: SETBACK_REFERENCE,
      exteriorThicknessM: (facade[0]?.wall.thicknessM ?? 0.25),
    },
    missingData: MISSING_COMMON,
  };
}

function horizontalCenter(entry: ProjectedWall, opening: Opening): number {
  const horizontalWall = Math.abs(entry.wall.end.x - entry.wall.start.x) >= Math.abs(entry.wall.end.y - entry.wall.start.y);
  const wallStartU = horizontalWall ? Math.min(entry.wall.start.x, entry.wall.end.x) : Math.min(entry.wall.start.y, entry.wall.end.y);
  return round(wallStartU + opening.stationM, 3);
}

export function buildSectionScene(
  scheme: CanonicalScheme,
  options: { format?: SheetFormat; axis?: "x" | "y" } = {},
): SectionScene {
  const format: SheetFormat = options.format ?? "A2";
  const frame = sceneFrame(format);
  const level = scheme.levels[0];
  const axis: "x" | "y" = options.axis ?? "y";
  const plate = level.plateRects[0] ?? { x: 0, y: 0, w: 10, h: 10 };
  const floorHeight = scheme.floorHeightM;
  const levels = scheme.levels.length;
  const totalHeight = round(levels * floorHeight, 3);
  const slab = round(scheme.structural.slabThicknessMm / 1000, 3);
  const core = level.cores[0] ?? null;

  const cutCoordinate = axis === "y" ? (core ? core.rect.x + core.rect.w / 2 : plate.x + plate.w / 2) : core ? core.rect.y + core.rect.h / 2 : plate.y + plate.h / 2;
  const uMin = axis === "y" ? plate.x : plate.y;
  const uMax = axis === "y" ? plate.x + plate.w : plate.y + plate.h;

  const primitives: Primitive[] = [];
  const missing: MissingDataRow[] = [
    {
      item: "شالوده و پی",
      reason: "هندسه پی در مدل مرکزی موجود نیست (تنها عرض پی مقدماتی محاسبه می‌شود).",
      impact: "در برش ترسیم نمی‌شود؛ خط زمین صرفاً تراز ±۰٫۰۰ نسبی است.",
      blocking: false,
    },
    {
      item: "تیر و ضخامت واقعی سقف",
      reason: `ضخامت سقف از تحلیل مقدماتی سازه (${slab} m) گرفته شده است.`,
      impact: "سقف به‌صورت دال یکنواخت با همان ضخامت ترسیم می‌شود؛ تیر و دیتیل ادعا نمی‌شود.",
      blocking: false,
    },
    {
      item: "بام و جان‌پناه",
      reason: "موجودیت بام در مدل تعریف نشده است.",
      impact: "خط بام خط‌چین و «تعریف‌نشده» است.",
      blocking: false,
    },
  ];

  // datum
  primitives.push({ kind: "line", layer: "parcel", id: "sec-datum", from: { x: uMin - 1, y: 0 }, to: { x: uMax + 1, y: 0 } });

  // slabs and walls per level
  for (let floor = 0; floor < levels; floor++) {
    const v0 = levelElevation(scheme, floor);
    const v1 = round(v0 + floorHeight, 3);
    // slab band at the floor level
    primitives.push({
      kind: "polygon",
      layer: "wall-interior",
      id: `sec-slab-${floor}`,
      points: [
        { x: uMin, y: v0 - slab },
        { x: uMax, y: v0 - slab },
        { x: uMax, y: v0 },
        { x: uMin, y: v0 },
      ],
      fill: "#cbd5e1",
    });
    // cut facade walls at both ends
    for (const [index, u] of [uMin, uMax].entries()) {
      const half = 0.125;
      primitives.push({
        kind: "polygon",
        layer: "wall-exterior",
        id: `sec-facade-${floor}-${index}`,
        points: [
          { x: u - half, y: v0 },
          { x: u + half, y: v0 },
          { x: u + half, y: v1 },
          { x: u - half, y: v1 },
        ],
        fill: "#0f172a",
      });
    }
    // core walls section
    if (core) {
      const coreU0 = axis === "y" ? core.rect.x : core.rect.y;
      const coreU1 = axis === "y" ? core.rect.x + core.rect.w : core.rect.y + core.rect.h;
      for (const u of [coreU0, coreU1]) {
        primitives.push({
          kind: "polygon",
          layer: "wall-interior",
          id: `sec-core-${floor}-${u.toFixed(2)}`,
          points: [
            { x: u - 0.1, y: v0 },
            { x: u + 0.1, y: v0 },
            { x: u + 0.1, y: v1 },
            { x: u - 0.1, y: v1 },
          ],
          fill: "#64748b",
        });
      }
      // stair flights: draw steps from the model's own stair summary
      const stair = level.stair;
      const flightRun = stair ? stair.treadCount * stair.goingM : 0;
      if (stair && flightRun > 0) {
        const available = coreU1 - coreU0;
        const scale = Math.min(1, available / Math.max(1, flightRun));
        const risers = stair.riserCount;
        const riserHeight = stair.riserHeightM;
        const going = stair.goingM * scale;
        const points: { x: number; y: number }[] = [];
        let u = coreU0 + 0.3;
        let v = v0;
        const perFlight = Math.ceil(risers / 2);
        for (let r = 0; r < perFlight; r++) {
          points.push({ x: u, y: v });
          u += going;
          points.push({ x: u, y: v });
          v += riserHeight;
          points.push({ x: u, y: v });
        }
        // return flight
        for (let r = 0; r < perFlight; r++) {
          points.push({ x: u, y: v });
          u -= going;
          points.push({ x: u, y: v });
          v += riserHeight * Math.min(1, (risers - perFlight) / perFlight);
          points.push({ x: u, y: v });
        }
        primitives.push({
          kind: "polyline",
          layer: "stair",
          id: `sec-stair-${floor}`,
          points,
        });
        primitives.push({
          kind: "text",
          layer: "room-label",
          id: `sec-stair-label-${floor}`,
          at: { x: (coreU0 + coreU1) / 2, y: v0 + 0.6 },
          text: `${risers}×${(riserHeight * 1000).toFixed(0)}mm`,
          heightM: 0.28,
          anchor: "middle",
        });
      }
    }
    // floor level annotation
    primitives.push({
      kind: "text",
      layer: "annotation",
      id: `sec-level-${floor}`,
      at: { x: uMin - 0.6, y: v0 + 0.25 },
      text: `${v0 === 0 ? "±0.00" : `+${v0.toFixed(2)}`}`,
      heightM: 0.3,
      anchor: "end",
    });
    primitives.push(...dimensionV(`sec-dim-h-${floor}`, v0, v1, uMin - 2.2, `${floorHeight.toFixed(2)}`));
  }

  // roof undefined
  primitives.push({
    kind: "line",
    layer: "issue",
    id: "sec-roof-undefined",
    from: { x: uMin - 0.8, y: totalHeight },
    to: { x: uMax + 0.8, y: totalHeight },
    dashed: true,
  });
  primitives.push({
    kind: "text",
    layer: "issue",
    id: "sec-roof-note",
    at: { x: (uMin + uMax) / 2, y: totalHeight + 0.5 },
    text: "بام در مدل تعریف نشده است",
    heightM: 0.32,
    anchor: "middle",
  });

  primitives.push(...dimensionH("sec-dim-w", uMin, uMax, -1.5, `${(uMax - uMin).toFixed(2)} m`));
  primitives.push(...dimensionV("sec-dim-total", 0, totalHeight, uMin - 3.4, `${totalHeight.toFixed(2)} m`));
  primitives.push({
    kind: "text",
    layer: "annotation",
    id: "sec-cut-label",
    at: { x: uMin, y: totalHeight + 1.4 },
    text: `برش ${axis === "y" ? "A-A (عمود بر محور x)" : "B-B (عمود بر محور y)"} در ${cutCoordinate.toFixed(2)} m — ضخامت سقف ${slab} m (فرض مقدماتی سازه)`,
    heightM: 0.38,
    anchor: "start",
  });

  const modelBox = { x: uMin - 4, y: -2.6, w: uMax - uMin + 6, h: totalHeight + 5 };
  const { scaleDenominator, mmPerMetre } = chooseScale(modelBox, frame.frameMm);
  const modelWallLength = (level.walls ?? []).reduce((sum, wall) => sum + wall.lengthM, 0);

  return {
    kind: "floor-plan" as const,
    space: "section",
    cutAxis: axis,
    cutCoordinateM: round(cutCoordinate, 3),
    schemeCode: scheme.code,
    schemeId: scheme.id,
    levelIndex: 0,
    levelName: axis === "y" ? "برش A-A" : "برش B-B",
    engineVersion: scheme.engineVersion,
    units: "metre",
    sheet: {
      format,
      widthMm: frame.size.widthMm,
      heightMm: frame.size.heightMm,
      marginMm: frame.margin,
      frameMm: frame.frameMm,
      scaleDenominator,
      mmPerMetre,
      modelBox,
      titleBlock: frame.titleBlock,
    },
    layers: DRAWING_LAYERS,
    primitives,
    issues: [],
    consistency: {
      modelRoomAreaM2: 0,
      drawnRoomAreaM2: 0,
      modelWallLengthM: round(modelWallLength, 2),
      drawnWallLengthM: round((uMax - uMin) * 2, 2),
      openingsOnWalls: 0,
      unresolvedOpenings: [],
      ok: levels > 0 && uMax > uMin,
    },
    readiness: {
      status: "review-required",
      label: "برش قابل بازبینی کارشناسی",
      reason: `${levels} طبقه × ${floorHeight.toFixed(2)} m · ضخامت سقف ${slab} m (فرض مقدماتی) · شالوده و بام تعریف نشده‌اند.`,
      disclaimer:
        "برش از مدل مرکزی تولید شده است. ضخامت سقف از تحلیل مقدماتی سازه آمده و تأییدشده نیست؛ خروجی جایگزین بازبینی مهندس دارای صلاحیت نیست.",
    },
    meta: {
      plotAreaM2: scheme.plotAreaM2,
      plateAreaM2: level.plateAreaM2,
      wallCount: (level.walls ?? []).length,
      openingCount: (level.openings ?? []).length,
      setbackReference: SETBACK_REFERENCE,
      exteriorThicknessM: 0.25,
    },
    missingData: missing,
  };
}

export const ELEVATION_LAYERS: DrawingLayerId[] = ["wall-exterior", "opening-window", "opening-door", "dimension", "annotation", "issue", "room-label", "stair"];

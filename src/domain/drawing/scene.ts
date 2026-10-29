import { bbox, rectArea, round } from "../geometry";
import { EXTERIOR_WALL_THICKNESS_M, SETBACK_REFERENCE } from "../constants";
import { ROOM_COLORS, ROOM_LABEL_FA } from "../program";
import type {
  CanonicalScheme,
  DimensionLine,
  Level,
  Opening,
  Rect,
  Room,
  Vec2,
  Wall,
} from "../types";

/**
 * CANONICAL 2D DRAWING SCENE (review-only output, not construction-ready).
 *
 * Every exporter (SVG, PDF, DXF) and the interactive plan workspace render the
 * SAME scene. The scene is derived strictly from the canonical engineering model
 * — no separate "drawing geometry" is invented. Coordinates in `model` space are
 * metres in the project frame; the sheet transform is a pure scale+translate, so
 * any check that compares model coordinates with drawn coordinates is meaningful.
 *
 * Units and scale are explicit: `sheet.scaleDenominator` is the printed scale
 * (e.g. 100 → 1:100) and `sheet.mmPerMetre` is the linear factor applied.
 */

export const SHEET_FORMATS = {
  A3: { widthMm: 420, heightMm: 297 },
  A2: { widthMm: 594, heightMm: 420 },
  A1: { widthMm: 841, heightMm: 594 },
} as const;

export type SheetFormat = keyof typeof SHEET_FORMATS;

export type DrawingLayerId =
  | "parcel"
  | "setback"
  | "envelope"
  | "wall-exterior"
  | "wall-interior"
  | "wall-party"
  | "opening-door"
  | "opening-window"
  | "stair"
  | "room-tint"
  | "room-label"
  | "dimension"
  | "grid"
  | "issue"
  | "annotation";

export interface DrawingLayer {
  id: DrawingLayerId;
  label: string;
  color: string;
  lineWidthMm: number;
  defaultVisible: boolean;
  printable: boolean;
}

export const DRAWING_LAYERS: DrawingLayer[] = [
  { id: "parcel", label: "مرز زمین", color: "#166534", lineWidthMm: 0.5, defaultVisible: true, printable: true },
  { id: "setback", label: "خط عقب‌نشینی", color: "#b45309", lineWidthMm: 0.25, defaultVisible: true, printable: true },
  { id: "envelope", label: "محدوده ساخت‌پذیر", color: "#f59e0b", lineWidthMm: 0.18, defaultVisible: true, printable: false },
  { id: "wall-exterior", label: "دیوار پیرامونی", color: "#0f172a", lineWidthMm: 0.5, defaultVisible: true, printable: true },
  { id: "wall-party", label: "دیوار مشترک", color: "#334155", lineWidthMm: 0.35, defaultVisible: true, printable: true },
  { id: "wall-interior", label: "تیغه داخلی", color: "#64748b", lineWidthMm: 0.25, defaultVisible: true, printable: true },
  { id: "opening-door", label: "درها", color: "#9a3412", lineWidthMm: 0.25, defaultVisible: true, printable: true },
  { id: "opening-window", label: "پنجره‌ها", color: "#0369a1", lineWidthMm: 0.25, defaultVisible: true, printable: true },
  { id: "stair", label: "پله و آسانسور", color: "#7f1d1d", lineWidthMm: 0.2, defaultVisible: true, printable: true },
  { id: "room-tint", label: "رنگ فضاها", color: "#93c5fd", lineWidthMm: 0.1, defaultVisible: true, printable: false },
  { id: "room-label", label: "نام و مساحت فضا", color: "#0f172a", lineWidthMm: 0.15, defaultVisible: true, printable: true },
  { id: "dimension", label: "اندازه‌گذاری", color: "#334155", lineWidthMm: 0.18, defaultVisible: true, printable: true },
  { id: "grid", label: "شبکه راهنما", color: "#e2e8f0", lineWidthMm: 0.1, defaultVisible: false, printable: false },
  { id: "issue", label: "هشدارهای هندسی", color: "#e11d48", lineWidthMm: 0.4, defaultVisible: true, printable: true },
  { id: "annotation", label: "عنوان، شمال، مقیاس", color: "#0f172a", lineWidthMm: 0.2, defaultVisible: true, printable: true },
];

export type Primitive =
  | { kind: "polygon"; layer: DrawingLayerId; points: Vec2[]; fill?: string; fillOpacity?: number; dashed?: boolean; id: string }
  | { kind: "polyline"; layer: DrawingLayerId; points: Vec2[]; closed?: boolean; dashed?: boolean; id: string }
  | { kind: "line"; layer: DrawingLayerId; from: Vec2; to: Vec2; dashed?: boolean; id: string }
  | { kind: "arc"; layer: DrawingLayerId; center: Vec2; radiusM: number; startDeg: number; endDeg: number; id: string }
  | {
      kind: "text";
      layer: DrawingLayerId;
      at: Vec2;
      text: string;
      heightM: number;
      anchor: "start" | "middle" | "end";
      rotateDeg?: number;
      bold?: boolean;
      id: string;
    };

export interface SheetFrame {
  format: SheetFormat;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  /** printable drawing window on the sheet, in millimetres */
  frameMm: { x: number; y: number; w: number; h: number };
  /** true printed scale denominator (e.g. 100 for 1:100) */
  scaleDenominator: number;
  /** millimetres on paper per metre of model */
  mmPerMetre: number;
  /** model-space window covered by the frame */
  modelBox: Rect;
  titleBlock: { x: number; y: number; w: number; h: number };
}

export interface DrawingIssue {
  id: string;
  severity: "fail" | "warning" | "insufficient";
  title: string;
  detail: string;
  at: Vec2;
  roomIds: string[];
  layer: DrawingLayerId;
}

export interface DrawingScene {
  kind: "floor-plan" | "site-plan";
  schemeCode: string;
  schemeId: string;
  levelIndex: number;
  levelName: string;
  engineVersion: string;
  units: "metre";
  sheet: SheetFrame;
  layers: DrawingLayer[];
  primitives: Primitive[];
  issues: DrawingIssue[];
  /** independent verification that drawn geometry equals model geometry */
  consistency: {
    modelRoomAreaM2: number;
    drawnRoomAreaM2: number;
    modelWallLengthM: number;
    drawnWallLengthM: number;
    openingsOnWalls: number;
    unresolvedOpenings: string[];
    ok: boolean;
  };
  readiness: {
    status: "review-required" | "blocked";
    label: string;
    reason: string;
    disclaimer: string;
  };
  meta: {
    plotAreaM2: number;
    plateAreaM2: number;
    wallCount: number;
    openingCount: number;
    setbackReference: typeof SETBACK_REFERENCE;
    exteriorThicknessM: number;
  };
  /** Set by the sheet composer: block-local mm offset inside the sheet. */
  blockOffset?: { xMm: number; yMm: number };
  /** Elevation / section drawings use the same primitives in (u,v) metres. */
  space?: "plan" | "elevation" | "section" | "site";
}

const STANDARD_SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];

export interface SceneOptions {
  format?: SheetFormat;
  /** choose the smallest standard scale that still fits the sheet */
  maxScaleDenominator?: number;
  includeSiteContext?: boolean;
  issueRoomIds?: string[];
}

const polyOf = (rect: Rect): Vec2[] => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.w, y: rect.y },
  { x: rect.x + rect.w, y: rect.y + rect.h },
  { x: rect.x, y: rect.y + rect.h },
];

function rectOfPoints(pts: Vec2[]): Rect {
  const box = bbox(pts);
  return box;
}

function sceneModelBox(scheme: CanonicalScheme, level: Level, includeSite: boolean): Rect {
  const platePts = level.plateRects.flatMap((rect) => polyOf(rect));
  const roomPts = level.rooms.flatMap((room) => room.polygon);
  const dimPts = (level.dimensions ?? []).flatMap((dim) => {
    const horizontal = Math.abs(dim.start.y - dim.end.y) < Math.abs(dim.start.x - dim.end.x);
    return horizontal
      ? [dim.start, dim.end, { x: dim.start.x, y: dim.start.y + dim.offsetM }, { x: dim.end.x, y: dim.end.y + dim.offsetM }]
      : [dim.start, dim.end, { x: dim.start.x + dim.offsetM, y: dim.start.y }, { x: dim.end.x + dim.offsetM, y: dim.end.y }];
  });
  const pts = includeSite ? [...scheme.site.boundary, ...platePts, ...roomPts, ...dimPts] : [...platePts, ...roomPts, ...dimPts];
  const box = rectOfPoints(pts.length > 0 ? pts : [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
  const pad = 1.2;
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

/** Chooses the smallest standard scale whose drawing fits the printable frame. */
export function chooseScale(
  modelBox: Rect,
  frameMm: { w: number; h: number },
  maxScale?: number,
): { scaleDenominator: number; mmPerMetre: number } {
  for (const scale of STANDARD_SCALES) {
    if (maxScale && scale > maxScale) break;
    const mmPerMetre = 1000 / scale;
    if (modelBox.w * mmPerMetre <= frameMm.w && modelBox.h * mmPerMetre <= frameMm.h) {
      return { scaleDenominator: scale, mmPerMetre };
    }
  }
  const fallback = STANDARD_SCALES[STANDARD_SCALES.length - 1];
  return { scaleDenominator: fallback, mmPerMetre: 1000 / fallback };
}

function wallLayer(wall: Wall): DrawingLayerId {
  if (wall.kind === "exterior") return "wall-exterior";
  if (wall.kind === "party") return "wall-party";
  return "wall-interior";
}

/** Rectangle band around a wall centreline, used by every renderer. */
export function wallBand(wall: Wall): { corners: Vec2[]; angleDeg: number } {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.max(1e-6, Math.hypot(dx, dy));
  const nx = (-dy / len) * (wall.thicknessM / 2);
  const ny = (dx / len) * (wall.thicknessM / 2);
  return {
    corners: [
      { x: wall.start.x + nx, y: wall.start.y + ny },
      { x: wall.end.x + nx, y: wall.end.y + ny },
      { x: wall.end.x - nx, y: wall.end.y - ny },
      { x: wall.start.x - nx, y: wall.start.y - ny },
    ],
    angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

function openingSymbol(opening: Opening, wall: Wall): Primitive[] {
  const alongX = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
  const half = opening.widthM / 2;
  const band = wallBand(wall);
  const t = wall.thicknessM / 2 + 0.02;
  const out: Primitive[] = [];
  // punch the wall
  out.push({
    kind: "polygon",
    layer: "opening-window",
    id: `gap-${opening.id}`,
    points: alongX
      ? [
          { x: opening.center.x - half, y: opening.center.y - t },
          { x: opening.center.x + half, y: opening.center.y - t },
          { x: opening.center.x + half, y: opening.center.y + t },
          { x: opening.center.x - half, y: opening.center.y + t },
        ]
      : [
          { x: opening.center.x - t, y: opening.center.y - half },
          { x: opening.center.x + t, y: opening.center.y - half },
          { x: opening.center.x + t, y: opening.center.y + half },
          { x: opening.center.x - t, y: opening.center.y + half },
        ],
    fill: "#ffffff",
  });
  if (opening.kind === "window") {
    for (const offset of [-0.075, 0, 0.075]) {
      out.push(
        alongX
          ? {
              kind: "line",
              layer: "opening-window",
              id: `win-${opening.id}-${offset}`,
              from: { x: opening.center.x - half, y: opening.center.y + offset },
              to: { x: opening.center.x + half, y: opening.center.y + offset },
            }
          : {
              kind: "line",
              layer: "opening-window",
              id: `win-${opening.id}-${offset}`,
              from: { x: opening.center.x + offset, y: opening.center.y - half },
              to: { x: opening.center.x + offset, y: opening.center.y + half },
            },
      );
    }
    out.push({
      kind: "text",
      layer: "room-label",
      id: `wtext-${opening.id}`,
      at: { x: opening.center.x, y: opening.center.y + (alongX ? -0.45 : 0.5) },
      text: `W ${opening.widthM.toFixed(2)}×${opening.heightM.toFixed(2)}`,
      heightM: 0.32,
      anchor: "middle",
    });
    return out;
  }
  // door: leaf + 90° swing
  const hinge = alongX
    ? { x: opening.center.x - half, y: opening.center.y }
    : { x: opening.center.x, y: opening.center.y - half };
  const leafEnd = alongX
    ? { x: hinge.x, y: hinge.y + opening.widthM }
    : { x: hinge.x + opening.widthM, y: hinge.y };
  out.push({ kind: "line", layer: "opening-door", id: `leaf-${opening.id}`, from: hinge, to: leafEnd });
  out.push({
    kind: "arc",
    layer: "opening-door",
    id: `swing-${opening.id}`,
    center: hinge,
    radiusM: opening.widthM,
    startDeg: alongX ? 0 : 90,
    endDeg: alongX ? 90 : 0,
  });
  out.push({
    kind: "text",
    layer: "room-label",
    id: `dtext-${opening.id}`,
    at: { x: opening.center.x, y: opening.center.y + (alongX ? 1.0 : -0.55) },
    text: `D ${opening.widthM.toFixed(2)}`,
    heightM: 0.3,
    anchor: "middle",
  });
  return out;
}

function dimensionPrimitives(dim: DimensionLine): Primitive[] {
  const horizontal = Math.abs(dim.start.y - dim.end.y) < Math.abs(dim.start.x - dim.end.x);
  const out: Primitive[] = [];
  const label = `${dim.valueM.toFixed(2)}`;
  if (horizontal) {
    const y = dim.start.y + dim.offsetM;
    out.push({ kind: "line", layer: "dimension", id: `${dim.id}-main`, from: { x: dim.start.x, y }, to: { x: dim.end.x, y } });
    for (const x of [dim.start.x, dim.end.x]) {
      out.push({ kind: "line", layer: "dimension", id: `${dim.id}-tick-${x}`, from: { x, y: y - 0.22 }, to: { x, y: y + 0.22 } });
      out.push({
        kind: "line",
        layer: "dimension",
        id: `${dim.id}-ext-${x}`,
        from: { x, y: dim.start.y },
        to: { x, y },
        dashed: true,
      });
    }
    out.push({
      kind: "text",
      layer: "dimension",
      id: `${dim.id}-label`,
      at: { x: (dim.start.x + dim.end.x) / 2, y: y - 0.3 },
      text: label,
      heightM: 0.34,
      anchor: "middle",
    });
  } else {
    const x = dim.start.x + dim.offsetM;
    out.push({ kind: "line", layer: "dimension", id: `${dim.id}-main`, from: { x, y: dim.start.y }, to: { x, y: dim.end.y } });
    for (const y of [dim.start.y, dim.end.y]) {
      out.push({ kind: "line", layer: "dimension", id: `${dim.id}-tick-${y}`, from: { x: x - 0.22, y }, to: { x: x + 0.22, y } });
      out.push({
        kind: "line",
        layer: "dimension",
        id: `${dim.id}-ext-${y}`,
        from: { x: dim.start.x, y },
        to: { x, y },
        dashed: true,
      });
    }
    out.push({
      kind: "text",
      layer: "dimension",
      id: `${dim.id}-label`,
      at: { x: x - 0.3, y: (dim.start.y + dim.end.y) / 2 },
      text: label,
      heightM: 0.34,
      anchor: "middle",
      rotateDeg: -90,
    });
  }
  return out;
}

function issuesForLevel(scheme: CanonicalScheme, level: Level): DrawingIssue[] {
  const issues: DrawingIssue[] = [];
  for (const check of level.planChecks ?? []) {
    if (check.passed) continue;
    const rooms = (check.roomIds ?? [])
      .map((id) => level.rooms.find((room) => room.id === id))
      .filter((room): room is Room => !!room);
    const anchorRoom = rooms[0];
    const at = anchorRoom
      ? {
          x: anchorRoom.polygon.reduce((sum, point) => sum + point.x, 0) / anchorRoom.polygon.length,
          y: anchorRoom.polygon.reduce((sum, point) => sum + point.y, 0) / anchorRoom.polygon.length,
        }
      : level.plateRects[0]
        ? { x: level.plateRects[0].x + level.plateRects[0].w / 2, y: level.plateRects[0].y + level.plateRects[0].h / 2 }
        : { x: 0, y: 0 };
    issues.push({
      id: `plan-${check.id}`,
      severity: check.status === "fail" ? "fail" : "warning",
      title: check.title,
      detail: `${check.value} — ${check.reason ?? check.requirement}`,
      at,
      roomIds: rooms.map((room) => room.id),
      layer: "issue",
    });
  }
  return issues;
}

export function buildFloorPlanScene(scheme: CanonicalScheme, levelIndex = 0, options: SceneOptions = {}): DrawingScene {
  const level = scheme.levels[Math.min(levelIndex, scheme.levels.length - 1)];
  const format: SheetFormat = options.format ?? "A3";
  const sheetSize = SHEET_FORMATS[format];
  const margin = 12;
  const titleBlock = { x: margin, y: margin, w: 118, h: 44 };
  const frameMm = {
    x: margin,
    y: margin + titleBlock.h + 4,
    w: sheetSize.widthMm - margin * 2,
    h: sheetSize.heightMm - margin * 2 - titleBlock.h - 4,
  };
  const includeSite = options.includeSiteContext ?? false;
  const modelBox = sceneModelBox(scheme, level, includeSite);
  const { scaleDenominator, mmPerMetre } = chooseScale(modelBox, frameMm, options.maxScaleDenominator);

  const primitives: Primitive[] = [];
  const walls = level.walls ?? [];
  const openings = level.openings ?? [];
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));

  if (includeSite) {
    primitives.push({ kind: "polygon", layer: "parcel", id: "parcel", points: scheme.site.boundary, fill: "#f0fdf4" });
    if (scheme.buildablePolygon.length >= 3) {
      primitives.push({ kind: "polygon", layer: "envelope", id: "buildable", points: scheme.buildablePolygon, dashed: true });
    }
  }

  // room tints
  for (const room of level.rooms) {
    primitives.push({
      kind: "polygon",
      layer: "room-tint",
      id: `tint-${room.id}`,
      points: room.polygon,
      fill: ROOM_COLORS[room.kind] ?? "#e2e8f0",
      fillOpacity: room.unitIndex >= 0 ? 0.22 : 0.12,
    });
  }

  // walls
  for (const wall of walls) {
    primitives.push({
      kind: "polygon",
      layer: wallLayer(wall),
      id: `wall-${wall.id}`,
      points: wallBand(wall).corners,
      fill: wall.kind === "exterior" ? "#0f172a" : wall.kind === "party" ? "#334155" : wall.kind === "shaft" ? "#7c3aed" : "#94a3b8",
    });
  }

  // openings
  for (const opening of openings) {
    const wall = wallById.get(opening.wallId);
    if (!wall) continue;
    primitives.push(...openingSymbol(opening, wall));
  }

  // stair + lift
  for (const core of level.cores) {
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const y = core.rect.y + (core.rect.h / steps) * i;
      primitives.push({
        kind: "line",
        layer: "stair",
        id: `stair-${core.id}-${i}`,
        from: { x: core.rect.x + 0.2, y },
        to: { x: core.rect.x + core.rect.w - 0.2, y },
      });
    }
    primitives.push({
      kind: "polygon",
      layer: "stair",
      id: `lift-${core.id}`,
      points: polyOf({
        x: core.rect.x + 0.3,
        y: core.rect.y + 0.3,
        w: Math.max(0.8, core.rect.w - 0.6),
        h: Math.max(0.8, core.rect.h * 0.3),
      }),
      dashed: true,
    });
    primitives.push({
      kind: "text",
      layer: "room-label",
      id: `core-label-${core.id}`,
      at: { x: core.rect.x + core.rect.w / 2, y: core.rect.y + core.rect.h / 2 },
      text: "پله + آسانسور",
      heightM: 0.4,
      anchor: "middle",
    });
  }

  // room labels: Persian name + net area
  for (const room of level.rooms) {
    if (room.areaM2 < 0.8) continue;
    const cx = room.polygon.reduce((sum, point) => sum + point.x, 0) / room.polygon.length;
    const cy = room.polygon.reduce((sum, point) => sum + point.y, 0) / room.polygon.length;
    const label = ROOM_LABEL_FA[room.kind] ?? room.kind;
    primitives.push({
      kind: "text",
      layer: "room-label",
      id: `room-name-${room.id}`,
      at: { x: cx, y: cy + 0.12 },
      text: label,
      heightM: room.areaM2 > 12 ? 0.44 : 0.34,
      anchor: "middle",
    });
    primitives.push({
      kind: "text",
      layer: "room-label",
      id: `room-area-${room.id}`,
      at: { x: cx, y: cy - 0.42 },
      text: `${room.areaM2.toFixed(1)} m²`,
      heightM: room.areaM2 > 12 ? 0.34 : 0.27,
      anchor: "middle",
    });
  }

  // dimensions
  for (const dim of level.dimensions ?? []) primitives.push(...dimensionPrimitives(dim));

  // unit boundaries as dashed annotation
  for (const unit of scheme.units) {
    primitives.push({ kind: "polygon", layer: "annotation", id: `unit-${unit.index}`, points: polyOf(unit.rect), dashed: true });
    primitives.push({
      kind: "text",
      layer: "annotation",
      id: `unit-label-${unit.index}`,
      at: { x: unit.rect.x + 0.25, y: unit.rect.y + 0.7 },
      text: `واحد ${unit.index + 1} — ${unit.areaM2.toFixed(1)} m²`,
      heightM: 0.34,
      anchor: "start",
    });
  }

  // issues
  const issues = issuesForLevel(scheme, level);
  for (const issue of issues) {
    for (const roomId of issue.roomIds) {
      const room = level.rooms.find((candidate) => candidate.id === roomId);
      if (!room) continue;
      primitives.push({
        kind: "polygon",
        layer: "issue",
        id: `issue-fill-${issue.id}-${roomId}`,
        points: room.polygon,
        fill: "#e11d48",
        fillOpacity: 0.16,
        dashed: true,
      });
    }
    primitives.push({
      kind: "text",
      layer: "issue",
      id: `issue-mark-${issue.id}`,
      at: { x: issue.at.x, y: issue.at.y + 0.9 },
      text: `⚠ ${issue.title}`,
      heightM: 0.32,
      anchor: "middle",
    });
  }

  // --- consistency verification (model vs drawn) ---
  const modelRoomArea = level.rooms.reduce((sum, room) => sum + room.areaM2, 0);
  const drawnRoomArea = level.rooms.reduce((sum, room) => sum + Math.abs(areaOfPolygon(room.polygon)), 0);
  const modelWallLength = walls.reduce((sum, wall) => sum + wall.lengthM, 0);
  const drawnWallLength = walls.reduce((sum, wall) => {
    const band = wallBand(wall);
    const longest = Math.max(
      Math.hypot(band.corners[0].x - band.corners[1].x, band.corners[0].y - band.corners[1].y),
      Math.hypot(band.corners[1].x - band.corners[2].x, band.corners[1].y - band.corners[2].y),
    );
    return sum + longest;
  }, 0);
  const unresolved = openings.filter((opening) => !wallById.has(opening.wallId)).map((opening) => opening.id);
  const consistency = {
    modelRoomAreaM2: round(modelRoomArea, 2),
    drawnRoomAreaM2: round(drawnRoomArea, 2),
    modelWallLengthM: round(modelWallLength, 2),
    drawnWallLengthM: round(drawnWallLength, 2),
    openingsOnWalls: openings.length - unresolved.length,
    unresolvedOpenings: unresolved,
    ok:
      Math.abs(modelRoomArea - drawnRoomArea) < 0.05 &&
      Math.abs(modelWallLength - drawnWallLength) < 0.05 &&
      unresolved.length === 0,
  };

  const blockingIssues = issues.filter((issue) => issue.severity === "fail");
  const readiness =
    blockingIssues.length > 0
      ? {
          status: "blocked" as const,
          label: "نیازمند بازبینی — نقص هندسی",
          reason: `${blockingIssues.length} هشدار هندسی روی نقشه علامت‌گذاری شده است.`,
          disclaimer:
            "این نقشه از مدل الگوریتمی تولید شده و «آماده اجرا» نیست؛ هیچ ادعای انطباق با ضوابط رسمی مطرح نمی‌شود.",
        }
      : {
          status: "review-required" as const,
          label: "قابل بازبینی کارشناسی",
          reason:
            issues.length > 0
              ? `${issues.length} هشدار کیفیت (غیر بحرانی) روی نقشه علامت‌گذاری شده است.`
              : "هیچ هشدار هندسی ثبت نشده است؛ با این حال بازبینی مهندس دارای صلاحیت الزامی است.",
          disclaimer:
            "نقشه از مدل مرکزی تولید شده است. آمادگی اجرایی، انطباق مقرراتی و صحت سازه/تأسیسات تأیید نشده و مسئولیت آن با مهندس دارای صلاحیت است.",
        };

  return {
    kind: "floor-plan",
    schemeCode: scheme.code,
    schemeId: scheme.id,
    levelIndex: level.index,
    levelName: level.name,
    engineVersion: scheme.engineVersion,
    units: "metre",
    sheet: {
      format,
      widthMm: sheetSize.widthMm,
      heightMm: sheetSize.heightMm,
      marginMm: margin,
      frameMm,
      scaleDenominator,
      mmPerMetre,
      modelBox,
      titleBlock,
    },
    layers: DRAWING_LAYERS,
    primitives,
    issues,
    consistency,
    readiness,
    meta: {
      plotAreaM2: scheme.plotAreaM2,
      plateAreaM2: level.plateAreaM2,
      wallCount: walls.length,
      openingCount: openings.length,
      setbackReference: SETBACK_REFERENCE,
      exteriorThicknessM: EXTERIOR_WALL_THICKNESS_M,
    },
  };
}

export function areaOfPolygon(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Same scene, site context only (parcel + setback + block footprints). */
export function buildSiteScene(scheme: CanonicalScheme, options: SceneOptions = {}): DrawingScene {
  const format: SheetFormat = options.format ?? "A3";
  const sheetSize = SHEET_FORMATS[format];
  const margin = 12;
  const titleBlock = { x: margin, y: margin, w: 118, h: 44 };
  const frameMm = {
    x: margin,
    y: margin + titleBlock.h + 4,
    w: sheetSize.widthMm - margin * 2,
    h: sheetSize.heightMm - margin * 2 - titleBlock.h - 4,
  };
  const box = bbox(scheme.site.boundary);
  const modelBox = { x: box.x - 3, y: box.y - 3, w: box.w + 6, h: box.h + 6 };
  const { scaleDenominator, mmPerMetre } = chooseScale(modelBox, frameMm, options.maxScaleDenominator);
  const primitives: Primitive[] = [
    { kind: "polygon", layer: "parcel", id: "parcel", points: scheme.site.boundary, fill: "#f0fdf4" },
  ];
  if (scheme.buildablePolygon.length >= 3) {
    primitives.push({ kind: "polygon", layer: "envelope", id: "buildable", points: scheme.buildablePolygon, dashed: true });
  }
  const level = scheme.levels[0];
  for (const plate of level?.plateRects ?? []) {
    primitives.push({ kind: "polygon", layer: "wall-exterior", id: `plate-${plate.x}-${plate.y}`, points: polyOf(plate), fill: "#e2e8f0" });
  }
  for (const point of scheme.site.spotLevels) {
    primitives.push({
      kind: "text",
      layer: "annotation",
      id: `spot-${point.x}-${point.y}`,
      at: { x: point.x, y: point.y },
      text: `${point.z.toFixed(1)}`,
      heightM: 0.5,
      anchor: "middle",
    });
  }
  const plateArea = (level?.plateRects ?? []).reduce((sum, plate) => sum + rectArea(plate), 0);
  return {
    kind: "site-plan",
    schemeCode: scheme.code,
    schemeId: scheme.id,
    levelIndex: 0,
    levelName: "پلان زمین",
    engineVersion: scheme.engineVersion,
    units: "metre",
    sheet: {
      format,
      widthMm: sheetSize.widthMm,
      heightMm: sheetSize.heightMm,
      marginMm: margin,
      frameMm,
      scaleDenominator,
      mmPerMetre,
      modelBox,
      titleBlock,
    },
    layers: DRAWING_LAYERS,
    primitives,
    issues: [],
    consistency: {
      modelRoomAreaM2: 0,
      drawnRoomAreaM2: 0,
      modelWallLengthM: 0,
      drawnWallLengthM: 0,
      openingsOnWalls: 0,
      unresolvedOpenings: [],
      ok: true,
    },
    readiness: {
      status: "review-required",
      label: "پلان زمین — سند موقعیت",
      reason: "این صفحه فقط موقعیت و محدوده را نشان می‌دهد.",
      disclaimer: "عقب‌نشینی نسبت به سطح خارجی دیوار پیرامونی سنجیده می‌شود (قرارداد داخلی موتور).",
    },
    meta: {
      plotAreaM2: scheme.plotAreaM2,
      plateAreaM2: round(plateArea, 2),
      wallCount: 0,
      openingCount: 0,
      setbackReference: SETBACK_REFERENCE,
      exteriorThicknessM: EXTERIOR_WALL_THICKNESS_M,
    },
  };
}

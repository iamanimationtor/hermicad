import {
  clamp,
  clipRectByPolygon,
  polygonInsidePolygon,
  dedupe,
  distanceToPolygonOutline,
  effectiveSetbackForEdge,
  ensureCCW,
  facadeLength,
  largestInscribedRect,
  bbox,
  buildMask,
  createRng,
  dist,
  applySetbacks,
  pointInPolygon,
  polygonArea,
  polygonIsConvex,
  polygonIsSimple,
  rectArea,
  round,
  type GridMask,
} from "./geometry";
import {
  buildMetrics,
  computeCirculation,
  computeDaylight,
  computeMep,
  computeParking,
  computeStructural,
} from "./analysis";
import {
  ANALYSIS_STATUS,
  EXTERIOR_WALL_THICKNESS_M,
  SETBACK_REFERENCE,
  CORE_STAIR_DEPTH_M,
  CORE_WIDTH_M,
  ENGINE_VERSION,
  MAX_CROSS_VENTILATION_DEPTH_M,
  MIN_UNIT_WIDTH_M,
  PUBLIC_CORRIDOR_WIDTH_M,
  UNIT_NET_FACTOR,
} from "./constants";
import { buildLevelPlan } from "./architecture/plan";
import { LAYOUT_ASSUMPTIONS, minimumUnitFrontage, planUnitLayout, type UnitLayoutEvaluation } from "./architecture/layoutEngine";
import { DWELLING_LABEL, totalDwellingCount, validateRequirements, validateSite, weightedTargetArea } from "./requirements";
import { ROOM_LABEL_FA, ROOM_PROGRAMS, type RoomTarget } from "./program";
import type {
  Assumption,
  UnitLayoutPlan,
  CanonicalScheme,
  Core,
  DwellingType,
  Level,
  Rect,
  Requirements,
  Room,
  SiteModel,
  TraceStep,
  UnitInstance,
  Vec2,
} from "./types";

export interface EffectiveSetback {
  edgeIndex: number;
  direction: "north" | "east" | "south" | "west";
  normalAngleDeg: number;
  requestedPerpendicularM: number;
  maxCardinalClearanceM: number;
}

export interface SiteAnalysis {
  plotAreaM2: number;
  boundary: Vec2[];
  boundarySimple: boolean;
  convexParcel: boolean;
  buildablePolygon: Vec2[];
  buildableAreaM2: number;
  buildableRatio: number;
  primaryPlate: Rect | null;
  secondaryPlate: Rect | null;
  slope: { dropM: number; averagePercent: number; directionDeg: number };
  effectiveSetbacks: EffectiveSetback[];
  setbackMethod: "convex-halfplane-setback";
  /** The setback input is measured to the exterior wall's outer face. */
  setbackReference: "outer-wall-face";
  requestedSetbacks: { north: number; east: number; south: number; west: number };
  /** Setback actually applied to the wall-centreline envelope. */
  centrelineSetbacks: { north: number; east: number; south: number; west: number };
  approximation: { exact: boolean; note: string };
  viable: boolean;
  viabilityErrors: string[];
  warnings: string[];
  errors: string[];
}

/** Smallest plate that can host one dwelling band plus an access core. */
export const MIN_VIABLE_PLATE_WIDTH_M = 8.0;
export const MIN_VIABLE_PLATE_DEPTH_M = 8.0;

export function analyzeSite(site: SiteModel): SiteAnalysis {
  const validation = validateSite(site);
  // Consecutive duplicate vertices would create degenerate edges; they are
  // removed here rather than silently distorting area or setback results.
  const rawBoundary = Array.isArray(site.boundary) ? dedupe(ensureCCW(site.boundary)) : [];
  const boundary = rawBoundary;
  const simple = polygonIsSimple(boundary);
  const convexParcel = simple ? polygonIsConvex(boundary) : false;
  const plotArea = polygonArea(boundary);
  // The user-facing setback is the clear distance from the parcel boundary to
  // the OUTER face of the exterior wall. The built envelope (plate + centred
  // walls) therefore sits half a wall thickness further inside.
  const halfWall = EXTERIOR_WALL_THICKNESS_M / 2;
  const centrelineSetbacks = {
    north: site.setbacks.north + halfWall,
    east: site.setbacks.east + halfWall,
    south: site.setbacks.south + halfWall,
    west: site.setbacks.west + halfWall,
  };
  const buildable = simple ? applySetbacks(boundary, centrelineSetbacks) : [];
  const buildableArea = polygonArea(buildable);
  let primary: Rect | null = null;
  let secondary: Rect | null = null;
  let mask: GridMask | null = null;
  if (buildable.length >= 3 && buildableArea > 20) {
    mask = buildMask(buildable, 1);
    primary = largestInscribedRect(mask);
    if (primary && primary.w >= 14 && primary.h >= 12) {
      const pad = 3;
      secondary = largestInscribedRect(mask, (i, j) => {
        const x = mask!.origin.x + (i + 0.5) * mask!.step;
        const y = mask!.origin.y + (j + 0.5) * mask!.step;
        const inside =
          x > primary!.x - pad &&
          x < primary!.x + primary!.w + pad &&
          y > primary!.y - pad &&
          y < primary!.y + primary!.h + pad;
        return !inside;
      });
      if (secondary && rectArea(secondary) < rectArea(primary) * 0.3) secondary = null;
    }
  }
  // Defensive containment: a candidate rectangle may never extend outside the
  // buildable region. The inscribed-rectangle search works on a 1 m mask, so a
  // rounding edge case could previously yield a plate 1 m wider than the
  // setback region — which the integrity rule then (correctly) rejected.
  const clampToBuildable = (rect: Rect | null): Rect | null => {
    if (!rect || buildable.length < 3) return rect;
    const box = bbox(buildable);
    let candidate = { ...rect };
    for (let attempt = 0; attempt < 6; attempt++) {
      const rectPoly = [
        { x: candidate.x, y: candidate.y },
        { x: candidate.x + candidate.w, y: candidate.y },
        { x: candidate.x + candidate.w, y: candidate.y + candidate.h },
        { x: candidate.x, y: candidate.y + candidate.h },
      ];
      // Edge-touching rectangles are valid (a 2 m strip is fully usable);
      // only real overhang beyond tolerance is rejected and shrunk.
      if (polygonInsidePolygon(rectPoly, buildable, 0.02)) return candidate;
      candidate = {
        x: candidate.x + 0.25,
        y: candidate.y + 0.25,
        w: Math.max(1, candidate.w - 0.5),
        h: Math.max(1, candidate.h - 0.5),
      };
    }
    const fallback = {
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
    };
    return rectArea(fallback) > 4 ? fallback : null;
  };
  primary = clampToBuildable(primary);
  secondary = clampToBuildable(secondary);
  if (secondary && primary && rectArea(secondary) < rectArea(primary) * 0.3) secondary = null;
  const slope = computeSlope(site);
  const warnings = [...validation.warnings];
  if (!simple && site.boundary.length >= 3) warnings.push("مرز زمین خودمتقاطع است؛ محاسبات هندسی متوقف شد.");
  if (buildable.length < 3 && simple) warnings.push("پس از اعمال عقب‌نشینی‌ها هیچ سطح ساخت‌پذیری باقی نمی‌ماند.");

  // Effective clearance disclosure: for a diagonal edge the perpendicular
  // offset produces a larger cardinal clearance, so the requested value is a
  // *minimum* guarantee, not the distance to the property line.
  const effectiveSetbacks: EffectiveSetback[] = [];
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    const { normalAngleDeg, direction } = effectiveSetbackForEdge(a, b);
    const requested = site.setbacks[direction] ?? 0;
    const rad = (normalAngleDeg * Math.PI) / 180;
    const minComponent = Math.min(Math.abs(Math.cos(rad)), Math.abs(Math.sin(rad)));
    effectiveSetbacks.push({
      edgeIndex: i,
      direction,
      normalAngleDeg,
      requestedPerpendicularM: requested,
      maxCardinalClearanceM: round(minComponent > 1e-6 ? requested / minComponent : requested, 2),
    });
  }

  const viabilityErrors: string[] = [];
  if (primary) {
    if (primary.w < MIN_VIABLE_PLATE_WIDTH_M) {
      viabilityErrors.push(
        `عرض بزرگ‌ترین مستطیل ساخت‌پذیر (${primary.w.toFixed(1)} m) کمتر از حداقل لازم برای یک باند واحد و هسته (${MIN_VIABLE_PLATE_WIDTH_M} m) است.`,
      );
    }
    if (primary.h < MIN_VIABLE_PLATE_DEPTH_M) {
      viabilityErrors.push(
        `عمق بزرگ‌ترین مستطیل ساخت‌پذیر (${primary.h.toFixed(1)} m) کمتر از حداقل لازم (${MIN_VIABLE_PLATE_DEPTH_M} m) است.`,
      );
    }
  } else if (simple) {
    viabilityErrors.push("هیچ مستطیل ساخت‌پذیری استخراج نشد.");
  }
  const viable = simple && !!primary && viabilityErrors.length === 0;

  const approximation = {
    exact: convexParcel,
    note: convexParcel
      ? "زمین محدب است: برش نیم‌صفحه معادل عقب‌نشینی هندسی دقیق است."
      : "زمین مقعر است: محدوده ساخت‌پذیر از تقاطع نیم‌صفحه‌های اضلاع به‌دست می‌آید؛ این روش زیرمجموعه‌ای از منطقه واقعی پس از عقب‌نشینی است (محافظه‌کارانه) و می‌تواند بخشی از سطح مجاز را از دست بدهد. مستطیل محاطی روی شبکه ۱×۱ متر جست‌وجو می‌شود، بنابراین ابعاد آن با دقت ۱ متر (کمتر از مساحت واقعی) گرد می‌شود.",
  };
  if (!convexParcel && simple) warnings.push(approximation.note);

  return {
    plotAreaM2: plotArea,
    boundary,
    boundarySimple: simple,
    convexParcel,
    buildablePolygon: buildable,
    buildableAreaM2: buildableArea,
    buildableRatio: plotArea > 0 ? buildableArea / plotArea : 0,
    primaryPlate: primary,
    secondaryPlate: secondary,
    slope,
    effectiveSetbacks,
    setbackMethod: "convex-halfplane-setback",
    setbackReference: SETBACK_REFERENCE,
    requestedSetbacks: { ...site.setbacks },
    centrelineSetbacks,
    approximation,
    viable,
    viabilityErrors,
    warnings,
    errors: validation.errors,
  };
}

function computeSlope(site: SiteModel): { dropM: number; averagePercent: number; directionDeg: number } {
  const pts = site.spotLevels;
  if (pts.length < 2) return { dropM: 0, averagePercent: 0, directionDeg: 0 };
  let low = pts[0];
  let high = pts[0];
  for (const p of pts) {
    if (p.z < low.z) low = p;
    if (p.z > high.z) high = p;
  }
  const horizontal = dist(low, high);
  const drop = high.z - low.z;
  return {
    dropM: round(drop, 2),
    averagePercent: horizontal > 1 ? round((drop / horizontal) * 100, 1) : 0,
    directionDeg: round((Math.atan2(high.y - low.y, high.x - low.x) * 180) / Math.PI, 1),
  };
}

interface Strategy {
  id: string;
  label: string;
  blocks: 1 | 2;
  shrink: number;
  accessNorth: boolean;
  note: string;
}

export const STRATEGY_LIBRARY: Strategy[] = [
  { id: "compact", label: "بلوک فشرده یکپارچه", blocks: 1, shrink: 1, accessNorth: true, note: "بیشترین سطح اشغال، هسته واحد در یک انتها" },
  { id: "shallow", label: "بلوک کم‌عمق با نورگیری بهتر", blocks: 1, shrink: 0.9, accessNorth: true, note: "کاهش ۱۰٪ مساحت اشغال به‌نفع عمق کمتر و تهویه دوطرفه" },
  { id: "dual", label: "دو بلوک با هسته مستقل", blocks: 2, shrink: 1, accessNorth: true, note: "تفکیک حجمی روی زمین نامنظم و کاهش عمق هر بلوک" },
  { id: "compact-north", label: "راهرو جنوبی، نمای شمالی", blocks: 1, shrink: 0.96, accessNorth: false, note: "گزینه کنترل‌شده برای مقایسه جهت‌گیری" },
  { id: "dual-north", label: "دو بلوک با دسترسی جنوبی", blocks: 2, shrink: 0.98, accessNorth: false, note: "بلوک ثانویه با دسترسی مقابل، برای ارزیابی پارتو" },
];

export interface GenerationOptions {
  seed: number;
  variants: number;
  generatedAt?: string;
}

interface BlockPlan {
  plate: Rect;
  rooms: Room[];
  cores: Core[];
  corridors: Rect[];
  units: UnitInstance[];
  unitLayouts: UnitLayoutRecord[];
  unitsPerFloor: number;
  score: number;
  feasibleUnits: number;
  notes: string[];
}

export type UnitLayoutRecord = UnitLayoutPlan;

export class DomainError extends Error {
  readonly detail: string[];
  constructor(message: string, detail: string[] = []) {
    super(message);
    this.name = "DomainError";
    this.detail = detail;
  }
}

export function generateSchemes(
  site: SiteModel,
  requirements: Requirements,
  options: GenerationOptions,
): CanonicalScheme[] {
  const siteCheck = validateSite(site);
  const reqCheck = validateRequirements(requirements);
  const analysis = analyzeSite(site);
  const errors = [...siteCheck.errors, ...reqCheck.errors];
  if (!analysis.boundarySimple) errors.push("مرز زمین معتبر نیست (خودمتقاطع یا مساحت ناکافی).");
  if (!analysis.primaryPlate) errors.push("هیچ مستطیل ساخت‌پذیری در محدوده پس از عقب‌نشینی یافت نشد.");
  if (analysis.boundarySimple && !analysis.viable) errors.push(...analysis.viabilityErrors);
  if (errors.length) throw new DomainError("ورودی پروژه برای تولید طرح معتبر نیست.", errors);

  const demanded = totalDwellingCount(requirements);
  const targetGross = weightedTargetArea(requirements) / UNIT_NET_FACTOR;
  // The seed has one documented, reproducible effect: it rotates the strategy
  // library. With fewer variants than strategies this selects a different
  // subset; with all five it only changes the order/labels. Geometry inside a
  // strategy is fully deterministic and does not depend on the seed.
  const variantCount = clamp(options.variants, 1, STRATEGY_LIBRARY.length);
  const rotation = Math.abs(Math.trunc(options.seed)) % STRATEGY_LIBRARY.length;
  const strategies = Array.from({ length: variantCount }, (_, index) => STRATEGY_LIBRARY[(rotation + index) % STRATEGY_LIBRARY.length]);
  const schemes: CanonicalScheme[] = [];

  for (let index = 0; index < strategies.length; index++) {
    const strategy = strategies[index];
    const seed = options.seed + index * 7919;
    const rng = createRng(seed);
    const plates: Rect[] = [];
    const primary = analysis.primaryPlate;
    if (!primary) continue;
    const shrunk = shrinkRect(primary, strategy.shrink);
    plates.push(shrunk);
    if (strategy.blocks === 2 && analysis.secondaryPlate && analysis.buildablePolygon.length >= 3) {
      const candidate = shrinkRect(analysis.secondaryPlate, 0.96);
      if (rectArea(candidate) > 24) plates.push(candidate);
    }
    const plateArea = plates.reduce((s, r) => s + rectArea(r), 0);
    const usablePlate = plateArea * 0.88;
    // Capacity is bounded from two independent directions:
    //  (a) area: how many dwellings of the *programmed* size fit on a plate,
    //  (b) geometry: how many minimum-width bands fit beside the cores.
    // Delivery also considers the demand spread over the maximum allowed floors,
    // so a tight parcel is not filled with a single oversized dwelling per floor.
    const areaCapacity = Math.max(1, Math.floor(usablePlate / targetGross));
    const geometryCapacity = plates.reduce((sum, rect) => {
      const coreWidth = Math.min(CORE_WIDTH_M, Math.max(3.6, rect.w * 0.18));
      return sum + Math.max(1, Math.floor((rect.w - coreWidth) / MIN_UNIT_WIDTH_M));
    }, 0);
    const demandPerFloor = Math.ceil(demanded / Math.max(1, requirements.floorsMax));
    const capacityPerFloor = Math.max(1, Math.min(geometryCapacity, Math.max(areaCapacity, demandPerFloor)));
    // Provisional; replaced by the floor count implied by the chosen layout.
    let floors = clamp(Math.ceil(demanded / capacityPerFloor), 1, Math.max(1, requirements.floorsMax));
    const unitsPerFloor = Math.max(1, Math.min(capacityPerFloor, Math.ceil(demanded / floors)));
    const typeList = buildTypeList(requirements, unitsPerFloor);

    // ---- intelligent layout decision -------------------------------------
    // Dwellings per floor is now a *searched* variable: every candidate count
    // is laid out by the engine, scored on facade/width/area feasibility and
    // the best is kept. This is what lets a narrow plate produce two usable
    // wide dwellings instead of three unusable narrow ones.
    const buildBlocks = (count: number): BlockPlan[] => {
      const result: BlockPlan[] = [];
      const totalFrontage = plates.reduce((sum, rect) => sum + rect.w, 0);
      let cursor = 0;
      for (let b = 0; b < plates.length; b++) {
        const share = plates.length === 1 ? count : Math.round((plates[b].w / Math.max(1, totalFrontage)) * count);
        const take = b === plates.length - 1 ? count - cursor : Math.max(0, share);
        if (take <= 0) continue;
        cursor += take;
        const slice = Array.from({ length: take }, (_, k) => typeList[(cursor - take + k) % Math.max(1, typeList.length)]);
        result.push(
          planBlock(site, plates[b], slice, {
            level: 0,
            blockIndex: b,
            accessNorth: strategy.accessNorth,
            rng,
            requirements,
            plateRects: plates,
            unitCount: take,
          }),
        );
      }
      return result;
    };

    const maxSlots = plates.reduce((sum, rect) => {
      const coreWidth = Math.min(CORE_WIDTH_M, Math.max(3.6, rect.w * 0.18));
      return sum + Math.max(1, Math.floor((rect.w - coreWidth) / (LAYOUT_ASSUMPTIONS.minBayWidthM * 2)));
    }, 0);
    const candidateCounts = Array.from(
      new Set([maxSlots, Math.max(1, maxSlots - 1), Math.max(1, Math.round(maxSlots * 0.6)), 1]),
    )
      .filter((n) => n >= 1 && n <= Math.max(1, maxSlots))
      .sort((a, b) => b - a);
    const layouts = candidateCounts.map((count) => {
      const candidate = buildBlocks(count);
      const total = candidate.reduce((sum, block) => sum + block.unitsPerFloor, 0);
      const score = candidate.length
        ? candidate.reduce((sum, block) => sum + block.score * block.unitsPerFloor, 0) / Math.max(1, total)
        : 0;
      const feasibleUnits = candidate.reduce((sum, block) => sum + block.feasibleUnits, 0);
      // Supply matters: prefer layouts that can still meet the programme.
      const floorsNeeded = Math.max(1, Math.ceil(demanded / Math.max(1, total)));
      const supplyPenalty = Math.max(0, floorsNeeded - requirements.floorsMax) * 12;
      const feasibilityBonus = total > 0 ? (feasibleUnits / total) * 6 : 0;
      return { count, blocks: candidate, score, total, feasibleUnits, adjusted: score + feasibilityBonus - supplyPenalty };
    });
    const chosen = layouts.sort((a, b) => b.adjusted - a.adjusted)[0];
    const blocks = chosen?.blocks ?? [];
    if (blocks.length === 0) continue;
    const layoutDecision = {
      candidateCounts,
      chosenUnitsPerFloor: chosen?.total ?? blocks.reduce((sum, b) => sum + b.unitsPerFloor, 0),
      candidates: layouts.map((layout) => ({
        unitsPerFloor: layout.total,
        score: round(layout.score, 2),
        feasibleUnits: layout.feasibleUnits,
        adjusted: round(layout.adjusted, 2),
      })),
      notes: chosen ? chosen.blocks.flatMap((block) => block.notes).slice(0, 6) : [],
    };

    const chosenUnitsPerFloor = Math.max(1, layoutDecision.chosenUnitsPerFloor);
    const resolvedFloors = clamp(Math.ceil(demanded / chosenUnitsPerFloor), 1, Math.max(1, requirements.floorsMax));
    floors = resolvedFloors;
    const levels: Level[] = [];
    for (let level = 0; level < resolvedFloors; level++) {
      const rooms: Room[] = [];
      const cores: Core[] = [];
      const corridors: Rect[] = [];
      for (const block of blocks) {
        for (const room of block.rooms) {
          rooms.push({ ...room, id: `${level}-${room.id}`, level });
        }
        for (const core of block.cores) cores.push({ ...core, id: `${level}-${core.id}` });
        corridors.push(...block.corridors);
      }
      const plateRects = blocks.map((b) => b.plate);
      const plan = buildLevelPlan(
        { index: level, rooms, cores, corridors, plateRects, corridorWidthM: PUBLIC_CORRIDOR_WIDTH_M },
        requirements.floorHeightM,
      );
      // Capacity declaration: does the available gross area of each unit even
      // reach the programme's minimum? If not, NO internal pattern can rescue
      // the plan, and that must be stated with numbers instead of producing a
      // "successful" drawing of 4 m² rooms.
      const capacityRows = blocks
        .flatMap((block) => block.units)
        .map((unit) => {
          const program = requirements.dwellings.find((d) => d.type === unit.type);
          const requiredGross = (program?.minAreaM2 ?? 0) / UNIT_NET_FACTOR;
          const availableGross = rectArea(unit.rect);
          return {
            type: unit.type,
            label: unit.label,
            availableGross: round(availableGross, 1),
            requiredGross: round(requiredGross, 1),
            ratio: requiredGross > 0 ? round(availableGross / requiredGross, 2) : 1,
          };
        });
      // Seed must be "infinitely good", otherwise a seed with ratio 1 wins over
      // every legitimate row (96.6/79.5 = 1.21 > 1) and the check silently
      // reported "programme has no minimum area".
      const worstCapacity =
        capacityRows.length === 0
          ? { type: "", label: "", availableGross: 0, requiredGross: 0, ratio: 1 }
          : capacityRows.reduce((worst, row) => (row.ratio < worst.ratio ? row : worst));
      const capacityCheck = {
        id: "PLAN-GEOMETRY-CAPACITY",
        severity: "quality" as const,
        status: (worstCapacity.ratio >= 1.15 ? "pass" : worstCapacity.ratio >= 1 ? "warning" : "fail") as
          | "pass"
          | "warning"
          | "fail",
        title: "کفایت سطح ناخالص واحد نسبت به برنامه",
        passed: worstCapacity.ratio >= 1,
        value: worstCapacity.requiredGross > 0
          ? `${worstCapacity.availableGross} m² موجود در برابر ${worstCapacity.requiredGross} m² لازم (${Math.round(worstCapacity.ratio * 100)}٪)`
          : "برنامه بدون حداقل سطح",
        requirement:
          "سطح ناخالص هر واحد ≥ حداقل برنامه ÷ ۰٫۸۸ (معیار داخلی؛ حداقل سطح از برنامه پروژه می‌آید و ضابطه رسمی نیست)",
        reason:
          worstCapacity.ratio >= 1
            ? undefined
            : `هیچ چیدمان داخلی نمی‌تواند این کمبود را جبران کند: ${worstCapacity.label} فقط ${worstCapacity.availableGross} m² ناخالص دارد در حالی که برنامه حداقل ${worstCapacity.requiredGross} m² ناخالص می‌خواهد.` +
              (analysis.convexParcel
                ? ""
                : ` روش محافظه‌کارانه عقب‌نشینی برای زمین مقعر تنها ${round(analysis.buildableAreaM2, 1)} m² از ${round(analysis.plotAreaM2, 1)} m² زمین را قابل ساخت می‌داند.`),
        roomIds: [],
      };
      const unitFitCheck = {
        id: "PLAN-UNIT-FIT",
        severity: "quality" as const,
        status: (blocks.every((block) => block.unitLayouts.every((layout) => layout.feasible)) ? "pass" : "warning") as "pass" | "warning",
        title: "تناسب واحدها با برنامه فیزیکی",
        passed: blocks.every((block) => block.unitLayouts.every((layout) => layout.feasible)),
        value: `${blocks.reduce((sum, block) => sum + block.feasibleUnits, 0)} از ${blocks.reduce((sum, block) => sum + block.unitLayouts.length, 0)} واحد`,
        requirement: "همه واحدها با الگوی داخلی قابل قبول (معیار داخلی)",
        roomIds: blocks.flatMap((block) => block.unitLayouts.filter((l) => !l.feasible).flatMap((l) => l.narrowRooms.map((room) => room.label))),
        reason: blocks.some((block) => block.unitLayouts.some((layout) => !layout.feasible))
          ? "برخی واحدها با عرض موجود نمی‌توانند همه فضاها را در ابعاد قابل استفاده جای دهند؛ کاهش تعداد واحد در طبقه یا افزایش عرض بلوک لازم است."
          : undefined,
      };
      levels.push({
        index: level,
        name: level === 0 ? "همکف" : `طبقه ${level + 1}`,
        rooms,
        cores,
        corridors,
        corridorWidthM: PUBLIC_CORRIDOR_WIDTH_M,
        plateRects,
        plateAreaM2: round(plateRects.reduce((s, r) => s + rectArea(r), 0), 2),
        netAreaM2: round(rooms.filter((r) => r.unitIndex >= 0).reduce((s, r) => s + r.areaM2, 0), 2),
        walls: plan.walls,
        openings: plan.openings,
        dimensions: plan.dimensions,
        stair: plan.stair,
        planChecks: [...plan.checks, capacityCheck, unitFitCheck],
        unitLayouts: blocks.flatMap((block) => block.unitLayouts),
      });
    }

    const footprintArea = round(plates.reduce((s, r) => s + rectArea(r), 0), 2);
    const unitsPerLevel = chosenUnitsPerFloor;
    const unitsTotal = unitsPerLevel * floors;
    const units = blocks.flatMap((b) => b.units.map((u) => ({ ...u, level: 0 })));
    const typicalMix = units.reduce<Record<string, number>>((acc, u) => {
      acc[u.type] = (acc[u.type] ?? 0) + 1;
      return acc;
    }, {});
    const unitMix = Object.fromEntries(Object.entries(typicalMix).map(([type, count]) => [type, count * floors]));
    const gfa = round(footprintArea * floors, 2);
    const netArea = round(levels.reduce((s, l) => s + l.netAreaM2, 0) * UNIT_NET_FACTOR, 2);
    const structural = computeStructural({
      footprintAreaM2: footprintArea,
      floors,
      grossFloorAreaM2: gfa,
      site,
      requirements,
      footprintRects: plates,
    });
    const mep = computeMep({ unitsTotal, grossFloorAreaM2: gfa, site, requirements });
    const parking = computeParking({ unitsTotal, requirements, footprintAreaM2: footprintArea, plotAreaM2: analysis.plotAreaM2 });
    const circulation = computeCirculation({ levels, cores: levels[0].cores, corridorWidthM: PUBLIC_CORRIDOR_WIDTH_M });
    const daylight = computeDaylight(levels);
    const metrics = buildMetrics({
      plotAreaM2: analysis.plotAreaM2,
      buildableAreaM2: analysis.buildableAreaM2,
      footprintAreaM2: footprintArea,
      gfa,
      netAreaM2: netArea,
      unitsTotal,
      unitsDemanded: demanded,
      floors,
      levels,
      site,
      structural,
      mep,
      parking,
      circulation,
      daylight,
      requirements,
      basements: parking.basementLevels,
    });

    const assumptions: Assumption[] = [
      {
        id: "ass-setback",
        label: "عقب‌نشینی اعمال‌شده",
        value: `${site.setbacks.north}/${site.setbacks.east}/${site.setbacks.south}/${site.setbacks.west}`,
        unit: "m (شمال/شرق/جنوب/غرب)",
        basis: "ورودی کاربر؛ محدوده ساخت‌پذیر به روش نیم‌صفحه (محافظه‌کارانه) محاسبه شد",
        confidence: "default",
      },
      {
        id: "ass-convex",
        label: "روش محاسبه سطح ساخت‌پذیر",
        value: "تقاطع نیم‌صفحه‌ها",
        unit: "-",
        basis: "برای زمین‌های مقعر، سطح ساخت‌پذیر محدب و بنابراین محافظه‌کارانه است",
        confidence: "engineering-judgement",
      },
      {
        id: "ass-units",
        label: "برنامه واحدها در طبقه نمونه",
        value: typeList.map((t) => DWELLING_LABEL[t]).join(" + "),
        unit: "-",
        basis: `تأمین ${unitsTotal} واحد از ${demanded} واحد درخواستی در ${floors} طبقه؛ آمیزه کل: ${Object.entries(unitMix)
          .map(([type, count]) => `${DWELLING_LABEL[type as DwellingType] ?? type}=${count}`)
          .join(" / ")}`,
        confidence: "default",
      },
      {
        id: "ass-wall",
        label: "افت دیوار و تأسیسات داخل واحد",
        value: "12",
        unit: "%",
        basis: "پلان شماتیک بدون ضخامت دیوار؛ ۱۲٪ افت برای دیوار، شفت و تأسیسات",
        confidence: "engineering-judgement",
      },
      {
        id: "ass-grid",
        label: "مدول سازه‌ای",
        value: `${structural.gridX} × ${structural.gridY}`,
        unit: "دهانه",
        basis: "هدف دهانه ≈۶ متر؛ کنترل مقدماتی برش پایه و ستون",
        confidence: "engineering-judgement",
      },
      ...structural.assumptions,
      ...mep.assumptions,
    ];

    const trace: TraceStep[] = [
      { step: "۱. اعتبارسنجی زمین", detail: `${site.boundary.length} رأس، مساحت ${round(analysis.plotAreaM2, 1)} m²`, output: analysis.boundarySimple ? "معتبر" : "نامعتبر" },
      {
        step: "۲. اعمال عقب‌نشینی",
        detail: `شمال ${site.setbacks.north}، شرق ${site.setbacks.east}، جنوب ${site.setbacks.south}، غرب ${site.setbacks.west} متر`,
        output: `سطح ساخت‌پذیر ${round(analysis.buildableAreaM2, 1)} m² (${round(analysis.buildableRatio * 100, 1)}٪ زمین)`,
      },
      {
        step: "۳. استخراج مستطیل ساخت‌پذیر",
        detail: "جست‌وجوی بیشینه مستطیل محاطی روی شبکه ۱×۱ متر",
        output: primary ? `${round(primary.w, 1)}×${round(primary.h, 1)} m` : "ناموفق",
      },
      {
        step: "۳.۵. نقش seed",
        detail: `seed=${options.seed} ترتیب انتخاب راهبردها را می‌چرخاند (چرخش ${rotation} از ${STRATEGY_LIBRARY.length})؛ هندسه هر راهبرد قطعی است.`,
        output: strategies.map((s) => s.id).join(" → "),
      },
      {
        step: "۴. راهبرد حجم",
        detail: `${strategy.label} — ${strategy.note}`,
        output: `${plates.length} بلوک، مساحت اشغال ${footprintArea} m²`,
      },
      {
        step: "۵. برنامه طبقات",
        detail: `ظرفیت طبقه ${capacityPerFloor} واحد، ارتفاع طبقه ${requirements.floorHeightM} m`,
        output: `${floors} طبقه × ${unitsPerLevel} واحد = ${unitsTotal} واحد`,
      },
      {
        step: "۵.۵. وضعیت هندسه و تحلیل",
        detail: analysis.approximation.note,
        output: `${analysis.convexParcel ? "محدب/دقیق" : "مقعر/محافظه‌کارانه"} · مرحله تحلیل: ${ANALYSIS_STATUS.level}`,
      },
      {
        step: "۵.۷. تصمیم چیدمان داخلی",
        detail: `تعداد واحد در طبقه از میان ${layoutDecision.candidateCounts.length} گزینه (${layoutDecision.candidateCounts.join("، ")}) با امتیازدهی نما/عرض/سطح انتخاب شد.`,
        output: `${layoutDecision.chosenUnitsPerFloor} واحد در طبقه · امتیازها: ${layoutDecision.candidates
          .map((candidate) => `${candidate.unitsPerFloor}→${candidate.adjusted}`)
          .join(" · ")}`,
      },
      {
        step: "۶. تقسیم فضا و چیدمان",
        detail: "همگام‌سازی برنامه اتاق‌ها با باند نما/دسترسی و بسته‌بندی قفسه‌ای",
        output: `${levels[0].rooms.length} فضای تولیدشده در طبقه نمونه`,
      },
      {
        step: "۷. تحلیل مهندسی",
        detail: "سازه (برش پایه، ستون، فونداسیون)، MEP، پارکینگ، گردش و نور روز",
        output: `برش پایه ${structural.seismicBaseShearKN} kN، ترانس ${mep.transformerKVA} kVA، پارکینگ ${parking.providedStalls}/${parking.requiredStalls}`,
      },
      {
        step: "۸. تولید معیارها",
        detail: "۲۴ معیار کمی برای مقایسه و رتبه‌بندی چندمعیاره",
        output: `تراکم ${round(gfa / Math.max(1, analysis.plotAreaM2), 2)}، بهره‌وری ${round(netArea / Math.max(1, gfa) * 100, 1)}٪`,
      },
    ];

    schemes.push({
      id: `${strategy.id}-${seed}`,
      code: `HMC-${String.fromCharCode(65 + index)}-${String(options.seed % 1000).padStart(3, "0")}`,
      seed,
      strategy: strategy.id,
      strategyLabel: strategy.label,
      engineVersion: ENGINE_VERSION,
      site,
      requirements,
      plotAreaM2: round(analysis.plotAreaM2, 2),
      buildablePolygon: analysis.buildablePolygon,
      buildableAreaM2: round(analysis.buildableAreaM2, 2),
      footprintRects: plates,
      footprintAreaM2: footprintArea,
      floors,
      floorHeightM: requirements.floorHeightM,
      unitsTotal,
      unitsPerFloor: unitsPerLevel,
      unitMix,
      levels,
      units,
      grossFloorAreaM2: gfa,
      netAreaM2: netArea,
      structural,
      mep,
      parking,
      circulation,
      daylight,
      metrics,
      assumptions,
      trace,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      analysisStatus: {
        level: "preliminary-screening",
        requiresEngineerReview: ANALYSIS_STATUS.requiresEngineerReview,
        notForConstruction: ANALYSIS_STATUS.notForConstruction,
        limitations: [...ANALYSIS_STATUS.limitations],
      },
      layoutDecision,
      geometryStatus: {
        buildableMethod: "convex-halfplane-setback",
        exact: analysis.approximation.exact,
        convexParcel: analysis.convexParcel,
        note: analysis.approximation.note,
      },
    });
  }
  return schemes;
}

/**
 * Shrinks a rect about its centre.
 *
 * Root cause fix (stage B-2): the previous version used
 * `Math.max(12, rect.w * f)` — a *minimum* width of 12 m. On a parcel whose
 * buildable strip was 11 m wide it silently ENLARGED the plate to 12 m and
 * re-centred it (x = 2.5 instead of 3), pushing the whole block outside the
 * permitted setback region and failing DATA-01-INTEGRITY.
 * Shrinking must never grow a rect: the minimum applies only as a lower bound
 * that is itself clamped by the input size.
 */
function shrinkRect(rect: Rect, factor: number): Rect {
  const f = clamp(factor, 0.5, 1);
  const w = Math.min(rect.w, Math.max(Math.min(12, rect.w), rect.w * f));
  const h = Math.min(rect.h, Math.max(Math.min(9, rect.h), rect.h * f));
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
}

/**
 * Proportional (largest-remainder) allocation of the dwelling programme to a
 * typical floor. Round-robin sequencing keeps the mix on every floor instead of
 * exhausting one dwelling type first.
 */
function buildTypeList(requirements: Requirements, unitsPerFloor: number): DwellingType[] {
  const fallback = [...requirements.dwellings].sort((x, y) => y.count - x.count)[0]?.type ?? "twoBed";
  const total = requirements.dwellings.reduce((s, d) => s + d.count, 0);
  if (total === 0) return Array.from({ length: unitsPerFloor }, () => fallback);
  const quotas = requirements.dwellings
    .filter((d) => d.count > 0)
    .map((d) => {
      const exact = (d.count / total) * unitsPerFloor;
      return { type: d.type, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
  let assigned = quotas.reduce((s, q) => s + q.count, 0);
  const byRemainder = [...quotas].sort((a, b) => b.remainder - a.remainder);
  let cursor = 0;
  while (assigned < unitsPerFloor && byRemainder.length > 0) {
    byRemainder[cursor % byRemainder.length].count += 1;
    assigned += 1;
    cursor += 1;
  }
  const list: DwellingType[] = [];
  while (list.length < unitsPerFloor) {
    const candidate = [...quotas].sort((a, b) => b.count - a.count)[0];
    if (!candidate || candidate.count <= 0) break;
    list.push(candidate.type);
    candidate.count -= 1;
  }
  while (list.length < unitsPerFloor) list.push(fallback);
  return list;
}

function planBlock(
  site: SiteModel,
  plate: Rect,
  types: DwellingType[],
  ctx: {
    level: number;
    blockIndex: number;
    accessNorth: boolean;
    rng: () => number;
    requirements: Requirements;
    plateRects: Rect[];
    unitCount?: number;
  },
): BlockPlan {
  const corridorDepth = PUBLIC_CORRIDOR_WIDTH_M;
  const cores: Core[] = [];
  const corridors: Rect[] = [];
  const rooms: Room[] = [];
  const units: UnitInstance[] = [];

  const unitsY = ctx.accessNorth ? plate.y : plate.y + corridorDepth;
  const unitsH = Math.max(4, plate.h - corridorDepth);
  const coreWidth = Math.min(CORE_WIDTH_M, Math.max(3.6, plate.w * 0.18));
  const coreDepth = Math.min(CORE_STAIR_DEPTH_M, unitsH);
  const coreRect: Rect = {
    x: plate.x,
    y: ctx.accessNorth ? plate.y : plate.y + plate.h - coreDepth,
    w: coreWidth,
    h: coreDepth,
  };
  const shaftDepth = unitsH - coreDepth;
  const shaftRect: Rect | null = shaftDepth > 1.2
    ? { x: plate.x, y: ctx.accessNorth ? plate.y + plate.h - corridorDepth - shaftDepth : plate.y, w: coreWidth, h: shaftDepth }
    : null;

  cores.push({
    id: `blk${ctx.blockIndex}-core`,
    kind: "stairElevator",
    rect: coreRect,
    polygon: [
      { x: coreRect.x, y: coreRect.y },
      { x: coreRect.x + coreRect.w, y: coreRect.y },
      { x: coreRect.x + coreRect.w, y: coreRect.y + coreRect.h },
      { x: coreRect.x, y: coreRect.y + coreRect.h },
    ],
    x: coreRect.x,
    y: coreRect.y,
  });
  corridors.push({
    x: plate.x + coreWidth,
    y: ctx.accessNorth ? plate.y + plate.h - corridorDepth : plate.y,
    w: plate.w - coreWidth,
    h: corridorDepth,
  });

  const unitZone: Rect = {
    x: plate.x + coreWidth,
    y: unitsY,
    w: Math.max(0, plate.w - coreWidth),
    h: unitsH,
  };

  const structuralPlateRects = ctx.plateRects;
  const baseRoom = (id: string, kind: Room["kind"], label: string, rect: Rect, unitIndex: number, minArea: number, habitable: boolean): Room => {
    const polygon = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ];
    const area = rectArea(rect);
    const facade = facadeLength(polygon, structuralPlateRects);
    return {
      id,
      kind,
      label,
      unitIndex,
      level: ctx.level,
      polygon,
      areaM2: round(area, 2),
      minAreaM2: minArea,
      habitable,
      facadeM: round(facade, 2),
      daylightFactorProxy: habitable ? round(clamp((0.9 * facade) / Math.max(1, area), 0, 0.6), 3) : 0,
    };
  };

  rooms.push(baseRoom(`blk${ctx.blockIndex}-core-room`, "core", "هسته دسترسی", coreRect, -1, 0, false));
  if (shaftRect) rooms.push(baseRoom(`blk${ctx.blockIndex}-shaft`, "void", "چاه نور/شفت", shaftRect, -1, 0, false));

  const fallbackType = types[0] ?? "twoBed";
  // The requested count is a *decision* (evaluated by the caller), not a
  // geometric afterthought. It is still clamped by the minimum frontage so an
  // impossible request cannot be drawn.
  const geometricMax = Math.max(1, Math.floor(unitZone.w / Math.min(LAYOUT_ASSUMPTIONS.minBayWidthM * 2, MIN_UNIT_WIDTH_M)));
  const slots = Math.max(1, Math.min(ctx.unitCount ?? types.length, geometricMax));
  const selectedTypes = Array.from({ length: slots }, (_, i) => types[i] ?? fallbackType);
  const targetGross = selectedTypes.map((t) => {
    const program = ctx.requirements.dwellings.find((d) => d.type === t);
    return (program?.targetAreaM2 ?? 85) / UNIT_NET_FACTOR;
  });
  const selectedSum = targetGross.reduce((s, x) => s + x, 0);
  let cursorX = unitZone.x;
  const unitLayouts: UnitLayoutRecord[] = [];

  for (let i = 0; i < slots; i++) {
    const isLast = i === slots - 1;
    const width = isLast
      ? unitZone.x + unitZone.w - cursorX
      : (targetGross[i] / Math.max(1, selectedSum)) * unitZone.w;
    const unitRect: Rect = { x: cursorX, y: unitZone.y, w: Math.max(0.5, width), h: unitZone.h };
    cursorX += width;
    const unitIndex = ctx.blockIndex * 100 + i;
    const projectedArea = rectArea(unitRect) * UNIT_NET_FACTOR;
    const layout = planUnitLayout(unitRect, selectedTypes[i], {
      unitIndex,
      level: ctx.level,
      accessNorth: ctx.accessNorth,
      plateRects: structuralPlateRects,
      suffix: `u${unitIndex}`,
      // Side-facade adjacency must be derived from geometry, not from the
      // position in the row: a single-unit floor touches BOTH short edges, and
      // that is exactly the case where a dual-aspect layout rescues a narrow
      // unit. Previously `i === slots - 1 && slots > 1` disabled dual aspect on
      // single-unit floors, leaving 1.7 m wide bedrooms.
      sideFacadeEast: Math.abs(unitRect.x + unitRect.w - (plate.x + plate.w)) <= 0.25,
      sideFacadeWest: Math.abs(unitRect.x - plate.x) <= 0.25,
    });
    void projectedArea;
    rooms.push(...layout.rooms);
    const area = rectArea(unitRect);
    const frontageNeed = minimumUnitFrontage(selectedTypes[i], unitRect.h, area);
    unitLayouts.push({
      unitIndex,
      type: selectedTypes[i],
      pattern: layout.pattern,
      patternLabel: layout.patternLabel,
      score: layout.evaluation.score,
      feasible: layout.evaluation.feasible,
      alternatives: layout.alternatives,
      narrowRooms: layout.evaluation.narrowRooms.map((room) => ({ label: room.label, width: room.width, depth: room.depth, area: room.area })),
      darkHabitable: layout.evaluation.darkHabitable,
      notes: [
        ...layout.evaluation.notes,
        ...(unitRect.w < frontageNeed - 0.05
          ? [`عرض واحد ${unitRect.w.toFixed(2)} m کمتر از نیاز برنامه (${frontageNeed.toFixed(2)} m) برای این گونه است.`]
          : []),
      ],
    });
    units.push({
      index: unitIndex,
      type: selectedTypes[i],
      label: `واحد ${ctx.blockIndex + 1}-${i + 1} (${DWELLING_LABEL[selectedTypes[i]]})`,
      level: ctx.level,
      rect: unitRect,
      areaM2: round(area, 2),
      roomIds: layout.rooms.map((r) => r.id),
      facadeM: round(layout.rooms.reduce((s, r) => s + r.facadeM, 0), 2),
    });
  }

  const feasibleUnits = unitLayouts.filter((layout) => layout.feasible).length;
  const score = unitLayouts.length
    ? round(unitLayouts.reduce((sum, layout) => sum + layout.score, 0) / unitLayouts.length, 2)
    : 0;
  const notes = unitLayouts.flatMap((layout) => layout.notes).slice(0, 6);

  return { plate, rooms, cores, corridors, units, unitLayouts, unitsPerFloor: slots, score, feasibleUnits, notes };
}

function planUnit(
  rect: Rect,
  type: DwellingType,
  ctx: {
    unitIndex: number;
    level: number;
    accessNorth: boolean;
    rng: () => number;
    blockIndex: number;
    plateRects: Rect[];
    suffix: string;
  },
): Room[] {
  const targets = ROOM_PROGRAMS[type];
  const unitArea = rectArea(rect);
  const habitableFacade = targets.filter((t) => t.habitable && t.zone === "facade");
  const facadeArea = habitableFacade.reduce((s, t) => s + t.ratio, 0) * unitArea;
  const desiredFacadeDepth = clamp(facadeArea / Math.max(1, rect.w), Math.min(3.8, rect.h * 0.45), rect.h * 0.6);
  const facadeDepth = round(Math.min(rect.h - 2.4, desiredFacadeDepth), 2);
  const facadeBandArea = rect.w * facadeDepth;

  const facadeRooms: RoomTarget[] = [...habitableFacade];
  let usedRatio = habitableFacade.reduce((s, t) => s + t.ratio, 0);
  const extras = targets.filter((t) => !facadeRooms.includes(t) && (t.kind === "kitchen" || t.kind === "balcony"));
  for (const extra of extras) {
    if ((usedRatio + extra.ratio) * unitArea <= facadeBandArea * 0.98) {
      facadeRooms.push(extra);
      usedRatio += extra.ratio;
    }
  }
  const accessRooms = targets.filter((t) => !facadeRooms.includes(t));

  const yFacade = ctx.accessNorth ? rect.y : rect.y + rect.h - facadeDepth;
  const yAccess = ctx.accessNorth ? rect.y + facadeDepth : rect.y;
  const accessDepth = rect.h - facadeDepth;

  const rooms: Room[] = [];
  const makeRoom = (target: RoomTarget, r: Rect, ordinal: number): Room => {
    const polygon = [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ];
    const area = rectArea(r);
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
  };

  // Facade band: rooms side by side. Habitable rooms first receive a usable
  // minimum facade width (1.4 m); the remainder is distributed proportionally.
  // Without this, a narrow unit split into three rooms produced a bedroom with
  // <1 m of daylight facade, which then failed the daylight target.
  const facadeSum = facadeRooms.reduce((s, t) => s + t.ratio, 0);
  const minFacade = 1.4;
  const habitableCount = facadeRooms.filter((t) => t.habitable).length;
  const reserve = Math.min(rect.w * 0.75, habitableCount * minFacade);
  const flexible = Math.max(0, rect.w - reserve);
  const flexibleRatio = facadeRooms.filter((t) => !t.habitable).reduce((s, t) => s + t.ratio, 0);
  const habitableRatio = Math.max(0.001, facadeRooms.filter((t) => t.habitable).reduce((s, t) => s + t.ratio, 0));
  const widths = facadeRooms.map((t) => {
    if (t.habitable) {
      const proportional = (t.ratio / Math.max(0.001, facadeSum)) * rect.w;
      const extra = flexibleRatio > 0 ? (t.ratio / habitableRatio) * flexible * 0.5 : 0;
      return Math.max(Math.min(minFacade, rect.w / facadeRooms.length), proportional, extra);
    }
    const proportional = (t.ratio / Math.max(0.001, facadeSum)) * rect.w;
    return Math.max(0.8, proportional * 0.9);
  });
  const widthSum = widths.reduce((sum, w) => sum + w, 0);
  const facadeScale = widthSum > rect.w ? rect.w / widthSum : 1;
  let fx = rect.x;
  facadeRooms.forEach((target, i) => {
    const isLast = i === facadeRooms.length - 1;
    const w = isLast ? rect.x + rect.w - fx : widths[i] * facadeScale;
    rooms.push(makeRoom(target, { x: fx, y: yFacade, w: Math.max(0.8, w), h: facadeDepth }, i));
    fx += w;
  });

  // Access band: shelf packing in up to three rows; entry sits on the corridor edge.
  const accessTotal = accessRooms.reduce((s, t) => s + t.ratio, 0) * unitArea;
  const entry = accessRooms.find((t) => t.kind === "entry");
  const others = accessRooms.filter((t) => t !== entry);
  const rowsCount = clamp(Math.round(accessDepth / 2.8), 1, 3);
  const rows: RoomTarget[][] = Array.from({ length: rowsCount }, () => []);
  if (entry) rows[0].push(entry);
  const sortedOthers = [...others].sort((x, y) => y.ratio - x.ratio);
  for (const t of sortedOthers) {
    let best = 0;
    let bestLoad = Infinity;
    rows.forEach((row, idx) => {
      const load = idx === 0 && entry ? Infinity : row.reduce((s, x) => s + x.ratio, 0);
      if (load < bestLoad) {
        bestLoad = load;
        best = idx;
      }
    });
    rows[best].push(t);
  }
  const rowAreas = rows.map((row) => row.reduce((s, t) => s + t.ratio, 0) * unitArea);
  const rowAreaSum = rowAreas.reduce((s, x) => s + x, 0) || accessTotal || 1;
  const scale = (accessDepth * rect.w) / rowAreaSum;
  let ry = ctx.accessNorth ? yAccess + accessDepth : yAccess;
  // rows are emitted from the corridor side inward
  rows.forEach((row, rowIndex) => {
    const h = (rowAreas[rowIndex] || (accessDepth * rect.w) / rows.length) * scale / Math.max(1, rect.w);
    const y = ctx.accessNorth ? ry - h : ry;
    ry = ctx.accessNorth ? ry - h : ry + h;
    const rowRatio = row.reduce((s, t) => s + t.ratio, 0) || 1;
    let rx = rect.x;
    row.forEach((target, i) => {
      const isLast = i === row.length - 1;
      const w = isLast ? rect.x + rect.w - rx : (target.ratio / rowRatio) * rect.w;
      rooms.push(
        makeRoom(target, { x: rx, y, w: Math.max(0.6, w), h: Math.max(0.6, h) }, facadeRooms.length + rowIndex * 4 + i),
      );
      rx += w;
    });
  });

  return rooms;
}

/** Recompute every derived quantity after a repair mutates the scheme. */
export function recomputeDerived(scheme: CanonicalScheme): CanonicalScheme {
  const floors = Math.max(1, Math.min(scheme.floors, scheme.levels.length));
  const levels = scheme.levels.slice(0, floors);
  const footprintArea = levels[0]?.plateAreaM2 ?? scheme.footprintAreaM2;
  const unitsPerLevel = levels[0]?.rooms.filter((r) => r.kind === "entry").length ?? scheme.unitsPerFloor;
  const unitsTotal = Math.max(unitsPerLevel, scheme.units.length) * floors;
  const gfa = round(footprintArea * floors, 2);
  const netArea = round(levels.reduce((s, l) => s + l.netAreaM2, 0) * UNIT_NET_FACTOR, 2);
  // Rebuild the architectural plan layer so walls/openings always match the
  // mutated rooms instead of drifting from the geometry.
  const replanned = levels.map((level) => {
    const plan = buildLevelPlan(
      {
        index: level.index,
        rooms: level.rooms,
        cores: level.cores,
        corridors: level.corridors,
        plateRects: level.plateRects,
        corridorWidthM: level.corridorWidthM,
      },
      scheme.floorHeightM,
    );
    return {
      ...level,
      walls: plan.walls,
      openings: plan.openings,
      dimensions: plan.dimensions,
      stair: plan.stair,
      planChecks: plan.checks,
    };
  });
  const structural = computeStructural({
    footprintAreaM2: footprintArea,
    floors,
    grossFloorAreaM2: gfa,
    site: scheme.site,
    requirements: scheme.requirements,
    footprintRects: levels[0]?.plateRects,
  });
  const mep = computeMep({ unitsTotal, grossFloorAreaM2: gfa, site: scheme.site, requirements: scheme.requirements });
  const parking = computeParking({
    unitsTotal,
    requirements: scheme.requirements,
    footprintAreaM2: footprintArea,
    plotAreaM2: scheme.plotAreaM2,
  });
  const circulation = computeCirculation({ levels, cores: levels[0]?.cores ?? [], corridorWidthM: levels[0]?.corridorWidthM ?? 2 });
  const daylight = computeDaylight(levels);
  const metrics = buildMetrics({
    plotAreaM2: scheme.plotAreaM2,
    buildableAreaM2: scheme.buildableAreaM2,
    footprintAreaM2: footprintArea,
    gfa,
    netAreaM2: netArea,
    unitsTotal,
    unitsDemanded: totalDwellingCount(scheme.requirements),
    floors,
    levels,
    site: scheme.site,
    structural,
    mep,
    parking,
    circulation,
    daylight,
    requirements: scheme.requirements,
    basements: parking.basementLevels,
  });
  return {
    ...scheme,
    floors,
    levels: replanned,
    footprintAreaM2: round(footprintArea, 2),
    unitsTotal,
    unitsPerFloor: unitsPerLevel,
    grossFloorAreaM2: gfa,
    netAreaM2: netArea,
    structural,
    mep,
    parking,
    circulation,
    daylight,
    metrics,
  };
}

export function areaOfPolygons(polys: Vec2[][]): number {
  return polys.reduce((s, p) => s + polygonArea(p), 0);
}

export function maxPlateDepth(scheme: CanonicalScheme): number {
  const level = scheme.levels[0];
  if (!level) return 0;
  const unitDepths = scheme.units.map((u) => u.rect.h);
  const plateDepths = level.plateRects.map((r) => r.h);
  return Math.max(MAX_CROSS_VENTILATION_DEPTH_M, ...unitDepths, ...plateDepths);
}

export function clipPlateToBuildable(plate: Rect, buildable: Vec2[]): number {
  const clipped = clipRectByPolygon(buildable, plate);
  return polygonArea(clipped);
}

export function siteBoundingBox(site: SiteModel): Rect {
  return bbox(site.boundary);
}

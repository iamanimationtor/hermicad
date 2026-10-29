import { round } from "../geometry";
import {
  buildFloorPlanScene,
  buildSiteScene,
  SHEET_FORMATS,
  type DrawingScene,
  type SheetFormat,
} from "./scene";
import { buildElevationScene, buildSectionScene, SIDE_LABEL_FA, type FacadeSide } from "./elevation";
import { doorWindowSchedule, roomSchedule, levelSummaryTable, drawingMissingData, type ScheduleTable } from "./tables";
import type { CanonicalScheme } from "../types";

/**
 * SHEET COMPOSITION (stage C).
 *
 * One architectural sheet is composed of blocks. Each drawing block is a real
 * `DrawingScene` produced from the shared model; the composer only decides where
 * it goes on the sheet and at which of the standard scales it fits. Tables are
 * rendered from `ScheduleTable` data.
 *
 * The composed document is expressed directly in SHEET millimetres so a single
 * renderer can produce SVG and PDF with identical geometry.
 */

export type BlockKind = "plan" | "elevation" | "section" | "schedule" | "text";

export interface ComposedBlock {
  id: string;
  kind: BlockKind;
  title: string;
  /** position on the sheet, millimetres, origin top-left */
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  scaleDenominator?: number;
  scene?: DrawingScene;
  table?: ScheduleTable;
  note?: string;
}

export interface SheetDocument {
  id: string;
  sheetNumber: string;
  title: string;
  format: SheetFormat;
  widthMm: number;
  heightMm: number;
  project: {
    name: string;
    code: string;
    schemeCode: string;
    levelName: string;
    engineVersion: string;
    date: string;
  };
  blocks: ComposedBlock[];
  titleBlock: { xMm: number; yMm: number; widthMm: number; heightMm: number };
  scaleSummary: { blockId: string; title: string; scaleDenominator: number }[];
  missingData: { item: string; detail: string }[];
  notes: string[];
  readiness: { status: "review-required"; label: string; disclaimer: string };
}

export interface SheetRequest {
  format?: SheetFormat;
  levelIndex?: number;
  includeElevations?: FacadeSide[];
  projectName?: string;
}

const STANDARD = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];

export function fitScale(scene: DrawingScene, widthMm: number, heightMm: number): { scaleDenominator: number; mmPerMetre: number } {
  const box = scene.sheet.modelBox;
  for (const scale of STANDARD) {
    const mmPerMetre = 1000 / scale;
    if (box.w * mmPerMetre <= widthMm - 4 && box.h * mmPerMetre <= heightMm - 12) {
      return { scaleDenominator: scale, mmPerMetre };
    }
  }
  return { scaleDenominator: 1000, mmPerMetre: 1 };
}

/** Re-scales a scene's own sheet transform to the target block size. */
export function sceneForBlock(scene: DrawingScene, widthMm: number, heightMm: number): DrawingScene {
  const { scaleDenominator, mmPerMetre } = fitScale(scene, widthMm, heightMm);
  const box = scene.sheet.modelBox;
  const offsetX = (widthMm - box.w * mmPerMetre) / 2;
  const offsetY = (heightMm - 8 - box.h * mmPerMetre) / 2 + 6;
  return {
    ...scene,
    sheet: {
      ...scene.sheet,
      scaleDenominator,
      mmPerMetre,
      // frame == block: the block-local coordinate system
      frameMm: { x: 0, y: 0, w: widthMm, h: heightMm },
      modelBox: box,
      marginMm: 0,
    },
    // carry the block offset so renderers can place it
    blockOffset: { xMm: offsetX, yMm: offsetY },
  } as DrawingScene;
}

function tableBlock(
  table: ScheduleTable,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
): ComposedBlock {
  return { id: `table-${table.id}`, kind: "schedule", title: table.title, xMm, yMm, widthMm, heightMm, table };
}

export function composeArchitecturalSheet(
  scheme: CanonicalScheme,
  request: SheetRequest = {},
): SheetDocument {
  const format: SheetFormat = request.format ?? "A1";
  const size = SHEET_FORMATS[format];
  const margin = 10;
  const titleBlock = { xMm: margin, yMm: size.heightMm - margin - 40, widthMm: 150, heightMm: 40 };
  const usableW = size.widthMm - margin * 2;
  const bodyTop = margin + 26; // datums for the sheet header
  const bodyBottom = titleBlock.yMm - 6;
  const bodyH = bodyBottom - bodyTop;
  const levelIndex = request.levelIndex ?? 0;

  // Right-hand column holds the schedules; drawings occupy the left.
  const tableW = 168;
  const drawW = usableW - tableW - 6;

  const planSceneRaw = buildFloorPlanScene(scheme, levelIndex, { includeSiteContext: true });
  const planScene = sceneForBlock(planSceneRaw, drawW, bodyH * 0.56 - 12);
  const sections = request.includeElevations ?? ["south", "east"];
  const elevH = (bodyH * 0.44) / Math.max(1, Math.ceil(sections.length / 2)) - 14;
  const elevW = drawW / 2 - 3;

  const blocks: ComposedBlock[] = [
    { id: "plan", kind: "plan", title: `پلان طبقه ${planScene.levelName}`, xMm: margin, yMm: bodyTop, widthMm: drawW, heightMm: bodyH * 0.56, scene: planScene, scaleDenominator: planScene.sheet.scaleDenominator },
  ];

  sections.slice(0, 4).forEach((side, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const elevation = sceneForBlock(buildElevationScene(scheme, side, { format }), elevW, elevH);
    blocks.push({
      id: `elevation-${side}`,
      kind: "elevation",
      title: `نمای ${SIDE_LABEL_FA[side]}`,
      xMm: margin + column * (elevW + 6),
      yMm: bodyTop + bodyH * 0.56 + row * (elevH + 14),
      widthMm: elevW,
      heightMm: elevH,
      scene: elevation,
      scaleDenominator: elevation.sheet.scaleDenominator,
    });
  });

  const tableX = margin + drawW + 6;
  const dwTable = doorWindowSchedule(scheme, levelIndex);
  const rmTable = roomSchedule(scheme, levelIndex);
  const lvTable = levelSummaryTable(scheme);
  const tableHeights = [bodyH * 0.4, bodyH * 0.36, bodyH * 0.24];
  [dwTable, rmTable, lvTable].forEach((table, index) => {
    blocks.push(
      tableBlock(
        table,
        tableX,
        bodyTop + tableHeights.slice(0, index).reduce((sum, value) => sum + value + 4, 0),
        tableW,
        tableHeights[index],
      ),
    );
  });

  const missing = drawingMissingData(scheme);
  return {
    id: `sheet-A-${format}`,
    sheetNumber: `A-101`,
    title: `مجموعه نقشه‌های معماری — ${scheme.code}`,
    format,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    project: {
      name: request.projectName ?? scheme.code,
      code: scheme.code,
      schemeCode: scheme.code,
      levelName: planScene.levelName,
      engineVersion: scheme.engineVersion,
      date: scheme.generatedAt.slice(0, 10),
    },
    blocks,
    titleBlock,
    scaleSummary: blocks
      .filter((block) => block.kind !== "schedule" && block.scaleDenominator)
      .map((block) => ({ blockId: block.id, title: block.title, scaleDenominator: block.scaleDenominator as number })),
    missingData: missing,
    notes: [
      "همه نقشه‌ها و جداول از یک مدل مرکزی (CEM) تولید شده‌اند؛ هیچ هندسه مستقلی ترسیم نشده است.",
      "مقیاس هر نقشه روی همان نقشه درج شده است؛ واحدها متر است.",
      "این مجموعه «قابل بازبینی کارشناسی» است و آمادگی اجرایی یا انطباق با ضوابط رسمی را اثبات نمی‌کند.",
    ],
    readiness: {
      status: "review-required",
      label: "قابل بازبینی کارشناسی — آماده اجرا نیست",
      disclaimer:
        "عناصر تعریف‌نشده در مدل (بام، محوطه، بالکن، مصالح، شالوده) ترسیم نشده‌اند و کمبود آن‌ها در همین برگ فهرست شده است. تأیید نهایی با مهندس دارای صلاحیت است.",
    },
  };
}

/** Sheets for the individual drawings (elevations and sections on their own sheet). */
export function composeElevationSheet(scheme: CanonicalScheme, request: SheetRequest = {}): SheetDocument {
  const format: SheetFormat = request.format ?? "A2";
  const size = SHEET_FORMATS[format];
  const margin = 10;
  const titleBlock = { xMm: margin, yMm: size.heightMm - margin - 34, widthMm: 140, heightMm: 34 };
  const bodyTop = margin + 22;
  const bodyH = titleBlock.yMm - 6 - bodyTop;
  const usableW = size.widthMm - margin * 2;
  const sides: FacadeSide[] = ["south", "north", "east", "west"];
  const cellW = usableW / 2 - 3;
  const cellH = bodyH / 2 - 6;
  const blocks: ComposedBlock[] = sides.map((side, index) => {
    const scene = sceneForBlock(buildElevationScene(scheme, side, { format }), cellW, cellH);
    return {
      id: `elevation-${side}`,
      kind: "elevation",
      title: `نمای ${SIDE_LABEL_FA[side]}`,
      xMm: margin + (index % 2) * (cellW + 6),
      yMm: bodyTop + Math.floor(index / 2) * (cellH + 12),
      widthMm: cellW,
      heightMm: cellH,
      scene,
      scaleDenominator: scene.sheet.scaleDenominator,
    };
  });
  const section = sceneForBlock(buildSectionScene(scheme, { format }), cellW, cellH);
  blocks.push({
    id: "section",
    kind: "section",
    title: section.levelName,
    xMm: margin,
    yMm: bodyTop + 2 * (cellH + 12),
    widthMm: cellW,
    heightMm: cellH,
    scene: section,
    scaleDenominator: section.sheet.scaleDenominator,
  });
  return {
    id: `sheet-E-${format}`,
    sheetNumber: "A-201",
    title: `نماها و برش — ${scheme.code}`,
    format,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    project: {
      name: scheme.code,
      code: scheme.code,
      schemeCode: scheme.code,
      levelName: "نما/برش",
      engineVersion: scheme.engineVersion,
      date: scheme.generatedAt.slice(0, 10),
    },
    blocks,
    titleBlock,
    scaleSummary: blocks.map((block) => ({
      blockId: block.id,
      title: block.title,
      scaleDenominator: block.scaleDenominator ?? 0,
    })),
    missingData: drawingMissingData(scheme),
    notes: [
      "تراز ±۰٫۰۰ نسبی است؛ نگاشت تراز زمین طبیعی در مدل تعریف نشده است.",
      "خط بام و پاراپت تعریف‌نشده است و ارتفاع بام ادعا نمی‌شود.",
      "ضخامت سقف در برش از تحلیل مقدماتی سازه آمده و تأییدشده نیست.",
    ],
    readiness: {
      status: "review-required",
      label: "قابل بازبینی کارشناسی — آماده اجرا نیست",
      disclaimer:
        "نماها و برش از مدل مرکزی تولید شده‌اند؛ عناصر تعریف‌نشده (بام، محوطه، مصالح، شالوده) ترسیم نشده و تأیید نهایی با مهندس دارای صلاحیت است.",
    },
  };
}

export function sheetAreaSummary(doc: SheetDocument): { blocks: number; drawings: number; tables: number; minScale: number; maxScale: number } {
  const drawings = doc.blocks.filter((block) => block.scene);
  const tables = doc.blocks.filter((block) => block.table);
  const scales = drawings.map((block) => block.scaleDenominator ?? 0).filter((value) => value > 0);
  return {
    blocks: doc.blocks.length,
    drawings: drawings.length,
    tables: tables.length,
    minScale: scales.length ? Math.min(...scales) : 0,
    maxScale: scales.length ? Math.max(...scales) : 0,
  };
}

export function sheetStats(doc: SheetDocument): { widthMm: number; heightMm: number; areaM2: number } {
  return { widthMm: doc.widthMm, heightMm: doc.heightMm, areaM2: round((doc.widthMm * doc.heightMm) / 1e6, 3) };
}

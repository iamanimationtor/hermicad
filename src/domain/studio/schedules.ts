/**
 * HERMICAD Studio — برگهٔ جداول و کیپلان
 *
 * چرا وجود دارد: نقشهٔ شهرداری بدون این سه چیز برگشت می‌خورد: «کیپلان» (جای
 * ساختمان در زمین)، «جدول دیوارها» (نوع، ضخامت، طول، سطح خالص) و «جدول درها و
 * پنجره‌ها» (کد، ابعاد، کف‌نشیمن، تعداد). این ماژول همه را از همان مدل پلان
 * می‌سازد — بدون ورود دستی و بدون عدد خوش‌ساختگی.
 *
 * اصول:
 *  - هر عدد از سند محاسبه می‌شود (طول دیوار از هندسهٔ شیء، ارتفاع از کتابخانه).
 *  - کد بازشوها (D1، W1، …) قطعی و پایدار است: مرتب‌سازی بر اساس ابعاد، نه ترتیب
 *    تصادفی اشیا؛ بنابراین با افزودن یک درِ جدید، کدهای قبلی جابه‌جا نمی‌شوند.
 *  - سطح خالص دیوار = سطح ناخالص منهای سطح بازشوهای همان طبقه، با کف صفر
 *    (سطح منفی بی‌معناست و به‌جای عدد غلط، صفر گزارش می‌شود).
 */

import { CATALOG_BY_ID } from "./catalog";
import { renderableItems, type StudioDocument, type StudioItem } from "./document";
import { Scene } from "./draw";
import {
  drawChrome,
  drawKeyplan,
  drawNorthArrow,
  drawScaleBar,
  drawTable,
  faArea,
  faMeter,
  faNumber,
  faPercent,
  sheetFrame,
  sheetSvg,
  sheetsPdf,
} from "./sheetKit";
import { OPENING_HEIGHTS } from "./vertical";

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

export interface WallRow {
  catalogId: string;
  name: string;
  /** ضخامت (متر) */
  thickness: number;
  /** طول کل (متر) */
  length: number;
  /** ارتفاع (متر) */
  height: number;
  /** سطح ناخالص (مترمربع) */
  grossArea: number;
  /** تعداد بازشو روی این نوع دیوار */
  openings: number;
  /** سطح بازشوها (مترمربع) */
  openingArea: number;
  /** سطح خالص */
  netArea: number;
  levels: number[];
}

export interface OpeningRow {
  code: string;
  catalogId: string;
  name: string;
  width: number;
  height: number;
  sill: number;
  count: number;
  area: number;
  levels: number[];
}

export interface SpaceRow {
  label: string;
  area: number;
  perimeter: number;
  level: number;
}

export interface StudioSchedules {
  walls: WallRow[];
  openings: OpeningRow[];
  spaces: SpaceRow[];
  totals: {
    wallLength: number;
    wallNetArea: number;
    openingArea: number;
    openingCount: number;
    spaceArea: number;
  };
  /** ساختمان: محدودهٔ پلان (متر) */
  bounds: { x: number; y: number; w: number; h: number };
}

const WALL_IDS = new Set(["wall-exterior", "wall-partition", "wall-party", "wall-curtain"]);
const OPENING_IDS = new Set(["door-single", "door-double", "door-garage", "window", "window-fixed", "sliding-door"]);

/** طول و ضخامت یک دیوار از هندسهٔ شیء (دیوارها از «نقطه تا نقطه» ساخته می‌شوند). */
function wallGeometry(item: StudioItem): { length: number; thickness: number } {
  return { length: Math.max(item.w, item.d), thickness: Math.min(item.w, item.d) };
}

/**
 * فاصلهٔ مرکز بازشو تا خط محور دیوار (متر).
 * محاسبه در دستگاه محلی دیوار انجام می‌شود تا چرخش دیوار هم درست حساب شود.
 */
function distanceToWall(opening: StudioItem, wall: StudioItem): number {
  const radians = (wall.rotationDeg * Math.PI) / 180;
  const dx = opening.x - wall.x;
  const dy = opening.y - wall.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // بردار در دستگاه محلی دیوار (محور x در راستای طول دیوار)
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const halfLength = Math.max(wall.w, wall.d) / 2;
  const along = Math.abs(localX) <= halfLength ? 0 : Math.abs(localX) - halfLength;
  return Math.hypot(along, localY);
}

/** سطح یک بازشو از مدل. */
function openingGeometry(item: StudioItem): { width: number; height: number; sill: number } {
  const spec = OPENING_HEIGHTS[item.catalogId];
  const width = Math.max(item.w, item.d);
  const height = spec?.height ?? CATALOG_BY_ID[item.catalogId]?.defaultSize.h ?? 2.1;
  const sill = spec?.sill ?? 0;
  return { width, height, sill };
}

/**
 * محاسبهٔ سه جدول. ترتیب ردیف‌ها قطعی است (نوع دیوار، سپس ضخامت) تا خروجی
 * تکرارپذیر باشد و مقایسهٔ دو نسخهٔ نقشه ساده شود.
 */
export function studioSchedules(doc: StudioDocument): StudioSchedules {
  const items = renderableItems({ ...doc, classification: "all" });
  const walls = items.filter((item) => WALL_IDS.has(item.catalogId));
  const openings = items.filter((item) => OPENING_IDS.has(item.catalogId));

  // تجمیع دیوارها بر پایهٔ (نوع، ضخامت) — همان شکلی که در جدول دیوارها می‌آید
  const wallGroups = new Map<string, WallRow>();
  for (const wall of walls) {
    const definition = CATALOG_BY_ID[wall.catalogId];
    if (!definition) continue;
    const { length, thickness } = wallGeometry(wall);
    const height = definition.defaultSize.h || 3;
    const key = `${wall.catalogId}|${thickness.toFixed(3)}`;
    const row = wallGroups.get(key) ?? {
      catalogId: wall.catalogId,
      name: definition.nameFa,
      thickness,
      length: 0,
      height,
      grossArea: 0,
      openings: 0,
      openingArea: 0,
      netArea: 0,
      levels: [] as number[],
    };
    row.length += length;
    row.grossArea += length * height;
    if (!row.levels.includes(wall.level)) row.levels.push(wall.level);
    wallGroups.set(key, row);
  }

  // هر بازشو به «نزدیک‌ترین دیوار» نسبت داده می‌شود (نه به سهم نسبی). دلیل:
  // در نقشه، بازشو روی خط همان دیوار قرار می‌گیرد؛ با فاصلهٔ نقطه تا پاره‌خط
  // می‌توان دیوار میزبان را قطعی تشخیص داد و «سطح خالص» هر نوع دیوار را دقیق
  // گزارش کرد. اگر بازشویی از هیچ دیواری نزدیک نباشد (کاربر آزاد گذاشته)، به
  // نزدیک‌ترین دیوار همان طبقه و در نهایت به سهم نسبی برمی‌گردد.
  const wallItems = walls.map((wall) => ({ item: wall, key: `${wall.catalogId}|${Math.min(wall.w, wall.d).toFixed(3)}` }));
  let openingAreaTotal = 0;
  const openingAreaPerGroup = new Map<string, number>();
  const openingCountPerGroup = new Map<string, number>();
  const unassigned: { area: number; level: number }[] = [];
  for (const opening of openings) {
    const { width, height } = openingGeometry(opening);
    const area = width * height;
    openingAreaTotal += area;
    let best: { key: string; distance: number } | null = null;
    for (const candidate of wallItems) {
      if (candidate.item.level !== opening.level) continue;
      const distance = distanceToWall(opening, candidate.item);
      if (!best || distance < best.distance) best = { key: candidate.key, distance };
    }
    if (best) {
      openingAreaPerGroup.set(best.key, (openingAreaPerGroup.get(best.key) ?? 0) + area);
      openingCountPerGroup.set(best.key, (openingCountPerGroup.get(best.key) ?? 0) + 1);
    } else {
      unassigned.push({ area, level: opening.level });
    }
  }
  // بازشوهای بی‌دیوار میان دیوارهای همان طبقه به نسبت سطح پخش می‌شوند
  for (const item of unassigned) {
    const sameLevel = [...wallGroups.values()].filter((row) => row.levels.includes(item.level));
    const total = sameLevel.reduce((sum, row) => sum + row.grossArea, 0);
    for (const row of sameLevel) {
      const key = `${row.catalogId}|${row.thickness.toFixed(3)}`;
      const share = total > 0 ? (row.grossArea / total) * item.area : 0;
      openingAreaPerGroup.set(key, (openingAreaPerGroup.get(key) ?? 0) + share);
      openingCountPerGroup.set(key, (openingCountPerGroup.get(key) ?? 0) + (total > 0 ? item.area / total : 0));
    }
  }
  for (const row of wallGroups.values()) {
    const key = `${row.catalogId}|${row.thickness.toFixed(3)}`;
    row.openingArea = round(openingAreaPerGroup.get(key) ?? 0, 3);
    row.openings = Math.round(openingCountPerGroup.get(key) ?? 0);
    row.netArea = Math.max(0, row.grossArea - row.openingArea);
  }

  // ترتیب قطعی ردیف‌ها: نوع دیوار، سپس ضخامت (خروجی تکرارپذیر)
  const wallRows = [...wallGroups.values()].sort(
    (a, b) => a.catalogId.localeCompare(b.catalogId) || a.thickness - b.thickness,
  );

  // کدگذاری پایدار: درها به ترتیب عرض نزولی D1..، پنجره‌ها W1..
  const openingGroups = new Map<string, OpeningRow & { seen: number }>();
  for (const opening of openings) {
    const definition = CATALOG_BY_ID[opening.catalogId];
    if (!definition) continue;
    const { width, height, sill } = openingGeometry(opening);
    const key = `${opening.catalogId}|${width.toFixed(2)}|${height.toFixed(2)}`;
    const existing = openingGroups.get(key);
    if (existing) {
      existing.count += 1;
      existing.area += width * height;
      if (!existing.levels.includes(opening.level)) existing.levels.push(opening.level);
    } else {
      openingGroups.set(key, {
        code: "",
        catalogId: opening.catalogId,
        name: definition.nameFa,
        width,
        height,
        sill,
        count: 1,
        area: width * height,
        levels: [opening.level],
        seen: 0,
      });
    }
  }
  const groups = [...openingGroups.values()];
  const doors = groups.filter((group) => group.catalogId.startsWith("door")).sort((a, b) => b.width - a.width || a.height - b.height);
  const windows = groups.filter((group) => !group.catalogId.startsWith("door")).sort((a, b) => b.width - a.width || a.height - b.height);
  doors.forEach((group, index) => (group.code = `D${index + 1}`));
  windows.forEach((group, index) => (group.code = `W${index + 1}`));
  const openingRows: OpeningRow[] = [...doors, ...windows].map(({ seen: _seen, ...rest }) => ({ ...rest, area: round(rest.area, 2) }));

  const spaces: SpaceRow[] = doc.items
    .filter((item) => item.catalogId.startsWith("space-"))
    .map((item) => ({
      label: item.label?.trim() || (item.catalogId === "space-terrace" ? "تراس" : item.catalogId === "space-shaft" ? "شفت" : "فضا"),
      area: round(item.w * item.d, 2),
      perimeter: round(2 * (item.w + item.d), 2),
      level: item.level,
    }))
    .sort((a, b) => a.level - b.level || b.area - a.area);

  const xs = items.map((item) => item.x - item.w / 2);
  const ys = items.map((item) => item.y - item.d / 2);
  const xe = items.map((item) => item.x + item.w / 2);
  const ye = items.map((item) => item.y + item.d / 2);
  const bounds =
    items.length > 0
      ? {
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xe) - Math.min(...xs),
          h: Math.max(...ye) - Math.min(...ys),
        }
      : { x: 0, y: 0, w: 12, h: 10 };

  return {
    walls: wallRows,
    openings: openingRows,
    spaces,
    totals: {
      wallLength: round(wallRows.reduce((sum, row) => sum + row.length, 0), 2),
      wallNetArea: round(wallRows.reduce((sum, row) => sum + row.netArea, 0), 2),
      openingArea: round(openingAreaTotal, 2),
      openingCount: openings.length,
      spaceArea: round(spaces.reduce((sum, row) => sum + row.area, 0), 2),
    },
    bounds: { x: round(bounds.x, 2), y: round(bounds.y, 2), w: round(bounds.w, 2), h: round(bounds.h, 2) },
  };
}

/* ─────────────────────────── برگه ─────────────────────────── */

/**
 * سه برگهٔ مستقل ساخته می‌شود تا هر کدام خوانا بماند:
 *   ۱) کیپلان + جدول فضاها
 *   ۲) جدول دیوارها
 *   ۳) جدول درها و پنجره‌ها
 * روی A3 هر سه با هم جا می‌شوند؛ روی A4 هم چون چیدمان نسبی است، می‌شکند نه
 * اینکه از کادر بیرون بزند.
 */
export function scheduleSheetScene(doc: StudioDocument, page: "keyplan" | "walls" | "openings"): Scene {
  const schedules = studioSchedules(doc);
  const scene = new Scene();
  const { area } = sheetFrame(doc);

  const titles: Record<string, string> = {
    keyplan: "کیپلان و جدول فضاها",
    walls: "جدول دیوارها",
    openings: "جدول درها و پنجره‌ها",
  };
  drawChrome(scene, doc, {
    title: titles[page],
    subtitle: `${doc.project.code} · ${doc.sheet.format} · ویرایش ${doc.revision}`,
    drawingTitle: titles[page],
    scaleText: page === "keyplan" ? "مقیاس کیپلان: خودکار" : "جدول — بدون مقیاس",
    footnote: "ترسیم آزاد — کنترل نهایی با مهندس دارای صلاحیت",
  });

  if (page === "keyplan") {
    const keyplanH = Math.min(area.h * 0.6, area.h - 70);
    drawKeyplan(scene, doc, {
      x: area.x,
      y: area.y + 2,
      w: area.w,
      h: keyplanH,
      bounds: schedules.bounds,
      level: doc.currentLevel,
      title: "کیپلان (موقعیت ساختمان در زمین)",
    });
    drawTable(scene, {
      x: area.x,
      y: area.y + keyplanH + 8,
      w: area.w,
      title: "جدول فضاها",
      columns: [
        { header: "ردیف", weight: 8, numeric: true },
        { header: "نام فضا", weight: 40 },
        { header: "مساحت (m²)", weight: 18, numeric: true },
        { header: "محیط (m)", weight: 16, numeric: true },
        { header: "طبقه", weight: 12, numeric: true },
        { header: "سهم از کل", weight: 16, numeric: true },
      ],
      rows: schedules.spaces.map((space, index) => [
        faNumber(index + 1, 0),
        space.label,
        faNumber(space.area),
        faNumber(space.perimeter),
        faNumber(space.level + 1, 0),
        schedules.totals.spaceArea > 0 ? faPercent(space.area / schedules.totals.spaceArea) : "—",
      ]),
      maxRows: 14,
      footer: ["", "جمع", faNumber(schedules.totals.spaceArea), "", "", faPercent(1, 0)],
      note: `تعداد فضاهای ثبت‌شده: ${faNumber(schedules.spaces.length, 0)} · مساحت کل: ${faArea(schedules.totals.spaceArea)}`,
    });
  }

  if (page === "walls") {
    drawTable(scene, {
      x: area.x,
      y: area.y + 2,
      w: area.w,
      title: "جدول دیوارها",
      columns: [
        { header: "ردیف", weight: 7, numeric: true },
        { header: "نوع دیوار", weight: 30 },
        { header: "ضخامت (m)", weight: 13, numeric: true },
        { header: "طول کل (m)", weight: 16, numeric: true },
        { header: "ارتفاع (m)", weight: 13, numeric: true },
        { header: "سطح ناخالص (m²)", weight: 18, numeric: true },
        { header: "بازشو (عدد)", weight: 14, numeric: true },
        { header: "سطح خالص (m²)", weight: 18, numeric: true },
        { header: "طبقات", weight: 14 },
      ],
      rows: schedules.walls.map((wall, index) => [
        faNumber(index + 1, 0),
        wall.name,
        faNumber(wall.thickness),
        faNumber(wall.length),
        faNumber(wall.height),
        faNumber(wall.grossArea),
        faNumber(wall.openings, 0),
        faNumber(wall.netArea),
        wall.levels.map((level) => faNumber(level + 1, 0)).join("، "),
      ]),
      maxRows: 16,
      rowHeight: 6,
      footer: ["", "جمع", "", faNumber(schedules.totals.wallLength), "", faNumber(schedules.walls.reduce((sum, wall) => sum + wall.grossArea, 0)), faNumber(schedules.totals.openingCount, 0), faNumber(schedules.totals.wallNetArea), ""],
      note: "سطح خالص = سطح ناخالص منهای سهم بازشوهای همان طبقه (به نسبت سطح دیوار).",
    });
  }

  if (page === "openings") {
    drawTable(scene, {
      x: area.x,
      y: area.y + 2,
      w: area.w,
      title: "جدول درها و پنجره‌ها",
      columns: [
        { header: "کد", weight: 8 },
        { header: "نوع", weight: 26 },
        { header: "عرض (m)", weight: 14, numeric: true },
        { header: "ارتفاع (m)", weight: 14, numeric: true },
        { header: "کف‌نشیمن (m)", weight: 16, numeric: true },
        { header: "تعداد", weight: 12, numeric: true },
        { header: "سطح (m²)", weight: 14, numeric: true },
        { header: "طبقات", weight: 16 },
      ],
      rows: schedules.openings.map((opening) => [
        opening.code,
        opening.name,
        faNumber(opening.width),
        faNumber(opening.height),
        faNumber(opening.sill),
        faNumber(opening.count, 0),
        faNumber(round(opening.area, 2)),
        opening.levels.map((level) => faNumber(level + 1, 0)).join("، "),
      ]),
      maxRows: 18,
      footer: [
        "",
        "جمع",
        "",
        "",
        "",
        faNumber(schedules.totals.openingCount, 0),
        faNumber(schedules.totals.openingArea),
        "",
      ],
      note: "کدگذاری پایدار: درها از D1 و پنجره‌ها از W1 به ترتیب عرض نزولی.",
    });
  }

  return scene;
}

/** برگهٔ جداول به‌صورت SVG (یک صفحهٔ ترکیبی سه‌بخشی: کیپلان + دیوارها + بازشوها). */
export function renderStudioScheduleSheet(doc: StudioDocument): string {
  return sheetSvg(combinedScheduleScene(doc), doc);
}

/** برگهٔ جداول (سه بخش روی یک برگه) برای PDF. */
export function renderStudioSchedulePdf(doc: StudioDocument): Uint8Array {
  return sheetsPdf([combinedScheduleScene(doc)], doc);
}

/**
 * نسخهٔ ترکیبی: چون کاربر معمولاً «یک برگهٔ جداول» می‌خواهد، هر سه بخش با
 * فاصلهٔ استاندارد و اندازه‌های متناسب در یک برگه چیده می‌شوند. صفحه‌های
 * مستقل هم در دسترس‌اند (`scheduleSheetScene`).
 */
function combinedScheduleScene(doc: StudioDocument): Scene {
  const schedules = studioSchedules(doc);
  const scene = new Scene();
  const { area } = sheetFrame(doc);
  drawChrome(scene, doc, {
    title: "جداول و کیپلان",
    subtitle: `${doc.project.code} · ${doc.sheet.format} · ویرایش ${doc.revision}`,
    drawingTitle: "کیپلان، جدول دیوارها و بازشوها",
    scaleText: "کیپلان: خودکار",
    footnote: "ترسیم آزاد — کنترل نهایی با مهندس دارای صلاحیت",
  });

  // چیدمان سه‌بخشی: نوار بالا (کیپلان + فضاها)، جدول دیوارها، جدول بازشوها.
  // چرا این ترتیب: کیپلان باید در بالای برگه و کنار خلاصهٔ فضاها باشد (روش
  // رایج نقشه‌های شهرداری) و دو جدول اصلی تمام‌عرض بمانند تا اعداد خوانا شوند.
  const gap = 5;
  const topBand = Math.min(area.h * 0.42, 96);
  const leftW = area.w * 0.4;
  const rightW = area.w - leftW - gap;

  drawKeyplan(scene, doc, {
    x: area.x,
    y: area.y + 2,
    w: leftW,
    h: topBand,
    bounds: schedules.bounds,
    level: doc.currentLevel,
    title: "کیپلان",
  });

  const spacesBottom = drawTable(scene, {
    x: area.x + leftW + gap,
    y: area.y + 2,
    w: rightW,
    title: "جدول فضاها",
    columns: [
      { header: "ردیف", weight: 7, numeric: true },
      { header: "نام فضا", weight: 34 },
      { header: "مساحت (m²)", weight: 16, numeric: true },
      { header: "محیط (m)", weight: 14, numeric: true },
      { header: "طبقه", weight: 10, numeric: true },
      { header: "سهم از کل", weight: 14, numeric: true },
    ],
    rows: schedules.spaces.map((space, index) => [
      faNumber(index + 1, 0),
      space.label,
      faNumber(space.area),
      faNumber(space.perimeter),
      faNumber(space.level + 1, 0),
      schedules.totals.spaceArea > 0 ? faPercent(space.area / schedules.totals.spaceArea, 0) : "—",
    ]),
    maxRows: 10,
    rowHeight: 4.8,
    cellSize: 1.8,
    footer: ["", "جمع", faNumber(schedules.totals.spaceArea), "", "", faPercent(1, 0)],
    note: `مساحت کل ثبت‌شده: ${faArea(schedules.totals.spaceArea)} · تعداد فضاها: ${faNumber(schedules.spaces.length, 0)}`,
  });

  const wallsTop = Math.max(area.y + topBand + 10, spacesBottom + 8);
  const wallsBottom = drawTable(scene, {
    x: area.x,
    y: wallsTop,
    w: area.w,
    title: "جدول دیوارها",
    columns: [
      { header: "ردیف", weight: 6, numeric: true },
      { header: "نوع دیوار", weight: 26 },
      { header: "ضخامت (m)", weight: 12, numeric: true },
      { header: "طول کل (m)", weight: 14, numeric: true },
      { header: "ارتفاع (m)", weight: 12, numeric: true },
      { header: "سطح ناخالص (m²)", weight: 16, numeric: true },
      { header: "بازشو (عدد)", weight: 12, numeric: true },
      { header: "سطح خالص (m²)", weight: 16, numeric: true },
      { header: "طبقات", weight: 12 },
    ],
    rows: schedules.walls.map((wall, index) => [
      faNumber(index + 1, 0),
      wall.name,
      faNumber(wall.thickness),
      faNumber(wall.length),
      faNumber(wall.height),
      faNumber(wall.grossArea),
      faNumber(wall.openings, 0),
      faNumber(wall.netArea),
      wall.levels.map((level) => faNumber(level + 1, 0)).join("، "),
    ]),
    maxRows: 10,
    rowHeight: 5.6,
    footer: [
      "",
      "جمع",
      "",
      faNumber(schedules.totals.wallLength),
      "",
      faNumber(schedules.walls.reduce((sum, wall) => sum + wall.grossArea, 0)),
      faNumber(schedules.totals.openingCount, 0),
      faNumber(schedules.totals.wallNetArea),
      "",
    ],
    note: "سطح خالص = سطح ناخالص منهای سطح بازشوهای همان دیوار (تشخیص با نزدیک‌ترین دیوار).",
  });

  const openingsBottom = drawTable(scene, {
    x: area.x,
    y: wallsBottom + 12,
    w: area.w,
    title: "جدول درها و پنجره‌ها",
    columns: [
      { header: "کد", weight: 7 },
      { header: "نوع", weight: 24 },
      { header: "عرض (m)", weight: 12, numeric: true },
      { header: "ارتفاع (m)", weight: 12, numeric: true },
      { header: "کف‌نشیمن (m)", weight: 14, numeric: true },
      { header: "تعداد", weight: 10, numeric: true },
      { header: "سطح (m²)", weight: 12, numeric: true },
      { header: "طبقات", weight: 14 },
    ],
    rows: schedules.openings.map((opening) => [
      opening.code,
      opening.name,
      faNumber(opening.width),
      faNumber(opening.height),
      faNumber(opening.sill),
      faNumber(opening.count, 0),
      faNumber(round(opening.area, 2)),
      opening.levels.map((level) => faNumber(level + 1, 0)).join("، "),
    ]),
    maxRows: 12,
    rowHeight: 5.4,
    footer: ["", "جمع", "", "", "", faNumber(schedules.totals.openingCount, 0), faNumber(schedules.totals.openingArea), ""],
    note: "کدگذاری پایدار: درها از D1 و پنجره‌ها از W1 به ترتیب عرض نزولی؛ کد با تغییر مکان اشیا عوض نمی‌شود.",
  });

  // نوار خلاصهٔ متره در پایین برگه: چهار کارت با اعداد کلیدی نگه‌دارندهٔ
  // فضای خالی برگه را به اطلاعات قابل استفاده تبدیل می‌کند.
  // کارت‌ها هرگز روی کتیبه نمی‌افتند: همیشه داخل ناحیهٔ نقشه می‌مانند
  const summaryTop = Math.min(openingsBottom + 12, area.y + area.h - 22);
  const cards = [
    { label: "طول کل دیوارها", value: faMeter(schedules.totals.wallLength), note: `طبقات: ${faNumber(doc.levels, 0)}` },
    { label: "سطح خالص دیوارها", value: faArea(schedules.totals.wallNetArea), note: "پس از کسر بازشوها" },
    { label: "بازشوها", value: `${faNumber(schedules.totals.openingCount, 0)} عدد`, note: `${faArea(schedules.totals.openingArea)} سطح` },
    { label: "مساحت فضاهای ثبت‌شده", value: faArea(schedules.totals.spaceArea), note: `${faNumber(schedules.spaces.length, 0)} فضا` },
  ];
  const cardGap = 4;
  const cardW = (area.w - cardGap * (cards.length - 1)) / cards.length;
  cards.forEach((card, index) => {
    const x0 = area.x + index * (cardW + cardGap);
    scene.rect(x0, summaryTop, cardW, 20, { fill: 0.96, width: 0.25, gray: 0.6 });
    scene.text(x0 + cardW - 2.5, summaryTop + 5.4, card.label, 2, { anchor: "end", gray: 0.45 });
    scene.text(x0 + cardW - 2.5, summaryTop + 12, card.value, 3.6, { anchor: "end", bold: true, gray: 0.12 });
    scene.text(x0 + cardW - 2.5, summaryTop + 16.6, card.note, 1.8, { anchor: "end", gray: 0.45 });
  });

  return scene;
}

export { drawKeyplan, drawNorthArrow, drawScaleBar };

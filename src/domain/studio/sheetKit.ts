/**
 * HERMICAD Studio — ابزار مشترک برگه‌سازی
 *
 * چرا وجود دارد: پلان، نما، برش، جزئیات و جداول همه روی برگهٔ A0..A4 چاپ می‌شوند
 * و باید «یک خانوادهٔ بصری» باشند: همان کادر دوگانه، همان کتیبه، همان قلم، همان
 * قاعدهٔ عدد فارسی و همان جدول. اگر هر برگه کادر خودش را بکشد، دیر یا زود
 * عنوان‌ها جابه‌جا، قلم‌ها ناهمگون و اعداد ناسازگار می‌شوند.
 *
 * همه‌چیز روی `Scene` (draw.ts) ساخته می‌شود؛ بنابراین هر برگه یک بار ساخته و
 * هم به SVG و هم به PDF برداری (با فونت فارسی جاسازی‌شده) تبدیل می‌شود.
 */

import { documentFingerprint, sheetSizeMm, todayJalali, type StudioDocument } from "./document";
import { Scene } from "./draw";
import { scenePdfOps, sceneSvg } from "./draw";
import { assemblePdf, type SheetLayout } from "./pdf/sheetPdf";
import { PdfText } from "./pdf/text";
import { loadTypeface } from "./pdf/typeface";

export const MARGIN = 8;
export const HEADER_H = 12;
export const FOOTER_H = 26;

export interface Frame {
  /** ابعاد برگه (میلی‌متر) */
  sheet: { w: number; h: number };
  /** ناحیهٔ نقشه داخل کادر */
  area: { x: number; y: number; w: number; h: number };
  titleBlock: { x: number; y: number; w: number; h: number };
}

/* ─────────────────────────── اعداد و واحدها ─────────────────────────── */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** عدد با ارقام فارسی؛ جداکنندهٔ اعشار «٫» و هزارگان «٬». */
export function faNumber(value: number, digits = 2, group = false): string {
  const negative = value < 0;
  let text = Math.abs(value).toFixed(digits);
  if (group) {
    const [whole, fraction] = text.split(".");
    text = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "٬") + (fraction ? `٫${fraction}` : "");
  } else {
    text = text.replace(".", "٫");
  }
  const converted = text.replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]);
  return negative ? `−${converted}` : converted;
}

/** طول با واحد متر: «۱۲٫۰۰ متر» */
export const faMeter = (value: number, digits = 2): string => `${faNumber(value, digits)} متر`;

/** سطح با واحد مترمربع. */
export const faArea = (value: number, digits = 2): string => `${faNumber(value, digits)} م²`;

/** درصد با علامت فارسی. */
export const faPercent = (ratio: number, digits = 1): string => `${faNumber(ratio * 100, digits)}٪`;

/* ─────────────────────────── کادر و کتیبه ─────────────────────────── */

export function sheetFrame(doc: StudioDocument): Frame {
  const size = sheetSizeMm(doc);
  return {
    sheet: { w: size.w, h: size.h },
    area: {
      x: MARGIN + 3,
      y: MARGIN + HEADER_H + 4,
      w: size.w - (MARGIN + 3) * 2,
      h: size.h - HEADER_H - FOOTER_H - MARGIN * 2 - 6,
    },
    titleBlock: {
      x: MARGIN + 3,
      y: size.h - MARGIN - FOOTER_H,
      w: size.w - (MARGIN + 3) * 2,
      h: FOOTER_H,
    },
  };
}

export interface ChromeOptions {
  /** عنوان اصلی برگه (سمت راست) */
  title: string;
  /** زیرعنوان: کد پروژه، مقیاس، برگه */
  subtitle: string;
  /** عنوان در کتیبه (ستون «نقشه») */
  drawingTitle: string;
  /** ستون مقیاس و برگه */
  scaleText: string;
  /** یادداشت پایین کادر (پیش‌فرض: کنترل نهایی) */
  footnote?: string;
}

/**
 * کادر دوگانه، سرصفحه، خط جداکننده و کتیبهٔ چهارستونه.
 * ترتیب ستون‌ها از راست به چپ است (پروژه | نقشه | مقیاس | کنترل).
 */
export function drawChrome(scene: Scene, doc: StudioDocument, options: ChromeOptions): void {
  const { sheet, titleBlock } = sheetFrame(doc);
  scene.rect(MARGIN, MARGIN, sheet.w - MARGIN * 2, sheet.h - MARGIN * 2, {
    width: 0.45,
    gray: 0.45,
    data: 'data-frame="1"',
  });
  scene.rect(MARGIN + 3, MARGIN + 3, sheet.w - (MARGIN + 3) * 2, sheet.h - (MARGIN + 3) * 2, {
    width: 0.2,
    gray: 0.7,
    data: 'data-frame-inner="1"',
  });
  // خط جداکنندهٔ کتیبه (مرز بالای کادر اطلاعات)
  scene.line(titleBlock.x, titleBlock.y, titleBlock.x + titleBlock.w, titleBlock.y, {
    width: 0.35,
    gray: 0.45,
    data: 'data-title-block="1"',
  });

  scene.text(sheet.w - MARGIN - 4, MARGIN + 9, `${doc.project.code} · ${doc.project.name}`, 5.2, { anchor: "end", bold: true });
  scene.text(sheet.w - MARGIN - 4, MARGIN + 14, options.subtitle, 2.8, { anchor: "end", gray: 0.4 });
  scene.text(MARGIN + 4, MARGIN + 9, documentFingerprint(doc), 2.4, { direction: "ltr", gray: 0.5 });
  scene.line(MARGIN + 3, MARGIN + HEADER_H + 2, sheet.w - MARGIN - 3, MARGIN + HEADER_H + 2, { width: 0.35, gray: 0.4 });

  const cols = [
    { title: "پروژه", value: doc.project.name, sub: `${doc.project.code} · کارفرما: ${doc.project.client || "—"}` },
    { title: "نقشه", value: options.drawingTitle, sub: `ویرایش ${doc.revision} · ${todayJalali()}` },
    { title: "مقیاس و برگه", value: options.scaleText, sub: `${doc.sheet.format} · ${doc.sheet.orientation === "landscape" ? "افقی" : "عمودی"}` },
    { title: "طراح / کنترل", value: doc.project.designer || "—", sub: `${doc.project.date} · کنترل نهایی با مهندس دارای صلاحیت` },
  ];
  const colW = titleBlock.w / cols.length;
  cols.forEach((col, index) => {
    const x0 = titleBlock.x + index * colW;
    if (index > 0) scene.line(x0, titleBlock.y, x0, titleBlock.y + titleBlock.h, { width: 0.25, gray: 0.45 });
    scene.text(x0 + colW - 3, titleBlock.y + 5, col.title, 2.2, { anchor: "end", gray: 0.45 });
    scene.text(x0 + colW - 3, titleBlock.y + 12, col.value, 3.4, { anchor: "end", bold: true });
    scene.text(x0 + colW - 3, titleBlock.y + 17, col.sub, 2.1, { anchor: "end", gray: 0.4 });
  });
  if (options.footnote) {
    scene.text(titleBlock.x + titleBlock.w - 2.5, titleBlock.y + 22, options.footnote, 1.9, { anchor: "end", gray: 0.5 });
  }
}

/* ─────────────────────────── جدول ─────────────────────────── */

export interface TableColumn {
  header: string;
  /** وزن نسبی عرض ستون */
  weight: number;
  /** اعداد در ستون‌های عددی چپ‌به‌راست نوشته می‌شوند */
  numeric?: boolean;
  align?: "start" | "middle" | "end";
}

export interface TableOptions {
  x: number;
  y: number;
  w: number;
  title: string;
  columns: TableColumn[];
  rows: string[][];
  /** حداکثر ردیف روی برگه؛ باقی با «و N ردیف دیگر» خلاصه می‌شود */
  maxRows?: number;
  rowHeight?: number;
  /** سطر جمع در پایان */
  footer?: string[];
  /** یادداشت زیر جدول */
  note?: string;
  /** اندازهٔ قلم سرستون/سلول */
  headerSize?: number;
  cellSize?: number;
}

/**
 * جدول عمومی برگه (از راست به چپ).
 * عرض ستون‌ها نسبی است و در عرض داده‌شده نرمال می‌شود؛ هیچ ستونی از جدول
 * بیرون نمی‌زند و متن بلند در سلول کوچک می‌شود (نه اینکه سرریز کند).
 */
export function drawTable(scene: Scene, options: TableOptions): number {
  const { x, w } = options;
  const headerSize = options.headerSize ?? 2;
  const cellSize = options.cellSize ?? 1.9;
  const rowH = options.rowHeight ?? 5.2;
  const totalWeight = options.columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = options.columns.map((column) => (column.weight / totalWeight) * w);
  const maxRows = options.maxRows ?? Infinity;
  const visible = options.rows.slice(0, maxRows);
  const hidden = options.rows.length - visible.length;
  const footerRows = options.footer ? 1 : 0;
  const height = rowH * (visible.length + 1 + footerRows);

  scene.text(x + w, options.y + 4.6, options.title, 3, { anchor: "end", bold: true, gray: 0.12 });
  const top = options.y + 7.4;
  scene.rect(x, top, w, height, { width: 0.35, gray: 0.3 });
  scene.rect(x, top, w, rowH, { fill: 0.9, width: 0.35, gray: 0.3 });

  // سرستون‌ها (از راست به چپ)
  let right = x + w;
  options.columns.forEach((column, index) => {
    const cellW = widths[index];
    if (index > 0) scene.line(right, top, right, top + height, { width: 0.15, gray: 0.55 });
    const label = fitText(column.header, cellW - 1.6, headerSize);
    scene.text(right - cellW / 2, top + rowH - 1.7, label, headerSize, { anchor: "middle", gray: 0.15, bold: true });
    right -= cellW;
  });
  scene.line(x, top + rowH, x + w, top + rowH, { width: 0.25, gray: 0.45 });

  const drawRow = (cells: string[], rowIndex: number, style: { fill?: number | null; gray?: number; bold?: boolean }) => {
    const rowY = top + rowH * rowIndex;
    if (style.fill != null) scene.rect(x, rowY, w, rowH, { fill: style.fill, width: 0, gray: 1 });
    scene.line(x, rowY, x + w, rowY, { width: 0.12, gray: 0.72 });
    let cellRight = x + w;
    cells.forEach((cell, index) => {
      const cellW = widths[index];
      const column = options.columns[index];
      const align = column.align ?? (column.numeric ? "middle" : "end");
      const value = fitText(cell, cellW - 1.6, cellSize);
      const anchorX = align === "middle" ? cellRight - cellW / 2 : align === "end" ? cellRight - 0.8 : cellRight - cellW + 0.8;
      scene.text(anchorX, rowY + rowH - 1.6, value, cellSize, {
        anchor: align,
        gray: style.gray ?? 0.12,
        bold: style.bold ?? false,
        direction: column.numeric ? "ltr" : "rtl",
      });
      if (index > 0) scene.line(cellRight, rowY, cellRight, rowY + rowH, { width: 0.1, gray: 0.78 });
      cellRight -= cellW;
    });
  };

  visible.forEach((cells, index) => drawRow(cells, index + 1, { fill: index % 2 === 1 ? 0.965 : null }));
  if (options.footer) {
    drawRow(options.footer, visible.length + 1, { fill: 0.88, bold: true, gray: 0.08 });
  }

  let bottom = top + height;
  if (hidden > 0) {
    scene.text(x + w / 2, bottom + 4.2, `و ${faNumber(hidden, 0)} ردیف دیگر — فهرست کامل در خروجی XLSX/CSV`, 1.9, { anchor: "middle", gray: 0.45 });
    bottom += 4.2;
  }
  if (options.note) {
    scene.text(x + w, bottom + 4.6, options.note, 1.9, { anchor: "end", gray: 0.45 });
    bottom += 4.6;
  }
  return bottom;
}

/** کوچک‌کردن متن تا در عرض سلول جا شود (بدون سرریز). */
export function fitText(value: string, maxMm: number, sizeMm: number): string {
  const approx = (text: string, size: number) => text.length * size * 0.52;
  if (approx(value, sizeMm) <= maxMm) return value;
  let text = value;
  while (text.length > 4 && approx(`${text}…`, sizeMm) > maxMm) text = text.slice(0, -1);
  return `${text}…`;
}

/* ─────────────────────────── نمادها ─────────────────────────── */

/** فلش شمال (بالا) — نماد استاندارد نقشه. */
export function drawNorthArrow(scene: Scene, cx: number, cy: number, size: number): void {
  const half = size / 2;
  scene.circle(cx, cy, half, { width: 0.25, gray: 0.2 });
  // پیکان دوسویه: نیمهٔ بالا پر (شمال)، نیمهٔ پایین خالی
  scene.poly(
    [
      [cx, cy - half * 0.88],
      [cx + half * 0.42, cy + half * 0.55],
      [cx, cy + half * 0.2],
    ],
    { fill: 0.15, width: 0.2, gray: 0.15 },
  );
  scene.poly(
    [
      [cx, cy - half * 0.88],
      [cx - half * 0.42, cy + half * 0.55],
      [cx, cy + half * 0.2],
    ],
    { fill: null, width: 0.2, gray: 0.2 },
  );
  scene.text(cx, cy - half - 1.6, "شمال", 2.1, { anchor: "middle", gray: 0.25 });
}

/** خط‌کش مقیاس راه‌راه (متر). */
export function drawScaleBar(scene: Scene, x: number, y: number, mmPerMetre: number, metres = 4): void {
  const step = mmPerMetre;
  for (let index = 0; index < metres; index += 1) {
    scene.rect(x + index * step, y, step, 1.6, {
      fill: index % 2 === 0 ? 0.12 : 1,
      width: 0.15,
      gray: 0.15,
    });
    scene.text(x + index * step, y + 4.4, faNumber(index, 0), 1.8, { anchor: "middle", gray: 0.4, direction: "ltr" });
  }
  scene.text(x + metres * step, y + 4.4, faNumber(metres, 0), 1.8, { anchor: "middle", gray: 0.4, direction: "ltr" });
  scene.text(x + metres * step + 3, y + 1.5, "متر", 2, { anchor: "start", gray: 0.4 });
}

/* ─────────────────────────── رندر ─────────────────────────── */

/** برگه به‌صورت SVG کامل (همان صحنه، بدون بازرسم). */
export function sheetSvg(scene: Scene, doc: StudioDocument): string {
  const { sheet } = sheetFrame(doc);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.w}mm" height="${sheet.h}mm" viewBox="0 0 ${sheet.w} ${sheet.h}">
  <rect width="${sheet.w}" height="${sheet.h}" fill="#ffffff"/>
  ${sceneSvg(scene)}
</svg>`;
}

/** برگه (یا برگه‌ها) به‌صورت PDF با فونت جاسازی‌شده. */
export function sheetsPdf(pages: Scene[], doc: StudioDocument): Uint8Array {
  const { sheet, area, titleBlock } = sheetFrame(doc);
  const text = new PdfText(loadTypeface("regular"), loadTypeface("bold"));
  const layout: SheetLayout = {
    widthMm: sheet.w,
    heightMm: sheet.h,
    areaMm: area,
    titleBlock,
    mmPerMetre: 1000 / (doc.sheet.scale || 50),
    requestedScale: doc.sheet.scale || 50,
    fitted: false,
    bounds: { x: 0, y: 0, w: sheet.w, h: sheet.h },
  };
  const ops = pages.map((scene) => scenePdfOps(scene, sheet.h, text));
  return assemblePdf(ops.map((pageOps) => ({ ops: pageOps, layout })), text, doc);
}

/* ─────────────────────────── کیپلان ─────────────────────────── */

export interface KeyplanOptions {
  /** مستطیل محل کیپلان روی برگه (میلی‌متر) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** محدودهٔ طرح (متر) */
  bounds: { x: number; y: number; w: number; h: number };
  /** طبقهٔ نمایش‌داده‌شده */
  level: number;
  /** عنوان کیپلان */
  title?: string;
}

/**
 * کیپلان: نمای کلی زمین/بلوک با مشخص‌کردن محدودهٔ ساختمان و قطعه.
 *
 * در نقشه‌های شهرداری، کیپلان «جای ساختمان در زمین» را نشان می‌دهد تا ناظر
 * بتواند موقعیت را با نقشهٔ سایت تطبیق دهد. اینجا همان کار با نمادهای ساده و
 * مقیاس خوانا انجام می‌شود: خط قطعه (چین‌دار)، بلوک ساختمان هاشورخورده،
 * محورهای اصلی، فلش شمال و خط‌کش مقیاس.
 */
export function drawKeyplan(scene: Scene, doc: StudioDocument, options: KeyplanOptions): number {
  const { x, y, w, h, bounds } = options;
  scene.text(x + w, y + 4.6, options.title ?? "کیپلان", 3, { anchor: "end", bold: true, gray: 0.12 });

  // کادر کیپلان
  const pad = 5;
  const box = { x: x + 1, y: y + 7.4, w: w - 2, h: h - 9 };
  scene.rect(box.x, box.y, box.w, box.h, { width: 0.2, gray: 0.75, dash: [3, 2] });

  // مقیاس خودکار از میان مقیاس‌های رایج نقشهٔ سایت
  const candidates = [50, 100, 200, 250, 500, 750, 1000, 2000];
  const usable = { w: box.w - pad * 2, h: box.h - pad * 3 };
  let scale = candidates[candidates.length - 1];
  for (const candidate of candidates) {
    const mmPerMetre = 1000 / candidate;
    if (bounds.w * mmPerMetre <= usable.w && bounds.h * mmPerMetre <= usable.h) {
      scale = candidate;
      break;
    }
  }
  const mmPerMetre = 1000 / scale;
  const drawingW = bounds.w * mmPerMetre;
  const drawingH = bounds.h * mmPerMetre;
  const originX = box.x + (box.w - drawingW) / 2;
  const originY = box.y + (box.h - drawingH) / 2 + 3;
  // دستگاه پروژه: y رو به شمال ⇒ روی کاغذ رو به بالا
  const map = (mx: number, my: number) => ({ x: originX + (mx - bounds.x) * mmPerMetre, y: originY + drawingH - (my - bounds.y) * mmPerMetre });

  // قطعه (پارسل): محدودهٔ سند + حاشیهٔ زمین (فضای حیاط/پاسیو)
  const parcelMargin = Math.max(1.5, Math.min(bounds.w, bounds.h) * 0.3);
  const p0 = map(bounds.x - parcelMargin, bounds.y - parcelMargin);
  const p1 = map(bounds.x + bounds.w + parcelMargin, bounds.y + bounds.h + parcelMargin);
  scene.rect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y), {
    fill: 0.97,
    width: 0.3,
    gray: 0.55,
    dash: [4, 2],
  });
  scene.text(Math.max(p0.x, p1.x) - 1.4, Math.min(p0.y, p1.y) + 3.6, "حد قطعه", 1.8, { anchor: "end", gray: 0.5 });

  // بلوک ساختمان (محدودهٔ اشیای همان طبقه)
  const b0 = map(bounds.x, bounds.y);
  const b1 = map(bounds.x + bounds.w, bounds.y + bounds.h);
  scene.rect(Math.min(b0.x, b1.x), Math.min(b0.y, b1.y), Math.abs(b1.x - b0.x), Math.abs(b1.y - b0.y), {
    fill: 0.82,
    width: 0.45,
    gray: 0.2,
  });
  scene.hatch(Math.min(b0.x, b1.x), Math.min(b0.y, b1.y), Math.abs(b1.x - b0.x), Math.abs(b1.y - b0.y), 2.6, {
    gray: 0.55,
    width: 0.12,
  });
  scene.text(
    Math.min(b0.x, b1.x) + Math.abs(b1.x - b0.x) / 2,
    Math.min(b0.y, b1.y) + Math.abs(b1.y - b0.y) / 2 + 1,
    `ساختمان · طبقهٔ ${faNumber(options.level + 1, 0)}`,
    2.2,
    { anchor: "middle", gray: 0.15, bold: true },
  );

  // اندازه‌گذاری ابعاد کلی روی کیپلان
  const dimY = Math.max(b0.y, b1.y) + 4;
  scene.line(Math.min(b0.x, b1.x), dimY, Math.max(b0.x, b1.x), dimY, { width: 0.2, gray: 0.35 });
  scene.line(Math.min(b0.x, b1.x), dimY - 1, Math.min(b0.x, b1.x), dimY + 1, { width: 0.2, gray: 0.35 });
  scene.line(Math.max(b0.x, b1.x), dimY - 1, Math.max(b0.x, b1.x), dimY + 1, { width: 0.2, gray: 0.35 });
  scene.text((Math.min(b0.x, b1.x) + Math.max(b0.x, b1.x)) / 2, dimY + 3.4, faMeter(bounds.w), 1.9, { anchor: "middle", gray: 0.3 });

  const dimX = Math.max(b0.x, b1.x) + 4;
  scene.line(dimX, Math.min(b0.y, b1.y), dimX, Math.max(b0.y, b1.y), { width: 0.2, gray: 0.35 });
  scene.line(dimX - 1, Math.min(b0.y, b1.y), dimX + 1, Math.min(b0.y, b1.y), { width: 0.2, gray: 0.35 });
  scene.line(dimX - 1, Math.max(b0.y, b1.y), dimX + 1, Math.max(b0.y, b1.y), { width: 0.2, gray: 0.35 });
  // اندازهٔ عمودی به‌صورت چرخیده (هم در SVG و هم در PDF پشتیبانی می‌شود)
  const midY = (Math.min(b0.y, b1.y) + Math.max(b0.y, b1.y)) / 2;
  scene.text(dimX + 2.6, midY, faMeter(bounds.h), 1.9, { anchor: "middle", gray: 0.3, rotate: -90 });

  // شمال و مقیاس
  drawNorthArrow(scene, box.x + box.w - 9, box.y + 11, 7);
  // خط‌کش: بزرگ‌ترین طول رُند که در نیمهٔ کادر جا شود و از لبهٔ چپ بیرون نزند.
  // پس‌زمینهٔ سفید لازم است، وگرنه خط‌کش روی هاشور قطعه گم می‌شود.
  const scaleBarWidth = Math.min(box.w * 0.45, Math.max(20, box.w - 40));
  const metres = [5, 4, 3, 2, 1].find((value) => value * mmPerMetre <= scaleBarWidth) ?? 1;
  const barX = box.x + 4;
  const barY = box.y + box.h - 10;
  scene.rect(barX - 1.5, barY - 4, metres * mmPerMetre + 16, 9, { fill: 1, width: 0.15, gray: 0.7 });
  drawScaleBar(scene, barX, barY, mmPerMetre, metres);
  scene.text(box.x + box.w - 2.5, box.y + box.h - 2.4, `مقیاس کیپلان ۱:${faNumber(scale, 0)}`, 1.9, { anchor: "end", gray: 0.4 });

  void doc;
  return box.y + box.h;
}

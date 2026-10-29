/**
 * HERMICAD Studio — برگه‌های PDF نما و برش
 *
 * چرا وجود دارد: نما و برش قبلاً فقط SVG بودند؛ برگهٔ چاپی و امضاشدنی دفتر فنی
 * باید PDF باشد. این ماژول همان هندسهٔ SVG را (از `viewGeometry`) می‌گیرد و با
 * همان فونت جاسازی‌شدهٔ فارسی روی برگهٔ واقعی رسم می‌کند؛ بنابراین «یک مدل، دو
 * خروجی» و هیچ دوگانگی هندسی بین SVG و PDF وجود ندارد.
 *
 * خروجی:
 *   - `renderStudioVerticalPdf`  → یک برگه (یک نما یا یک برش)
 *   - `renderStudioElevationsPdf` → پنج برگه: چهار نمای اصلی + برش A-A
 */

import { documentFingerprint, sheetSizeMm, todayJalali, type StudioDocument } from "./document";
import { ELEVATION_LABELS, DEFAULT_FLOOR_HEIGHT, viewGeometry, type ElevationDirection, type ViewGeometry, type VerticalViewOptions } from "./vertical";
import { assemblePdf } from "./pdf/sheetPdf";
import { PdfText } from "./pdf/text";
import { loadTypeface } from "./pdf/typeface";
import type { SheetLayout } from "./pdf/sheetPdf";

const MM_TO_PT = 72 / 25.4;

const MARGIN = 8;
const HEADER_H = 12;
const FOOTER_H = 26;

/** خاکستری معادل هر لایه برای چاپ سیاه‌وسفید. */
const LAYER_GRAY: Record<string, { fill: number; stroke: number; width: number }> = {
  walls: { fill: 0.93, stroke: 0.12, width: 0.35 },
  structure: { fill: 0.8, stroke: 0.08, width: 0.35 },
  foundation: { fill: 0.88, stroke: 0.2, width: 0.3 },
};

interface RectOptions {
  fillGray?: number | null;
  strokeGray?: number;
  widthMm?: number;
  dash?: [number, number];
}

/** بوم سادهٔ PDF با مختصات میلی‌متری و مبدأ بالا-چپ (هم‌خوان با SVG). */
class PdfCanvas {
  readonly ops: string[] = [];

  constructor(
    private readonly heightMm: number,
    private readonly textLayerRef: PdfText,
  ) {}

  private toPt(x: number, y: number): { x: number; y: number } {
    return { x: x * MM_TO_PT, y: this.heightMm * MM_TO_PT - y * MM_TO_PT };
  }

  private dash(value?: [number, number]): string {
    return value ? `[${value.map((part) => (part * MM_TO_PT).toFixed(2)).join(" ")}] 0 d` : "[] 0 d";
  }

  line(a: { x: number; y: number }, b: { x: number; y: number }, widthMm = 0.25, gray = 0.1, dash?: [number, number]): void {
    const pa = this.toPt(a.x, a.y);
    const pb = this.toPt(b.x, b.y);
    this.ops.push(
      `${this.dash(dash)} ${gray} ${gray} ${gray} RG ${(widthMm * MM_TO_PT).toFixed(2)} w ` +
        `${pa.x.toFixed(2)} ${pa.y.toFixed(2)} m ${pb.x.toFixed(2)} ${pb.y.toFixed(2)} l S`,
    );
  }

  rect(x: number, y: number, w: number, h: number, options: RectOptions = {}): void {
    if (w <= 0 || h <= 0) return;
    const corner = this.toPt(x, y);
    const stroke = options.strokeGray ?? 0.1;
    const width = options.widthMm ?? 0.25;
    if (options.fillGray != null) this.ops.push(`${options.fillGray} ${options.fillGray} ${options.fillGray} rg`);
    this.ops.push(
      `${this.dash(options.dash)} ${stroke} ${stroke} ${stroke} RG ${(width * MM_TO_PT).toFixed(2)} w ` +
        `${corner.x.toFixed(2)} ${(corner.y - h * MM_TO_PT).toFixed(2)} ${(w * MM_TO_PT).toFixed(2)} ${(h * MM_TO_PT).toFixed(2)} re ` +
        (options.fillGray != null ? "B" : "S"),
    );
  }

  text(
    at: { x: number; y: number },
    sizeMm: number,
    value: string,
    gray = 0.1,
    anchor: "start" | "middle" | "end" = "start",
    bold = false,
    direction: "rtl" | "ltr" = "rtl",
  ): void {
    if (!value.trim()) return;
    this.textLayerRef.draw(this.ops, this.toPt(at.x, at.y), value, { sizePt: sizeMm * MM_TO_PT, gray, anchor, bold, direction });
  }

  /** متن در عرض مشخص: کوچک‌تر، سپس کوتاه‌تر. */
  fit(value: string, maxMm: number, sizeMm: number, bold = false): { value: string; sizeMm: number } {
    const fits = (candidate: string, candidateSize: number) =>
      this.textLayerRef.width(candidate, { sizePt: candidateSize * MM_TO_PT, bold }) <= maxMm * MM_TO_PT;
    let size = sizeMm;
    if (fits(value, size)) return { value, sizeMm: size };
    while (size > 2 && !fits(value, size)) size -= 0.2;
    if (fits(value, size)) return { value, sizeMm: size };
    let trimmed = value;
    while (trimmed.length > 3 && !fits(`${trimmed}…`, size)) trimmed = trimmed.slice(0, -1);
    return { value: `${trimmed}…`, sizeMm: size };
  }
}

/** کادر و کتیبهٔ برگه (مشترک همهٔ برگه‌های نما/برش). */
function drawSheetChrome(
  canvas: PdfCanvas,
  doc: StudioDocument,
  title: string,
  subtitle: string,
  scaleText: string,
): void {
  const size = sheetSizeMm(doc);
  // کادرهای دوگانه
  canvas.rect(MARGIN, MARGIN, size.w - MARGIN * 2, size.h - MARGIN * 2, { strokeGray: 0.55, widthMm: 0.45 });
  canvas.rect(MARGIN + 3, MARGIN + 3, size.w - (MARGIN + 3) * 2, size.h - (MARGIN + 3) * 2, { strokeGray: 0.75, widthMm: 0.2 });

  // سرصفحه
  const head = canvas.fit(`${doc.project.code} · ${doc.project.name}`, size.w / 2, 5.4, true);
  canvas.text({ x: size.w - MARGIN - 4, y: MARGIN + 9 }, head.sizeMm, head.value, 0.1, "end", true);
  const sub = canvas.fit(subtitle, size.w / 2.2, 3, false);
  canvas.text({ x: size.w - MARGIN - 4, y: MARGIN + 14 }, sub.sizeMm, sub.value, 0.4, "end");
  canvas.text({ x: MARGIN + 4, y: MARGIN + 9 }, 2.6, `${documentFingerprint(doc)}`, 0.5, "start", false, "ltr");
  canvas.line({ x: MARGIN + 3, y: MARGIN + HEADER_H + 2 }, { x: size.w - MARGIN - 3, y: MARGIN + HEADER_H + 2 }, 0.35, 0.4);

  // کتیبه پایین
  const blockTop = size.h - MARGIN - FOOTER_H;
  canvas.line({ x: MARGIN + 3, y: blockTop }, { x: size.w - MARGIN - 3, y: blockTop }, 0.45, 0.3);
  const cols = [
    { title: "پروژه", value: doc.project.name, sub: `${doc.project.code} · کارفرما: ${doc.project.client || "—"}` },
    { title: "نقشه", value: title, sub: `ویرایش ${doc.revision} · ${todayJalali()}` },
    { title: "مقیاس و برگه", value: scaleText, sub: `${doc.sheet.format} · ${doc.sheet.orientation === "landscape" ? "افقی" : "عمودی"}` },
    { title: "طراح / کنترل", value: doc.project.designer || "—", sub: `${doc.project.date} · کنترل نهایی با مهندس دارای صلاحیت` },
  ];
  const startX = MARGIN + 3;
  const totalW = size.w - (MARGIN + 3) * 2;
  const colW = totalW / cols.length;
  cols.forEach((col, index) => {
    const x0 = startX + index * colW;
    if (index > 0) canvas.line({ x: x0, y: blockTop }, { x: x0, y: blockTop + FOOTER_H }, 0.25, 0.45);
    canvas.text({ x: x0 + colW - 3, y: blockTop + 5 }, 2.2, col.title, 0.45, "end");
    const value = canvas.fit(col.value, colW - 6, 3.6, true);
    canvas.text({ x: x0 + colW - 3, y: blockTop + 12 }, value.sizeMm, value.value, 0.1, "end", true);
    const note = canvas.fit(col.sub, colW - 6, 2.2);
    canvas.text({ x: x0 + colW - 3, y: blockTop + 17 }, note.sizeMm, note.value, 0.4, "end");
  });
}

/** رسم هندسهٔ یک نما/برش روی بوم. */
function drawViewOnCanvas(canvas: PdfCanvas, doc: StudioDocument, view: ViewGeometry, title: string): void {
  const { blocks, ordered, scale, mmPerMetre, minX, maxX, minY, map } = view;

  // کف طبقات و بام
  for (let level = 0; level <= doc.levels; level += 1) {
    const y = level * DEFAULT_FLOOR_HEIGHT;
    const a = map(minX - 0.3, y - 0.2);
    const b = map(maxX + 0.3, y + 0.02);
    canvas.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y), {
      fillGray: 0.88,
      strokeGray: 0.15,
      widthMm: 0.25,
    });
  }

  // جان‌پناه بام
  const parapetA = map(minX - 0.3, doc.levels * DEFAULT_FLOOR_HEIGHT);
  const parapetB = map(maxX + 0.3, doc.levels * DEFAULT_FLOOR_HEIGHT + 0.9);
  canvas.rect(Math.min(parapetA.x, parapetB.x), Math.min(parapetA.y, parapetB.y), Math.abs(parapetA.x - parapetB.x), Math.abs(parapetA.y - parapetB.y), {
    strokeGray: 0.15,
    widthMm: 0.35,
    dash: [2, 1.2],
  });

  // اجزای نما
  for (const block of ordered) {
    const style = LAYER_GRAY[block.layer] ?? LAYER_GRAY.walls;
    const p0 = map(block.x0, block.y0);
    const p1 = map(block.x1, block.y1);
    const x = Math.min(p0.x, p1.x);
    const y = Math.min(p0.y, p1.y);
    const w = Math.max(Math.abs(p1.x - p0.x), 0.3);
    const h = Math.max(Math.abs(p1.y - p0.y), 0.3);
    if (block.kind === "opening") {
      canvas.rect(x, y, w, h, { fillGray: 1, strokeGray: style.stroke, widthMm: 0.3 });
      canvas.line({ x, y: y + h / 2 }, { x: x + w, y: y + h / 2 }, 0.18, style.stroke);
      continue;
    }
    // در برش، اجزای بریده‌شده تیره‌تر (poché) رسم می‌شوند
    const isCut = view.isSection;
    canvas.rect(x, y, w, h, {
      fillGray: block.kind === "column" ? (isCut ? 0.45 : 0.62) : isCut ? 0.72 : style.fill,
      strokeGray: style.stroke,
      widthMm: style.width,
    });
  }

  // خاک زیر تراز صفر: هاشور مورب
  const groundA = map(minX - 0.6, 0);
  const groundB = map(maxX + 0.3, 0);
  const lower = map(minX - 0.6, minY);
  const soilHeight = Math.max(lower.y - groundA.y, 0);
  if (soilHeight > 0.2) {
    const top = groundA.y;
    const bottom = groundA.y + soilHeight;
    const left = groundA.x;
    const right = groundB.x;
    const step = 2.4;
    for (let offset = -soilHeight; left + offset < right; offset += step) {
      const x1 = Math.max(left, left + offset);
      const y1 = offset < 0 ? top : top + offset;
      const dx = Math.min(right, left + offset + soilHeight) - x1;
      const x2 = x1 + Math.min(dx, soilHeight - (y1 - top) + (y1 - top));
      const y2 = Math.min(bottom, y1 + (Math.min(right, left + offset + soilHeight) - x1));
      canvas.line({ x: x1, y: y1 }, { x: Math.min(x2, right), y: Math.min(y2, bottom) }, 0.15, 0.68);
    }
  }
  canvas.line({ x: groundA.x, y: groundA.y }, { x: groundB.x, y: groundB.y }, 0.7, 0.1);

  // تراز طبقات
  const frameX = view.frame.x;
  for (let level = 0; level <= doc.levels; level += 1) {
    const y = level * DEFAULT_FLOOR_HEIGHT;
    const point = map(minX, y);
    const leftEdge = map(maxX, y);
    const label = level === 0 ? "±0.00" : `+${y.toFixed(2)}`;
    canvas.line({ x: frameX + 13, y: point.y }, { x: leftEdge.x - 1.5, y: point.y }, 0.15, 0.6, [3, 2]);
    canvas.text({ x: frameX + 1, y: point.y + 0.9 }, 2, label, 0.35, "start", false, "ltr");
  }

  // ارتفاع‌گذاری کل
  const dimA = map(minX - 0.55, 0);
  const dimB = map(minX - 0.55, doc.levels * DEFAULT_FLOOR_HEIGHT);
  canvas.line({ x: dimA.x, y: dimA.y }, { x: dimB.x, y: dimB.y }, 0.2, 0.25);
  canvas.line({ x: dimA.x - 1, y: dimA.y }, { x: dimA.x + 1, y: dimA.y }, 0.2, 0.25);
  canvas.line({ x: dimB.x - 1, y: dimB.y }, { x: dimB.x + 1, y: dimB.y }, 0.2, 0.25);
  canvas.text(
    { x: dimA.x + 1.6, y: (dimA.y + dimB.y) / 2 + 0.8 },
    2,
    `${(doc.levels * DEFAULT_FLOOR_HEIGHT).toFixed(2)} m`,
    0.1,
    "start",
    false,
    "ltr",
  );

  // مقیاس ترسیمی
  const barY = view.frame.y + view.frame.h - 6;
  for (let i = 0; i < 2; i += 1) {
    canvas.rect(view.frame.x + 4 + i * mmPerMetre, barY, mmPerMetre, 1.6, {
      fillGray: i % 2 === 0 ? 0.1 : 1,
      strokeGray: 0.1,
      widthMm: 0.15,
    });
  }
  canvas.text({ x: view.frame.x + 4 + 2 * mmPerMetre + 3, y: barY + 1.4 }, 1.9, `1:${scale}`, 0.3, "start", false, "ltr");
  void blocks;

  // عنوان نما
  canvas.text({ x: view.frame.x + view.frame.w - 2, y: view.frame.y + 5 }, 3.4, title, 0.1, "end", true);
}

function newTextLayer(): PdfText {
  return new PdfText(loadTypeface("regular"), loadTypeface("bold"));
}

/** یک برگهٔ PDF برای یک نما یا برش. */
export function renderStudioVerticalPdf(doc: StudioDocument, options: VerticalViewOptions = {}): Uint8Array {
  const size = sheetSizeMm(doc);
  const text = newTextLayer();
  const layout: SheetLayout = {
    widthMm: size.w,
    heightMm: size.h,
    mmPerMetre: 1000 / (doc.sheet.scale || 50),
    requestedScale: doc.sheet.scale || 50,
    fitted: false,
    areaMm: { x: MARGIN + 3, y: MARGIN + HEADER_H + 4, w: size.w - (MARGIN + 3) * 2, h: size.h - HEADER_H - FOOTER_H - MARGIN * 2 - 6 },
    titleBlock: { x: MARGIN + 3, y: size.h - MARGIN - FOOTER_H, w: size.w - (MARGIN + 3) * 2, h: FOOTER_H },
    bounds: { x: 0, y: 0, w: size.w, h: size.h },
  };
  const canvas = new PdfCanvas(size.h, text);
  const frame = { x: layout.areaMm.x, y: layout.areaMm.y, w: layout.areaMm.w, h: layout.areaMm.h };
  const view = viewGeometry(doc, options, frame);
  const title = options.title ?? (options.sectionAt != null ? `برش A-A (در ${options.sectionAt.toFixed(2)} متر)` : ELEVATION_LABELS[options.direction ?? "south"]);
  const subtitle = `${doc.project.code} · مقیاس 1:${view.scale} · ${doc.sheet.format}`;
  drawSheetChrome(canvas, doc, title, subtitle, `1:${view.scale}`);
  drawViewOnCanvas(canvas, doc, view, title);
  return assemblePdf([{ ops: canvas.ops, layout }], text, doc);
}

/** پنج برگهٔ PDF: چهار نمای اصلی + یک برش. */
export function renderStudioElevationsPdf(doc: StudioDocument, sectionAt = 6, sectionWidth = 1.2): { pdf: Uint8Array; pages: number } {
  const size = sheetSizeMm(doc);
  const text = newTextLayer();
  const areaMm = {
    x: MARGIN + 3,
    y: MARGIN + HEADER_H + 4,
    w: size.w - (MARGIN + 3) * 2,
    h: size.h - HEADER_H - FOOTER_H - MARGIN * 2 - 6,
  };
  const layout: SheetLayout = {
    widthMm: size.w,
    heightMm: size.h,
    mmPerMetre: 1000 / (doc.sheet.scale || 50),
    requestedScale: doc.sheet.scale || 50,
    fitted: false,
    areaMm,
    titleBlock: { x: MARGIN + 3, y: size.h - MARGIN - FOOTER_H, w: size.w - (MARGIN + 3) * 2, h: FOOTER_H },
    bounds: { x: 0, y: 0, w: size.w, h: size.h },
  };

  const directions: ElevationDirection[] = ["south", "north", "east", "west"];
  const pages: { ops: string[]; layout: SheetLayout }[] = [];
  for (const direction of directions) {
    const canvas = new PdfCanvas(size.h, text);
    const view = viewGeometry(doc, { direction }, { x: areaMm.x, y: areaMm.y, w: areaMm.w, h: areaMm.h });
    const title = ELEVATION_LABELS[direction];
    drawSheetChrome(canvas, doc, title, `${doc.project.code} · مقیاس 1:${view.scale} · ${doc.sheet.format}`, `1:${view.scale}`);
    drawViewOnCanvas(canvas, doc, view, title);
    pages.push({ ops: canvas.ops, layout });
  }
  const sectionCanvas = new PdfCanvas(size.h, text);
  const section = viewGeometry(
    doc,
    { direction: "west", sectionAt, sectionWidth },
    { x: areaMm.x, y: areaMm.y, w: areaMm.w, h: areaMm.h },
  );
  const sectionTitle = `برش A-A (در ${sectionAt.toFixed(2)} متر)`;
  drawSheetChrome(sectionCanvas, doc, sectionTitle, `${doc.project.code} · مقیاس 1:${section.scale} · ${doc.sheet.format}`, `1:${section.scale}`);
  drawViewOnCanvas(sectionCanvas, doc, section, sectionTitle);
  pages.push({ ops: sectionCanvas.ops, layout });

  return { pdf: assemblePdf(pages, text, doc), pages: pages.length };
}

/**
 * HERMICAD Studio — پلان آرماتور سقف با شماره‌گذاری میلگرد (bar mark)
 *
 * چرا وجود دارد: جدول میلگرد (BBS) می‌گوید «چه قطری، چه طولی، چند عدد»، اما روی
 * نقشه هیچ ارجاعی به آن نیست و کارگاه نمی‌داند کدام شبکه کجاست. این برگه همان
 * چیزی است که در دفاتر ایرانی «توصیف آرماتور سقف» نام دارد: پلان طبقه با شبکهٔ
 * پایین در هر دهانه، نوار شبکهٔ بالا در لبه‌های دال، و جدولی که هر نشان (B1، T1…)
 * را با قطر/فاصله/طول شاخه/تعداد/وزن فهرست می‌کند.
 *
 * قواعد ترسیم (همه روی خود برگه هم چاپ می‌شوند):
 *  • هر «فضا» یک دهانهٔ دال است؛ شبکهٔ پایین درون همان دهانه با پوشش بتنی اجرا می‌شود.
 *  • شبکهٔ بالا فقط در نوار لبه‌های خارجی دال (۲۵٪ دهانهٔ کوتاه، حداقل ۶۰ سانتی‌متر).
 *  • نشان‌ها بر پایهٔ (لایه، جهت، طول شاخه) تجمیع می‌شوند؛ دو دهانهٔ هم‌طول یک نشان
 *    مشترک می‌گیرند تا جدول کوتاه و قابل خواندن بماند.
 *  • ابعاد کل و مقیاس خودکار روی برگه چاپ می‌شوند؛ فاصلهٔ میله‌ها روی کاغذ هرگز
 *    کمتر از ۱٫۶ میلی‌متر نمی‌شود (وگرنه به لکهٔ سیاه تبدیل می‌شود).
 *
 * محدودیت صریح: این برگه «ترسیمی/برآوردی» است و جانشین محاسبات سازه نیست؛ همان
 * جمله روی برگه چاپ می‌شود. دال مورب و بازشو با تقریب کادر محیطی پوشش داده می‌شود.
 */

import { barWeightPerMetre, CONCRETE_COVER } from "./details";
import type { StudioDocument, StudioItem } from "./document";
import { Scene } from "./draw";
import {
  drawChrome,
  drawNorthArrow,
  drawScaleBar,
  drawTable,
  faNumber,
  sheetFrame,
  sheetSvg,
  sheetsPdf,
} from "./sheetKit";

/** قطر شبکهٔ دال (میلی‌متر) — فرض پایهٔ این برگه. */
export const SLAB_BAR_DIA = 12;
/** فاصلهٔ شبکه (متر). */
export const SLAB_SPACING = 0.2;
/** عرض نوار شبکهٔ بالا نسبت به دهانهٔ کوتاه (از هر لبهٔ خارجی). */
export const TOP_STRIP_RATIO = 0.25;
/** طول گیرش در تکیه‌گاه = ۲۰db (فقط در محاسبهٔ طول شاخه، نه در ترسیم). */
export const ANCHORAGE_FACTOR = 20;

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));
const spacingOf = (start: number, end: number): number => Math.max(2, Math.floor((end - start) / SLAB_SPACING) + 1);

export type SlabLayer = "bottom" | "top";
export type SlabDirection = "x" | "y";

export interface SlabField {
  id: string;
  label: string;
  /** کادر محیطی فضا (متر) */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** ضخامت فرضی دال (متر) */
  thickness: number;
  rotated: boolean;
}

export interface SlabMark {
  /** نشان روی نقشه: B1، T2، … */
  code: string;
  layer: SlabLayer;
  direction: SlabDirection;
  diameterMm: number;
  spacingM: number;
  /** طول یک شاخه (متر) */
  lengthM: number;
  count: number;
  totalLengthM: number;
  weightKg: number;
  /** دهانه‌هایی که این نشان را می‌گیرند (برای ردیف توضیح) */
  fields: string[];
}

export interface SlabRebarPlan {
  fields: SlabField[];
  marks: SlabMark[];
  totalWeightKg: number;
  notes: string[];
  /** کادر کل دال (متر) */
  outline: { x: number; y: number; w: number; h: number };
  /** عرض نوار شبکهٔ بالا (متر) */
  stripM: number;
  /** متوسط ضخامت (متر) */
  thicknessM: number;
}

const directionLabel = (direction: SlabDirection): string => (direction === "x" ? "شرقی–غربی" : "شمالی–جنوبی");
const layerLabel = (layer: SlabLayer): string => (layer === "bottom" ? "پایین" : "بالا");

/**
 * استخراج دهانه‌های دال از سند.
 *
 * فضا (`space-*`) همان کادری است که کاربر برای اتاق کشیده؛ دال روی همان کادر
 * پهن می‌شود. فضاهای چرخیده با کادر محیطی (AABB) تقریب زده می‌شوند. اگر سند هیچ
 * فضایی نداشته باشد، از کادر کل نقشه یک دال فرضی ساخته می‌شود تا خروجی همیشه
 * قابل ارائه باشد.
 */
export function slabFields(doc: StudioDocument, level = doc.currentLevel): SlabField[] {
  const spaces = doc.items.filter((item) => item.catalogId.startsWith("space-") && item.level === level);
  const source: StudioItem[] = spaces.length > 0 ? spaces : doc.items.filter((item) => item.level === level);
  const fields: SlabField[] = [];
  for (const item of source) {
    const radians = (item.rotationDeg * Math.PI) / 180;
    const w = Math.abs(item.w * Math.cos(radians)) + Math.abs(item.d * Math.sin(radians));
    const h = Math.abs(item.w * Math.sin(radians)) + Math.abs(item.d * Math.cos(radians));
    if (w < 0.8 || h < 0.8) continue;
    fields.push({
      id: item.id,
      label: item.label?.trim() || "فضا",
      x0: round(item.x - w / 2, 3),
      y0: round(item.y - h / 2, 3),
      x1: round(item.x + w / 2, 3),
      y1: round(item.y + h / 2, 3),
      // ضخامت فرضی: ۱/۳۰ دهانهٔ کوتاه، بین ۱۰ و ۳۰ سانتی‌متر
      thickness: round(Math.min(0.3, Math.max(0.1, Math.min(w, h) / 30)), 2),
      rotated: Math.abs(item.rotationDeg % 180) > 0.5,
    });
  }
  return fields;
}

/** کادر کل دال از اجتماع دهانه‌ها. */
export function slabOutline(fields: SlabField[]): { x: number; y: number; w: number; h: number } {
  if (fields.length === 0) return { x: 0, y: 0, w: 12, h: 10 };
  const xs = fields.flatMap((field) => [field.x0, field.x1]);
  const ys = fields.flatMap((field) => [field.y0, field.y1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x: round(x, 2), y: round(y, 2), w: round(Math.max(...xs) - x, 2), h: round(Math.max(...ys) - y, 2) };
}

interface Entry {
  layer: SlabLayer;
  direction: SlabDirection;
  lengthM: number;
  count: number;
  fields: string[];
}

/**
 * نشان‌های میلگرد دال.
 *
 * • شبکهٔ پایین: در هر دهانه، دو جهت؛ طول شاخه = دهانه + ۲×(۲۰db) گیرش.
 * • شبکهٔ بالا: چهار نوار لبهٔ خارجی؛ طول شاخه = عرض نوار + ۲×(۲۰db).
 */
export function slabMarks(fields: SlabField[], outline = slabOutline(fields)): SlabMark[] {
  const anchorage = (ANCHORAGE_FACTOR * SLAB_BAR_DIA) / 1000;
  const entries: Entry[] = [];

  for (const field of fields) {
    const spanX = Math.max(0.3, field.x1 - field.x0 - 2 * CONCRETE_COVER);
    const spanY = Math.max(0.3, field.y1 - field.y0 - 2 * CONCRETE_COVER);
    entries.push({ layer: "bottom", direction: "x", lengthM: spanX + 2 * anchorage, count: spacingOf(field.y0, field.y1), fields: [field.label] });
    entries.push({ layer: "bottom", direction: "y", lengthM: spanY + 2 * anchorage, count: spacingOf(field.x0, field.x1), fields: [field.label] });
  }

  if (fields.length > 0) {
    const shortSpan = Math.min(outline.w, outline.h);
    const strip = Math.max(0.6, shortSpan * TOP_STRIP_RATIO);
    const countNorthSouth = 2 * spacingOf(0, strip);
    const countEastWest = 2 * spacingOf(0, strip);
    entries.push({ layer: "top", direction: "x", lengthM: strip + 2 * anchorage, count: countNorthSouth, fields: ["لبهٔ شمالی و جنوبی"] });
    entries.push({ layer: "top", direction: "y", lengthM: strip + 2 * anchorage, count: countEastWest, fields: ["لبهٔ شرقی و غربی"] });
  }

  // تجمیع بر پایهٔ (لایه، جهت، طول شاخه)
  const groups = new Map<string, SlabMark>();
  for (const entry of entries) {
    const key = [entry.layer, entry.direction, round(entry.lengthM, 1)].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.count += entry.count;
      existing.totalLengthM = round(existing.totalLengthM + entry.lengthM * entry.count, 2);
      existing.weightKg = round(existing.totalLengthM * barWeightPerMetre(SLAB_BAR_DIA), 1);
      for (const name of entry.fields) if (!existing.fields.includes(name)) existing.fields.push(name);
      continue;
    }
    const totalLengthM = round(entry.lengthM * entry.count, 2);
    groups.set(key, {
      code: "",
      layer: entry.layer,
      direction: entry.direction,
      diameterMm: SLAB_BAR_DIA,
      spacingM: SLAB_SPACING,
      lengthM: round(entry.lengthM, 2),
      count: entry.count,
      totalLengthM,
      weightKg: round(totalLengthM * barWeightPerMetre(SLAB_BAR_DIA), 1),
      fields: [...entry.fields],
    });
  }

  const marks = [...groups.values()].sort(
    (a, b) =>
      (a.layer === b.layer ? 0 : a.layer === "bottom" ? -1 : 1) ||
      (a.direction === b.direction ? 0 : a.direction === "x" ? -1 : 1) ||
      a.lengthM - b.lengthM,
  );
  let bottomIndex = 0;
  let topIndex = 0;
  for (const mark of marks) {
    mark.code = mark.layer === "bottom" ? `B${++bottomIndex}` : `T${++topIndex}`;
    mark.fields = [...new Set(mark.fields)].slice(0, 5);
    // طول کل و وزن از همان طول شاخهٔ چاپ‌شده محاسبه می‌شود تا جدول خودش را نقض نکند
    mark.totalLengthM = round(mark.lengthM * mark.count, 2);
    mark.weightKg = round(mark.totalLengthM * barWeightPerMetre(SLAB_BAR_DIA), 1);
  }
  return marks;
}

export function slabRebarPlan(doc: StudioDocument): SlabRebarPlan {
  const fields = slabFields(doc);
  const outline = slabOutline(fields);
  const marks = slabMarks(fields, outline);
  const totalWeightKg = round(marks.reduce((sum, mark) => sum + mark.weightKg, 0), 1);
  const stripM = round(Math.max(0.6, Math.min(outline.w, outline.h) * TOP_STRIP_RATIO), 2);
  const thicknessM = fields.length > 0 ? round(fields.reduce((sum, field) => sum + field.thickness, 0) / fields.length, 2) : 0.15;

  const notes = [
    `شبکهٔ پایین دوطرفه: میلگرد ${faNumber(SLAB_BAR_DIA, 0)} هر ${faNumber(SLAB_SPACING * 100, 0)} سانتی‌متر در هر دهانه، دو جهت.`,
    `شبکهٔ بالا فقط در نوار لبه‌های خارجی: عرض ${faNumber(stripM)} متر (${faNumber(TOP_STRIP_RATIO * 100, 0)}٪ دهانهٔ کوتاه، حداقل ۶۰ سانتی‌متر).`,
    `طول شاخه شامل ${faNumber(ANCHORAGE_FACTOR, 0)}db گیرش در تکیه‌گاه است؛ پوشش بتنی ${faNumber(CONCRETE_COVER * 100, 0)} سانتی‌متر.`,
    `وزن برآوردی میلگرد سقف ${faNumber(totalWeightKg, 1)} کیلوگرم، بدون احتساب پرت.`,
    "برچسب هر نشان: لایه (B پایین، T بالا) — قطر — فاصله — طول شاخه.",
    "این برگه ترسیمی/برآوردی است؛ طراحی و کنترل نهایی با مهندس دارای صلاحیت است.",
  ];

  return { fields, marks, totalWeightKg, notes, outline, stripM, thicknessM };
}

/* ───────────────────────────── برگه ───────────────────────────── */

/**
 * برگهٔ پلان آرماتور سقف: نقشه در ستون چپ، جدول نشان‌ها و یادداشت‌ها در ستون راست.
 * مقیاس خودکار از کادر دال و فضای برگه محاسبه و روی برگه چاپ می‌شود.
 */
export function slabRebarScene(doc: StudioDocument): Scene {
  const plan = slabRebarPlan(doc);
  const scene = new Scene();
  const { area } = sheetFrame(doc);

  drawChrome(scene, doc, {
    title: "پلان آرماتور سقف",
    subtitle: `${doc.project.code} · طبقهٔ ${faNumber(doc.currentLevel + 1, 0)} · ${doc.sheet.format} · ویرایش ${doc.revision}`,
    drawingTitle: "پلان آرماتور سقف (bar mark)",
    scaleText: "مقیاس: خودکار",
    footnote: "ترسیم و برآورد — کنترل نهایی با مهندس دارای صلاحیت",
  });

  const tableW = Math.min(Math.max(area.w * 0.34, 110), 165);
  const planW = area.w - tableW - 10;
  // ۲۴ میلی‌متر پایین صفحه برای خط‌کش مقیاس و زنجیرهٔ ابعاد رزرو می‌شود
  const planH = area.h - 24;

  // حاشیهٔ نقشه برای ابعاد، حباب نشان‌ها و فلش شمال
  const margin = 15;
  const mmPerMetre = Math.max(
    4,
    Math.min((planW - margin * 2) / Math.max(plan.outline.w, 0.5), (planH - margin * 2) / Math.max(plan.outline.h, 0.5)),
  );
  const originX = area.x + margin + (planW - margin * 2 - plan.outline.w * mmPerMetre) / 2;
  const originY = area.y + margin + (planH - margin * 2 - plan.outline.h * mmPerMetre) / 2;
  // y مدل به شمال است؛ روی برگه به سمت پایین (قاعدهٔ پلان)
  const map = (x: number, y: number): [number, number] => [
    originX + (x - plan.outline.x) * mmPerMetre,
    originY + (plan.outline.y + plan.outline.h - y) * mmPerMetre,
  ];

  if (plan.fields.length === 0) {
    scene.text(area.x + planW / 2, area.y + planH / 2, "فضایی برای دال تعریف نشده است", 3, { anchor: "middle", gray: 0.5 });
  }

  // فاصلهٔ میله‌ها روی کاغذ نباید از ۱٫۶ میلی‌متر کمتر شود
  const stepMm = Math.max(SLAB_SPACING * mmPerMetre, 1.6);
  const stepM = stepMm / mmPerMetre;

  const markOf = (layer: SlabLayer, direction: SlabDirection, lengthM: number): string =>
    slabMarkCode(plan, layer, direction, lengthM);

  const [ox0, oy0] = map(plan.outline.x, plan.outline.y + plan.outline.h);
  const [ox1, oy1] = map(plan.outline.x + plan.outline.w, plan.outline.y);
  const oLeft = Math.min(ox0, ox1);
  const oTop = Math.min(oy0, oy1);
  const oW = Math.abs(ox1 - ox0);
  const oH = Math.abs(oy1 - oy0);

  // ── شبکهٔ پایین هر دهانه
  for (const field of plan.fields) {
    const innerX0 = field.x0 + CONCRETE_COVER;
    const innerY0 = field.y0 + CONCRETE_COVER;
    const innerX1 = field.x1 - CONCRETE_COVER;
    const innerY1 = field.y1 - CONCRETE_COVER;
    const spanX = innerX1 - innerX0;
    const spanY = innerY1 - innerY0;
    if (spanX <= 0 || spanY <= 0) continue;

    // میله‌های موازی X (خط افقی روی برگه)
    const rows = Math.max(2, Math.floor(spanY / stepM) + 1);
    for (let index = 0; index < rows; index += 1) {
      const y = innerY0 + (index * spanY) / (rows - 1);
      const [x0, y0] = map(innerX0, y);
      const [x1, y1] = map(innerX1, y);
      scene.line(x0, y0, x1, y1, { width: 0.13, gray: 0.35 });
    }
    // میله‌های موازی Y (خط عمودی روی برگه)
    const columns = Math.max(2, Math.floor(spanX / stepM) + 1);
    for (let index = 0; index < columns; index += 1) {
      const x = innerX0 + (index * spanX) / (columns - 1);
      const [x0, y0] = map(x, innerY0);
      const [x1, y1] = map(x, innerY1);
      scene.line(x0, y0, x1, y1, { width: 0.13, gray: 0.35 });
    }

    // کادر دهانه (تیرهای پیرامونی)
    const [ax, ay] = map(field.x0, field.y1);
    const [bx, by] = map(field.x1, field.y0);
    scene.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), { width: 0.45, gray: 0.15 });

    // برچسب دهانه + ضخامت (با پس‌زمینهٔ سفید تا روی شبکه خوانا بماند)
    const cx = (Math.min(ax, bx) + Math.max(ax, bx)) / 2;
    const cy = (Math.min(ay, by) + Math.max(ay, by)) / 2;
    const label = `${field.label} · دال ${faNumber(field.thickness * 100, 0)} سانتی`;
    // پس‌زمینهٔ سفید؛ عرض با احتیاط بیشتر از تخمین SVG محاسبه می‌شود تا در PDF هم بپوشاند
    const labelW = label.length * 1.32 + 4;
    scene.rect(cx - labelW / 2, cy - 3.4, labelW, 6.8, { fill: 1, width: 0, gray: 1 });
    scene.text(cx, cy + 1.3, label, 2.0, { anchor: "middle", gray: 0.15 });

    // نشان‌های شبکهٔ پایین این دهانه: کادر کوچک در گوشهٔ پایین-چپ دهانه
    const bottomX = markOf("bottom", "x", spanX + (2 * ANCHORAGE_FACTOR * SLAB_BAR_DIA) / 1000);
    const bottomY = markOf("bottom", "y", spanY + (2 * ANCHORAGE_FACTOR * SLAB_BAR_DIA) / 1000);
    const tagX = Math.min(ax, bx) + 1;
    const tagY = Math.max(ay, by) - 1;
    if (bottomX) callout(scene, tagX + 3.4, tagY - 4.2, bottomX);
    if (bottomY && columns > 1) callout(scene, tagX + 14, tagY - 4.2, bottomY);
  }

  // ── نوار شبکهٔ بالا در لبه‌های خارجی (نقطه‌چین)
  if (plan.fields.length > 0) {
    const stripPxX = plan.stripM * mmPerMetre;
    const stripPxY = plan.stripM * mmPerMetre;
    const drawBand = (x0: number, y0: number, w: number, h: number, vertical: boolean) => {
      scene.rect(x0, y0, w, h, { width: 0.25, gray: 0.5, dash: [2.4, 1.4] });
      const target = vertical ? w : h;
      const count = Math.max(2, Math.floor(target / stepMm) + 1);
      for (let index = 0; index < count; index += 1) {
        const offset = (index * target) / (count - 1);
        if (vertical) {
          scene.line(x0 + offset, y0, x0 + offset, y0 + h, { width: 0.22, gray: 0.5, dash: [2.2, 1.3] });
        } else {
          scene.line(x0, y0 + offset, x0 + w, y0 + offset, { width: 0.22, gray: 0.5, dash: [2.2, 1.3] });
        }
      }
    };
    drawBand(oLeft, oTop, oW, Math.min(stripPxY, oH / 3), false); // شمال
    drawBand(oLeft, oTop + oH - Math.min(stripPxY, oH / 3), oW, Math.min(stripPxY, oH / 3), false); // جنوب
    drawBand(oLeft, oTop, Math.min(stripPxX, oW / 3), oH, true); // شرق (سمت چپ برگه)
    drawBand(oLeft + oW - Math.min(stripPxX, oW / 3), oTop, Math.min(stripPxX, oW / 3), oH, true); // غرب

    const topX = plan.marks.find((mark) => mark.layer === "top" && mark.direction === "x");
    const topY = plan.marks.find((mark) => mark.layer === "top" && mark.direction === "y");
    if (topX) callout(scene, oLeft + oW / 2, oTop - 5.5, topX.code, "down");
    if (topY) callout(scene, oLeft + oW + 6.5, oTop + oH / 2, topY.code, "left");
  }

  // ── کادر کل دال (ضخیم‌تر)
  scene.rect(oLeft, oTop, oW, oH, { width: 0.8, gray: 0.1 });

  // ── زنجیرهٔ ابعاد: عرض پایین، ارتفاع سمت چپ
  const dimY = oTop + oH + 7;
  scene.line(oLeft, dimY, oLeft + oW, dimY, { width: 0.25, gray: 0.3 });
  for (const x of [oLeft, oLeft + oW]) scene.line(x, dimY - 1.6, x, dimY + 1.6, { width: 0.25, gray: 0.3 });
  // پس‌زمینهٔ سفید تا متن روی خط اندازه‌گذاری خوانا بماند
  const dimLabelW = `${faNumber(plan.outline.w)} متر`.length * 2.2 * 0.52 + 2;
  scene.rect(oLeft + oW / 2 - dimLabelW / 2, dimY - 3.4, dimLabelW, 3.6, { fill: 1, width: 0, gray: 1 });
  scene.text(oLeft + oW / 2, dimY - 0.9, `${faNumber(plan.outline.w)} متر`, 2.2, { anchor: "middle", gray: 0.2 });
  const dimX = oLeft - 7;
  scene.line(dimX, oTop, dimX, oTop + oH, { width: 0.25, gray: 0.3 });
  for (const y of [oTop, oTop + oH]) scene.line(dimX - 1.6, y, dimX + 1.6, y, { width: 0.25, gray: 0.3 });
  scene.text(dimX - 1.6, oTop + oH / 2, `${faNumber(plan.outline.h)} متر`, 2.2, { anchor: "middle", gray: 0.2, rotate: -90 });

  drawNorthArrow(scene, area.x + planW - 6, area.y + 8, 8);

  // ── مقیاس و خط‌کش: بلندترین عدد رُند که در ۵۰ میلی‌متر جا شود
  const barMetres = [1, 2, 3, 4, 5, 10].filter((metres) => metres * mmPerMetre <= 55).pop() ?? 1;
  const barY = area.y + area.h - 15;
  drawScaleBar(scene, area.x + 8, barY, mmPerMetre, barMetres);
  scene.text(area.x + 8, barY + 9.4, `مقیاس ۱:${faNumber(Math.round(1000 / mmPerMetre), 0)}`, 2.1, { anchor: "start", gray: 0.35 });

  // ── جدول نشان‌ها
  const tableX = area.x + planW + 6;
  const rows = plan.marks.map((mark) => [
    mark.code,
    layerLabel(mark.layer),
    directionLabel(mark.direction),
    faNumber(mark.diameterMm, 0),
    faNumber(mark.spacingM * 100, 0),
    faNumber(mark.lengthM),
    faNumber(mark.count, 0),
    faNumber(mark.totalLengthM, 1),
    faNumber(mark.weightKg, 1),
  ]);
  const totalCount = plan.marks.reduce((sum, mark) => sum + mark.count, 0);
  const bottom = drawTable(scene, {
    x: tableX,
    y: area.y + 1,
    w: tableW,
    title: "جدول میلگرد سقف (نشان‌ها)",
    columns: [
      { header: "نشان", weight: 8, numeric: true },
      { header: "لایه", weight: 9 },
      { header: "جهت", weight: 16 },
      { header: "قطر (mm)", weight: 10, numeric: true },
      { header: "فاصله (cm)", weight: 10, numeric: true },
      { header: "طول شاخه (m)", weight: 12, numeric: true },
      { header: "تعداد", weight: 9, numeric: true },
      { header: "طول کل (m)", weight: 12, numeric: true },
      { header: "وزن (kg)", weight: 11, numeric: true },
    ],
    rows,
    footer: ["جمع", "", "", "", "", "", faNumber(totalCount, 0), "", faNumber(plan.totalWeightKg, 1)],
    note: "نشان‌ها بر پایهٔ لایه، جهت و طول شاخه تجمیع شده‌اند.",
  });

  scene.text(tableX + tableW, bottom + 7, "یادداشت‌های فنی", 2.6, { anchor: "end", bold: true, gray: 0.15 });
  plan.notes.forEach((note, index) => {
    scene.text(tableX + tableW, bottom + 12.5 + index * 4.4, `• ${note}`, 1.85, { anchor: "end", gray: 0.3 });
  });

  // ── فهرست دهانه‌ها زیر یادداشت‌ها؛ جدول کوچک با ستون‌های عددی جدا
  const legendY = bottom + 12.5 + plan.notes.length * 4.4 + 4;
  const legendH = 4.4 * (plan.fields.length + 1) + 9;
  if (plan.fields.length > 0 && legendY + legendH < area.y + area.h - 2) {
    drawTable(scene, {
      x: tableX,
      y: legendY,
      w: tableW,
      title: "دهانه‌های دال",
      columns: [
        { header: "فضا", weight: 44 },
        { header: "عرض (m)", weight: 28, numeric: true },
        { header: "عمق (m)", weight: 28, numeric: true },
      ],
      rows: plan.fields.map((field) => [field.label, faNumber(field.x1 - field.x0), faNumber(field.y1 - field.y0)]),
      rowHeight: 4.4,
      headerSize: 1.85,
      cellSize: 1.8,
    });
  }

  return scene;
}

/** حباب نشان (دایره + کد) با خط راهنما به‌سمت نقطهٔ `tipX`. */
function callout(scene: Scene, cx: number, cy: number, code: string, leader: "none" | "down" | "left" = "none"): void {
  if (leader === "down") scene.line(cx, cy + 3.2, cx, cy + 7.2, { width: 0.2, gray: 0.35 });
  if (leader === "left") scene.line(cx - 3.2, cy, cx - 7.2, cy, { width: 0.2, gray: 0.35 });
  scene.circle(cx, cy, 3.2, { fill: 1, width: 0.35, gray: 0.15 });
  scene.text(cx, cy + 1.1, code, 2.3, { anchor: "middle", bold: true, gray: 0.1, direction: "ltr" });
}

/** برگهٔ پلان آرماتور سقف به‌صورت SVG. */
export function renderStudioSlabRebarSheet(doc: StudioDocument): string {
  return sheetSvg(slabRebarScene(doc), doc);
}

/** برگهٔ پلان آرماتور سقف به‌صورت PDF با فونت فارسی جاسازی‌شده. */
export function renderStudioSlabRebarPdf(doc: StudioDocument): Uint8Array {
  return sheetsPdf([slabRebarScene(doc)], doc);
}

/** کشف نشان برای هر (لایه، جهت، طول) — برای آزمون و خروجی داده‌ای. */
export function slabMarkCode(plan: SlabRebarPlan, layer: SlabLayer, direction: SlabDirection, lengthM: number): string {
  return plan.marks.find((mark) => mark.layer === layer && mark.direction === direction && Math.abs(mark.lengthM - round(lengthM, 2)) < 0.06)?.code ?? "";
}

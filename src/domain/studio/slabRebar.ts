/**
 * پلان آرماتور دال توپر: شاخه‌های واقعی، منبع واحد جدول و ترسیم‌اند.
 * قطع در بازشو با پوشش بتن و تجمیع طول سانتی‌متری؛ نوار بالا عمود بر لبه.
 * پیش‌فرض‌ها صرفاً فرض برآوردند، نه طراحی سازه یا تأیید مقررات.
 * هندسهٔ مورب، هم‌پوشان و سقف تیرچه‌ای صریحاً رد می‌شود، نه تقریب پنهان.
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

import { slabConfig, SlabInputError, SLAB_REBAR_DEFAULTS, type SlabRebarConfig } from "./slabConfig";
export { SLAB_REBAR_DEFAULTS, type SlabRebarConfig } from "./slabConfig";

/** قطر شبکهٔ دال در حالت پیش‌فرض (سازگاری با کد/آزمون‌های قبلی). */
export const SLAB_BAR_DIA = SLAB_REBAR_DEFAULTS.diameterMm;
/** فاصلهٔ شبکه در حالت پیش‌فرض. */
export const SLAB_SPACING = SLAB_REBAR_DEFAULTS.spacingM;
/** عرض نوار شبکهٔ بالا در حالت پیش‌فرض. */
export const TOP_STRIP_RATIO = SLAB_REBAR_DEFAULTS.topStripRatio;
/** ضریب گیرش در حالت پیش‌فرض. */
export const ANCHORAGE_FACTOR = SLAB_REBAR_DEFAULTS.anchorageFactor;

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));
const spacingOf = (start: number, end: number, spacing = SLAB_SPACING): number =>
  Math.max(2, Math.ceil((end - start) / spacing) + 1);

export type SlabLayer = "bottom" | "top" | "trim";
export type SlabDirection = "x" | "y";

/** بازشوی دال (چاهک آسانسور، داکت، نورگیر). */
export interface SlabOpening {
  id: string;
  label: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

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
  /** منبع هندسه: دالِ ترسیم‌شده یا فضای اتاق */
  source: "slab" | "space" | "extent";
}

export interface SlabMark {
  /** نشان روی نقشه: B1، T2، O1 … */
  code: string;
  layer: SlabLayer;
  direction: SlabDirection;
  diameterMm: number;
  spacingM: number;
  /** طول شاخهٔ نامی (متر) — همان چیزی که روی نقشه نوشته می‌شود */
  lengthM: number;
  count: number;
  totalLengthM: number;
  weightKg: number;
  /** دهانه‌هایی که این نشان را می‌گیرند (برای ردیف توضیح) */
  fields: string[];
}

export interface SlabRebarPlan {
  fields: SlabField[];
  openings: SlabOpening[];
  marks: SlabMark[];
  totalWeightKg: number;
  notes: string[];
  /** کادر کل دال (متر) */
  outline: { x: number; y: number; w: number; h: number };
  /** عرض نوار شبکهٔ بالا (متر) */
  stripM: number;
  /** متوسط ضخامت (متر) */
  thicknessM: number;
  /** جمع طول تکیه‌گاه‌های داخلی (متر) — در مترهٔ شبکهٔ بالا لحاظ می‌شود */
  interiorSupportM: number;
  config: SlabRebarConfig;
  bars: SlabBar[];
}

const directionLabel = (direction: SlabDirection): string => (direction === "x" ? "شرقی–غربی" : "شمالی–جنوبی");
const layerLabel = (layer: SlabLayer): string => (layer === "bottom" ? "پایین" : layer === "top" ? "بالا" : "تقویتی");

const SLAB_IDS = new Set(["slab-solid"]);
const OPENING_IDS = new Set(["slab-opening", "space-shaft"]);

const boxOf = (item: StudioItem): { x0: number; y0: number; x1: number; y1: number; w: number; h: number } => {
  const radians = (item.rotationDeg * Math.PI) / 180;
  const w = Math.abs(item.w * Math.cos(radians)) + Math.abs(item.d * Math.sin(radians));
  const h = Math.abs(item.w * Math.sin(radians)) + Math.abs(item.d * Math.cos(radians));
  return {
    x0: round(item.x - w / 2, 3),
    y0: round(item.y - h / 2, 3),
    x1: round(item.x + w / 2, 3),
    y1: round(item.y + h / 2, 3),
    w,
    h,
  };
};

/**
 * استخراج دهانه‌های دال از سند.
 *
 * دال توپر بر فضاها اولویت دارد؛ شفت دهانه نیست. از مبلمان یا دیوار دال فرضی
 * ساخته نمی‌شود. چرخش مضرب ۹۰ درجه دقیق است؛ سایر چرخش‌ها رد می‌شوند.
 */
export function slabFields(doc: StudioDocument, level = doc.currentLevel): SlabField[] {
  const atLevel = doc.items.filter((item) => item.level === level);
  if (atLevel.some((item) => item.catalogId === "slab-joist"))
    throw new SlabInputError(
      "مترهٔ شبکهٔ دال توپر برای سقف تیرچه‌بلوک معتبر نیست؛ دال توپر را در طبقه‌ای جدا تعریف کنید.",
    );
  const slabs = atLevel.filter((item) => SLAB_IDS.has(item.catalogId));
  const spaces = atLevel.filter((item) => item.catalogId.startsWith("space-") && !OPENING_IDS.has(item.catalogId));
  const source = slabs.length > 0 ? slabs : spaces;
  const kind: SlabField["source"] = slabs.length > 0 ? "slab" : spaces.length > 0 ? "space" : "extent";

  const fields: SlabField[] = [];
  for (const item of source) {
    if (![item.x, item.y, item.w, item.d, item.rotationDeg].every(Number.isFinite) || item.w <= 0 || item.d <= 0)
      throw new SlabInputError("هندسهٔ دال معتبر نیست.");
    if (Math.abs(item.rotationDeg / 90 - Math.round(item.rotationDeg / 90)) > 1e-6)
      throw new SlabInputError("دال مورب هنوز در مترهٔ سقف پشتیبانی نمی‌شود؛ تقریب کادر محیطی مجاز نیست.");
    const box = boxOf(item);
    if (box.w < 0.8 || box.h < 0.8) continue;
    fields.push({
      id: item.id,
      label: item.label?.trim() || "فضا",
      x0: box.x0,
      y0: box.y0,
      x1: box.x1,
      y1: box.y1,
      // ضخامت فرضی: ۱/۳۰ دهانهٔ کوتاه، بین ۱۰ و ۳۰ سانتی‌متر
      thickness: round(Math.min(0.3, Math.max(0.1, Math.min(box.w, box.h) / 30)), 2),
      rotated: Math.abs(item.rotationDeg % 180) > 0.5,
      source: kind,
    });
  }
  if (fields.length > 150) throw new SlabInputError("حداکثر ۱۵۰ دهانه در هر برگهٔ سقف پشتیبانی می‌شود.");
  for (let i = 0; i < fields.length; i++)
    for (let j = i + 1; j < fields.length; j++) {
      const a = fields[i],
        b = fields[j];
      if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.001 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.001)
        throw new SlabInputError("دهانه‌های سقف هم‌پوشان‌اند؛ برای جلوگیری از دوباره‌شماری، مرز دال‌ها را اصلاح کنید.");
    }
  return fields;
}

/** بازشوهای دال همان طبقه (چاهک، داکت، نورگیر). */
export function slabOpenings(doc: StudioDocument, level = doc.currentLevel): SlabOpening[] {
  return doc.items
    .filter((item) => item.level === level && OPENING_IDS.has(item.catalogId))
    .map((item) => {
      if (![item.x, item.y, item.w, item.d, item.rotationDeg].every(Number.isFinite) || item.w <= 0 || item.d <= 0)
        throw new SlabInputError("هندسهٔ بازشو معتبر نیست.");
      if (Math.abs(item.rotationDeg / 90 - Math.round(item.rotationDeg / 90)) > 1e-6)
        throw new SlabInputError("بازشوی مورب هنوز در مترهٔ سقف پشتیبانی نمی‌شود.");
      const box = boxOf(item);
      return {
        id: item.id,
        label: item.label?.trim() || (item.catalogId === "space-shaft" ? "شفت" : "بازشو"),
        x0: box.x0,
        y0: box.y0,
        x1: box.x1,
        y1: box.y1,
      };
    })
    .filter((opening) => opening.x1 > opening.x0 && opening.y1 > opening.y0);
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

/**
 * بازه‌های باقی‌ماندهٔ یک میله پس از کسر بازشوها.
 * میلهٔ افقی (y ثابت) با بازشویی که آن نوار را می‌پوشاند قطع می‌شود؛ همان برای عمودی.
 */
export function barSegments(
  axis: SlabDirection,
  fixed: number,
  from: number,
  to: number,
  openings: SlabOpening[],
): [number, number][] {
  const blocking = openings
    .filter((opening) =>
      axis === "x" ? fixed > opening.y0 && fixed < opening.y1 : fixed > opening.x0 && fixed < opening.x1,
    )
    .map((opening) => (axis === "x" ? [opening.x0, opening.x1] : [opening.y0, opening.y1]) as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const segments: [number, number][] = [];
  let cursor = from;
  for (const [start, end] of blocking) {
    if (end <= cursor) continue;
    if (start > to) break;
    if (start > cursor + 0.02) segments.push([cursor, Math.min(start, to)]);
    cursor = Math.max(cursor, end);
  }
  if (to > cursor + 0.02) segments.push([cursor, to]);
  return segments;
}

/** عرض نوار شبکهٔ بالا برای یک دهانه (۲۵٪ دهانهٔ کوتاه، حداقل ۶۰ سانتی‌متر). */
export function fieldStrip(field: SlabField, config: SlabRebarConfig = SLAB_REBAR_DEFAULTS): number {
  const short = Math.min(field.x1 - field.x0, field.y1 - field.y0);
  return round(Math.min(short / 2 - CONCRETE_COVER, Math.max(0.6, short * config.topStripRatio)), 2);
}

/** لبه‌های مشترک بین دهانه‌ها = تکیه‌گاه داخلی (تیر یا دیوار باربر). */
export function supportEdges(fields: SlabField[]) {
  const edges: { orientation: "v" | "h"; at: number; from: number; to: number; length: number }[] = [];
  for (let i = 0; i < fields.length; i++)
    for (let j = i + 1; j < fields.length; j++) {
      const a = fields[i],
        b = fields[j];
      for (const orientation of ["v", "h"] as const) {
        const vertical = orientation === "v";
        const adjacent = vertical
          ? Math.abs(a.x1 - b.x0) < 0.001 || Math.abs(b.x1 - a.x0) < 0.001
          : Math.abs(a.y1 - b.y0) < 0.001 || Math.abs(b.y1 - a.y0) < 0.001;
        const from = Math.max(vertical ? a.y0 : a.x0, vertical ? b.y0 : b.x0);
        const to = Math.min(vertical ? a.y1 : a.x1, vertical ? b.y1 : b.x1);
        if (adjacent && to > from)
          edges.push({
            orientation,
            at: vertical ? Math.max(a.x0, b.x0) : Math.max(a.y0, b.y0),
            from,
            to,
            length: to - from,
          });
      }
    }
  return edges;
}

/** یک شاخهٔ واقعی پس از قطع در بازشو؛ منبع واحد ترسیم و جدول. */
export interface SlabBar {
  layer: SlabLayer;
  direction: SlabDirection;
  fixed: number;
  from: number;
  to: number;
  fieldId: string;
  label: string;
  lengthM: number;
  code: string;
}

function makeBars(fields: SlabField[], config: SlabRebarConfig, openings: SlabOpening[]): SlabBar[] {
  const bars: SlabBar[] = [];
  const sharedEdges = supportEdges(fields);
  const anchorage = (config.anchorageFactor * config.diameterMm) / 1000;
  const holes = openings.map((o) => ({
    ...o,
    x0: o.x0 - CONCRETE_COVER,
    x1: o.x1 + CONCRETE_COVER,
    y0: o.y0 - CONCRETE_COVER,
    y1: o.y1 + CONCRETE_COVER,
  }));
  const add = (
    layer: SlabLayer,
    direction: SlabDirection,
    fixed: number,
    from: number,
    to: number,
    field: SlabField,
    label = field.label,
  ) => {
    for (const [a, b] of barSegments(direction, fixed, from, to, holes)) {
      bars.push({
        layer,
        direction,
        fixed,
        from: a,
        to: b,
        fieldId: field.id,
        label,
        code: "",
        lengthM: round(b - a + (layer === "trim" ? 0 : 2 * anchorage), 2),
      });
      if (bars.length > 50000)
        throw new SlabInputError("تعداد شاخه‌ها بیش از ظرفیت متره است؛ طبقه را به چند سند تقسیم کنید.");
    }
  };
  const grid = (a: number, b: number, fn: (v: number) => void) => {
    const count = spacingOf(a, b, config.spacingM);
    if (!Number.isFinite(count) || count > 10000) throw new SlabInputError("ابعاد دهانه بیش از ظرفیت ترسیم است.");
    for (let i = 0; i < count; i++) fn(a + ((b - a) * i) / (count - 1));
  };
  for (const f of fields) {
    const x0 = f.x0 + CONCRETE_COVER,
      x1 = f.x1 - CONCRETE_COVER,
      y0 = f.y0 + CONCRETE_COVER,
      y1 = f.y1 - CONCRETE_COVER;
    grid(y0, y1, (y) => add("bottom", "x", y, x0, x1, f));
    grid(x0, x1, (x) => add("bottom", "y", x, y0, y1, f));
    const strip = fieldStrip(f, config);
    // نوار بالا عمود بر لبه؛ تعداد از طول لبه، نه عرض نوار، به دست می‌آید.
    // در حالت پیرامونی، بخش مشترک با دهانهٔ مجاور حذف می‌شود (نه مقایسه با AABB کل).
    const edges = sharedEdges;
    const ranges = (orientation: "v" | "h", at: number, from: number, to: number) => {
      if (config.topMode === "all") return [[from, to]] as [number, number][];
      const blockers = edges
        .filter((e) => e.orientation === orientation && Math.abs(e.at - at) < 0.001)
        .map((e) => ({ id: "", label: "", x0: e.from, x1: e.to, y0: -1, y1: 1 }));
      return barSegments("x", 0, from, to, blockers);
    };
    for (const [edge, start, end] of [
      [f.x0, x0, x0 + strip],
      [f.x1, x1 - strip, x1],
    ])
      for (const [a, b] of ranges("v", edge, y0, y1)) grid(a, b, (y) => add("top", "x", y, start, end, f));
    for (const [edge, start, end] of [
      [f.y0, y0, y0 + strip],
      [f.y1, y1 - strip, y1],
    ])
      for (const [a, b] of ranges("h", edge, x0, x1)) grid(a, b, (x) => add("top", "y", x, start, end, f));
  }
  for (const o of openings) {
    const field = fields.find((f) => o.x0 >= f.x0 && o.x1 <= f.x1 && o.y0 >= f.y0 && o.y1 <= f.y1);
    if (!field) continue;
    const ext = config.openingTrimLengthM;
    for (const gap of [0.06, 0.18]) {
      for (const y of [o.y0 - gap, o.y1 + gap])
        if (y >= field.y0 + CONCRETE_COVER && y <= field.y1 - CONCRETE_COVER)
          add(
            "trim",
            "x",
            y,
            Math.max(field.x0 + CONCRETE_COVER, o.x0 - ext),
            Math.min(field.x1 - CONCRETE_COVER, o.x1 + ext),
            field,
            o.label,
          );
      for (const x of [o.x0 - gap, o.x1 + gap])
        if (x >= field.x0 + CONCRETE_COVER && x <= field.x1 - CONCRETE_COVER)
          add(
            "trim",
            "y",
            x,
            Math.max(field.y0 + CONCRETE_COVER, o.y0 - ext),
            Math.min(field.y1 - CONCRETE_COVER, o.y1 + ext),
            field,
            o.label,
          );
    }
  }
  return bars;
}
function marksFromBars(bars: SlabBar[], config: SlabRebarConfig): SlabMark[] {
  const keyOf = (bar: SlabBar) => [bar.layer, bar.direction, bar.lengthM.toFixed(2)].join("|");
  const groups = new Map<string, SlabMark>();
  for (const bar of bars) {
    const key = keyOf(bar);
    let mark = groups.get(key);
    if (!mark) {
      mark = {
        code: "",
        layer: bar.layer,
        direction: bar.direction,
        diameterMm: bar.layer === "trim" ? config.openingTrimDiameterMm : config.diameterMm,
        spacingM: bar.layer === "trim" ? 0 : config.spacingM,
        lengthM: bar.lengthM,
        count: 0,
        totalLengthM: 0,
        weightKg: 0,
        fields: [],
      };
      groups.set(key, mark);
    }
    mark.count++;
    if (!mark.fields.includes(bar.label)) mark.fields.push(bar.label);
  }
  const order = { bottom: 0, top: 1, trim: 2 },
    indices = { bottom: 0, top: 0, trim: 0 };
  const marks = [...groups.values()].sort(
    (a, b) => order[a.layer] - order[b.layer] || a.direction.localeCompare(b.direction) || a.lengthM - b.lengthM,
  );
  for (const m of marks) {
    m.code = { bottom: "B", top: "T", trim: "O" }[m.layer] + ++indices[m.layer];
    m.totalLengthM = round(m.lengthM * m.count, 2);
    m.weightKg = round(m.totalLengthM * barWeightPerMetre(m.diameterMm), 1);
  }
  for (const bar of bars) bar.code = groups.get(keyOf(bar))!.code;
  return marks;
}
export function slabMarks(
  fields: SlabField[],
  _outline = slabOutline(fields),
  config: SlabRebarConfig = SLAB_REBAR_DEFAULTS,
  openings: SlabOpening[] = [],
): SlabMark[] {
  config = slabConfig(config);
  return marksFromBars(makeBars(fields, config, openings), config);
}

export function slabRebarPlan(doc: StudioDocument, override: Partial<SlabRebarConfig> = {}): SlabRebarPlan {
  const saved = slabConfig(doc.slabRebar === undefined ? {} : doc.slabRebar);
  slabConfig(override);
  const config = slabConfig({ ...saved, ...override });
  const fields = slabFields(doc);
  const openings = slabOpenings(doc).filter((o) =>
    fields.some((f) => o.x1 > f.x0 && o.x0 < f.x1 && o.y1 > f.y0 && o.y0 < f.y1),
  );
  if (openings.length > 200) throw new SlabInputError("حداکثر ۲۰۰ بازشو در هر سند سقف پشتیبانی می‌شود.");
  for (let i = 0; i < openings.length; i++)
    for (let j = i + 1; j < openings.length; j++) {
      const a = openings[i],
        b = openings[j];
      if (Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0))
        throw new SlabInputError("بازشوهای هم‌پوشان را پیش از متره یکپارچه کنید.");
    }
  for (const o of openings)
    if (
      !fields.some(
        (f) =>
          o.x0 > f.x0 + CONCRETE_COVER &&
          o.x1 < f.x1 - CONCRETE_COVER &&
          o.y0 > f.y0 + CONCRETE_COVER &&
          o.y1 < f.y1 - CONCRETE_COVER,
      )
    )
      throw new SlabInputError(
        "بازشوی مرزی یا عبوری از چند دهانه نیازمند طراحی جداگانه است؛ مترهٔ خودکار آن پشتیبانی نمی‌شود.",
      );
  const outline = slabOutline(fields);
  const bars = makeBars(fields, config, openings);
  const marks = marksFromBars(bars, config);
  if (marks.length > 500) throw new SlabInputError("بیش از ۵۰۰ نشان مستقل در سقف؛ برای خروجی خوانا سند را تقسیم کنید.");
  const totalWeightKg = round(
    marks.reduce((sum, mark) => sum + mark.weightKg, 0),
    1,
  );
  const stripM = Math.max(0, ...fields.map((f) => fieldStrip(f, config)));
  const thicknessM =
    fields.length > 0 ? round(fields.reduce((sum, field) => sum + field.thickness, 0) / fields.length, 2) : 0.15;
  const interiorSupportM = round(
    supportEdges(fields).reduce((sum, edge) => sum + edge.length, 0),
    2,
  );

  const clippedTrim = openings.some((o) => {
    const f = fields.find((f) => o.x0 > f.x0 && o.x1 < f.x1 && o.y0 > f.y0 && o.y1 < f.y1)!;
    const ext = config.openingTrimLengthM + CONCRETE_COVER;
    return o.x0 - f.x0 < ext || f.x1 - o.x1 < ext || o.y0 - f.y0 < ext || f.y1 - o.y1 < ext;
  });
  const notes = [
    `شبکهٔ پایین دوطرفه: میلگرد ${faNumber(config.diameterMm, 0)} هر ${faNumber(config.spacingM * 100, 0)} سانتی‌متر، دو جهت، در هر دهانه.`,
    `شبکهٔ بالا: نوار ${faNumber(config.topStripRatio * 100, 0)}٪ دهانهٔ کوتاه هر دهانه (حداقل هدف ۶۰ سانتی‌متر، محدود به نصف دهانه؛ حداکثر ${faNumber(stripM)} متر) در لبه‌های خارجی${
      config.topMode === "all" && interiorSupportM > 0
        ? ` و لبه‌های مشترک هندسی (جمع ${faNumber(interiorSupportM)} متر، نه کشف تیر)`
        : ""
    }.`,
    "خط پیوسته: پایین؛ خط‌چین: بالا؛ خط ضخیم: تقویتی؛ تراکم چاپ شماتیک است.",
    `طول شاخه شامل ${faNumber(config.anchorageFactor, 0)}db گیرش در تکیه‌گاه است؛ پوشش بتنی ${faNumber(CONCRETE_COVER * 100, 0)} سانتی‌متر.`,
    openings.length > 0
      ? `بازشوها: ${openings.length} مورد؛ میلگرد تقویتی ${faNumber(config.openingTrimDiameterMm, 0)} — ۲ شاخه در هر لبه با امتداد ${faNumber(config.openingTrimLengthM)} متر (نشان O…).`
      : "بازشوی مؤثر روی دهانه‌های این طبقه ثبت نشده است.",
    `وزن برآوردی میلگرد سقف ${faNumber(totalWeightKg, 1)} کیلوگرم، بدون احتساب پرت.`,
    "برچسب هر نشان: لایه (B پایین، T بالا، O تقویتی) — قطر — فاصله — طول شاخه.",
    ...(fields.some((f) => f.source === "space")
      ? ["مرز دال از فضاها فرض شده؛ ضخامت و تکیه‌گاه محاسبه نشده‌اند."]
      : []),
    ...(clippedTrim ? ["هشدار: امتداد تقویتی در مرز دال کوتاه شده؛ مهار کافی تأیید نمی‌شود."] : []),
    "گیرش و تقویت فرضی‌اند؛ کنترل مهاری، خم، وصله، بار و تکیه‌گاه انجام نشده است.",
    "این برگه ترسیمی/برآوردی است؛ طراحی و کنترل نهایی با مهندس دارای صلاحیت است.",
  ];

  return {
    fields,
    bars,
    openings,
    marks,
    totalWeightKg,
    notes,
    outline,
    stripM,
    thicknessM,
    interiorSupportM,
    config,
  };
}

/* ───────────────────────────── برگه ───────────────────────────── */

/**
 * برگهٔ پلان آرماتور سقف: نقشه در ستون چپ، جدول نشان‌ها و یادداشت‌ها در ستون راست.
 * مقیاس خودکار از کادر دال و فضای برگه محاسبه و روی برگه چاپ می‌شود.
 */
export function slabRebarScene(
  doc: StudioDocument,
  override?: Partial<SlabRebarConfig>,
  page = 0,
  suppliedPlan?: SlabRebarPlan,
): Scene {
  const plan = suppliedPlan ?? slabRebarPlan(doc, override);
  const scene = new Scene();
  const { area } = sheetFrame(doc);
  const pageSize = slabPageSize(doc, plan);
  const pages = Math.max(1, Math.ceil(plan.marks.length / pageSize));
  const pageMarks = plan.marks.slice(page * pageSize, (page + 1) * pageSize);
  const visibleCodes = new Set(pageMarks.map((m) => m.code));

  drawChrome(scene, { ...doc, slabRebar: plan.config }, {
    title: "پلان آرماتور سقف",
    subtitle: `${doc.project.code} · طبقهٔ ${faNumber(doc.currentLevel + 1, 0)} · ${doc.sheet.format} · ویرایش ${doc.revision}`,
    drawingTitle: `پلان آرماتور سقف · برگ ${faNumber(page + 1, 0)} از ${faNumber(pages, 0)}`,
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
    0.01,
    Math.min(
      (planW - margin * 2) / Math.max(plan.outline.w, 0.5),
      (planH - margin * 2) / Math.max(plan.outline.h, 0.5),
    ),
  );
  const originX = area.x + margin + (planW - margin * 2 - plan.outline.w * mmPerMetre) / 2;
  const originY = area.y + margin + (planH - margin * 2 - plan.outline.h * mmPerMetre) / 2;
  // y مدل به شمال است؛ روی برگه به سمت پایین (قاعدهٔ پلان)
  const map = (x: number, y: number): [number, number] => [
    originX + (x - plan.outline.x) * mmPerMetre,
    originY + (plan.outline.y + plan.outline.h - y) * mmPerMetre,
  ];

  if (plan.fields.length === 0) {
    scene.text(area.x + planW / 2, area.y + planH / 2, "فضایی برای دال تعریف نشده است", 3, {
      anchor: "middle",
      gray: 0.5,
    });
  }

  const [oLeft, oTop] = map(plan.outline.x, plan.outline.y + plan.outline.h);
  const oW = plan.outline.w * mmPerMetre,
    oH = plan.outline.h * mmPerMetre;
  for (const field of plan.fields) {
    const [x, y] = map(field.x0, field.y1);
    scene.rect(x, y, (field.x1 - field.x0) * mmPerMetre, (field.y1 - field.y0) * mmPerMetre, {
      width: 0.45,
      gray: 0.15,
    });
  }
  // همان شاخه‌های متره رسم می‌شوند؛ در چاپ ریز، فقط بعضی خطوط تکراری حذف می‌شوند.
  const tagged = new Set<string>();
  const tags: { code: string; x: number; y: number }[] = [];
  const lastFixed = new Map<string, number>();
  for (const bar of plan.bars) {
    const key = [bar.fieldId, bar.layer, bar.direction, bar.code].join("|");
    const first = !tagged.has(bar.code) && visibleCodes.has(bar.code);
    const prev = lastFixed.get(key);
    if (!first && bar.layer !== "trim" && prev != null && Math.abs(bar.fixed - prev) * mmPerMetre < 1.6) continue;
    lastFixed.set(key, bar.fixed);
    const [x0, y0] = bar.direction === "x" ? map(bar.from, bar.fixed) : map(bar.fixed, bar.from);
    const [x1, y1] = bar.direction === "x" ? map(bar.to, bar.fixed) : map(bar.fixed, bar.to);
    scene.line(x0, y0, x1, y1, {
      width: bar.layer === "trim" ? 0.4 : 0.13,
      gray: bar.layer === "bottom" ? 0.55 : 0.25,
      dash: bar.layer === "top" ? [2, 1] : undefined,
      data: `data-bar="${bar.code}"`,
    });
    if (first) {
      // نشان کنار شاخهٔ واقعی، نه نشان نخستِ جهت برای همهٔ بازشوها.
      const tx = x0 + (x1 - x0) * 0.42,
        ty = y0 + (y1 - y0) * 0.42;
      tags.push({ code: bar.code, x: tx, y: ty });
      tagged.add(bar.code);
    }
  }
  for (const field of plan.fields) {
    const [cx, cy] = map((field.x0 + field.x1) / 2, (field.y0 + field.y1) / 2);
    const label = field.label;
    const w = Math.max(0.5, Math.min(label.length * 1.4 + 4, (field.x1 - field.x0) * mmPerMetre - 2));
    scene.rect(cx - w / 2, cy - 3, w, 5, { fill: 1, width: 0, gray: 1 });
    scene.text(cx, cy, label, Math.min(2, w / Math.max(1, label.length)), { anchor: "middle" });
  }
  for (const opening of plan.openings) {
    const [x, y] = map(opening.x0, opening.y1);
    const w = (opening.x1 - opening.x0) * mmPerMetre,
      h = (opening.y1 - opening.y0) * mmPerMetre;
    scene.rect(x, y, w, h, { width: 0.4, gray: 0.1, dash: [2, 1] });
    const size = Math.max(0.1, Math.min(1.8, (w - 1) / Math.max(1, opening.label.length)));
    scene.text(x + w / 2, y + h / 2, opening.label, size, { anchor: "middle" });
  }

  // برچسب‌ها پس از تمام خطوط رسم می‌شوند تا شبکهٔ بعدی روی متن نیفتد.
  const occupied: { x: number; y: number; w: number; h: number }[] = [];
  for (const tag of tags) {
    const w = tag.code.length * 1.5 + 2,
      h = 3.5;
    const candidates = [0, -4, 4, -8, 8].map((dy) => ({
      x: Math.min(oLeft + oW - w, Math.max(oLeft, tag.x - 1)),
      y: Math.min(oTop + oH - h, Math.max(oTop, tag.y - 2.5 + dy)),
      w,
      h,
    }));
    const box =
      candidates.find(
        (b) => !occupied.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y),
      ) ?? candidates[0];
    occupied.push(box);
    scene.rect(box.x, box.y, w, h, { fill: 1, width: 0, gray: 1 });
    scene.text(box.x + 1, box.y + 2.5, tag.code, 2, {
      anchor: "start",
      direction: "ltr",
      data: `data-bar-label="${tag.code}"`,
    });
  }

  // ── کادر کل دال (ضخیم‌تر)
  // کادر محیطی فقط مبنای ابعاد است؛ در پلان L شکل نباید به‌عنوان لبهٔ بتن رسم شود.

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
  scene.text(dimX - 1.6, oTop + oH / 2, `${faNumber(plan.outline.h)} متر`, 2.2, {
    anchor: "middle",
    gray: 0.2,
    rotate: -90,
  });

  drawNorthArrow(scene, area.x + planW - 6, area.y + 8, 8);

  // ── مقیاس و خط‌کش: بلندترین عدد رُند که در ۵۰ میلی‌متر جا شود
  const barMetres = [1, 2, 3, 4, 5, 10].filter((metres) => metres * mmPerMetre <= 55).pop() ?? 1;
  const barY = area.y + area.h - 15;
  drawScaleBar(scene, area.x + 8, barY, mmPerMetre, barMetres);
  scene.text(area.x + 8, barY + 9.4, `مقیاس ۱:${faNumber(Math.round(1000 / mmPerMetre), 0)}`, 2.1, {
    anchor: "start",
    gray: 0.35,
  });

  // ── جدول نشان‌ها
  const tableX = area.x + planW + 6;
  const rows = pageMarks.map((mark) => [
    mark.code,
    layerLabel(mark.layer),
    directionLabel(mark.direction),
    faNumber(mark.diameterMm, 0),
    mark.spacingM > 0 ? faNumber(mark.spacingM * 100, 0) : "—",
    faNumber(mark.lengthM),
    faNumber(mark.count, 0),
    faNumber(mark.totalLengthM, 1),
    faNumber(mark.weightKg, 1),
  ]);
  const totalCount = pageMarks.reduce((sum, mark) => sum + mark.count, 0);
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
    footer: [
      "جمع برگ",
      "",
      "",
      "",
      "",
      "",
      faNumber(totalCount, 0),
      "",
      faNumber(
        pageMarks.reduce((sum, m) => sum + m.weightKg, 0),
        1,
      ),
    ],
    note: "نشان‌ها بر پایهٔ لایه، جهت و طول شاخه تجمیع شده‌اند.",
  });

  scene.text(tableX + tableW, bottom + 7, "یادداشت‌های فنی", 2.6, { anchor: "end", bold: true, gray: 0.15 });
  slabNoteLines(plan, tableW).forEach((note, index) => {
    scene.text(tableX + tableW, bottom + 12.5 + index * 4.4, `• ${note}`, 1.85, { anchor: "end", gray: 0.3 });
  });

  // ── فهرست دهانه‌ها زیر یادداشت‌ها؛ جدول کوچک با ستون‌های عددی جدا
  const legendY = bottom + 12.5 + slabNoteLines(plan, tableW).length * 4.4 + 4;
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

/** یادداشت‌ها با شکست سطر؛ تمام فرض‌ها روی همهٔ برگ‌ها باقی می‌مانند. */
function slabNoteLines(plan: SlabRebarPlan, width: number): string[] {
  const maxChars = Math.floor(width / 0.85);
  return plan.notes.flatMap((note) => {
    const lines: string[] = [];
    let line = "";
    for (const word of note.split(" ")) {
      if (line.length + word.length + 1 > maxChars && line) {
        lines.push(line);
        line = "";
      }
      line += (line ? " " : "") + word;
    }
    if (line) lines.push(line);
    return lines;
  });
}
function slabPageSize(doc: StudioDocument, plan: SlabRebarPlan): number {
  const { area } = sheetFrame(doc);
  const tableW = Math.min(Math.max(area.w * 0.34, 110), 165);
  return Math.max(1, Math.floor((area.h - 40 - slabNoteLines(plan, tableW).length * 4.4) / 5.2) - 2);
}
export function slabRebarScenes(doc: StudioDocument, override?: Partial<SlabRebarConfig>): Scene[] {
  const plan = slabRebarPlan(doc, override);
  return Array.from({ length: Math.max(1, Math.ceil(plan.marks.length / slabPageSize(doc, plan))) }, (_, page) =>
    slabRebarScene(doc, override, page, plan),
  );
}
/** SVG چندبرگی با viewBox مستقل هر برگ؛ هیچ ردیفی حذف نمی‌شود. */
export function renderStudioSlabRebarSheet(doc: StudioDocument, override?: Partial<SlabRebarConfig>): string {
  const scenes = slabRebarScenes(doc, override);
  if (scenes.length === 1) return sheetSvg(scenes[0], doc);
  const { sheet } = sheetFrame(doc);
  const children = scenes.map((scene, index) =>
    sheetSvg(scene, doc)
      .replace(/<\?xml[^>]*>\s*/, "")
      .replace(/width="[^"]+"/, `width="${sheet.w}"`)
      .replace(/height="[^"]+"/, `height="${sheet.h}"`)
      .replace("<svg ", `<svg y="${index * sheet.h}" `),
  );
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${sheet.w}mm" height="${sheet.h * scenes.length}mm" viewBox="0 0 ${sheet.w} ${sheet.h * scenes.length}">${children.join("")}</svg>`;
}
export function renderStudioSlabRebarPdf(doc: StudioDocument, override?: Partial<SlabRebarConfig>): Uint8Array {
  return sheetsPdf(slabRebarScenes(doc, override), doc);
}

/** کشف نشان برای هر (لایه، جهت، طول) — برای آزمون و خروجی داده‌ای. */
export function slabMarkCode(plan: SlabRebarPlan, layer: SlabLayer, direction: SlabDirection, lengthM: number): string {
  return (
    plan.marks.find(
      (mark) =>
        mark.layer === layer && mark.direction === direction && Math.abs(mark.lengthM - round(lengthM, 2)) < 0.001,
    )?.code ?? ""
  );
}

/** جدول کامل با اعداد لاتین و BOM برای صفحه‌گسترده؛ واحدها در سرستون مشخص‌اند. */
export function renderStudioSlabRebarCsv(doc: StudioDocument, override?: Partial<SlabRebarConfig>): string {
  const plan = slabRebarPlan(doc, override);
  const rows: (string | number)[][] = [
    ["نشان", "لایه", "جهت", "قطر (mm)", "فاصله (m)", "طول شاخه (m)", "تعداد", "طول کل (m)", "وزن (kg)"],
  ];
  for (const m of plan.marks)
    rows.push([
      m.code,
      layerLabel(m.layer),
      directionLabel(m.direction),
      m.diameterMm,
      m.spacingM || "",
      m.lengthM,
      m.count,
      m.totalLengthM,
      m.weightKg,
    ]);
  rows.push([
    "جمع",
    "",
    "",
    "",
    "",
    "",
    plan.bars.length,
    round(
      plan.marks.reduce((sum, m) => sum + m.totalLengthM, 0),
      2,
    ),
    plan.totalWeightKg,
  ]);
  rows.push(["یادآوری", "برآورد ترسیمی؛ کنترل نهایی با مهندس دارای صلاحیت"]);
  return (
    "\uFEFF" + rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(",")).join("\r\n")
  );
}

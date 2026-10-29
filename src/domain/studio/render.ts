/**
 * HERMICAD Studio — خروجی‌های نقشه
 *
 * یک سند طراحی → چهار خروجی مستقل و قابل بازرسی:
 *  - SVG  (چاپ دقیق، مقیاس‌دار، متن فارسی، برای چاپ/PDF از مرورگر)
 *  - PDF  (برداری، ابعاد واقعی برگه؛ متن لاتین — محدودیت اعلام‌شده)
 *  - DXF  (AC1015، واحد متر، لایه‌بندی بر پایهٔ رشته)
 *  - CSV  (جدول اشیا/متره) و JSON (سند کامل)
 *
 * هیچ کتابخانهٔ بیرونی استفاده نمی‌شود؛ همهٔ نویسنده‌ها بومی و آزمون‌شده‌اند.
 */

import { CATALOG_BY_ID, STUDIO_LAYERS, type Part, type StudioLayerId } from "./catalog";
import { Scene, scenePdfOps, sceneSvg } from "./draw";
import { DxfWriter, dxfText } from "./dxf";
import { drawChrome, faArea, faNumber, sheetFrame } from "./sheetKit";
import { shapeForDisplay } from "./pdf/arabic";
import { PdfText, type TextAnchor } from "./pdf/text";
import { embedFont, loadTypeface, writeToUnicode } from "./pdf/typeface";
import { PdfWriter } from "./pdf/writer";
import { studioIfc, studioXlsx } from "./exporters";
import { renderStudioElevationSheet, renderStudioVertical, studioVerticalDxf } from "./vertical";
import { renderStudioElevationsPdf, renderStudioVerticalPdf } from "./verticalPdf";
import {
  renderStudioArchDetailDxf,
  renderStudioArchDetailPdf,
  renderStudioArchDetailSheet,
} from "./archDetails";
import { renderStudioDetailDxf, renderStudioDetailPdf, renderStudioDetailSheet } from "./details";
import { renderStudioSchedulePdf, renderStudioScheduleSheet } from "./schedules";
import { renderStudioSlabRebarPdf, renderStudioSlabRebarSheet } from "./slabRebar";
import {
  documentBounds,
  documentFingerprint,
  itemCorners,
  mmPerMetre,
  renderableItems,
  SHARED_LAYERS,
  schedule,
  sheetSizeMm,
  type StudioDocument,
  type StudioItem,
} from "./document";

export type Theme = "screen" | "print";

const LAYER_BY_ID: Record<string, (typeof STUDIO_LAYERS)[number]> = Object.fromEntries(
  STUDIO_LAYERS.map((layer) => [layer.id, layer]),
);

const FILL_TOKENS: Record<Theme, Record<string, string>> = {
  print: {
    none: "none",
    soft: "#f1f5f9",
    medium: "#cbd5e1",
    dark: "#334155",
    accent: "#fca5a5",
  },
  screen: {
    none: "none",
    soft: "rgba(148,163,184,0.16)",
    medium: "rgba(148,163,184,0.3)",
    dark: "rgba(226,232,240,0.55)",
    accent: "rgba(248,113,113,0.5)",
  },
};

const STROKE: Record<Theme, Record<string, string>> = {
  print: Object.fromEntries(STUDIO_LAYERS.map((layer) => [layer.id, layer.color])),
  screen: {
    walls: "#e2e8f0",
    structure: "#fca5a5",
    foundation: "#fdba74",
    furniture: "#67e8f9",
    sanitary: "#7dd3fc",
    kitchen: "#5eead4",
    mep: "#d8b4fe",
    electrical: "#fcd34d",
    fire: "#fca5a5",
    site: "#86efac",
    annotation: "#cbd5e1",
    grid: "#64748b",
    dimension: "#94a3b8",
  },
};

const PAPER = "#ffffff";
import { assemblePdf, type SheetLayout } from "./pdf/sheetPdf";

export const ENGINE_LABEL = "hermicad-studio/1.0";

// نویسندهٔ برگه‌ها جدا شده تا برگه‌های دیگر (جزئیات، جداول) بتوانند بدون
// ایجاد وابستگی چرخه‌ای از آن استفاده کنند.
export { assemblePdf } from "./pdf/sheetPdf";

const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const n = (value: number): string => (Math.round(value * 1000) / 1000).toString();

const GHOST_COLOR: Record<Theme, string> = { print: "#94a3b8", screen: "#475569" };

export interface RenderOptions {
  theme?: Theme;
  /** فیلتر موقت رشته، مستقل از فیلتر ذخیره‌شده در سند */
  classification?: StudioDocument["classification"];
  showGrid?: boolean;
  showTitleBlock?: boolean;
  showSchedule?: boolean;
  /** `undefined` = طبقهٔ جاری سند، `null` = همهٔ طبقات */
  onlyLevel?: number | null;
  /** نمایش محو رشته‌های دیگر به‌عنوان مرجع (پیش‌فرض: روشن) */
  showContext?: boolean;
  /** نمایش همهٔ طبقات روی هم (پیش‌فرض: فقط طبقهٔ جاری) */
  allLevels?: boolean;
  /** مختصات خط برش برای خروجی «section» (متر) */
  sectionAt?: number;
  sectionWidth?: number;
}

export function sheetLayout(doc: StudioDocument, options: RenderOptions = {}): SheetLayout {
  // کادر و کتیبه از ابزار مشترک برگه‌سازی می‌آید تا پلان با نما/برش/جزئیات/جداول
  // یک خانوادهٔ بصری باشد (همان حاشیه، همان سرصفحه، همان کتیبه).
  const frame = sheetFrame(doc);
  const sheet = frame.sheet;
  const titleBlock = frame.titleBlock;
  const areaMm = frame.area;
  // محدودهٔ نقشه: اشیای «محتوا» (نه اندازه‌گذاری/محور/برچسب).
  // چرا: یک اندازه‌گذاری یا نشانهٔ محوطه که چند متر بیرون نقشه است، کادر را
  // باد می‌کند و نتیجه‌اش این است که پلان بی‌دلیل کوچک‌تر (مثلاً ۱:۷۵ به‌جای
  // ۱:۵۰) و از مرکز برگه جابه‌جا چاپ می‌شود. حاشیهٔ ۱٫۲ متر برای همان
  // اندازه‌گذاری‌ها و حباب‌های بیرونی در نظر گرفته می‌شود.
  const ANNOTATION_LAYERS = new Set(["annotation", "grid", "dimension"]);
  const contentItems = doc.items.filter(
    (item) => !ANNOTATION_LAYERS.has(CATALOG_BY_ID[item.catalogId]?.layer ?? ""),
  );
  let bounds = documentBounds(doc);
  if (contentItems.length > 0 && contentItems.length < doc.items.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of contentItems) {
      for (const corner of itemCorners(item)) {
        minX = Math.min(minX, corner.x);
        minY = Math.min(minY, corner.y);
        maxX = Math.max(maxX, corner.x);
        maxY = Math.max(maxY, corner.y);
      }
    }
    const pad = 1.2;
    bounds = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }
  const requested = Math.max(1, doc.sheet.scale);
  let scale = requested;
  let fitted = false;
  const fit = (): boolean => {
    const mm = 1000 / scale;
    return bounds.w * mm <= areaMm.w - 8 && bounds.h * mm <= areaMm.h - 8;
  };
  // بزرگ‌ترین مخرج مقیاس استاندارد که محتوا در آن جا می‌شود.
  const steps = [20, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];
  if (!fit()) {
    for (const step of steps) {
      if (step < requested) continue;
      scale = step;
      if (fit()) {
        fitted = scale !== requested;
        break;
      }
    }
    if (!fit()) {
      // کوچک‌ترین مقیاس ممکن برای جا شدن کامل (غیراستاندارد، اما اعلام می‌شود)
      scale = Math.ceil(Math.max(bounds.w / ((areaMm.w - 8) / 1000), bounds.h / ((areaMm.h - 8) / 1000)));
      fitted = true;
    }
  }
  return {
    widthMm: sheet.w,
    heightMm: sheet.h,
    areaMm,
    titleBlock,
    mmPerMetre: 1000 / scale,
    requestedScale: requested,
    fitted,
    bounds,
  };
}

function classificationLabel(doc: StudioDocument, options: RenderOptions): string {
  const value = options.classification ?? doc.classification;
  const map: Record<string, string> = {
    all: "پلان ترکیبی (همهٔ رشته‌ها)",
    architecture: "پلان معماری",
    structure: "پلان سازه",
    mechanical: "پلان تأسیسات مکانیکی",
    electrical: "پلان تأسیسات برقی",
    plumbing: "پلان بهداشتی و آب",
    fire: "پلان ایمنی حریق",
    site: "پلان محوطه",
  };
  return map[value] ?? "پلان";
}

/** نگاشت نقطهٔ محلی شیء (متر از مرکز) به مختصات میلی‌متری برگه. */
function itemTransform(item: StudioItem, layout: SheetLayout): {
  origin: { x: number; y: number };
  map: (lx: number, ly: number) => { x: number; y: number };
  radians: number;
} {
  const area = layout.areaMm;
  const drawW = layout.bounds.w * layout.mmPerMetre;
  const drawH = layout.bounds.h * layout.mmPerMetre;
  const offsetX = area.x + (area.w - drawW) / 2;
  const offsetY = area.y + (area.h - drawH) / 2;
  const cx = offsetX + (item.x - layout.bounds.x) * layout.mmPerMetre;
  const cy = offsetY + (layout.bounds.y + layout.bounds.h - item.y) * layout.mmPerMetre;
  const rad = (item.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    origin: { x: cx, y: cy },
    radians: rad,
    map: (lx, ly) => ({
      x: cx + (lx * cos - ly * sin) * layout.mmPerMetre,
      y: cy + (lx * sin + ly * cos) * layout.mmPerMetre,
    }),
  };
}

interface PartOverride {
  stroke?: string;
  weight?: number;
  forceDash?: boolean;
}

/* ─────────────────── نام‌گذاری محورها و برچسب PDF/DXF ─────────────────── */

/**
 * نام‌گذاری خودکار حباب‌های محور (گرید).
 *
 * در نقشه‌های اجرایی، محورهای عمودی با عدد (۱، ۲، ۳ …) و محورهای افقی با حرف
 * (A، B، C …) نام‌گذاری می‌شوند. کاربر فقط حباب را می‌گذارد؛ نام باید خودکار و
 * پایدار باشد. تشخیص محور از موقعیت حباب نسبت به محدودهٔ ساختمان انجام می‌شود:
 * حباب بالای/پایین نقشه ⇒ محور عمودی (عدد)، حباب چپ/راست ⇒ محور افقی (حرف).
 */
const AXIS_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function withAxisLabels(doc: StudioDocument): StudioDocument {
  const bubbles = doc.items.filter((item) => item.catalogId === "grid-bubble");
  if (bubbles.length === 0) return doc;
  // محدودهٔ مرجع باید «بدنهٔ ساختمان» باشد؛ اگر همهٔ اشیا (اندازه‌گذاری، محوطه،
  // برچسب‌ها) در نظر گرفته شوند، کادر چنان بزرگ می‌شود که حباب‌های کنار نقشه
  // داخل آن بیفتند و هرگز نام نگیرند (ایراد دیده‌شده در نقشهٔ نمونه).
  const BUILDING_LAYERS = new Set(["walls", "structure", "foundation"]);
  const onBuilding = doc.items.filter(
    (item) => item.catalogId !== "grid-bubble" && BUILDING_LAYERS.has(CATALOG_BY_ID[item.catalogId]?.layer ?? ""),
  );
  const structural =
    onBuilding.length > 0
      ? onBuilding
      : doc.items.filter((item) => item.catalogId !== "grid-bubble" && item.catalogId !== "dim-linear");
  if (structural.length === 0) return doc;
  // نیم‌عرض/نیم‌ارتفاع مؤثر با احتساب چرخش: دیوارهای عمودی با w=طول و چرخش ۹۰
  // درجه ذخیره می‌شوند، پس کادر ساده (x ± w/2) آن‌ها را چند متر جابه‌جا می‌کرد.
  const halfExtent = (item: StudioItem) => {
    const rad = (item.rotationDeg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    return {
      hw: (item.w / 2) * cos + (item.d / 2) * sin,
      hh: (item.w / 2) * sin + (item.d / 2) * cos,
    };
  };
  const extents = structural.map((item) => ({ item, ...halfExtent(item) }));
  const box = {
    minX: Math.min(...extents.map(({ item, hw }) => item.x - hw)),
    maxX: Math.max(...extents.map(({ item, hw }) => item.x + hw)),
    minY: Math.min(...extents.map(({ item, hh }) => item.y - hh)),
    maxY: Math.max(...extents.map(({ item, hh }) => item.y + hh)),
  };
  const vertical: { id: string; key: number }[] = [];
  const horizontal: { id: string; key: number }[] = [];
  for (const bubble of bubbles) {
    if (bubble.label?.trim()) continue; // برچسب دستی کاربر مقدم است
    if (bubble.y < box.minY || bubble.y > box.maxY) vertical.push({ id: bubble.id, key: bubble.x });
    else if (bubble.x < box.minX || bubble.x > box.maxX) horizontal.push({ id: bubble.id, key: bubble.y });
  }
  const labels = new Map<string, string>();
  const unique = (values: number[]) =>
    [...new Set(values.map((value) => Math.round(value * 100) / 100))].sort((a, b) => a - b);
  // شمارهٔ محورهای عمودی از راست به چپ افزایش می‌یابد (روش رایج نقشه‌های
  // ایرانی: محور ۱ در سمت راست برگه و آخرین شماره در سمت چپ).
  const verticalKeys = unique(vertical.map((entry) => entry.key)).reverse();
  const horizontalKeys = unique(horizontal.map((entry) => entry.key)).reverse(); // بالای نقشه ⇒ A
  for (const entry of vertical) {
    const index = verticalKeys.indexOf(Math.round(entry.key * 100) / 100);
    // شمارهٔ محور در نقشه‌های ایرانی با ارقام فارسی نوشته می‌شود.
    if (index >= 0) labels.set(entry.id, `${index + 1}`.replace(/[0-9]/g, (digit) => FA_DIGITS[Number(digit)]));
  }
  for (const entry of horizontal) {
    const index = horizontalKeys.indexOf(Math.round(entry.key * 100) / 100);
    if (index >= 0 && index < AXIS_LETTERS.length) labels.set(entry.id, AXIS_LETTERS[index]);
  }
  if (labels.size === 0) return doc;
  return {
    ...doc,
    items: doc.items.map((item) => (labels.has(item.id) ? { ...item, label: labels.get(item.id) } : item)),
  };
}

/** برچسب قابل نوشتن برای یک شیء در PDF/DXF (هم‌خوان با منطق صحنه). */
function pdfLabelFor(item: StudioItem, definition: (typeof CATALOG_BY_ID)[string]): string | null {
  if (SPACE_IDS.has(item.catalogId)) {
    const name = item.label?.trim() || (item.catalogId === "space-terrace" ? "تراس" : item.catalogId === "space-shaft" ? "شفت" : "فضا");
    // ارقام و واحد فارسی — همان قاعدهٔ برگه، تا DXF با PDF ناهمگون نباشد.
    return `${name} (${faArea(item.w * item.d, 1)})`;
  }
  if (item.catalogId === "dim-linear") return faNumber(item.w, 2);
  if (UNLABELLED_IDS.has(item.catalogId)) return null;
  if (!LABELLED_CATEGORIES.has(definition.category) && !item.label) return null;
  if (!item.label && (Math.min(item.w, item.d) < 0.75 || item.w * item.d < 0.4)) return null;
  return item.label ?? definition.nameFa;
}

/* ─────────────── صحنهٔ برگه: یک منبع برای SVG و PDF ─────────────── */

/**
 * چرا صحنهٔ مشترک: پیش‌تر پلان با یک رندرکنندهٔ رشته‌ای برای SVG و یک نویسندهٔ
 * جداگانه برای PDF ساخته می‌شد و نتیجه این بود که PDF پلان بدون کادر و راهنما و
 * با دیوارهای توخالی درمی‌آمد. حالا برگه یک بار به‌صورت «صحنه» (draw.ts) ساخته
 * می‌شود و هم SVG رنگی و هم PDF برداری از همان صحنه بیرون می‌آید؛ پس هر اصلاحی
 * در هر دو خروجی هم‌زمان دیده می‌شود.
 */
interface PartOverride {
  color?: string;
  weight?: number;
  forceDash?: boolean;
  opacity?: number;
  data?: string;
}

function partToScene(
  scene: Scene,
  part: Part,
  item: StudioItem,
  layout: SheetLayout,
  theme: Theme,
  layer: StudioLayerId,
  override: PartOverride = {},
): void {
  const transform = itemTransform(item, layout);
  const fillColor = part.fill && part.fill !== "none" ? FILL_TOKENS[theme][part.fill] : undefined;
  const color = override.color ?? STROKE[theme][layer] ?? "#0f172a";
  const weight = override.weight ?? (LAYER_BY_ID[layer]?.weight ?? 0.2) * (part.thick ? 1.8 : 1);
  const dashed = override.forceDash ? true : part.dashed;
  const dash: [number, number] | undefined = dashed
    ? [Math.max(0.6, weight * 5), Math.max(0.4, weight * 3)]
    : undefined;
  const style = { color, width: weight, dash, opacity: override.opacity, data: override.data };
  const fill = fillColor ? { fillColor } : {};
  const w = item.w;
  const d = item.d;
  switch (part.kind) {
    case "rect": {
      const x0 = (part.x - 0.5) * w;
      const y0 = (part.y - 0.5) * d;
      const x1 = x0 + part.w * w;
      const y1 = y0 + part.h * d;
      const points: [number, number][] = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ].map(([x, y]) => {
        const point = transform.map(x, y);
        return [point.x, point.y] as [number, number];
      });
      scene.poly(points, { ...style, ...fill });
      return;
    }
    case "circle": {
      const center = transform.map((part.cx - 0.5) * w, (part.cy - 0.5) * d);
      scene.circle(center.x, center.y, part.r * Math.min(item.w, item.d) * 0.5 * layout.mmPerMetre, {
        ...style,
        ...fill,
      });
      return;
    }
    case "poly": {
      const points: [number, number][] = part.points.map(([u, v]) => {
        const point = transform.map((u - 0.5) * w, (v - 0.5) * d);
        return [point.x, point.y] as [number, number];
      });
      scene.poly(points, part.closed === false ? { ...style, closed: false } : { ...style, ...fill });
      return;
    }
    case "mline": {
      const a = transform.map(part.x1, part.y1);
      const b = transform.map(part.x2, part.y2);
      scene.line(a.x, a.y, b.x, b.y, style);
      return;
    }
    case "marc": {
      const steps = 16;
      const points: [number, number][] = [];
      for (let i = 0; i <= steps; i += 1) {
        const angle = ((part.from + ((part.to - part.from) * i) / steps) * Math.PI) / 180;
        const point = transform.map(part.cx + part.r * Math.cos(angle), part.cy + part.r * Math.sin(angle));
        points.push([point.x, point.y]);
      }
      scene.poly(points, { ...style, closed: false });
      return;
    }
    default: {
      const a = transform.map((part.x1 - 0.5) * w, (part.y1 - 0.5) * d);
      const b = transform.map((part.x2 - 0.5) * w, (part.y2 - 0.5) * d);
      scene.line(a.x, a.y, b.x, b.y, style);
      return;
    }
  }
}

/**
 * برچسب شیء فقط روی اقلام «قابل نام‌گذاری» نوشته می‌شود؛ برچسب روی دیوار و ستون
 * و نماد، نقشه را شلوغ می‌کند و در نقشهٔ اجرایی هم مرسوم نیست.
 */
/** اقلام تزئینی که برچسبشان فقط نقشه را شلوغ می‌کند. */
const UNLABELLED_IDS = new Set([
  "rug",
  "planter",
  "tree",
  "coffee-table",
  "floor-drain",
  "socket",
  "data-outlet",
  "smoke-detector",
  "sprinkler",
  "light-fixture",
]);

const LABELLED_CATEGORIES = new Set([
  "seating",
  "dining",
  "bedroom",
  "kitchen",
  "sanitary",
  "laundry",
  "office",
  "retail",
  "healthcare",
  "education",
  "hospitality",
  "industrial",
  "mep",
]);

const SPACE_IDS = new Set(["space-room", "space-terrace", "space-shaft"]);

const INK: Record<Theme, string> = { print: "#0f172a", screen: "#cbd5e1" };
const MUTED: Record<Theme, string> = { print: "#475569", screen: "#94a3b8" };

/** مرکز شیء روی برگه (میلی‌متر) — برای جای‌گذاری برچسب و بررسی تداخل. */
function spaceCenter(item: StudioItem, layout: SheetLayout): { x: number; y: number } {
  return itemTransform(item, layout).origin;
}

/** برچسب شیء روی صحنه؛ `true` اگر چیزی نوشته شد. */
function itemLabelToScene(
  scene: Scene,
  item: StudioItem,
  definition: (typeof CATALOG_BY_ID)[string],
  layout: SheetLayout,
  theme: Theme,
  offset: { dx: number; dy: number },
): boolean {
  if (theme === "screen") return false;
  if (UNLABELLED_IDS.has(item.catalogId)) return false;
  const data = `data-label-of="${item.id}"`;
  if (SPACE_IDS.has(item.catalogId)) {
    const { origin } = itemTransform(item, layout);
    const name =
      item.label?.trim() || (item.catalogId === "space-terrace" ? "تراس" : item.catalogId === "space-shaft" ? "شفت" : "فضا");
    scene.text(
      origin.x + offset.dx,
      origin.y - 0.6 + offset.dy,
      name,
      2.4,
      { anchor: "middle", color: "#0f172a", data: `data-space="${item.id}"` },
    );
    // مساحت با ارقام فارسی و واحد «م²» — همان قاعدهٔ برگه‌های دیگر
    scene.text(origin.x + offset.dx, origin.y + 2.2 + offset.dy, faArea(item.w * item.d, 1), 2.1, {
      anchor: "middle",
      color: "#334155",
      data,
    });
    return true;
  }
  if (item.catalogId === "grid-bubble" && item.label) {
    // نام محور دقیقاً در مرکز حباب (حباب کوچک است؛ قاعدهٔ «فقط اقلام بزرگ» نباید
    // آن را حذف کند، وگرنه همهٔ حباب‌ها بی‌نام می‌مانند).
    const { origin } = itemTransform(item, layout);
    scene.text(origin.x + offset.dx, origin.y + 0.9 + offset.dy, item.label, 2.3, {
      anchor: "middle",
      color: "#0f172a",
      bold: true,
      direction: "ltr",
      data,
    });
    return true;
  }
  if (item.catalogId === "dim-linear") {
    const { origin } = itemTransform(item, layout);
    // اندازه‌گذاری با ارقام فارسی؛ واحد در خط‌کش مقیاس اعلام شده است.
    scene.text(origin.x + offset.dx, origin.y - 1.2 + offset.dy, faNumber(item.w, 2), 2.3, {
      anchor: "middle",
      color: "#0f172a",
      data,
    });
    return true;
  }
  if (!LABELLED_CATEGORIES.has(definition.category) && !item.label) return false;
  // برچسب فقط برای اقلامی که جای کافی دارند؛ در غیر این صورت نقشه شلوغ می‌شود.
  const minSide = Math.min(item.w, item.d);
  if (!item.label && (minSide < 0.75 || item.w * item.d < 0.4)) return false;
  const widthMm = minSide * layout.mmPerMetre;
  if (!item.label && widthMm < 9) return false;
  const { origin } = itemTransform(item, layout);
  const name = item.label ?? definition.nameFa;
  if (!name) return false;
  const size = Math.max(1.5, Math.min(2.2, Math.min(item.w, item.d) * layout.mmPerMetre * 0.2));
  scene.text(origin.x + offset.dx, origin.y + size * 0.35 + offset.dy, name, size, {
    anchor: "middle",
    color: "#0f172a",
    opacity: 0.8,
    data,
  });
  return true;
}

function gridToScene(scene: Scene, layout: SheetLayout, grid: number, theme: Theme): void {
  if (!grid || grid <= 0) return;
  const step = grid * layout.mmPerMetre;
  if (step < 4) return;
  const { areaMm, bounds } = layout;
  const drawW = bounds.w * layout.mmPerMetre;
  const drawH = bounds.h * layout.mmPerMetre;
  const offsetX = areaMm.x + (areaMm.w - drawW) / 2;
  const offsetY = areaMm.y + (areaMm.h - drawH) / 2;
  const style =
    theme === "print"
      ? { color: "#e2e8f0", width: 0.1, data: 'data-grid="1"' }
      : { color: "#94a3b8", width: 0.1, opacity: 0.14, data: 'data-grid="1"' };
  for (let x = 0; x <= drawW + 0.01; x += step) scene.line(offsetX + x, offsetY, offsetX + x, offsetY + drawH, style);
  for (let y = 0; y <= drawH + 0.01; y += step) scene.line(offsetX, offsetY + y, offsetX + drawW, offsetY + y, style);
}

/**
 * کتیبه و سرصفحهٔ برگه از ابزار مشترک (`drawChrome`): کادر دوگانه، سرصفحه با کد
 * پروژه، اثر انگشت سند و کتیبهٔ چهارستونه. پلان دیگر کتیبهٔ اختصاصی نمی‌کشد تا
 * با برگه‌های نما/برش/جزئیات/جداول ناهمگون نشود.
 */
function drawSheetChrome(
  scene: Scene,
  doc: StudioDocument,
  layout: SheetLayout,
  options: RenderOptions,
  theme: Theme,
): void {
  if (options.showTitleBlock === false) return;
  const effectiveScale = Math.round(1000 / layout.mmPerMetre);
  // ارقام فارسی: برگه فارسی است و «1:75» لاتین در جدول عنوان ناهماهنگ دیده می‌شد
  const scaleText = layout.fitted ? `۱:${faNumber(effectiveScale, 0)}` : `۱:${faNumber(doc.sheet.scale, 0)}`;
  drawChrome(scene, doc, {
    title: doc.project.name,
    subtitle: [
      classificationLabel(doc, options),
      layout.fitted
        ? `مقیاس ۱:${faNumber(effectiveScale, 0)} (درخواست ۱:${faNumber(layout.requestedScale, 0)})`
        : `مقیاس ۱:${faNumber(doc.sheet.scale, 0)}`,
      `${doc.sheet.format} ${doc.sheet.orientation === "landscape" ? "افقی" : "عمودی"}`,
      `طبقه ${doc.currentLevel + 1} از ${doc.levels}`,
    ].join(" · "),
    drawingTitle: classificationLabel(doc, options),
    scaleText,
    footnote: `${ENGINE_LABEL} · ${doc.project.note}`,
  });
  void theme;
}

function northArrowToScene(scene: Scene, layout: SheetLayout, theme: Theme): void {
  const { areaMm } = layout;
  const cx = areaMm.x + areaMm.w - 14;
  const cy = areaMm.y + 16;
  const ink = INK[theme];
  const data = 'data-north="1"';
  scene.circle(cx, cy, 6, { color: ink, width: 0.25, data });
  scene.poly(
    [
      [cx, cy - 5.2],
      [cx + 1.6, cy + 2.2],
      [cx, cy + 1.1],
      [cx - 1.6, cy + 2.2],
    ],
    { fillColor: ink, color: ink, width: 0.05, data },
  );
  scene.text(cx, cy - 7, "شمال", 2.6, { anchor: "middle", color: ink, data });
}

function scaleBarToScene(scene: Scene, layout: SheetLayout, theme: Theme): void {
  const { areaMm } = layout;
  const x0 = areaMm.x + 4;
  const y0 = areaMm.y + areaMm.h - 8;
  const totalM = 5;
  const segM = 1;
  const ink = INK[theme];
  const data = 'data-scale-bar="1"';
  for (let i = 0; i < totalM / segM; i += 1) {
    const x = x0 + i * segM * layout.mmPerMetre;
    const w = segM * layout.mmPerMetre;
    scene.rect(x, y0, w, 2, i % 2 === 0 ? { fillColor: ink, color: ink, width: 0.2, data } : { color: ink, width: 0.2, data });
    scene.text(x, y0 + 5.4, String(i), 2.2, { anchor: "middle", color: ink, data });
  }
  scene.text(x0 + totalM * layout.mmPerMetre + 3, y0 + 5.4, "متر", 2.2, { color: ink, data });
  scene.text(x0, y0 - 2, `مقیاس ۱:${faNumber(Math.round(1000 / layout.mmPerMetre), 0)}`, 2.4, { color: ink, data });
}

function legendToScene(
  scene: Scene,
  doc: StudioDocument,
  layout: SheetLayout,
  theme: Theme,
  options: RenderOptions,
): void {
  const ink = INK[theme];
  const used = new Set<string>();
  for (const item of renderableItems(doc)) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (definition) used.add(definition.layer);
  }
  if (options.classification && options.classification !== "all") {
    used.clear();
    for (const item of renderableItems(doc)) {
      const definition = CATALOG_BY_ID[item.catalogId];
      if (definition && definition.discipline === options.classification) used.add(definition.layer);
    }
  }
  const layers = STUDIO_LAYERS.filter((layer) => used.has(layer.id));
  if (layers.length === 0) return;
  const x = layout.areaMm.x + 4;
  const y = layout.areaMm.y + 8;
  const rows = layers.slice(0, 12);
  const data = 'data-legend="1"';
  scene.text(x, y - 3, "لایه‌ها", 2.4, { color: ink, data });
  rows.forEach((layer, index) => {
    const rowY = y + index * 4.2;
    scene.line(x, rowY, x + 6, rowY, { color: layer.color, width: Math.max(0.25, layer.weight), data });
    scene.text(x + 8, rowY + 1, layer.label, 2.2, { color: ink, data });
  });
}

function scheduleToScene(scene: Scene, doc: StudioDocument, layout: SheetLayout, theme: Theme, level: number | null): void {
  const all = schedule(doc, { visibleOnly: true, level });
  const rows = all.slice(0, 8);
  if (rows.length === 0) return;
  const ink = INK[theme];
  const { areaMm } = layout;
  const w = 62;
  const x = areaMm.x + areaMm.w - w - 3;
  const y = areaMm.y + areaMm.h - 8 - rows.length * 4.4 - 6;
  const data = 'data-schedule="1"';
  scene.rect(x, y, w, rows.length * 4.4 + 6, { color: ink, width: 0.2, data });
  scene.text(x + w - 2, y + 4, "جدول اشیا", 2.3, { anchor: "end", color: ink, data });
  rows.forEach((row, index) => {
    const rowY = y + 8 + index * 4.4;
    scene.text(x + w - 2, rowY, row.nameFa, 2.1, { anchor: "end", color: ink, data });
    scene.text(x + 2, rowY, `${row.count} ×`, 2.1, { color: ink, data });
  });
}

/** برگهٔ کامل پلان به‌صورت صحنه: کادر، محور، اشیا، برچسب‌ها، راهنما، مقیاس، جدول و کتیبه. */
export function planScene(
  doc: StudioDocument,
  options: RenderOptions = {},
): { scene: Scene; layout: SheetLayout; view: StudioDocument } {
  doc = withAxisLabels(doc);
  const theme = options.theme ?? "print";
  // فیلتر رشته در سطح «نمای سند» اعمال می‌شود تا اشیا، جدول، راهنما و عنوان
  // همه با یکدیگر هم‌خوان باشند (نه اینکه فقط هندسه حذف شود).
  const view: StudioDocument = options.classification ? { ...doc, classification: options.classification } : doc;
  const layout = sheetLayout(view, options);
  const levelFilter = options.onlyLevel === undefined ? view.currentLevel : options.onlyLevel;
  const items = renderableItems(view).filter(
    (item) => options.allLevels === true || levelFilter == null || item.level === levelFilter,
  );
  const scene = new Scene();
  if (theme === "print") scene.rect(0, 0, layout.widthMm, layout.heightMm, { fillColor: PAPER, color: PAPER, width: 0.01 });
  // کادر، سرصفحه و کتیبه پیش از محتوا رسم می‌شوند تا زیر نقشه بمانند.
  drawSheetChrome(scene, doc, layout, options, theme);
  scene.rect(layout.areaMm.x, layout.areaMm.y, layout.areaMm.w, layout.areaMm.h, {
    color: "#94a3b8",
    opacity: theme === "print" ? 1 : 0.35,
    width: 0.3,
    data: 'data-area="1"',
  });
  if (options.showGrid ?? doc.gridVisible) gridToScene(scene, layout, doc.grid, theme);

  // زیرلایهٔ مرجع: رشته‌های دیگر به‌صورت محو نمایش داده می‌شوند تا نقشه خوانا و
  // در عین حال قابل انطباق با معماری/سازه باشد (روش رایج دفاتر ایرانی).
  if (options.showContext !== false && view.classification !== "all") {
    for (const item of doc.items) {
      const definition = CATALOG_BY_ID[item.catalogId];
      if (!definition) continue;
      if (!doc.layers[definition.layer]) continue;
      if (definition.discipline === view.classification) continue;
      if (SHARED_LAYERS.has(definition.layer)) continue;
      if (options.onlyLevel != null && item.level !== options.onlyLevel) continue;
      for (const part of definition.parts) {
        partToScene(scene, part, item, layout, theme, definition.layer, {
          color: GHOST_COLOR[theme],
          // وزن/کدری محو: باید «زمینه» باشد نه «محتوا»، اما در برگهٔ رشته‌ای
          // (مثلاً تأسیسات) دیوارها و بازشوها باید دیده شوند تا لوله نسبت به
          // فضا سنجیده شود؛ با ۰٫۱۳ قبلی، فقط چند کادر شناور دیده می‌شد.
          weight: 0.2,
          forceDash: true,
          opacity: 0.62,
          data: `data-ghost="${item.id}"`,
        });
      }
    }
  }

  const labelScene = new Scene();
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const overlaps = (
    box: { x: number; y: number; w: number; h: number },
    others: { x: number; y: number; w: number; h: number }[],
  ) =>
    others.some(
      (other) =>
        Math.abs(other.x - box.x) * 2 < other.w + box.w && Math.abs(other.y - box.y) * 2 < other.h + box.h,
    );
  const collides = (box: { x: number; y: number; w: number; h: number }) => overlaps(box, placed);

  /** کادر اشغال‌شدهٔ هر شیء روی برگه (میلی‌متر) — مانع جای‌گذاری برچسب فضا. */
  const obstacles = items
    .filter((item) => !item.catalogId.startsWith("space-"))
    .map((item) => {
      const rad = (item.rotationDeg * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const hw = (item.w * cos + item.d * sin) * 0.5 * layout.mmPerMetre;
      const hh = (item.w * sin + item.d * cos) * 0.5 * layout.mmPerMetre;
      const center = spaceCenter(item, layout);
      return { x: center.x, y: center.y, w: hw * 2, h: hh * 2 };
    });

  /**
   * جای برچسب فضا: وسط فضا، سپس چند جای‌گزین بالا/چپ/راست/پایین.
   *
   * چرا: وسط خیلی از فضاها تخت یا میز است و برچسب دقیقاً روی مبلمان می‌افتد
   * (در نقشهٔ نمونه، «اتاق خواب» روی تخت). اولین گزینه‌ای انتخاب می‌شود که هم
   * داخل خود فضا بماند و هم با مبلمان/دیگر برچسب‌ها تلاقی نکند.
   */
  const spaceLabelOffset = (item: StudioItem, labelWidth: number): { dx: number; dy: number } => {
    const center = spaceCenter(item, layout);
    const halfW = (item.w * layout.mmPerMetre) / 2;
    const halfH = (item.d * layout.mmPerMetre) / 2;
    const candidates: { dx: number; dy: number }[] = [
      { dx: 0, dy: 0 },
      { dx: 0, dy: -halfH * 0.45 },
      { dx: 0, dy: halfH * 0.45 },
      { dx: -halfW * 0.35, dy: 0 },
      { dx: halfW * 0.35, dy: 0 },
      { dx: -halfW * 0.35, dy: -halfH * 0.45 },
      { dx: halfW * 0.35, dy: -halfH * 0.45 },
    ];
    const fits = (candidate: { dx: number; dy: number }) => {
      const box = { x: center.x + candidate.dx, y: center.y + candidate.dy, w: labelWidth, h: 6 };
      const inside =
        box.x - box.w / 2 >= center.x - halfW + 1 &&
        box.x + box.w / 2 <= center.x + halfW - 1 &&
        box.y - 2 >= center.y - halfH + 1 &&
        box.y + 3 <= center.y + halfH - 1;
      return inside && !overlaps(box, obstacles) && !collides(box);
    };
    for (const candidate of candidates) {
      if (fits(candidate)) return candidate;
    }
    return { dx: 0, dy: 0 };
  };
  // ترتیب رسم: ابتدا فضاها (زمینه)، سپس تجهیزات/سازه، و در پایان برچسب‌ها —
  // تا نوشته‌ها هرگز زیر مبلمان پنهان نشوند.
  const ordered = [...items].sort((a, b) => {
    const spaceA = a.catalogId.startsWith("space-") ? 0 : 1;
    const spaceB = b.catalogId.startsWith("space-") ? 0 : 1;
    return spaceA - spaceB;
  });
  for (const item of ordered) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) continue;
    const data = `data-item="${item.id}" data-catalog="${item.catalogId}" data-level="${item.level}"`;
    for (const part of definition.parts) {
      partToScene(scene, part, item, layout, theme, definition.layer, { data });
    }
    const nameLength = (item.label ?? definition.nameFa).length;
    const labelWidth = nameLength * 1.35 + 2;
    const isSpace = item.catalogId.startsWith("space-");
    let offset = { dx: 0, dy: 0 };
    if (isSpace) {
      offset = spaceLabelOffset(item, labelWidth);
    } else {
      // جابه‌جایی عمودی گام‌به‌گام تا برچسب روی برچسب دیگری نیفتد
      const center = spaceCenter(item, layout);
      for (let step = 0; step < 5; step += 1) {
        const box = { x: center.x, y: center.y + offset.dy, w: labelWidth, h: 6 };
        if (!collides(box)) break;
        offset = { dx: 0, dy: offset.dy + 2.2 };
      }
    }
    const center = spaceCenter(item, layout);
    if (itemLabelToScene(labelScene, item, definition, layout, theme, offset)) {
      placed.push({ x: center.x + offset.dx, y: center.y + offset.dy, w: labelWidth, h: 6 });
    }
  }
  scene.prims.push(...labelScene.prims);

  northArrowToScene(scene, layout, theme);
  scaleBarToScene(scene, layout, theme);
  if (options.showSchedule !== false) {
    scheduleToScene(scene, view, layout, theme, options.onlyLevel == null ? view.currentLevel : options.onlyLevel);
  }
  legendToScene(scene, view, layout, theme, options);
  return { scene, layout, view };
}

export function renderStudioSvg(doc: StudioDocument, options: RenderOptions = {}): string {
  const { scene, layout } = planScene(doc, options);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(layout.widthMm)}mm" height="${n(layout.heightMm)}mm" viewBox="0 0 ${n(layout.widthMm)} ${n(layout.heightMm)}" role="img" aria-label="${esc(classificationLabel(doc, options))} — ${esc(doc.project.name)}">
  <title>${esc(`${doc.project.name} — ${classificationLabel(doc, options)}`)}</title>
  <desc>${esc(`مقیاس 1:${Math.round(1000 / layout.mmPerMetre)} · ${ENGINE_LABEL} · ${documentFingerprint(doc)}`)}</desc>
  ${sceneSvg(scene)}
</svg>`;
}

/* ───────────────────────────── DXF ───────────────────────────── */

const DXF_COLORS: Record<string, number> = {
  walls: 7,
  structure: 1,
  foundation: 30,
  furniture: 4,
  sanitary: 5,
  kitchen: 3,
  mep: 6,
  electrical: 2,
  fire: 1,
  site: 3,
  annotation: 8,
  grid: 9,
  dimension: 8,
};

/** متن برچسب برای DXF (همان قاعدهٔ PDF). */
function dxfLabelFor(item: StudioItem, definition: (typeof CATALOG_BY_ID)[string]): string | null {
  return pdfLabelFor(item, definition);
}

/**
 * پلان به DXF (AC1015، واحد متر).
 *
 * هندسه با همان تبدیل SVG (مرکز شیء + چرخش) ساخته می‌شود تا DXF و برگهٔ چاپی
 * دقیقاً یک نقشه باشند؛ فقط y محور در DXF رو به شمال است (استاندارد نقشه).
 */
export function renderStudioDxf(doc: StudioDocument, options: RenderOptions = {}): string {
  doc = withAxisLabels(doc);
  const view: StudioDocument = options.classification ? { ...doc, classification: options.classification } : doc;
  const levelFilter = options.onlyLevel === undefined ? view.currentLevel : options.onlyLevel;
  const items = renderableItems(view).filter(
    (item) => options.allLevels === true || levelFilter == null || item.level === levelFilter,
  );

  const usedLayers = new Set<string>();
  for (const item of items) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (definition) usedLayers.add(definition.layer);
  }
  usedLayers.add("labels");
  const writer = new DxfWriter(
    [...usedLayers].map((layer) => ({ name: layer.toUpperCase(), color: DXF_COLORS[layer] ?? 7 })),
  );

  /**
   * نقشه به‌صورت **بلوک** نوشته می‌شود، نه خط‌های پراکنده.
   *
   * چرا: در اتوکد، مبل/ستون/در باید یک «بلوک» باشد تا کاربر بتواند انتخابش
   * کند، جابه‌جا کند و نمونه‌های دیگرش را با یک کلیک عوض کند. قبلاً هر شیء به
   * چند خط و دایره شکسته می‌شد و ویرایش نقشه عملاً ناممکن بود.
   *
   * هر کلید بلوک = (شناسهٔ شیء + اندازهٔ واقعی)؛ بلوک در مقیاس ۱ و در متر
   * ساخته می‌شود تا دایره‌ها بیضی نشوند و اندازه‌گیری در اتوکد همان اندازهٔ
   * واقعی باشد. هندسهٔ داخل بلوک حول مرکز و **آینه‌شده در محور Y** است
   * (مختصات اشیای کتابخانه از بالا به پایین است)؛ درج با چرخش منفی همان
   * تبدیل نقشهٔ برداری را بازتولید می‌کند.
   */
  const blockKey = (item: (typeof items)[number], id: string): string =>
    `${id}@${item.w.toFixed(3)}x${item.d.toFixed(3)}`;
  const blockName = (key: string): string => `HERMI_${key.replace(/[^A-Za-z0-9_]+/g, "_").toUpperCase()}`;

  /** یک جزء را با نقش مختصات داده‌شده می‌نویسد (برای بلوک یا انفجار). */
  const emitPart = (
    writerRef: DxfWriter,
    part: (typeof CATALOG_BY_ID)[string]["parts"][number],
    itemWidth: number,
    itemDepth: number,
    map: (lx: number, ly: number) => [number, number],
    layer: string,
  ): void => {
    if (part.kind === "rect") {
      const x0 = (part.x - 0.5) * itemWidth;
      const y0 = (part.y - 0.5) * itemDepth;
      const x1 = x0 + part.w * itemWidth;
      const y1 = y0 + part.h * itemDepth;
      writerRef.polyline([map(x0, y0), map(x1, y0), map(x1, y1), map(x0, y1)], layer);
    } else if (part.kind === "circle") {
      const center = map((part.cx - 0.5) * itemWidth, (part.cy - 0.5) * itemDepth);
      writerRef.circle(center[0], center[1], part.r * Math.min(itemWidth, itemDepth) * 0.5, layer);
    } else if (part.kind === "mline") {
      const a = map(part.x1, part.y1);
      const b = map(part.x2, part.y2);
      writerRef.line(a[0], a[1], b[0], b[1], layer);
    } else if (part.kind === "marc") {
      const steps = 16;
      const points: [number, number][] = [];
      for (let i = 0; i <= steps; i += 1) {
        const angle = ((part.from + ((part.to - part.from) * i) / steps) * Math.PI) / 180;
        points.push(map(part.cx + part.r * Math.cos(angle), part.cy + part.r * Math.sin(angle)));
      }
      for (let i = 0; i < points.length - 1; i += 1) {
        writerRef.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], layer);
      }
    } else if (part.kind === "poly") {
      const points = part.points.map(([u, v]) => map((u - 0.5) * itemWidth, (v - 0.5) * itemDepth));
      if (part.closed === false) {
        for (let i = 0; i < points.length - 1; i += 1) {
          writerRef.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], layer);
        }
      } else {
        writerRef.polyline(points, layer);
      }
    } else {
      const a = map((part.x1 - 0.5) * itemWidth, (part.y1 - 0.5) * itemDepth);
      const b = map((part.x2 - 0.5) * itemWidth, (part.y2 - 0.5) * itemDepth);
      writerRef.line(a[0], a[1], b[0], b[1], layer);
    }
  };

  // ۱) تعریف بلوک‌ها
  const definedBlocks = new Map<string, { id: string; w: number; d: number; layer: string }>();
  for (const item of items) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) continue;
    const key = blockKey(item, definition.id);
    if (definedBlocks.has(key)) continue;
    definedBlocks.set(key, { id: definition.id, w: item.w, d: item.d, layer: definition.layer.toUpperCase() });
  }
  for (const [key, entry] of definedBlocks) {
    const definition = CATALOG_BY_ID[entry.id];
    if (!definition) continue;
    writer.beginBlock(blockName(key));
    // محلی (حول مرکز) و آینه‌شده در Y
    const mirror = (lx: number, ly: number): [number, number] => [lx, -ly];
    for (const part of definition.parts) emitPart(writer, part, entry.w, entry.d, mirror, entry.layer);
    writer.endBlock();
  }

  // ۲) درج نمونه‌ها + برچسب
  for (const item of items) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) continue;
    const layer = definition.layer.toUpperCase();
    const key = blockKey(item, definition.id);
    if (definedBlocks.has(key)) {
      writer.insert(blockName(key), item.x, item.y, 1, 1, -item.rotationDeg, layer);
    } else {
      // مسیر پشتیبان: اگر بلوک ساخته نشد، هندسه انفجار می‌شود (نقشه نباید ناقص بماند)
      const rad = (item.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const map = (lx: number, ly: number): [number, number] => [item.x + (lx * cos - ly * sin), item.y - (lx * sin + ly * cos)];
      for (const part of definition.parts) emitPart(writer, part, item.w, item.d, map, layer);
    }
    // نام لاتین فقط برای اقلامی که برچسب فارسی ندارند؛ وگرنه متن تکراری روی نقشه
    // می‌نشیند و انتخاب/ویرایش در اتوکد را شلوغ می‌کند.
    if (!dxfLabelFor(item, definition)) {
      writer.text(item.x, item.y - item.d / 2 - 0.1, 0.2, definition.nameEn.replace(/[^\x20-\x7E]/g, ""), layer);
    }
  }

  // برچسب‌های فارسی: DXF (R2000) کدگذاری تک‌بایتی دارد؛ متن فارسی به‌صورت
  // دنبالهٔ \U+XXXX و با شکل نمایشی درست نوشته می‌شود تا در اتوکد/ب‌ریک‌کد
  // خوانا باشد (روش استاندارد انتقال یونیکد در DXF).
  for (const item of items) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) continue;
    const text = dxfLabelFor(item, definition);
    if (!text) continue;
    // برچسب فضا در مرکز فضا (مثل برگهٔ چاپی) و بقیهٔ برچسب‌ها کمی زیر شیء، تا
    // متن‌ها روی خطوط نقشه نیفتند.
    const isSpace = item.catalogId.startsWith("space-");
    const y = isSpace ? item.y + 0.2 : item.y - item.d / 2 - 0.12;
    writer.text(item.x, y, isSpace ? 0.25 : 0.2, dxfText(text), "LABELS");
  }

  return writer.build();
}

/* ───────────────────────────── PDF ───────────────────────────── */

const MM_TO_PT = 72 / 25.4;

const ascii = (value: string): string => value.replace(/[^\x20-\x7E]/g, "");

/** پیشوند یونیکد DXF (بک‌اسلش + U+) بدون درگیری با escape رشته‌ها. */
const DXF_UNICODE = String.fromCharCode(92) + "U+";

function pdfEscape(value: string): string {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * نویسندهٔ PDF برداری مینیمال با فونت Base-14 (متن لاتین).
 *
 * صفحه‌ها با ابعاد واقعی برگه ساخته می‌شوند و هر صفحه محتوای مستقل خود (یک طبقه،
 * یک رشته) را دارد. متن فارسی در PDF جاسازی نمی‌شود (محدودیت اعلام‌شده)؛ نسخهٔ
 * فارسی‌کامل با SVG/چاپ مرورگر در دسترس است.
 */
interface PdfPageSpec {
  level: number | null;
  classification: StudioDocument["classification"];
  caption: string;
}

function buildPdfPage(
  doc: StudioDocument,
  options: RenderOptions,
  spec: PdfPageSpec,
  text: PdfText,
): { ops: string[]; layout: SheetLayout } {
  // صفحهٔ PDF همان صحنهٔ برگهٔ SVG است (کادر، محور، راهنما، جدول، کتیبه) که به
  // عملگرهای برداری تبدیل می‌شود؛ تفاوت تنها در خاکستری‌شدن رنگ‌ها و جاسازی
  // فونت فارسی است.
  const pageOptions: RenderOptions = {
    ...options,
    theme: "print",
    classification: spec.classification,
    onlyLevel: spec.level,
  };
  const { scene, layout } = planScene(doc, pageOptions);
  return { ops: scenePdfOps(scene, layout.heightMm, text), layout };
}

export function renderStudioPdf(doc: StudioDocument, options: RenderOptions = {}): Uint8Array {
  doc = withAxisLabels(doc);
  const text = new PdfText(loadTypeface("regular"), loadTypeface("bold"));
  const classification = options.classification ?? doc.classification;
  const caption = `${classificationLabel(doc, { classification })}`;
  const page = buildPdfPage(doc, options, {
    level: options.onlyLevel == null ? doc.currentLevel : options.onlyLevel,
    classification,
    caption,
  }, text);
  return assemblePdf([page], text, doc);
}

export interface PdfBundleOptions {
  /** همهٔ طبقات یا فقط طبقهٔ جاری */
  allLevels?: boolean;
  /** همهٔ رشته‌ها یا فقط رشتهٔ انتخاب‌شده */
  allClassifications?: boolean;
}

/**
 * PDF چندبرگی: یک صفحه برای هر ترکیب (طبقه × رشته).
 * این همان «رندر هماهنگ طبق طبقه‌بندی» است که برای ارائه و کنترل استفاده می‌شود.
 */
export function renderStudioPdfBundle(doc: StudioDocument, options: PdfBundleOptions = {}): { pdf: Uint8Array; pages: number } {
  doc = withAxisLabels(doc);
  const text = new PdfText(loadTypeface("regular"), loadTypeface("bold"));
  const levels = options.allLevels === false ? [doc.currentLevel] : Array.from({ length: doc.levels }, (_, index) => index);
  const classifications: StudioDocument["classification"][] =
    options.allClassifications === false
      ? [doc.classification]
      : ["all", "architecture", "structure", "mechanical", "electrical", "plumbing", "fire", "site"];
  const pages: { ops: string[]; layout: SheetLayout }[] = [];
  for (const level of levels) {
    for (const classification of classifications) {
      const levelItems = renderableItems({ ...doc, classification }).filter((item) => item.level === level);
      // صفحهٔ خالی چاپ نمی‌شود: فقط ترکیب‌هایی که روی آن طبقه واقعاً محتوا دارند.
      if (levelItems.length === 0) continue;
      pages.push(
        buildPdfPage(doc, { classification }, {
          level,
          classification,
          caption: classificationLabel(doc, { classification }),
        }, text),
      );
    }
  }
  if (pages.length === 0) {
    pages.push(
      buildPdfPage(doc, {}, { level: doc.currentLevel, classification: doc.classification, caption: "پلان" }, text),
    );
  }
  return { pdf: assemblePdf(pages, text, doc), pages: pages.length };
}

/* ───────────────────────────── CSV / JSON ───────────────────────────── */

export function studioScheduleCsv(doc: StudioDocument): string {
  const rows = schedule(doc);
  const header = ["ردیف", "کد کتابخانه", "نام شیء", "دسته", "رشته", "تعداد", "مساحت واحد (m²)", "مساحت کل (m²)", "کلاس IFC"];
  const lines = rows.map((row, index) => [
    String(index + 1),
    row.catalogId,
    row.nameFa,
    row.category,
    row.discipline,
    String(row.count),
    row.areaM2.toFixed(2),
    row.totalAreaM2.toFixed(2),
    row.ifcClass,
  ]);
  const escapeCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `\uFEFF${[header, ...lines].map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
}

export function studioItemsCsv(doc: StudioDocument): string {
  const header = ["id", "catalogId", "name", "discipline", "layer", "level", "x", "y", "w", "d", "rotation"];
  const lines = doc.items.map((item) => {
    const definition = CATALOG_BY_ID[item.catalogId];
    return [
      item.id,
      item.catalogId,
      definition?.nameFa ?? "?",
      definition?.discipline ?? "?",
      definition?.layer ?? "?",
      String(item.level + 1),
      item.x.toFixed(3),
      item.y.toFixed(3),
      item.w.toFixed(3),
      item.d.toFixed(3),
      String(item.rotationDeg),
    ];
  });
  const escapeCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `\uFEFF${[header, ...lines].map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
}

export function studioJson(doc: StudioDocument): string {
  return JSON.stringify(
    {
      document: doc,
      summary: {
        fingerprint: documentFingerprint(doc),
        engine: ENGINE_LABEL,
        scale: `1:${doc.sheet.scale}`,
        sheet: doc.sheet,
        items: doc.items.length,
      },
      schedule: schedule(doc),
    },
    null,
    2,
  );
}

export const STUDIO_FORMATS = [
  "svg",
  "pdf",
  "dxf",
  "csv",
  "items-csv",
  "json",
  "pdf-bundle",
  "xlsx",
  "ifc",
  "elevations",
  "section",
  "elevations-pdf",
  "section-pdf",
  "details",
  "details-pdf",
  "details-dxf",
  "arch-details",
  "arch-details-pdf",
  "arch-details-dxf",
  "slab-rebar",
  "slab-rebar-pdf",
  "schedules",
  "schedules-pdf",
  "elevations-dxf",
  "section-dxf",
] as const;
export type StudioFormat = (typeof STUDIO_FORMATS)[number];

export function exportStudio(
  doc: StudioDocument,
  format: StudioFormat,
  options: RenderOptions = {},
): { filename: string; mime: string; data: Buffer } {
  const base = `${doc.project.code || "hermicad"}-${doc.sheet.format}-${doc.currentLevel + 1}`;
  switch (format) {
    case "svg":
      return { filename: `${base}.svg`, mime: "image/svg+xml; charset=utf-8", data: Buffer.from(renderStudioSvg(doc, options), "utf8") };
    case "pdf":
      return { filename: `${base}.pdf`, mime: "application/pdf", data: Buffer.from(renderStudioPdf(doc, options)) };
    case "pdf-bundle": {
      const bundle = renderStudioPdfBundle(doc);
      return {
        filename: `${doc.project.code || "hermicad"}-all-levels-disciplines.pdf`,
        mime: "application/pdf",
        data: Buffer.from(bundle.pdf),
      };
    }
    case "dxf":
      return { filename: `${base}.dxf`, mime: "application/dxf", data: Buffer.from(renderStudioDxf(doc, options), "utf8") };
    case "csv":
      return { filename: `${base}-schedule.csv`, mime: "text/csv; charset=utf-8", data: Buffer.from(studioScheduleCsv(doc), "utf8") };
    case "items-csv":
      return { filename: `${base}-items.csv`, mime: "text/csv; charset=utf-8", data: Buffer.from(studioItemsCsv(doc), "utf8") };
    case "json":
      return { filename: `${base}.json`, mime: "application/json; charset=utf-8", data: Buffer.from(studioJson(doc), "utf8") };
    case "xlsx":
      return {
        filename: `${doc.project.code || "hermicad"}-metre.xlsx`,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        data: Buffer.from(studioXlsx(doc)),
      };
    case "ifc":
      return { filename: `${doc.project.code || "hermicad"}.ifc`, mime: "application/x-step", data: Buffer.from(studioIfc(doc), "utf8") };
    case "elevations":
      return {
        filename: `${base}-elevations.svg`,
        mime: "image/svg+xml; charset=utf-8",
        data: Buffer.from(renderStudioElevationSheet(doc), "utf8"),
      };
    case "section":
      return {
        filename: `${base}-section.svg`,
        mime: "image/svg+xml; charset=utf-8",
        data: Buffer.from(renderStudioVertical(doc, { direction: "west", sectionAt: options.sectionAt ?? 6, sectionWidth: options.sectionWidth ?? 1.2 }), "utf8"),
      };
    case "elevations-pdf": {
      const bundle = renderStudioElevationsPdf(doc, options.sectionAt ?? 6, options.sectionWidth ?? 1.2);
      return {
        filename: `${base}-elevations-section.pdf`,
        mime: "application/pdf",
        data: Buffer.from(bundle.pdf),
      };
    }
    case "schedules":
      return {
        filename: `${base}-schedules.svg`,
        mime: "image/svg+xml; charset=utf-8",
        data: Buffer.from(renderStudioScheduleSheet(doc), "utf8"),
      };
    case "schedules-pdf":
      return {
        filename: `${base}-schedules.pdf`,
        mime: "application/pdf",
        data: Buffer.from(renderStudioSchedulePdf(doc)),
      };
    case "slab-rebar":
      return {
        filename: `${base}-slab-rebar.svg`,
        mime: "image/svg+xml; charset=utf-8",
        data: Buffer.from(renderStudioSlabRebarSheet(doc), "utf8"),
      };
    case "slab-rebar-pdf":
      return {
        filename: `${base}-slab-rebar.pdf`,
        mime: "application/pdf",
        data: Buffer.from(renderStudioSlabRebarPdf(doc)),
      };
    case "details":
      return {
        filename: `${base}-structural-details.svg`,
        mime: "image/svg+xml; charset=utf-8",
        data: Buffer.from(renderStudioDetailSheet(doc), "utf8"),
      };
    case "details-pdf":
      return {
        filename: `${base}-structural-details.pdf`,
        mime: "application/pdf",
        data: Buffer.from(renderStudioDetailPdf(doc)),
      };
    case "details-dxf":
      return {
        filename: `${base}-structural-details.dxf`,
        mime: "application/dxf",
        data: Buffer.from(renderStudioDetailDxf(doc), "utf8"),
      };
    case "arch-details":
      return {
        filename: `${base}-arch-details.svg`,
        mime: "image/svg+xml; charset=utf-8",
        data: Buffer.from(renderStudioArchDetailSheet(doc), "utf8"),
      };
    case "arch-details-pdf":
      return {
        filename: `${base}-arch-details.pdf`,
        mime: "application/pdf",
        data: Buffer.from(renderStudioArchDetailPdf(doc)),
      };
    case "arch-details-dxf":
      return {
        filename: `${base}-arch-details.dxf`,
        mime: "application/dxf",
        data: Buffer.from(renderStudioArchDetailDxf(doc), "utf8"),
      };
    case "elevations-dxf":
      return {
        filename: `${base}-elevations.dxf`,
        mime: "application/dxf",
        data: Buffer.from(
          studioVerticalDxf(doc, [
            { direction: "south" },
            { direction: "north" },
            { direction: "east" },
            { direction: "west" },
          ]),
          "utf8",
        ),
      };
    case "section-dxf":
      return {
        filename: `${base}-section.dxf`,
        mime: "application/dxf",
        data: Buffer.from(
          studioVerticalDxf(doc, [
            { direction: "west", sectionAt: options.sectionAt ?? 6, sectionWidth: options.sectionWidth ?? 1.2, title: "برش A-A" },
          ]),
          "utf8",
        ),
      };
    case "section-pdf":
      return {
        filename: `${base}-section.pdf`,
        mime: "application/pdf",
        data: Buffer.from(
          renderStudioVerticalPdf(doc, { direction: "west", sectionAt: options.sectionAt ?? 6, sectionWidth: options.sectionWidth ?? 1.2 }),
        ),
      };
  }
}

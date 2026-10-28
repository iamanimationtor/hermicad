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
import {
  documentBounds,
  documentFingerprint,
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
export const ENGINE_LABEL = "hermicad-studio/1.0";

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
  onlyLevel?: number | null;
  /** نمایش محو رشته‌های دیگر به‌عنوان مرجع (پیش‌فرض: روشن) */
  showContext?: boolean;
}

export interface SheetLayout {
  widthMm: number;
  heightMm: number;
  areaMm: { x: number; y: number; w: number; h: number };
  titleBlock: { x: number; y: number; w: number; h: number };
  mmPerMetre: number;
  requestedScale: number;
  fitted: boolean;
  bounds: { x: number; y: number; w: number; h: number };
}

const MARGIN = 10;
const TITLE_H = 34;

export function sheetLayout(doc: StudioDocument, options: RenderOptions = {}): SheetLayout {
  const sheet = sheetSizeMm(doc);
  const titleBlock = {
    x: MARGIN,
    y: sheet.h - MARGIN - TITLE_H,
    w: sheet.w - MARGIN * 2,
    h: TITLE_H,
  };
  const areaMm = {
    x: MARGIN,
    y: MARGIN,
    w: sheet.w - MARGIN * 2,
    h: sheet.h - MARGIN * 2 - TITLE_H - 4,
  };
  const bounds = documentBounds(doc);
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

function partToSvg(
  part: Part,
  item: StudioItem,
  layout: SheetLayout,
  theme: Theme,
  layer: StudioLayerId,
  override: PartOverride = {},
): string {
  const transform = itemTransform(item, layout);
  const fill = FILL_TOKENS[theme][part.fill ?? "none"] ?? "none";
  const stroke = override.stroke ?? STROKE[theme][layer] ?? "#0f172a";
  const weight = override.weight ?? (LAYER_BY_ID[layer]?.weight ?? 0.2) * (part.thick ? 1.8 : 1);
  const dashed = override.forceDash ? true : part.dashed;
  const dash = dashed ? ` stroke-dasharray="${n(Math.max(0.6, weight * 5))} ${n(Math.max(0.4, weight * 3))}"` : "";
  const opacity = part.opacity != null ? ` fill-opacity="${part.opacity}"` : "";
  const common = `fill="${fill}"${opacity} stroke="${stroke}" stroke-width="${n(weight)}"${dash}`;
  const w = item.w;
  const d = item.d;
  switch (part.kind) {
    case "rect": {
      const x0 = (part.x - 0.5) * w;
      const y0 = (part.y - 0.5) * d;
      const x1 = x0 + part.w * w;
      const y1 = y0 + part.h * d;
      const points = [
        transform.map(x0, y0),
        transform.map(x1, y0),
        transform.map(x1, y1),
        transform.map(x0, y1),
      ]
        .map((point) => `${n(point.x)},${n(point.y)}`)
        .join(" ");
      return `<polygon points="${points}" ${common}/>`;
    }
    case "circle": {
      const center = transform.map((part.cx - 0.5) * w, (part.cy - 0.5) * d);
      const radius = part.r * Math.min(item.w, item.d) * 0.5 * layout.mmPerMetre;
      return `<circle cx="${n(center.x)}" cy="${n(center.y)}" r="${n(radius)}" ${common}/>`;
    }
    case "poly": {
      const points = part.points
        .map(([u, v]) => transform.map((u - 0.5) * w, (v - 0.5) * d))
        .map((point) => `${n(point.x)},${n(point.y)}`)
        .join(" ");
      if (part.closed === false) {
        return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${n(weight)}"${dash}/>`;
      }
      return `<polygon points="${points}" ${common}/>`;
    }
    case "mline": {
      const a = transform.map(part.x1, part.y1);
      const b = transform.map(part.x2, part.y2);
      const lineStyle = `stroke="${stroke}" stroke-width="${n(weight)}"${dash}`;
      return `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" fill="none" ${lineStyle}/>`;
    }
    case "marc": {
      const steps = 16;
      const points: string[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const angle = ((part.from + ((part.to - part.from) * i) / steps) * Math.PI) / 180;
        const point = transform.map(part.cx + part.r * Math.cos(angle), part.cy + part.r * Math.sin(angle));
        points.push(`${n(point.x)},${n(point.y)}`);
      }
      return `<polyline points="${points.join(" ")}" fill="none" stroke="${stroke}" stroke-width="${n(weight)}"${dash}/>`;
    }
    case "line": {
      const a = transform.map((part.x1 - 0.5) * w, (part.y1 - 0.5) * d);
      const b = transform.map((part.x2 - 0.5) * w, (part.y2 - 0.5) * d);
      const lineStyle = `stroke="${stroke}" stroke-width="${n(weight)}"${dash}`;
      return `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" fill="none" ${lineStyle}/>`;
    }
  }
}

/**
 * برچسب شیء فقط روی اقلام «قابل نام‌گذاری» نوشته می‌شود؛ برچسب روی دیوار و ستون
 * و نماد، نقشه را شلوغ می‌کند و در نقشهٔ اجرایی هم مرسوم نیست.
 */
const LABELLED_CATEGORIES = new Set(["seating", "dining", "bedroom", "kitchen", "sanitary", "laundry", "office", "retail", "healthcare", "education", "hospitality", "industrial", "mep"]);

const SPACE_IDS = new Set(["space-room", "space-terrace", "space-shaft"]);

function itemLabelSvg(item: StudioItem, definition: (typeof CATALOG_BY_ID)[string], layout: SheetLayout, theme: Theme): string {
  if (theme === "screen") return "";
  if (SPACE_IDS.has(item.catalogId)) {
    const { origin } = itemTransform(item, layout);
    const area = (item.w * item.d).toFixed(1);
    const name = item.label?.trim() || (item.catalogId === "space-terrace" ? "تراس" : item.catalogId === "space-shaft" ? "شفت" : "فضا");
    const size = 2.4;
    return `<g data-space="${esc(item.id)}"><text direction="rtl" x="${n(origin.x)}" y="${n(origin.y - 0.6)}" font-size="${size}" text-anchor="middle" fill="#0f172a" font-family="Vazirmatn, Tahoma, sans-serif">${esc(name)}</text><text direction="rtl" x="${n(origin.x)}" y="${n(origin.y + 2.2)}" font-size="${size - 0.3}" text-anchor="middle" fill="#334155" font-family="Vazirmatn, Tahoma, sans-serif">${area} m²</text></g>`;
  }
  if (item.catalogId === "dim-linear") {
    const { origin } = itemTransform(item, layout);
    return `<text direction="rtl" x="${n(origin.x)}" y="${n(origin.y - 1.2)}" font-size="2.3" text-anchor="middle" fill="#0f172a" font-family="Vazirmatn, Tahoma, sans-serif">${item.w.toFixed(2)} m</text>`;
  }
  if (!LABELLED_CATEGORIES.has(definition.category) && !item.label) return "";
  // برچسب فقط برای اقلامی که جای کافی دارند؛ در غیر این صورت نقشه شلوغ می‌شود.
  const minSide = Math.min(item.w, item.d);
  if (!item.label && (minSide < 0.75 || item.w * item.d < 0.4)) return "";
  const widthMm = minSide * layout.mmPerMetre;
  if (!item.label && widthMm < 9) return "";
  const { origin } = itemTransform(item, layout);
  const name = item.label ?? definition.nameFa;
  if (!name) return "";
  const size = Math.max(1.5, Math.min(2.2, Math.min(item.w, item.d) * layout.mmPerMetre * 0.2));
  return `<text direction="rtl" x="${n(origin.x)}" y="${n(origin.y + size * 0.35)}" font-size="${n(size)}" text-anchor="middle" fill="#0f172a" font-family="Vazirmatn, Tahoma, sans-serif" opacity="0.8">${esc(name)}</text>`;
}

function gridSvg(layout: SheetLayout, grid: number, theme: Theme): string {
  if (!grid || grid <= 0) return "";
  const step = grid * layout.mmPerMetre;
  if (step < 4) return "";
  const { areaMm, bounds } = layout;
  const drawW = bounds.w * layout.mmPerMetre;
  const drawH = bounds.h * layout.mmPerMetre;
  const offsetX = areaMm.x + (areaMm.w - drawW) / 2;
  const offsetY = areaMm.y + (areaMm.h - drawH) / 2;
  const color = theme === "print" ? "#e2e8f0" : "rgba(148,163,184,0.14)";
  const lines: string[] = [];
  for (let x = 0; x <= drawW + 0.01; x += step) {
    lines.push(`<line x1="${n(offsetX + x)}" y1="${n(offsetY)}" x2="${n(offsetX + x)}" y2="${n(offsetY + drawH)}" stroke="${color}" stroke-width="0.1"/>`);
  }
  for (let y = 0; y <= drawH + 0.01; y += step) {
    lines.push(`<line x1="${n(offsetX)}" y1="${n(offsetY + y)}" x2="${n(offsetX + drawW)}" y2="${n(offsetY + y)}" stroke="${color}" stroke-width="0.1"/>`);
  }
  return `<g data-grid="1">${lines.join("")}</g>`;
}

function titleBlockSvg(doc: StudioDocument, layout: SheetLayout, options: RenderOptions, theme: Theme): string {
  if (options.showTitleBlock === false) return "";
  const block = layout.titleBlock;
  const ink = theme === "print" ? "#0f172a" : "#cbd5e1";
  const muted = theme === "print" ? "#475569" : "#94a3b8";
  const bg = theme === "print" ? "#ffffff" : "rgba(15,23,42,0.55)";
  const effectiveScale = Math.round(1000 / layout.mmPerMetre);
  const scaleText = layout.fitted ? `1:${effectiveScale} (تنظیم خودکار)` : `1:${doc.sheet.scale}`;
  const sheetSub = `${doc.sheet.format} · ${doc.sheet.orientation === "landscape" ? "افقی" : "عمودی"}${layout.fitted ? ` · درخواست 1:${layout.requestedScale}` : ""}`;
  const cols = [
    { w: 0.34, title: "پروژه", value: doc.project.name, sub: `${doc.project.code} · کارفرما: ${doc.project.client || "—"}` },
    { w: 0.24, title: "نقشه", value: classificationLabel(doc, options), sub: `طبقه: ${doc.currentLevel + 1} از ${doc.levels} · تجدیدنظر ${doc.revision}` },
    { w: 0.18, title: "مقیاس و برگه", value: scaleText, sub: sheetSub },
    { w: 0.24, title: "کنترل", value: doc.project.designer || "—", sub: `تاریخ: ${doc.project.date} · ${documentFingerprint(doc)}` },
  ];
  const parts: string[] = [
    `<rect x="${n(block.x)}" y="${n(block.y)}" width="${n(block.w)}" height="${n(block.h)}" fill="${bg}" stroke="${ink}" stroke-width="0.45"/>`,
  ];
  let cursor = block.x;
  const clamp = (text: string, maxMm: number, sizeMm: number): string => {
    const maxChars = Math.max(4, Math.floor(maxMm / (sizeMm * 0.52)));
    return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
  };
  for (const col of cols) {
    const width = block.w * col.w;
    const value = clamp(col.value, width - 5, 4);
    const sub = clamp(col.sub, width - 5, 2.4);
    parts.push(`<line x1="${n(cursor)}" y1="${n(block.y)}" x2="${n(cursor)}" y2="${n(block.y + block.h)}" stroke="${ink}" stroke-width="0.25"/>`);
    parts.push(
      `<text direction="rtl" x="${n(cursor + width - 2.5)}" y="${n(block.y + 6)}" font-size="2.5" text-anchor="end" fill="${muted}" font-family="Vazirmatn, Tahoma, sans-serif">${esc(col.title)}</text>`,
      `<text direction="rtl" x="${n(cursor + width - 2.5)}" y="${n(block.y + 14)}" font-size="4" text-anchor="end" fill="${ink}" font-family="Vazirmatn, Tahoma, sans-serif" font-weight="600">${esc(value)}</text>`,
      `<text direction="rtl" x="${n(cursor + width - 2.5)}" y="${n(block.y + 21)}" font-size="2.4" text-anchor="end" fill="${muted}" font-family="Vazirmatn, Tahoma, sans-serif">${esc(sub)}</text>`,
    );
    cursor += width;
  }
  parts.push(
    `<text direction="rtl" x="${n(block.x + 2.5)}" y="${n(block.y + block.h - 2.5)}" font-size="2.2" fill="${muted}" font-family="Vazirmatn, Tahoma, sans-serif">${esc(
      `${ENGINE_LABEL} · ${doc.project.note}`,
    )}</text>`,
  );
  return `<g data-title-block="1">${parts.join("")}</g>`;
}

function northArrowSvg(layout: SheetLayout, theme: Theme): string {
  const { areaMm } = layout;
  const cx = areaMm.x + areaMm.w - 14;
  const cy = areaMm.y + 16;
  const ink = theme === "print" ? "#0f172a" : "#cbd5e1";
  return `<g transform="translate(${n(cx)},${n(cy)})" data-north="1">
    <circle r="6" fill="none" stroke="${ink}" stroke-width="0.25"/>
    <polygon points="0,-5.2 1.6,2.2 0,1.1 -1.6,2.2" fill="${ink}"/>
    <text direction="rtl" y="-7" font-size="2.6" text-anchor="middle" fill="${ink}" font-family="Vazirmatn, Tahoma, sans-serif">شمال</text>
  </g>`;
}

function scaleBarSvg(layout: SheetLayout, theme: Theme): string {
  const { areaMm } = layout;
  const x0 = areaMm.x + 4;
  const y0 = areaMm.y + areaMm.h - 8;
  const totalM = 5;
  const segM = 1;
  const ink = theme === "print" ? "#0f172a" : "#cbd5e1";
  const segs: string[] = [];
  for (let i = 0; i < totalM / segM; i += 1) {
    const x = x0 + i * segM * layout.mmPerMetre;
    const w = segM * layout.mmPerMetre;
    segs.push(
      `<rect x="${n(x)}" y="${n(y0)}" width="${n(w)}" height="2" fill="${i % 2 === 0 ? ink : "none"}" stroke="${ink}" stroke-width="0.2"/>`,
      `<text direction="rtl" x="${n(x)}" y="${n(y0 + 5.4)}" font-size="2.2" text-anchor="middle" fill="${ink}" font-family="Vazirmatn, Tahoma, sans-serif">${i}</text>`,
    );
  }
  segs.push(
    `<text direction="rtl" x="${n(x0 + totalM * layout.mmPerMetre + 3)}" y="${n(y0 + 5.4)}" font-size="2.2" fill="${ink}" font-family="Vazirmatn, Tahoma, sans-serif">متر</text>`,
    `<text direction="rtl" x="${n(x0)}" y="${n(y0 - 2)}" font-size="2.4" fill="${ink}" font-family="Vazirmatn, Tahoma, sans-serif">مقیاس ${n(1000 / layout.mmPerMetre) === "0" ? "—" : `1:${Math.round(1000 / layout.mmPerMetre)}`}</text>`,
  );
  return `<g data-scale-bar="1">${segs.join("")}</g>`;
}

function legendSvg(doc: StudioDocument, layout: SheetLayout, theme: Theme, options: RenderOptions): string {
  const ink = theme === "print" ? "#0f172a" : "#cbd5e1";
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
  if (layers.length === 0) return "";
  const x = layout.areaMm.x + 4;
  const y = layout.areaMm.y + 8;
  const rows = layers.slice(0, 12);
  const parts = `<text direction="rtl" x="${n(x)}" y="${n(y - 3)}" font-size="2.4" fill="${ink}" font-family="Vazirmatn, Tahoma, sans-serif">لایه‌ها</text>` +
    rows
      .map((layer, index) => {
        const rowY = y + index * 4.2;
        return `<line x1="${n(x)}" y1="${n(rowY)}" x2="${n(x + 6)}" y2="${n(rowY)}" stroke="${layer.color}" stroke-width="${n(Math.max(0.25, layer.weight))}"/>
          <text direction="rtl" x="${n(x + 8)}" y="${n(rowY + 1)}" font-size="2.2" fill="${ink}" font-family="Vazirmatn, Tahoma, sans-serif">${esc(layer.label)}</text>`;
      })
      .join("");
  return `<g data-legend="1">${parts}</g>`;
}

function scheduleSvg(doc: StudioDocument, layout: SheetLayout, theme: Theme, level: number | null): string {
  const all = schedule(doc, { visibleOnly: true, level });
  const rows = all.slice(0, 8);
  if (rows.length === 0) return "";
  const total = all.reduce((sum, row) => sum + row.count, 0);
  const ink = theme === "print" ? "#0f172a" : "#cbd5e1";
  const { areaMm } = layout;
  const w = 62;
  const x = areaMm.x + areaMm.w - w - 3;
  const y = areaMm.y + areaMm.h - 8 - rows.length * 4.4 - 6;
  const lines: string[] = [
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(rows.length * 4.4 + 6)}" fill="none" stroke="${ink}" stroke-width="0.2"/>`,
    `<text direction="rtl" x="${n(x + w - 2)}" y="${n(y + 4)}" font-size="2.3" text-anchor="end" fill="${ink}" font-family="Vazirmatn, Tahoma, sans-serif">جدول اشیا</text>`,
  ];
  rows.forEach((row, index) => {
    const rowY = y + 8 + index * 4.4;
    lines.push(
      `<text direction="rtl" x="${n(x + w - 2)}" y="${n(rowY)}" font-size="2.1" text-anchor="end" fill="${ink}" font-family="Vazirmatn, Tahoma, sans-serif">${esc(row.nameFa)}</text>`,
      `<text direction="rtl" x="${n(x + 2)}" y="${n(rowY)}" font-size="2.1" fill="${ink}" font-family="Vazirmatn, Tahoma, sans-serif">${row.count} ×</text>`,
    );
  });
  return `<g data-schedule="1">${lines.join("")}</g>`;
}

export function renderStudioSvg(doc: StudioDocument, options: RenderOptions = {}): string {
  const theme = options.theme ?? "print";
  // فیلتر رشته در سطح «نمای سند» اعمال می‌شود تا اشیا، جدول، راهنما و عنوان
  // همه با یکدیگر هم‌خوان باشند (نه اینکه فقط هندسه حذف شود).
  const view: StudioDocument = options.classification ? { ...doc, classification: options.classification } : doc;
  const layout = sheetLayout(view, options);
  const items = renderableItems(view).filter((item) => options.onlyLevel == null || item.level === options.onlyLevel);
  const body: string[] = [];
  if (theme === "print") {
    body.push(`<rect x="0" y="0" width="${n(layout.widthMm)}" height="${n(layout.heightMm)}" fill="${PAPER}"/>`);
  }
  body.push(
    `<rect x="${n(layout.areaMm.x)}" y="${n(layout.areaMm.y)}" width="${n(layout.areaMm.w)}" height="${n(layout.areaMm.h)}" fill="none" stroke="${theme === "print" ? "#94a3b8" : "rgba(148,163,184,0.35)"}" stroke-width="0.3"/>`,
  );
  if (options.showGrid ?? doc.gridVisible) body.push(gridSvg(layout, doc.grid, theme));

  // زیرلایهٔ مرجع: رشته‌های دیگر به‌صورت محو نمایش داده می‌شوند تا نقشه خوانا و
  // در عین حال قابل انطباق با معماری/سازه باشد (روش رایج دفاتر ایرانی).
  if (options.showContext !== false && view.classification !== "all") {
    const ghost: string[] = [];
    for (const item of doc.items) {
      const definition = CATALOG_BY_ID[item.catalogId];
      if (!definition) continue;
      if (!doc.layers[definition.layer]) continue;
      if (definition.discipline === view.classification) continue;
      if (SHARED_LAYERS.has(definition.layer)) continue;
      if (options.onlyLevel != null && item.level !== options.onlyLevel) continue;
      const shape = definition.parts
        .map((part) => partToSvg(part, item, layout, theme, definition.layer, { stroke: GHOST_COLOR[theme], weight: 0.13, forceDash: true }))
        .join("");
      ghost.push(`<g data-ghost="${esc(item.id)}" opacity="0.5">${shape}</g>`);
    }
    if (ghost.length > 0) body.push(`<g data-context="1">${ghost.join("")}</g>`);
  }

  const labels: string[] = [];
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
    const shape = definition.parts.map((part) => partToSvg(part, item, layout, theme, definition.layer)).join("");
    body.push(`<g data-item="${esc(item.id)}" data-catalog="${esc(item.catalogId)}" data-level="${item.level}">${shape}</g>`);
    const label = itemLabelSvg(item, definition, layout, theme);
    if (label) labels.push(label);
  }
  body.push(`<g data-labels="1">${labels.join("")}</g>`);

  body.push(northArrowSvg(layout, theme));
  body.push(scaleBarSvg(layout, theme));
  if (options.showSchedule !== false) {
    body.push(scheduleSvg(view, layout, theme, options.onlyLevel == null ? view.currentLevel : options.onlyLevel));
  }
  body.push(legendSvg(view, layout, theme, options));
  body.push(titleBlockSvg(doc, layout, options, theme));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(layout.widthMm)}mm" height="${n(layout.heightMm)}mm" viewBox="0 0 ${n(layout.widthMm)} ${n(layout.heightMm)}" role="img" aria-label="${esc(classificationLabel(doc, options))} — ${esc(doc.project.name)}">
  <title>${esc(`${doc.project.name} — ${classificationLabel(doc, options)}`)}</title>
  <desc>${esc(`مقیاس 1:${Math.round(1000 / layout.mmPerMetre)} · ${ENGINE_LABEL} · ${documentFingerprint(doc)}`)}</desc>
  ${body.join("\n  ")}
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

function dxfPolyline(points: { x: number; y: number }[], layer: string): string[] {
  return [
    "0",
    "LWPOLYLINE",
    "8",
    layer.toUpperCase(),
    "90",
    String(points.length),
    "70",
    "1",
    ...points.flatMap((point) => ["10", point.x.toFixed(4), "20", point.y.toFixed(4)]),
  ];
}

export function renderStudioDxf(doc: StudioDocument, options: RenderOptions = {}): string {
  const out: string[] = [];
  const push = (...values: (string | number)[]) => out.push(...values.map(String));
  const view: StudioDocument = options.classification ? { ...doc, classification: options.classification } : doc;
  const items = renderableItems(view).filter((item) => options.onlyLevel == null || item.level === options.onlyLevel);

  push(0, "SECTION", 2, "HEADER");
  push(9, "$ACADVER", 1, "AC1015");
  push(9, "$INSUNITS", 70, 6); // metres
  push(9, "$MEASUREMENT", 70, 1);
  push(9, "$LUPREC", 70, 4);
  push(0, "ENDSEC");

  const usedLayers = new Set<string>();
  for (const item of items) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (definition) usedLayers.add(definition.layer);
  }
  push(0, "SECTION", 2, "TABLES");
  push(0, "TABLE", 2, "LAYER", 70, usedLayers.size);
  for (const layer of usedLayers) {
    push(0, "LAYER", 2, layer.toUpperCase(), 70, 0, 62, DXF_COLORS[layer] ?? 7, 6, "CONTINUOUS");
  }
  push(0, "ENDTAB", 0, "ENDSEC");

  push(0, "SECTION", 2, "ENTITIES");
  for (const item of items) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) continue;
    const rad = (item.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const map = (lx: number, ly: number) => ({
      x: item.x + (lx * cos - ly * sin),
      y: item.y - (lx * sin + ly * cos),
    });
    for (const part of definition.parts) {
      if (part.kind === "rect") {
        const x0 = (part.x - 0.5) * item.w;
        const y0 = (part.y - 0.5) * item.d;
        const x1 = x0 + part.w * item.w;
        const y1 = y0 + part.h * item.d;
        push(
          ...dxfPolyline(
            [map(x0, y0), map(x1, y0), map(x1, y1), map(x0, y1)],
            definition.layer,
          ),
        );
      } else if (part.kind === "circle") {
        const center = map((part.cx - 0.5) * item.w, (part.cy - 0.5) * item.d);
        push(
          0,
          "CIRCLE",
          8,
          definition.layer.toUpperCase(),
          "10",
          center.x.toFixed(4),
          "20",
          center.y.toFixed(4),
          "40",
          (part.r * Math.min(item.w, item.d) * 0.5).toFixed(4),
        );
      } else if (part.kind === "mline") {
        const a = map(part.x1, part.y1);
        const b = map(part.x2, part.y2);
        push(0, "LINE", 8, definition.layer.toUpperCase(), "10", a.x.toFixed(4), "20", a.y.toFixed(4), "11", b.x.toFixed(4), "21", b.y.toFixed(4));
      } else if (part.kind === "marc") {
        const steps = 16;
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i <= steps; i += 1) {
          const angle = ((part.from + ((part.to - part.from) * i) / steps) * Math.PI) / 180;
          points.push(map(part.cx + part.r * Math.cos(angle), part.cy + part.r * Math.sin(angle)));
        }
        for (let i = 0; i < points.length - 1; i += 1) {
          const a = points[i];
          const b = points[i + 1];
          push(0, "LINE", 8, definition.layer.toUpperCase(), "10", a.x.toFixed(4), "20", a.y.toFixed(4), "11", b.x.toFixed(4), "21", b.y.toFixed(4));
        }
      } else if (part.kind === "poly") {
        const points = part.points.map(([u, v]) => map((u - 0.5) * item.w, (v - 0.5) * item.d));
        if (part.closed === false) {
          for (let i = 0; i < points.length - 1; i += 1) {
            const a = points[i];
            const b = points[i + 1];
            push(0, "LINE", 8, definition.layer.toUpperCase(), "10", a.x.toFixed(4), "20", a.y.toFixed(4), "11", b.x.toFixed(4), "21", b.y.toFixed(4));
          }
        } else {
          push(...dxfPolyline(points, definition.layer));
        }
      } else {
        const a = map((part.x1 - 0.5) * item.w, (part.y1 - 0.5) * item.d);
        const b = map((part.x2 - 0.5) * item.w, (part.y2 - 0.5) * item.d);
        push(0, "LINE", 8, definition.layer.toUpperCase(), "10", a.x.toFixed(4), "20", a.y.toFixed(4), "11", b.x.toFixed(4), "21", b.y.toFixed(4));
      }
    }
    push(
      0,
      "TEXT",
      8,
      definition.layer.toUpperCase(),
      "10",
      item.x.toFixed(4),
      "20",
      (item.y - item.d / 2 - 0.1).toFixed(4),
      "40",
      "0.2",
      "1",
      definition.nameEn.replace(/[^\x20-\x7E]/g, ""),
    );
  }
  push(0, "ENDSEC", 0, "EOF");
  return `${out.join("\n")}\n`;
}

/* ───────────────────────────── PDF ───────────────────────────── */

const MM_TO_PT = 72 / 25.4;

const ascii = (value: string): string => value.replace(/[^\x20-\x7E]/g, "");

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

function buildPdfPage(doc: StudioDocument, options: RenderOptions, spec: PdfPageSpec): { ops: string[]; layout: SheetLayout } {
  const view: StudioDocument = { ...doc, classification: spec.classification, currentLevel: spec.level ?? doc.currentLevel };
  const layout = sheetLayout(view, options);
  const pageH = layout.heightMm * MM_TO_PT;
  const ops: string[] = [];
  const toPt = (x: number, y: number) => ({ x: x * MM_TO_PT, y: pageH - y * MM_TO_PT });
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, widthMm: number, gray = 0.1) => {
    const pa = toPt(a.x, a.y);
    const pb = toPt(b.x, b.y);
    ops.push(`${gray} ${gray} ${gray} RG ${(widthMm * MM_TO_PT).toFixed(2)} w ${pa.x.toFixed(2)} ${pa.y.toFixed(2)} m ${pb.x.toFixed(2)} ${pb.y.toFixed(2)} l S`);
  };
  const poly = (points: { x: number; y: number }[], widthMm: number, fillGray: number | null, gray = 0.1) => {
    if (points.length < 2) return;
    const first = toPt(points[0].x, points[0].y);
    if (fillGray != null) ops.push(`${fillGray} ${fillGray} ${fillGray} rg`);
    ops.push(`${gray} ${gray} ${gray} RG ${(widthMm * MM_TO_PT).toFixed(2)} w ${first.x.toFixed(2)} ${first.y.toFixed(2)} m`);
    for (const point of points.slice(1)) {
      const pt = toPt(point.x, point.y);
      ops.push(`${pt.x.toFixed(2)} ${pt.y.toFixed(2)} l`);
    }
    ops.push(fillGray != null ? "b" : "S");
  };
  const circle = (center: { x: number; y: number }, radiusMm: number, widthMm: number, fillGray: number | null) => {
    const c = toPt(center.x, center.y);
    const r = radiusMm * MM_TO_PT;
    const k = 0.5523 * r;
    if (fillGray != null) ops.push(`${fillGray} ${fillGray} ${fillGray} rg`);
    ops.push(`0.1 0.1 0.1 RG ${(widthMm * MM_TO_PT).toFixed(2)} w ${c.x.toFixed(2)} ${c.y.toFixed(2)} m`);
    ops.push(
      `${(c.x + r).toFixed(2)} ${c.y.toFixed(2)} ${(c.x + r).toFixed(2)} ${(c.y + k).toFixed(2)} ${(c.x + k).toFixed(2)} ${(c.y + r).toFixed(2)} ${c.x.toFixed(2)} ${(c.y + r).toFixed(2)} c`,
      `${(c.x - k).toFixed(2)} ${(c.y + r).toFixed(2)} ${(c.x - r).toFixed(2)} ${(c.y + k).toFixed(2)} ${(c.x - r).toFixed(2)} ${c.y.toFixed(2)} c`,
      `${(c.x - r).toFixed(2)} ${(c.y - k).toFixed(2)} ${(c.x - k).toFixed(2)} ${(c.y - r).toFixed(2)} ${c.x.toFixed(2)} ${(c.y - r).toFixed(2)} c`,
      `${(c.x + k).toFixed(2)} ${(c.y - r).toFixed(2)} ${(c.x + r).toFixed(2)} ${(c.y - k).toFixed(2)} ${(c.x + r).toFixed(2)} ${c.y.toFixed(2)} c`,
      fillGray != null ? "b" : "S",
    );
  };
  const text = (at: { x: number; y: number }, sizeMm: number, value: string, gray = 0.1, anchor: "start" | "end" = "start") => {
    const pt = toPt(at.x, at.y);
    const fontSize = sizeMm * MM_TO_PT;
    const clean = pdfEscape(value);
    if (!clean.trim()) return;
    const widthEstimate = clean.length * fontSize * 0.5;
    const x = anchor === "end" ? pt.x - widthEstimate : pt.x;
    ops.push(`BT ${gray} ${gray} ${gray} rg /F1 ${fontSize.toFixed(2)} Tf 1 0 0 1 ${x.toFixed(2)} ${pt.y.toFixed(2)} Tm (${clean}) Tj ET`);
  };

  const area = layout.areaMm;
  text({ x: area.x + 2, y: area.y + 5 }, 2.6, `${ENGINE_LABEL}  FINGERPRINT ${documentFingerprint(doc)}`, 0.55);
  // کادر نقشه
  line({ x: area.x, y: area.y + 8 }, { x: area.x + area.w, y: area.y + 8 }, 0.4, 0.85);

  const items = renderableItems(view).filter((item) => spec.level == null || item.level === spec.level);
  for (const item of items) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) continue;
    const transform = itemTransform(item, layout);
    for (const part of definition.parts) {
      const fillGray = part.fill === "dark" ? 0.72 : part.fill === "medium" ? 0.86 : part.fill === "soft" ? 0.95 : part.fill === "accent" ? 0.88 : null;
      const width = (LAYER_BY_ID[definition.layer]?.weight ?? 0.2) * (part.thick ? 1.8 : 1);
      if (part.kind === "rect") {
        const x0 = (part.x - 0.5) * item.w;
        const y0 = (part.y - 0.5) * item.d;
        const x1 = x0 + part.w * item.w;
        const y1 = y0 + part.h * item.d;
        poly([transform.map(x0, y0), transform.map(x1, y0), transform.map(x1, y1), transform.map(x0, y1)], width, fillGray);
      } else if (part.kind === "circle") {
        const center = transform.map((part.cx - 0.5) * item.w, (part.cy - 0.5) * item.d);
        circle(center, part.r * Math.min(item.w, item.d) * 0.5 * layout.mmPerMetre, width, fillGray);
      } else if (part.kind === "mline") {
        line(transform.map(part.x1, part.y1), transform.map(part.x2, part.y2), width);
      } else if (part.kind === "marc") {
        const steps = 16;
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i <= steps; i += 1) {
          const angle = ((part.from + ((part.to - part.from) * i) / steps) * Math.PI) / 180;
          points.push(transform.map(part.cx + part.r * Math.cos(angle), part.cy + part.r * Math.sin(angle)));
        }
        for (let i = 0; i < points.length - 1; i += 1) line(points[i], points[i + 1], width);
      } else if (part.kind === "poly") {
        const points = part.points.map(([u, v]) => transform.map((u - 0.5) * item.w, (v - 0.5) * item.d));
        if (part.closed === false) {
          for (let i = 0; i < points.length - 1; i += 1) line(points[i], points[i + 1], width);
        } else {
          poly(points, width, fillGray);
        }
      } else {
        line(
          transform.map((part.x1 - 0.5) * item.w, (part.y1 - 0.5) * item.d),
          transform.map((part.x2 - 0.5) * item.w, (part.y2 - 0.5) * item.d),
          width,
        );
      }
    }
    if (LABELLED_CATEGORIES.has(definition.category)) {
      const center = transform.origin;
      text({ x: center.x, y: center.y + 1 }, 1.8, definition.nameEn, 0.35);
    }
  }

  // عنوان و کادر اطلاعات
  const scaleText = `SCALE 1:${Math.round(1000 / layout.mmPerMetre)}${layout.fitted ? " (AUTO)" : ""}`;
  text({ x: area.x + 3, y: area.y + area.h - 6 }, 3.6, `${doc.project.code}  ${ascii(doc.project.name) || "PROJECT"}`, 0.1);
  text({ x: area.x + 3, y: area.y + area.h - 11 }, 2.8, spec.caption, 0.35);
  text({ x: area.x + 3, y: area.y + area.h - 15 }, 2.4, `SHEET ${doc.sheet.format}  ${doc.sheet.orientation.toUpperCase()}  ${scaleText}  REV ${doc.revision}  ${doc.project.date}`, 0.45);

  const block = layout.titleBlock;
  poly(
    [
      { x: block.x, y: block.y },
      { x: block.x + block.w, y: block.y },
      { x: block.x + block.w, y: block.y + block.h },
      { x: block.x, y: block.y + block.h },
    ],
    0.45,
    null,
  );
  const colWidth = block.w / 4;
  for (let i = 1; i < 4; i += 1) {
    line({ x: block.x + colWidth * i, y: block.y }, { x: block.x + colWidth * i, y: block.y + block.h }, 0.25, 0.4);
  }
  text({ x: block.x + block.w - 3, y: block.y + 8 }, 4, ascii(doc.project.code), 0.1, "end");
  text({ x: block.x + block.w / 2 + colWidth / 2, y: block.y + 8 }, 3.4, ascii(spec.caption), 0.1, "end");
  text({ x: block.x + colWidth * 2, y: block.y + 8 }, 3, `${scaleText}`, 0.1, "end");
  text({ x: block.x + colWidth, y: block.y + 8 }, 3.2, ascii(doc.project.designer) || "DESIGNER", 0.1, "end");
  text({ x: block.x + block.w - 3, y: block.y + 16 }, 2.4, `DATE ${doc.project.date}   REV ${doc.revision}   ${doc.sheet.format}`, 0.45, "end");
  text({ x: block.x + block.w - 3, y: block.y + 24 }, 2.4, "HERMICAD - ENGINEER REVIEW REQUIRED", 0.55, "end");

  // خط‌کش مقیاس
  const barX = area.x + 3;
  const barY = area.y + 12;
  for (let i = 0; i < 5; i += 1) {
    const x = barX + i * layout.mmPerMetre;
    poly(
      [
        { x, y: barY },
        { x: x + layout.mmPerMetre, y: barY },
        { x: x + layout.mmPerMetre, y: barY + 2 },
        { x, y: barY + 2 },
      ],
      0.2,
      i % 2 === 0 ? 0.1 : null,
    );
    text({ x, y: barY + 6 }, 2.2, String(i), 0.4);
  }
  text({ x: barX + 5 * layout.mmPerMetre + 3, y: barY + 6 }, 2.2, "m", 0.4);

  return { ops, layout };
}

function assemblePdf(pages: { ops: string[]; layout: SheetLayout }[]): Uint8Array {
  const bodies = pages.map((page) => {
    const width = page.layout.widthMm * MM_TO_PT;
    const height = page.layout.heightMm * MM_TO_PT;
    const header = `q 1 1 1 rg 0 0 ${width.toFixed(2)} ${height.toFixed(2)} re f Q\n`;
    return Buffer.from(header + page.ops.join("\n"), "latin1");
  });

  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  pages.forEach((page, index) => {
    const contentId = pageIds[index] + 1;
    const width = (page.layout.widthMm * MM_TO_PT).toFixed(2);
    const height = (page.layout.heightMm * MM_TO_PT).toFixed(2);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> /ProcSet [/PDF /Text] >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${bodies[index].length} >>\nstream\n${bodies[index].toString("latin1")}\nendstream`);
  });

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

export function renderStudioPdf(doc: StudioDocument, options: RenderOptions = {}): Uint8Array {
  const classification = options.classification ?? doc.classification;
  const caption = `${classificationLabel(doc, { classification }).toUpperCase()} - LEVEL ${doc.currentLevel + 1}/${doc.levels}`;
  const page = buildPdfPage(doc, options, {
    level: options.onlyLevel == null ? doc.currentLevel : options.onlyLevel,
    classification,
    caption,
  });
  return assemblePdf([page]);
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
          caption: `${classificationLabel(doc, { classification }).toUpperCase()} - LEVEL ${level + 1}/${doc.levels}`,
        }),
      );
    }
  }
  if (pages.length === 0) {
    pages.push(
      buildPdfPage(doc, {}, { level: doc.currentLevel, classification: doc.classification, caption: "PLAN" }),
    );
  }
  return { pdf: assemblePdf(pages), pages: pages.length };
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

export const STUDIO_FORMATS = ["svg", "pdf", "dxf", "csv", "items-csv", "json", "pdf-bundle"] as const;
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
  }
}

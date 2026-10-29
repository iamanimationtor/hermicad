import { parameterErrors } from "./parameters";
import { slabConfig, SLAB_REBAR_DEFAULTS, type SlabRebarConfig } from "./slabConfig";
/**
 * HERMICAD Studio — مدل سند طراحی و عملیات خالص
 *
 * سند طراحی، برخلاف مدل مرکزی مولد (CEM)، «دست‌آزاد» است: کاربر خودش اشیا را
 * می‌چیند. اما همان اصول را نگه می‌دارد: قطعیت، نسخه‌بندی، خروجی قابل اندازه‌گیری
 * و ردیابی منبع هر شیء (catalogId → IFC class → layer).
 *
 * همهٔ توابع خالص‌اند: ورودی سند، خروجی سند جدید. بنابراین UI می‌تواند Undo/Redo
 * را با نگه‌داشتن تاریخچهٔ سندها پیاده کند و آزمون‌ها بدون مرورگر اجرا شوند.
 */

import { CATALOG_BY_ID, STUDIO_LAYERS, type CatalogItem, type DisciplineId, type StudioLayerId } from "./catalog";

export type SheetFormatId = "A4" | "A3" | "A2" | "A1" | "A0";

export const SHEET_SIZES: Record<SheetFormatId, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  A2: { w: 594, h: 420 },
  A1: { w: 841, h: 594 },
  A0: { w: 1189, h: 841 },
};

export interface StudioItem {
  id: string;
  catalogId: string;
  /** مرکز شیء در متر، در دستگاه پروژه (x شرق، y شمال) */
  x: number;
  y: number;
  /** عرض و عمق در متر (پیش از چرخش) */
  w: number;
  d: number;
  rotationDeg: number;
  level: number;
  label?: string;
  heightM?: number;
  sillM?: number;
}

export interface StudioSheet {
  format: SheetFormatId;
  orientation: "landscape" | "portrait";
  /** مخرج مقیاس (100 ⇒ 1:100) */
  scale: number;
}

export interface StudioProjectInfo {
  name: string;
  code: string;
  client: string;
  designer: string;
  date: string;
  note: string;
}

export interface StudioDocument {
  version: 1;
  id: string;
  name: string;
  kind: "architecture" | "structure" | "mep" | "site";
  project: StudioProjectInfo;
  sheet: StudioSheet;
  /** اندازهٔ شبکهٔ جذب در متر؛ صفر = خاموش */
  grid: number;
  gridVisible: boolean;
  levels: number;
  currentLevel: number;
  floorHeightM?: number;
  layers: Record<StudioLayerId, boolean>;
  classification: DisciplineId | "all";
  /** فرض‌های ذخیره‌شوندهٔ مترهٔ سقف؛ نه محاسبات سازه */
  slabRebar?: Partial<SlabRebarConfig>;
  items: StudioItem[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export const CLASSIFICATION_LABELS: { id: DisciplineId | "all"; label: string }[] = [
  { id: "all", label: "همهٔ رشته‌ها" },
  { id: "architecture", label: "معماری" },
  { id: "structure", label: "سازه" },
  { id: "mechanical", label: "تأسیسات مکانیکی" },
  { id: "electrical", label: "تأسیسات برقی" },
  { id: "plumbing", label: "بهداشتی و آب" },
  { id: "fire", label: "ایمنی حریق" },
  { id: "site", label: "محوطه" },
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 4): number => Number(value.toFixed(digits));

export function emptyLayers(): Record<StudioLayerId, boolean> {
  return STUDIO_LAYERS.reduce((acc, layer) => {
    acc[layer.id] = true;
    return acc;
  }, {} as Record<StudioLayerId, boolean>);
}

export function todayJalali(date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function createStudioDocument(input: Partial<StudioDocument> = {}): StudioDocument {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: input.id ?? `dsn-${Date.now().toString(36)}`,
    name: input.name ?? "سند طراحی جدید",
    kind: input.kind ?? "architecture",
    project: {
      name: "پروژهٔ نمونه",
      code: "HMC-D-001",
      client: "",
      designer: "مهندس طراح",
      date: todayJalali(),
      note: "ترسیم آزاد — خروجی باید توسط مهندس دارای صلاحیت کنترل شود.",
      ...(input.project ?? {}),
    },
    sheet: { format: "A3", orientation: "landscape", scale: 100, ...(input.sheet ?? {}) },
    grid: input.grid ?? 0.5,
    gridVisible: input.gridVisible ?? true,
    levels: input.levels ?? 1,
    currentLevel: input.currentLevel ?? 0,
    ...(input.floorHeightM===undefined?{}:{floorHeightM:input.floorHeightM}),
    layers: { ...emptyLayers(), ...(input.layers ?? {}) },
    classification: input.classification ?? "all",
    ...(input.slabRebar === undefined ? {} : { slabRebar: slabConfig(input.slabRebar) }),
    items: input.items ?? [],
    revision: input.revision ?? 1,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

export function sheetSizeMm(doc: StudioDocument): { w: number; h: number } {
  const base = SHEET_SIZES[doc.sheet.format] ?? SHEET_SIZES.A3;
  return doc.sheet.orientation === "portrait" ? { w: base.h, h: base.w } : base;
}

/** عامل تبدیل متر به میلی‌متر روی برگه. */
export function mmPerMetre(doc: StudioDocument): number {
  return 1000 / Math.max(1, doc.sheet.scale);
}

export function itemSize(item: StudioItem): { w: number; d: number } {
  return { w: item.w, d: item.d };
}

/** مستطیل محیطی شیء پس از چرخش، در متر. */
export function rotatedExtent(item: StudioItem): { w: number; d: number } {
  const rad = (item.rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { w: item.w * c + item.d * s, d: item.w * s + item.d * c };
}

export function itemCorners(item: StudioItem): { x: number; y: number }[] {
  const rad = (item.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = item.w / 2;
  const hd = item.d / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, ly]) => ({ x: item.x + lx * cos - ly * sin, y: item.y + lx * sin + ly * cos }));
}

export function documentBounds(doc: StudioDocument): { x: number; y: number; w: number; h: number } {
  if (doc.items.length === 0) return { x: -5, y: -4, w: 10, h: 8 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of doc.items) {
    for (const corner of itemCorners(item)) {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    }
  }
  const pad = 0.6;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export function snapValue(value: number, grid: number): number {
  if (!grid || grid <= 0) return round(value, 4);
  return round(Math.round(value / grid) * grid, 4);
}

export function normalizeAngle(value: number): number {
  const angle = value % 360;
  return round(angle < 0 ? angle + 360 : angle, 2);
}

function nextItemId(doc: StudioDocument): string {
  let max = 0;
  for (const item of doc.items) {
    const match = /^it-(\d+)$/.exec(item.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `it-${max + 1}`;
}

export function addItem(
  doc: StudioDocument,
  catalogId: string,
  at: { x: number; y: number },
  overrides: Partial<StudioItem> = {},
): StudioDocument {
  const definition = CATALOG_BY_ID[catalogId];
  if (!definition) throw new Error(`شیء «${catalogId}» در کتابخانه یافت نشد.`);
  const item: StudioItem = {
    id: nextItemId(doc),
    catalogId,
    x: snapValue(at.x, doc.grid),
    y: snapValue(at.y, doc.grid),
    w: definition.defaultSize.w,
    d: definition.defaultSize.d,
    rotationDeg: 0,
    level: doc.currentLevel,
    ...overrides,
  };
  return touch({ ...doc, items: [...doc.items, item] });
}

export function updateItem(doc: StudioDocument, id: string, patch: Partial<StudioItem>): StudioDocument {
  return touch({
    ...doc,
    items: doc.items.map((item) => {
      if (item.id !== id) return item;
      const merged = { ...item, ...patch };
      // اگر نوع شیء عوض شود، محدودهٔ مجاز باید از تعریف جدید خوانده شود، نه قدیمی.
      return clampItem(merged, CATALOG_BY_ID[merged.catalogId]);
    }),
  });
}

export function removeItem(doc: StudioDocument, id: string): StudioDocument {
  return touch({ ...doc, items: doc.items.filter((item) => item.id !== id) });
}

export function duplicateItem(doc: StudioDocument, id: string, offset = 0.5): StudioDocument {
  const source = doc.items.find((item) => item.id === id);
  if (!source) return doc;
  const copy: StudioItem = { ...source, id: nextItemId(doc), x: round(source.x + offset, 3), y: round(source.y + offset, 3) };
  return touch({ ...doc, items: [...doc.items, copy] });
}

export function resizeItem(doc: StudioDocument, id: string, size: { w?: number; d?: number }): StudioDocument {
  return updateItem(doc, id, {
    w: size.w ?? doc.items.find((item) => item.id === id)?.w ?? 1,
    d: size.d ?? doc.items.find((item) => item.id === id)?.d ?? 1,
  });
}

export function rotateItem(doc: StudioDocument, id: string, deltaDeg: number): StudioDocument {
  const item = doc.items.find((entry) => entry.id === id);
  if (!item) return doc;
  if (CATALOG_BY_ID[item.catalogId]?.rotatable === false) return doc;
  return updateItem(doc, id, { rotationDeg: normalizeAngle(item.rotationDeg + deltaDeg) });
}

export function moveItem(doc: StudioDocument, id: string, dx: number, dy: number): StudioDocument {
  const item = doc.items.find((entry) => entry.id === id);
  if (!item) return doc;
  return updateItem(doc, id, { x: round(item.x + dx, 4), y: round(item.y + dy, 4) });
}

export function setItemLevel(doc: StudioDocument, id: string, level: number): StudioDocument {
  return updateItem(doc, id, { level: clamp(Math.round(level), 0, doc.levels - 1) });
}

function clampItem(item: StudioItem, definition: CatalogItem | undefined): StudioItem {
  if (!definition) return item;
  const minW = definition.minSize?.w ?? 0.1;
  const minD = definition.minSize?.d ?? 0.1;
  const maxW = definition.maxSize?.w ?? definition.defaultSize.w * 6;
  const maxD = definition.maxSize?.d ?? definition.defaultSize.d * 6;
  return {
    ...item,
    w: round(clamp(item.w, minW, maxW), 3),
    d: round(clamp(item.d, minD, maxD), 3),
    rotationDeg: normalizeAngle(item.rotationDeg),
  };
}

function touch(doc: StudioDocument): StudioDocument {
  return { ...doc, updatedAt: new Date().toISOString() };
}

export function visibleItems(doc: StudioDocument, options: { respectLevel?: boolean } = {}): StudioItem[] {
  return doc.items.filter((item) => {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) return false;
    if (!doc.layers[definition.layer]) return false;
    if (doc.classification !== "all" && definition.discipline !== doc.classification) return false;
    if (options.respectLevel && item.level !== doc.currentLevel) return false;
    return true;
  });
}

/** آیتم‌هایی که باید رندر شوند؛ اشیای «همه‌طبقه» (سازه) همیشه دیده می‌شوند. */
/**
 * لایه‌های مشترک: نمادها، شبکهٔ محور و اندازه‌گذاری روی همهٔ برگه‌ها می‌آیند
 * (نه فقط برگهٔ معماری). بدون این، برگهٔ سازه بی‌محور و بی‌اندازه می‌ماند.
 */
export const SHARED_LAYERS = new Set<string>(["annotation", "grid", "dimension"]);

/**
 * لایه‌های تأسیساتی که در «پلان ترکیبی» نمی‌آیند.
 * پلان ترکیبی = معماری + سازه؛ مسیر کانال/لوله/سینی کابل/اسپرینکلر روی برگهٔ
 * خودش می‌آید، نه روی پلان معماری (روش رایج دفاتر و جلوگیری از شلوغی).
 */
const SERVICE_LAYERS = new Set<string>(["mep", "electrical", "fire", "site"]);

/**
 * اجزایی که فقط روی برگهٔ سازه معنا دارند: پی (زیر تراز طبیعی) و تیر/مهاربند
 * (در ضخامت کف پنهان). روی پلان معماری و ترکیبی رسم نمی‌شوند، وگرنه کادر پی
 * بیرون ساختمان و تیرها روی دیوارها، نقشه را ناخوانا می‌کند.
 */
const STRUCTURE_ONLY = (catalogId: string, layer: string): boolean =>
  layer === "foundation" || catalogId.startsWith("beam-") || catalogId.startsWith("brace-");

export function renderableItems(doc: StudioDocument): StudioItem[] {
  return doc.items.filter((item) => {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) return false;
    if (!doc.layers[definition.layer]) return false;
    if (doc.classification === "all") {
      if (SERVICE_LAYERS.has(definition.layer)) return false;
      if (STRUCTURE_ONLY(item.catalogId, definition.layer)) return false;
      return true;
    }
    if (definition.discipline !== doc.classification && !SHARED_LAYERS.has(definition.layer)) return false;
    if (doc.classification !== "structure" && STRUCTURE_ONLY(item.catalogId, definition.layer)) return false;
    return true;
  });
}

export interface ScheduleRow {
  catalogId: string;
  nameFa: string;
  category: string;
  discipline: DisciplineId;
  count: number;
  areaM2: number;
  totalAreaM2: number;
  ifcClass: string;
}

export interface ScheduleOptions {
  /** فقط اقلام نمایش‌داده‌شده در برگهٔ جاری (رشته/لایه/طبقه) */
  visibleOnly?: boolean;
  level?: number | null;
}

export function schedule(doc: StudioDocument, options: ScheduleOptions = {}): ScheduleRow[] {
  const map = new Map<string, ScheduleRow>();
  const source = options.visibleOnly
    ? renderableItems(doc).filter((item) => options.level == null || item.level === options.level)
    : doc.items;
  for (const item of source) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) continue;
    const existing = map.get(item.catalogId);
    const area = item.w * item.d;
    if (existing) {
      existing.count += 1;
      existing.totalAreaM2 = round(existing.totalAreaM2 + area, 3);
    } else {
      map.set(item.catalogId, {
        catalogId: item.catalogId,
        nameFa: definition.nameFa,
        category: definition.category,
        discipline: definition.discipline,
        count: 1,
        areaM2: round(area, 3),
        totalAreaM2: round(area, 3),
        ifcClass: definition.ifcClass,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.nameFa.localeCompare(b.nameFa, "fa"));
}

export interface StudioIssue {
  severity: "warning" | "error";
  code: string;
  message: string;
  itemIds?: string[];
}

/** بررسی‌های یکپارچگی سند — نه بررسی ضوابط. */
export function validateDocument(doc: StudioDocument): StudioIssue[] {
  const issues: StudioIssue[] = parameterErrors(doc).map(message=>({severity:"error",code:"INVALID_PARAMETER",message}));
  const missing = doc.items.filter((item) => !CATALOG_BY_ID[item.catalogId]);
  if (missing.length > 0) {
    issues.push({
      severity: "error",
      code: "UNKNOWN_ITEM",
      message: `${missing.length} شیء با شناسهٔ کتابخانهٔ ناشناخته در سند وجود دارد.`,
      itemIds: missing.map((item) => item.id),
    });
  }
  const invalid = doc.items.filter((item) => !(item.w > 0) || !(item.d > 0));
  if (invalid.length > 0) {
    issues.push({
      severity: "error",
      code: "INVALID_SIZE",
      message: `${invalid.length} شیء ابعاد نامعتبر (صفر یا منفی) دارد.`,
      itemIds: invalid.map((item) => item.id),
    });
  }
  const offLevel = doc.items.filter((item) => item.level < 0 || item.level >= doc.levels);
  if (offLevel.length > 0) {
    issues.push({
      severity: "warning",
      code: "LEVEL_OUT_OF_RANGE",
      message: `${offLevel.length} شیء به طبقه‌ای خارج از محدودهٔ سند نسبت داده شده است.`,
      itemIds: offLevel.map((item) => item.id),
    });
  }
  const annotations = doc.items.filter((item) => CATALOG_BY_ID[item.catalogId]?.category === "annotation");
  if (doc.items.length > 0 && annotations.length === 0) {
    issues.push({
      severity: "warning",
      code: "NO_ANNOTATION",
      message: "برگه بدون نماد شمال/برش است؛ برای خروجی رسمی نماد شمال و مقیاس لازم است.",
    });
  }
  if (doc.items.length === 0) {
    issues.push({ severity: "warning", code: "EMPTY", message: "سند خالی است." });
  }
  if (doc.currentLevel >= doc.levels) {
    issues.push({ severity: "error", code: "CURRENT_LEVEL", message: "طبقهٔ جاری خارج از محدودهٔ سند است." });
  }
  return issues;
}

/** اثر انگشت محتوایی سند (بدون زمان) برای بازتولید و مقایسه. */
export function documentFingerprint(doc: StudioDocument): string {
  const payload = JSON.stringify({
    sheet: doc.sheet,
    levels: doc.levels,
    floorHeightM: doc.floorHeightM,
    slabRebar: { ...SLAB_REBAR_DEFAULTS, ...doc.slabRebar },
    items: [...doc.items]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => [item.catalogId, item.x, item.y, item.w, item.d, item.rotationDeg, item.level, item.heightM, item.sillM]),
  });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `hds-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function documentSummary(doc: StudioDocument): {
  items: number;
  visible: number;
  levels: number;
  sheet: string;
  scale: string;
  footprintM2: number;
  fingerprint: string;
  issues: number;
} {
  const footprint = doc.items.reduce((sum, item) => sum + item.w * item.d, 0);
  const bounds = documentBounds(doc);
  return {
    items: doc.items.length,
    visible: renderableItems(doc).length,
    levels: doc.levels,
    sheet: `${doc.sheet.format} ${doc.sheet.orientation === "landscape" ? "افقی" : "عمودی"}`,
    scale: `1:${doc.sheet.scale}`,
    footprintM2: round(footprint, 2),
    fingerprint: documentFingerprint(doc),
    issues: validateDocument(doc).length,
  };
}

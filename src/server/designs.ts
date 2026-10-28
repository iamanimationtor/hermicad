import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { designDocuments } from "@/db/schema";
import {
  createStudioDocument,
  type StudioDocument,
  type StudioItem,
} from "@/domain/studio/document";

/**
 * Design Studio persistence.
 *
 * The engine never reads the database: this module is the only bridge. A saved
 * document is a complete, self-contained JSON — including sheet settings, layers
 * and items — so exports remain reproducible from storage alone.
 */

export interface DesignSummary {
  id: string;
  name: string;
  kind: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
  items: number;
  sheet: string;
  scale: string;
  fingerprint: string;
}

export async function listDesigns(): Promise<DesignSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(designDocuments).orderBy(desc(designDocuments.updatedAt)).limit(200);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    items: row.data?.items?.length ?? 0,
    sheet: `${row.data?.sheet?.format ?? "A3"} · 1:${row.data?.sheet?.scale ?? 100}`,
    scale: `1:${row.data?.sheet?.scale ?? 100}`,
    fingerprint: row.data ? fingerprintOf(row.data) : "—",
  }));
}

function fingerprintOf(doc: StudioDocument): string {
  const payload = JSON.stringify(doc.items.map((item) => [item.catalogId, item.x, item.y, item.w, item.d]));
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `hds-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function getDesign(id: string): Promise<StudioDocument | null> {
  const db = await getDb();
  const rows = await db.select().from(designDocuments).where(eq(designDocuments.id, id)).limit(1);
  return rows[0]?.data ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createDesign(input: Partial<StudioDocument> = {}): Promise<StudioDocument> {
  const base = createStudioDocument(input);
  // شناسهٔ دیتابیس باید UUID باشد؛ شناسهٔ داخلی سند با آن هم‌تراز می‌شود.
  const id = base.id && UUID.test(base.id) ? base.id : crypto.randomUUID();
  const doc: StudioDocument = { ...base, id };
  const db = await getDb();
  await db.insert(designDocuments).values({
    id,
    name: doc.name,
    kind: doc.kind,
    revision: doc.revision,
    data: doc,
  });
  return doc;
}

export async function saveDesign(id: string, doc: StudioDocument): Promise<StudioDocument> {
  const next: StudioDocument = {
    ...doc,
    id,
    revision: doc.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  const db = await getDb();
  const rows = await db.select({ id: designDocuments.id }).from(designDocuments).where(eq(designDocuments.id, id)).limit(1);
  if (rows.length === 0) {
    await db.insert(designDocuments).values({ id, name: next.name, kind: next.kind, revision: next.revision, data: next });
  } else {
    await db
      .update(designDocuments)
      .set({ name: next.name, kind: next.kind, revision: next.revision, data: next, updatedAt: new Date() })
      .where(eq(designDocuments.id, id));
  }
  return next;
}

export async function deleteDesign(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(designDocuments).where(eq(designDocuments.id, id));
}

/* ─────────────────────── سند نمونهٔ آماده ─────────────────────── */

const at = (
  id: string,
  catalogId: string,
  x: number,
  y: number,
  w: number,
  d: number,
  rotationDeg = 0,
  level = 0,
): StudioItem => ({ id, catalogId, x, y, w, d, rotationDeg, level });

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * دیوار از دو نقطهٔ محور (نه مرکز+چرخش). این شکل نوشتن، هندسهٔ غلط را تقریباً
 * غیرممکن می‌کند: طول و زاویه از مختصات محاسبه می‌شوند.
 */
function wallFromLine(
  id: string,
  catalogId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  level = 0,
): StudioItem {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const thickness = catalogId === "wall-exterior" ? 0.25 : 0.12;
  return {
    id,
    catalogId,
    x: round3((from.x + to.x) / 2),
    y: round3((from.y + to.y) / 2),
    w: round3(length),
    d: thickness,
    // y مدل به سمت شمال است؛ SVG آن را برمی‌گرداند، پس زاویه منفی می‌شود.
    rotationDeg: round3((-Math.atan2(dy, dx) * 180) / Math.PI),
    level,
  };
}

/** بازشو روی محور یک دیوار، با فاصلهٔ مرکز از نقطهٔ شروع. */
function openingOnWall(
  id: string,
  catalogId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  distance: number,
  width: number,
  level = 0,
): StudioItem {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const t = distance / length;
  return {
    id,
    catalogId,
    x: round3(from.x + dx * t),
    y: round3(from.y + dy * t),
    w: width,
    d: catalogId === "window" ? 0.25 : 0.12,
    rotationDeg: round3((-Math.atan2(dy, dx) * 180) / Math.PI),
    level,
  };
}

/**
 * نمونهٔ مرجع: آپارتمان ۱۲×۱۰ متر، دو خوابه، با اتاق‌های نام‌گذاری‌شده،
 * مبلمان کامل، سرویس، آشپزخانه، سازه و نمادهای نقشه.
 *
 * مختصات محور دیوارها: x از ۰ تا ۱۲ و y از ۰ تا ۱۰ (متر). دیوارها روی محور
 * قرار دارند و نیم‌ضخامتشان به بیرون و درون امتداد می‌یابد.
 */
export function sampleDesignItems(): StudioItem[] {
  const items: StudioItem[] = [];
  const push = (item: StudioItem) => items.push(item);

  /* فضاها (زیر همه رسم می‌شوند: اول در فهرست) */
  push(at("sp-1", "space-room", 2.8, 3.3, 5.3, 6.2, 0));
  items[items.length - 1].label = "نشیمن";
  push(at("sp-2", "space-room", 8.8, 3.3, 6.0, 6.2, 0));
  items[items.length - 1].label = "غذاخوری";
  push(at("sp-3", "space-room", 2.8, 8.3, 5.2, 3.2, 0));
  items[items.length - 1].label = "اتاق خواب ۱";
  push(at("sp-4", "space-room", 6.65, 7.5, 1.8, 1.6, 0));
  items[items.length - 1].label = "راهرو";
  push(at("sp-5", "space-room", 6.65, 9.2, 1.8, 1.4, 0));
  items[items.length - 1].label = "سرویس";
  push(at("sp-6", "space-room", 9.85, 8.3, 4.1, 3.2, 0));
  items[items.length - 1].label = "آشپزخانه";

  /* پوستهٔ ساختمان — ۱۲×۱۰ */
  push(wallFromLine("wl-1", "wall-exterior", { x: 0, y: 0 }, { x: 12, y: 0 }));
  push(wallFromLine("wl-2", "wall-exterior", { x: 12, y: 0 }, { x: 12, y: 10 }));
  push(wallFromLine("wl-3", "wall-exterior", { x: 12, y: 10 }, { x: 0, y: 10 }));
  push(wallFromLine("wl-4", "wall-exterior", { x: 0, y: 10 }, { x: 0, y: 0 }));

  /* تیغه‌های داخلی */
  push(wallFromLine("wl-5", "wall-partition", { x: 0, y: 6.6 }, { x: 12, y: 6.6 }));
  push(wallFromLine("wl-6", "wall-partition", { x: 5.6, y: 6.6 }, { x: 5.6, y: 10 }));
  push(wallFromLine("wl-7", "wall-partition", { x: 7.7, y: 6.6 }, { x: 7.7, y: 10 }));
  push(wallFromLine("wl-8", "wall-partition", { x: 5.6, y: 8.4 }, { x: 7.7, y: 8.4 }));

  /* بازشوها */
  push(openingOnWall("op-1", "door-single", { x: 0, y: 0 }, { x: 12, y: 0 }, 6.0, 1.0)); // ورودی
  push(openingOnWall("op-2", "door-single", { x: 0, y: 6.6 }, { x: 12, y: 6.6 }, 4.2, 0.9)); // اتاق خواب
  push(openingOnWall("op-3", "door-single", { x: 0, y: 6.6 }, { x: 12, y: 6.6 }, 9.6, 0.9)); // آشپزخانه
  push(openingOnWall("op-4", "door-single", { x: 5.6, y: 8.4 }, { x: 7.7, y: 8.4 }, 1.05, 0.8)); // سرویس
  push(openingOnWall("op-5", "window", { x: 0, y: 0 }, { x: 12, y: 0 }, 2.8, 1.8));
  push(openingOnWall("op-6", "window", { x: 0, y: 0 }, { x: 12, y: 0 }, 9.6, 1.8));
  push(openingOnWall("op-7", "window", { x: 0, y: 10 }, { x: 0, y: 0 }, 3.2, 1.4));
  push(openingOnWall("op-8", "window", { x: 0, y: 10 }, { x: 0, y: 0 }, 1.4, 1.2));
  push(openingOnWall("op-9", "window", { x: 12, y: 10 }, { x: 0, y: 10 }, 2.2, 1.2));

  /* نشیمن */
  push(at("fr-1", "sofa-3", 2.8, 0.65, 2.1, 0.9, 180));
  push(at("fr-2", "tv-unit", 2.8, 6.2, 1.8, 0.45, 0));
  push(at("fr-3", "coffee-table", 2.8, 3.4, 1.1, 0.6));
  push(at("fr-4", "rug", 2.8, 3.3, 3.2, 2.2));
  push(at("fr-5", "bookshelf", 5.25, 2.2, 1.6, 0.35, 90));

  /* غذاخوری */
  push(at("fr-6", "dining-6", 9.2, 2.6, 1.8, 0.9));
  push(at("fr-7", "chair", 8.0, 2.0, 0.5, 0.5, 0));
  push(at("fr-8", "chair", 10.4, 2.0, 0.5, 0.5, 0));
  push(at("fr-9", "chair", 8.0, 3.3, 0.5, 0.5, 180));
  push(at("fr-10", "chair", 10.4, 3.3, 0.5, 0.5, 180));
  push(at("fr-11", "sideboard", 11.45, 5.2, 1.6, 0.45, 90));

  /* اتاق خواب */
  push(at("fr-12", "bed-queen", 2.4, 8.875, 1.6, 2.0, 0));
  push(at("fr-13", "nightstand", 3.55, 9.6, 0.45, 0.4, 0));
  push(at("fr-14", "wardrobe-2", 0.43, 7.7, 1.2, 0.6, 270));
  push(at("fr-15", "desk", 4.5, 7.05, 1.4, 0.7, 0));
  push(at("fr-16", "dresser", 5.2, 8.6, 1.2, 0.5, 90));

  /* آشپزخانه */
  push(at("fr-17", "kitchen-counter", 8.4, 9.58, 1.2, 0.6, 0));
  push(at("fr-18", "kitchen-sink-1", 9.4, 9.58, 0.6, 0.6, 0));
  push(at("fr-19", "stove-4", 10.2, 9.58, 0.6, 0.6, 0));
  push(at("fr-20", "fridge", 11.2, 9.5, 0.7, 0.7, 0));

  /* سرویس */
  push(at("fr-21", "shower", 6.0, 9.5, 0.9, 0.9));
  push(at("fr-22", "wc-western", 7.2, 9.3, 0.4, 0.7, 0));
  push(at("fr-23", "lavatory", 6.6, 9.75, 0.55, 0.45, 0));

  /* سازه */
  const columns: [string, number, number][] = [
    ["st-1", 0, 0],
    ["st-2", 6, 0],
    ["st-3", 12, 0],
    ["st-4", 0, 5],
    ["st-5", 12, 5],
    ["st-6", 0, 10],
    ["st-7", 6, 10],
    ["st-8", 12, 10],
  ];
  for (const [id, x, y] of columns) push(at(id, "column-concrete", x, y, 0.4, 0.4));

  /* شبکهٔ محور */
  for (const [index, x] of [0, 6, 12].entries()) push(at(`ax-v${index}`, "axis-line", x, 5, 10, 0.1, 90));
  for (const [index, y] of [0, 5, 10].entries()) push(at(`ax-h${index}`, "axis-line", 6, y, 12, 0.1));

  /* سازه: پی و تیرهای شبکه */
  push(wallFromLine("fd-1", "footing-strip", { x: 0, y: -0.15 }, { x: 12, y: -0.15 }));
  push(wallFromLine("fd-2", "footing-strip", { x: 0, y: 10.15 }, { x: 12, y: 10.15 }));
  push(wallFromLine("fd-3", "footing-strip", { x: -0.15, y: 0 }, { x: -0.15, y: 10 }));
  push(wallFromLine("fd-4", "footing-strip", { x: 12.15, y: 0 }, { x: 12.15, y: 10 }));
  for (const [id, x, y] of columns) push(at(`fd-${id}`, "footing-isolated", x, y, 1.6, 1.6));
  for (const [index, y] of [0, 5, 10].entries()) push(at(`bm-h${index}`, "beam-concrete", 6, y, 12, 0.4));
  for (const [index, x] of [0, 6, 12].entries()) push(at(`bm-v${index}`, "beam-concrete", x, 5, 10, 0.4, 90));

  /* اندازه‌گذاری‌ها */
  push(at("dm-1", "dim-linear", 6, -2.2, 12, 0.3));
  push(at("dm-2", "dim-linear", 13.4, 5, 10, 0.3, 90));
  push(at("dm-3", "dim-linear", 2.8, -1.1, 5.6, 0.25));
  push(at("dm-4", "dim-linear", 8.8, -1.1, 6.4, 0.25));

  /* نمادها */
  push(at("an-1", "north-arrow", -1.2, 9.4, 1.0, 1.0));
  for (const [index, x] of [0, 6, 12].entries()) push(at(`an-gx${index}`, "grid-bubble", x, 10.9, 0.8, 0.8));
  for (const [index, y] of [0, 5, 10].entries()) push(at(`an-gy${index}`, "grid-bubble", -0.9, y, 0.8, 0.8));

  /* ── طبقهٔ دوم (سطح ۲): پوسته و سازه، با چیدمان مستقل ── */
  const shellIds = new Set(["wall-exterior", "column-concrete", "beam-concrete", "footing-strip", "footing-isolated", "axis-line"]);
  for (const item of [...items]) {
    if (!shellIds.has(item.catalogId)) continue;
    push({ ...item, id: `${item.id}-f2`, level: 1 });
  }
  push(wallFromLine("w2-1", "wall-partition", { x: 0, y: 6.6 }, { x: 12, y: 6.6 }, 1));
  push(wallFromLine("w2-2", "wall-partition", { x: 5.6, y: 6.6 }, { x: 5.6, y: 10 }, 1));
  push(wallFromLine("w2-3", "wall-partition", { x: 9.0, y: 6.6 }, { x: 9.0, y: 10 }, 1));
  push(wallFromLine("w2-4", "wall-partition", { x: 9.0, y: 8.4 }, { x: 12, y: 8.4 }, 1));

  const space = (id: string, x: number, y: number, w: number, d: number, label: string) => {
    const item = at(id, "space-room", x, y, w, d, 0, 1);
    item.label = label;
    push(item);
  };
  space("f2-sp1", 5.2, 8.3, 4.1, 3.2, "اتاق خواب ۲");
  space("f2-sp2", 10.5, 8.3, 3.0, 3.2, "اتاق خواب ۳");
  space("f2-sp3", 10.5, 7.5, 3.0, 1.6, "سرویس");
  space("f2-sp4", 6.0, 3.3, 12.0, 6.2, "نشیمن و کار");

  push(at("f2-1", "bed-king", 2.8, 8.7, 1.9, 2.1, 0, 1));
  push(at("f2-2", "wardrobe-2", 4.6, 9.3, 1.2, 0.6, 90, 1));
  push(at("f2-3", "bed-single", 8.4, 8.7, 1.0, 2.0, 0, 1));
  push(at("f2-4", "desk", 9.8, 9.4, 1.1, 0.6, 0, 1));
  push(at("f2-5", "wc-western", 9.5, 7.4, 0.4, 0.7, 0, 1));
  push(at("f2-6", "lavatory", 10.2, 7.15, 0.55, 0.45, 0, 1));
  push(at("f2-7", "sofa-3", 3.4, 1.2, 2.1, 0.9, 180, 1));
  push(at("f2-8", "tv-unit", 3.4, 5.6, 1.8, 0.45, 0, 1));
  push(at("f2-9", "rug", 3.4, 3.3, 3.2, 2.2, 0, 1));
  push(at("f2-10", "coffee-table", 3.4, 3.3, 1.1, 0.6, 0, 1));
  push(at("f2-11", "desk", 8.6, 2.2, 1.4, 0.7, 0, 1));
  push(at("f2-12", "bookshelf", 11.4, 2.6, 1.8, 0.35, 90, 1));
  push(at("f2-13", "dining-4", 8.6, 4.6, 1.2, 0.8, 0, 1));

  return items;
}

export function sampleDesign(): StudioDocument {
  return createStudioDocument({
    name: "آپارتمان نمونه — دو خوابه (۱۲×۱۰)",
    kind: "architecture",
    sheet: { format: "A3", orientation: "landscape", scale: 50 },
    grid: 0.25,
    levels: 2,
    project: {
      name: "مجتمع مسکونی آفتاب — واحد نمونه",
      code: "HMC-D-101",
      client: "کارفرمای نمونه",
      designer: "مهندس طراح",
      date: new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium" }).format(new Date()),
      note: "ترسیم آزاد — خروجی باید توسط مهندس دارای صلاحیت کنترل شود.",
    },
    items: sampleDesignItems(),
  });
}

/** اگر هیچ سندی وجود ندارد، نمونه را می‌سازد (فقط یک بار). */
export async function ensureSampleDesign(): Promise<StudioDocument> {
  const db = await getDb();
  const rows = await db.select({ id: designDocuments.id }).from(designDocuments).limit(1);
  if (rows.length > 0) {
    const doc = await getDesign(rows[0].id);
    if (doc) return doc;
  }
  return createDesign(sampleDesign());
}

export const SAMPLE_TEMPLATE_NAME = "آپارتمان نمونه — سه خوابه (۱۲×۱۰)";

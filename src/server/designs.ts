import { AccessError } from "./accessError";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { designDocuments } from "@/db/schema";
import { CATALOG_BY_ID } from "@/domain/studio/catalog";
import { createStudioDocument, documentFingerprint, type StudioDocument, type StudioItem } from "@/domain/studio/document";
import { PUBLIC_WORKSPACE } from "@/server/workspace";

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

/**
 * فهرست اسناد یک فضای کار.
 *
 * `workspace` پیش‌فرض «public» است تا اسکریپت‌ها/آزمون‌ها بدون کوکی هم کار
 * کنند؛ مسیرهای HTTP آن را از درخواست می‌خوانند.
 */
export async function listDesigns(workspace: string = PUBLIC_WORKSPACE): Promise<DesignSummary[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(designDocuments)
    .where(eq(designDocuments.workspace, workspace))
    .orderBy(desc(designDocuments.updatedAt))
    .limit(200);
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

const fingerprintOf = documentFingerprint;

/**
 * خواندن سند — با کنترل مالکیت.
 *
 * اگر `workspace` داده شود، سندِ فضای دیگری «یافت نشد» برمی‌گرداند (نه ۴۰۳) تا
 * وجود شناسه هم لو نرود. `PUBLIC_WORKSPACE` برای اسناد نمونه همیشه خوانا است.
 */
export async function getDesign(id: string, workspace?: string): Promise<StudioDocument | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const rows = await db.select().from(designDocuments).where(eq(designDocuments.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (workspace && row.workspace !== workspace && row.workspace !== PUBLIC_WORKSPACE) return null;
  return row.data ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createDesign(input: Partial<StudioDocument> = {}, workspace: string = PUBLIC_WORKSPACE): Promise<StudioDocument> {
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
    workspace,
    data: doc,
  });
  return doc;
}

export async function saveDesign(id: string, doc: StudioDocument, workspace: string = PUBLIC_WORKSPACE): Promise<StudioDocument> {
  if (!Number.isInteger(doc.revision) || doc.revision < 1) throw new AccessError(422, "شمارهٔ نسخه معتبر نیست.");
  const db = await getDb();
  const [owner] = await db
    .select({ workspace: designDocuments.workspace, data: designDocuments.data })
    .from(designDocuments)
    .where(eq(designDocuments.id, id))
    .limit(1);
  if (!owner || owner.workspace !== workspace) throw new AccessError(404, "سند طراحی یافت نشد یا قابل ویرایش نیست.");
  const family = owner.data?.brief?.structural?.family;
  if (family && doc.brief?.structural?.family !== family)
    throw new AccessError(422, "خانوادهٔ سازهٔ این پرونده قابل حذف یا تغییر نیست؛ برای مسیر دیگر پروندهٔ جدید بسازید.");
  const next: StudioDocument = { ...doc, id, revision: doc.revision + 1, updatedAt: new Date().toISOString() };
  const rows = await db
    .update(designDocuments)
    .set({ name: next.name, kind: next.kind, revision: next.revision, data: next, updatedAt: new Date() })
    .where(and(eq(designDocuments.id, id), eq(designDocuments.workspace, workspace), eq(designDocuments.revision, doc.revision)))
    .returning({ id: designDocuments.id });
  if (!rows.length)
    throw new AccessError(
      409,
      "نسخهٔ جدیدتری روی سرور ذخیره شده است؛ تغییرات شما بازنویسی نشد. ابتدا JSON محلی را دریافت کنید، سپس آخرین نسخه را باز کنید.",
    );
  return next;
}

/** خطای دسترسی به سندِ فضای کار دیگر. */
export class WorkspaceMismatchError extends Error {
  constructor(id: string) {
    super(`سند ${id} در فضای کار دیگری است.`);
    this.name = "WorkspaceMismatchError";
  }
}

/**
 * حذف سند. اسناد نمونهٔ عمومی محافظت می‌شوند: با یک درخواست نمی‌توان نمونهٔ
 * مرجع را برای همهٔ بازدیدکننده‌ها پاک کرد.
 */
export async function deleteDesign(id: string, workspace: string = PUBLIC_WORKSPACE): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select({ workspace: designDocuments.workspace }).from(designDocuments).where(eq(designDocuments.id, id)).limit(1);
  if (rows.length === 0) return false;
  if (rows[0].workspace !== workspace) return false;
  await db.delete(designDocuments).where(and(eq(designDocuments.id, id), eq(designDocuments.workspace, workspace)));
  return true;
}

/* ─────────────────────── سند نمونهٔ آماده ─────────────────────── */

const at = (id: string, catalogId: string, x: number, y: number, w: number, d: number, rotationDeg = 0, level = 0): StudioItem => ({
  id,
  catalogId,
  x,
  y,
  w,
  d,
  rotationDeg,
  level,
});

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * دیوار از دو نقطهٔ محور (نه مرکز+چرخش). این شکل نوشتن، هندسهٔ غلط را تقریباً
 * غیرممکن می‌کند: طول و زاویه از مختصات محاسبه می‌شوند.
 */
function wallFromLine(id: string, catalogId: string, from: { x: number; y: number }, to: { x: number; y: number }, level = 0): StudioItem {
  // ضخامت هر عضو از معنای خودش می‌آید؛ پی نواری ضخامت دیوار نیست و باید
  // عرض واقعی خودش (پیش‌فرض کتابخانه) را داشته باشد.
  const thickness =
    catalogId === "wall-exterior" ? 0.25 : catalogId === "wall-partition" ? 0.12 : (CATALOG_BY_ID[catalogId]?.defaultSize.d ?? 0.12);
  return special(id, catalogId, from, to, thickness, level);
}

/** همان «از نقطه تا نقطه»، با ضخامت دلخواه (برای مسیر تأسیسات و اعضای سازه). */
function special(
  id: string,
  catalogId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  thickness: number,
  level = 0,
): StudioItem {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
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

  /* تأسیسات مکانیکی، برقی، بهداشتی و ایمنی حریق — طبقهٔ همکف */
  push(at("mc-1", "fan-coil", 1.0, 5.2, 1.1, 0.5, 0));
  push(at("mc-2", "duct-riser", 6.55, 6.9, 0.7, 0.5, 0));
  push(at("mc-3", "water-heater", 5.0, 6.95, 0.5, 0.3, 0));
  // مسیر اصلی کانال از شفت به نشیمن و غذاخوری + انشعاب‌ها
  push(special("mc-d1", "duct-run", { x: 6.5, y: 7.2 }, { x: 6.5, y: 4.0 }, 0.5));
  push(special("mc-d2", "duct-run", { x: 6.5, y: 4.0 }, { x: 1.2, y: 4.0 }, 0.5));
  push(special("mc-d3", "duct-branch", { x: 6.5, y: 4.0 }, { x: 11.4, y: 4.0 }, 0.4));
  push(at("ec-1", "panel", 0.35, 5.0, 0.6, 0.25, 90));
  push(at("ec-2", "light-fixture", 2.8, 3.3, 0.6, 0.6, 0));
  push(at("ec-3", "light-fixture", 8.8, 3.3, 0.6, 0.6, 0));
  push(at("ec-4", "light-fixture", 8.8, 8.3, 0.6, 0.6, 0));
  push(at("ec-5", "socket", 0.35, 2.0, 0.25, 0.18, 90));
  push(at("ec-6", "socket", 11.65, 4.2, 0.25, 0.18, 90));
  push(at("pl-1", "pipe-riser", 7.45, 9.3, 0.4, 0.4, 0));
  // مسیر آب سرد/گرم/فاضلاب از شفت به سرویس و آشپزخانه
  push(special("pl-c1", "pipe-cold", { x: 7.45, y: 9.3 }, { x: 6.2, y: 9.3 }, 0.18));
  push(special("pl-c2", "pipe-cold", { x: 7.45, y: 9.0 }, { x: 8.8, y: 9.0 }, 0.18));
  push(special("pl-h1", "pipe-hot", { x: 7.45, y: 9.55 }, { x: 6.3, y: 9.55 }, 0.18));
  push(special("pl-d1", "pipe-drain", { x: 7.45, y: 9.05 }, { x: 7.45, y: 7.0 }, 0.2));
  push(special("pl-g1", "pipe-gas", { x: 11.9, y: 8.9 }, { x: 10.6, y: 8.9 }, 0.18));
  push(at("pl-2", "floor-drain", 6.2, 9.6, 0.2, 0.2, 0));
  push(at("pl-3", "washing-machine", 7.1, 7.0, 0.6, 0.6, 0));
  push(at("fr-30", "fire-extinguisher", 5.85, 6.85, 0.25, 0.25, 0));
  push(at("fr-31", "smoke-detector", 2.8, 4.6, 0.3, 0.3, 0));
  push(at("fr-32", "smoke-detector", 8.8, 4.6, 0.3, 0.3, 0));
  push(at("fr-33", "exit-sign", 6.65, 6.5, 0.5, 0.2, 0));
  // مسیر لولهٔ اسپرینکلر و شبکهٔ سینی کابل
  push(special("fr-s1", "sprinkler-run", { x: 0.6, y: 3.3 }, { x: 11.4, y: 3.3 }, 0.15));
  push(special("fr-s2", "sprinkler-run", { x: 0.6, y: 8.3 }, { x: 11.4, y: 8.3 }, 0.15));
  push(special("ec-t1", "cable-tray", { x: 0.5, y: 5.0 }, { x: 11.5, y: 5.0 }, 0.3));
  push(special("ec-t2", "cable-tray", { x: 6.0, y: 5.0 }, { x: 6.0, y: 9.5 }, 0.3));

  /* محوطه */
  push(at("st-p1", "parking-stall", -4.0, 3.0, 2.5, 5.0, 90));
  push(at("st-p2", "parking-stall", -4.0, 6.5, 2.5, 5.0, 90));
  push(at("st-t1", "tree", 14.2, 2.2, 1.6, 1.6, 0));
  push(at("st-t2", "tree", 14.2, 7.8, 1.6, 1.6, 0));
  push(at("st-b1", "bench-site", 13.6, 5.0, 1.6, 0.5, 90));

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
  // فلش شمال روی خودِ کادر برگه (chrome) رسم می‌شود؛ تکرار آن به‌صورت شیء روی
  // پلان، هم با حباب محور «A» تداخل می‌کرد و هم نقشه را شلوغ می‌ساخت.
  for (const [index, x] of [0, 6, 12].entries()) push(at(`an-gx${index}`, "grid-bubble", x, 10.9, 0.8, 0.8));
  for (const [index, y] of [0, 5, 10].entries()) push(at(`an-gy${index}`, "grid-bubble", -0.9, y, 0.8, 0.8));

  /* ── طبقهٔ دوم (سطح ۲): پوسته و سازه، با چیدمان مستقل ── */
  // پوسته، سازه و بازشوها در هر دو طبقه تکرار می‌شوند؛ بازشوها با شناسهٔ نو
  const shellIds = new Set([
    "wall-exterior",
    "column-concrete",
    "beam-concrete",
    "footing-strip",
    "footing-isolated",
    "axis-line",
    "door-single",
    "window",
  ]);
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

/**
 * اگر فضای کار هیچ سندی ندارد، یک **نسخهٔ شخصی** از نمونهٔ مرجع می‌سازد.
 *
 * چرا نسخهٔ شخصی: بازدیدکنندهٔ تازه اول باید چیزی ببیند که از آن شروع کند، اما
 * نباید همان سند مشترک را ویرایش کند (وگرنه نمونهٔ همه عوض می‌شود).
 */
export async function ensureSampleDesign(workspace: string = PUBLIC_WORKSPACE): Promise<StudioDocument> {
  const db = await getDb();
  const rows = await db.select({ id: designDocuments.id }).from(designDocuments).where(eq(designDocuments.workspace, workspace)).limit(1);
  if (rows.length > 0) {
    const doc = await getDesign(rows[0].id, workspace);
    if (doc) return doc;
  }
  const template = sampleDesign();
  const fresh: StudioDocument = {
    ...template,
    id: crypto.randomUUID(),
    name: workspace === PUBLIC_WORKSPACE ? template.name : `${template.name} — کارگاه من`,
    revision: 1,
  };
  return createDesign(fresh, workspace);
}

export const SAMPLE_TEMPLATE_NAME = "آپارتمان نمونه — سه خوابه (۱۲×۱۰)";

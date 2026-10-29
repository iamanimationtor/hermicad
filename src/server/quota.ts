/**
 * سقف مصرف هر فضای کار.
 *
 * چرا لازم است: HERMICAD بدون ثبت‌نام و رایگان برای عموم باز است و هر بازدیدکننده
 * یک فضای کار مستقل می‌گیرد. بدون سقف، ایجاد بی‌پایان پروژه/سند می‌تواند پایگاه
 * داده را پر کند و سرویس را برای همه از کار بیندازد. این سقف «ضد سوءمصرف» است،
 * نه محدودیت تجاری؛ برای استفادهٔ عادی چند برابر کافی است.
 *
 * خطا با کد 429 و پیام روشن برگردانده می‌شود تا کاربر بداند باید سند قدیمی را
 * حذف کند، نه اینکه فکر کند سرویس خراب است.
 */
import { count, eq } from "drizzle-orm";
import { designDocuments, projects } from "@/db/schema";
import { getDb } from "@/db";
import { AccessError } from "./accessError";

export const WORKSPACE_QUOTA = {
  projects: Number(process.env.HERMICAD_QUOTA_PROJECTS ?? 200),
  designs: Number(process.env.HERMICAD_QUOTA_DESIGNS ?? 300),
} as const;

const MESSAGE = (what: string, max: number) =>
  `سقف ${what} این فضای کار (${max} مورد) پر شده است؛ برای ساخت مورد جدید، ابتدا موارد بلااستفاده را حذف کنید.`;

export async function assertWorkspaceProjectQuota(workspace: string): Promise<void> {
  const db = await getDb();
  const [row] = await db.select({ value: count() }).from(projects).where(eq(projects.workspace, workspace));
  if (Number(row?.value ?? 0) >= WORKSPACE_QUOTA.projects) throw new AccessError(429, MESSAGE("پروژه", WORKSPACE_QUOTA.projects));
}

export async function assertWorkspaceDesignQuota(workspace: string): Promise<void> {
  const db = await getDb();
  const [row] = await db.select({ value: count() }).from(designDocuments).where(eq(designDocuments.workspace, workspace));
  if (Number(row?.value ?? 0) >= WORKSPACE_QUOTA.designs) throw new AccessError(429, MESSAGE("سند طراحی", WORKSPACE_QUOTA.designs));
}

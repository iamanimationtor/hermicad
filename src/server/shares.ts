import { randomBytes } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { designDocuments, designShares } from "@/db/schema";
import { AccessError } from "./accessError";
import { digest } from "./identity";

export async function listShares(id: string, workspace: string) {
  return (await getDb())
    .select({ id: designShares.id, expiresAt: designShares.expiresAt, createdAt: designShares.createdAt })
    .from(designShares)
    .where(and(eq(designShares.designId, id), eq(designShares.workspace, workspace)))
    .orderBy(desc(designShares.createdAt))
    .limit(50);
}
export async function createShare(id: string, workspace: string, days: unknown = 7) {
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 30)
    throw new AccessError(422, "اعتبار لینک باید بین ۱ تا ۳۰ روز باشد.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + days * 86400_000);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(designDocuments)
      .where(and(eq(designDocuments.id, id), eq(designDocuments.workspace, workspace)))
      .for("update")
      .limit(1);
    if (!row) throw new AccessError(404, "سند یافت نشد یا اجازهٔ اشتراک‌گذاری آن را ندارید.");
    const active = await tx
      .select({ id: designShares.id })
      .from(designShares)
      .where(and(eq(designShares.designId, id), gt(designShares.expiresAt, new Date())));
    if (active.length >= 10) throw new AccessError(422, "حداکثر ۱۰ لینک فعال برای هر سند؛ ابتدا لینک قبلی را لغو کنید.");
    const [share] = await tx
      .insert(designShares)
      .values({ designId: id, workspace, tokenHash: digest(token), snapshot: row.data, expiresAt })
      .returning({ id: designShares.id });
    return { id: share.id, path: `/share#${token}`, expiresAt, revision: row.revision };
  });
}
export async function revokeShare(designId: string, shareId: string, workspace: string) {
  const rows = await (
    await getDb()
  )
    .delete(designShares)
    .where(and(eq(designShares.id, shareId), eq(designShares.designId, designId), eq(designShares.workspace, workspace)))
    .returning({ id: designShares.id });
  if (!rows.length) throw new AccessError(404, "لینک بازبینی یافت نشد.");
}
export async function sharedSnapshot(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AccessError(404, "لینک معتبر نیست یا منقضی شده است.");
  const [row] = await (
    await getDb()
  )
    .select({ snapshot: designShares.snapshot })
    .from(designShares)
    .where(and(eq(designShares.tokenHash, digest(token)), gt(designShares.expiresAt, new Date())))
    .limit(1);
  if (!row) throw new AccessError(404, "لینک معتبر نیست، لغو یا منقضی شده است.");
  return row.snapshot;
}

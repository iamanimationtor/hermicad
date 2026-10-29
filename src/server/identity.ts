import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authAttempts, workspaceAccess, workspaceSessions } from "@/db/schema";
import { AccessError } from "./accessError";

// پارامتر ثابت و نسخه‌دار؛ از ورودی کاربر قابل افزایش/کاهش نیست.
const scrypt = (password: string, salt: string, length: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, hash) =>
      error ? reject(error) : resolve(hash),
    );
  });
const DAYS_30 = 30 * 86400_000;
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = (prefix: string) => prefix + randomBytes(32).toString("base64url");
export const isSession = (value: string) => /^hs_[A-Za-z0-9_-]{43}$/.test(value);
export const isRecovery = (value: string) => /^hr_[A-Za-z0-9_-]{43}$/.test(value);
export function normalizeUsername(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.-]{3,40}$/.test(value.trim()))
    throw new AccessError(422, "نام کاربری باید ۳ تا ۴۰ حرف لاتین، رقم، نقطه یا خط تیره باشد.");
  return value.trim().toLowerCase();
}
export function validatePassword(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    throw new AccessError(422, "گذرواژه باید ۱۲ تا ۱۲۸ نویسه باشد؛ عبارت طولانی انتخاب کنید.");
}
async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt-v1:${salt}:${hash.toString("hex")}`;
}
async function passwordMatches(password: string, encoded?: string | null): Promise<boolean> {
  // حتی برای نام ناموجود، هزینهٔ مشتق‌سازی رمز پرداخت می‌شود.
  const parts = (encoded ?? "").split(":");
  const valid = parts.length === 3 && parts[0] === "scrypt-v1" && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  const hash = (await scrypt(password, valid ? parts[1] : "0".repeat(32), 64)) as Buffer;
  return valid && timingSafeEqual(hash, Buffer.from(parts[2], "hex"));
}
async function throttle(key: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const cutoff = new Date(now.getTime() - 15 * 60_000);
  const rows = await db
    .insert(authAttempts)
    .values({ key: digest(key), count: 1, startedAt: now })
    .onConflictDoUpdate({
      target: authAttempts.key,
      set: {
        count: sql`case when ${authAttempts.startedAt} < ${cutoff} then 1 else ${authAttempts.count}+1 end`,
        startedAt: sql`case when ${authAttempts.startedAt} < ${cutoff} then ${now} else ${authAttempts.startedAt} end`,
      },
    })
    .returning();
  if (rows[0].count > 10) throw new AccessError(429, "تعداد تلاش‌ها زیاد است؛ ۱۵ دقیقه بعد دوباره امتحان کنید.");
  await db.delete(authAttempts).where(lt(authAttempts.startedAt, new Date(now.getTime() - 86400_000)));
}
export async function resolveCredential(value: string): Promise<string> {
  const db = await getDb();
  if (isSession(value)) {
    const [session] = await db
      .select()
      .from(workspaceSessions)
      .where(and(eq(workspaceSessions.tokenHash, digest(value)), gt(workspaceSessions.expiresAt, new Date())))
      .limit(1);
    if (!session) throw new AccessError(401, "نشست منقضی یا لغو شده است؛ دوباره وارد شوید.");
    return session.workspace;
  }
  const [account] = await db
    .select({ username: workspaceAccess.username })
    .from(workspaceAccess)
    .where(eq(workspaceAccess.workspace, value))
    .limit(1);
  if (account) throw new AccessError(401, "این فضای کار به حساب متصل شده است؛ وارد حساب شوید.");
  return value;
}
export async function accountStatus(workspace: string) {
  const [account] = await (
    await getDb()
  )
    .select({ username: workspaceAccess.username, recoveryHash: workspaceAccess.recoveryHash })
    .from(workspaceAccess)
    .where(eq(workspaceAccess.workspace, workspace))
    .limit(1);
  return { username: account?.username ?? null, hasRecovery: !!account?.recoveryHash };
}
export async function registerAccount(workspace: string, name: unknown, password: unknown) {
  if (workspace === "public") throw new AccessError(403, "فضای عمومی قابل اتصال به حساب نیست.");
  const username = normalizeUsername(name);
  validatePassword(password);
  await throttle("register:" + workspace);
  const hash = await passwordHash(password),
    recovery = secret("hr_"),
    token = secret("hs_");
  const db = await getDb();
  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .insert(workspaceAccess)
        .values({ workspace, username, passwordHash: hash, recoveryHash: digest(recovery) })
        .onConflictDoUpdate({
          target: workspaceAccess.workspace,
          set: { username, passwordHash: hash, recoveryHash: digest(recovery) },
          setWhere: isNull(workspaceAccess.username),
        })
        .returning();
      if (!rows.length) throw new AccessError(409, "فضای کار قبلاً به حساب متصل شده است.");
      await tx.insert(workspaceSessions).values({ workspace, tokenHash: digest(token), expiresAt: new Date(Date.now() + DAYS_30) });
    });
  } catch (error) {
    if (error instanceof AccessError) throw error;
    if ((error as { cause?: { code?: string }; code?: string })?.cause?.code === "23505" || (error as { code?: string })?.code === "23505")
      throw new AccessError(409, "این نام کاربری قابل استفاده نیست.");
    throw error;
  }
  return { token, recovery, username };
}
export async function loginAccount(name: unknown, password: unknown) {
  const username = normalizeUsername(name);
  validatePassword(password);
  await throttle("login:" + username);
  const db = await getDb();
  const [account] = await db.select().from(workspaceAccess).where(eq(workspaceAccess.username, username)).limit(1);
  if (!(await passwordMatches(password, account?.passwordHash))) throw new AccessError(401, "نام کاربری یا گذرواژه نادرست است.");
  const token = secret("hs_");
  // بازیابی نباید میان بررسی رمز و صدور نشست، یک ورود با رمز قدیمی را زنده کند.
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(workspaceAccess)
      .where(eq(workspaceAccess.workspace, account.workspace))
      .for("update")
      .limit(1);
    if (!current || current.passwordHash !== account.passwordHash) throw new AccessError(401, "گذرواژه تغییر کرده است؛ دوباره وارد شوید.");
    await tx
      .insert(workspaceSessions)
      .values({ workspace: account.workspace, tokenHash: digest(token), expiresAt: new Date(Date.now() + DAYS_30) });
  });
  await db.delete(workspaceSessions).where(lt(workspaceSessions.expiresAt, new Date()));
  return { token, username };
}
export async function rotateRecovery(workspace: string) {
  if (workspace === "public") throw new AccessError(403, "فضای عمومی کلید بازیابی ندارد.");
  const recovery = secret("hr_"),
    token = secret("hs_");
  await (
    await getDb()
  ).transaction(async (tx) => {
    await tx
      .insert(workspaceAccess)
      .values({ workspace, recoveryHash: digest(recovery) })
      .onConflictDoUpdate({ target: workspaceAccess.workspace, set: { recoveryHash: digest(recovery) } });
    await tx.insert(workspaceSessions).values({ workspace, tokenHash: digest(token), expiresAt: new Date(Date.now() + DAYS_30) });
  });
  return { recovery, token };
}
/** یک‌بارمصرف: بازیابی، کلید قبلی و همهٔ نشست‌ها را لغو می‌کند. */
export async function recoverWorkspace(code: unknown, password?: unknown) {
  if (typeof code !== "string" || !isRecovery(code.trim())) throw new AccessError(401, "کلید بازیابی معتبر نیست.");
  const hash = digest(code.trim());
  await throttle("recovery:" + hash);
  const db = await getDb();
  const [account] = await db.select().from(workspaceAccess).where(eq(workspaceAccess.recoveryHash, hash)).limit(1);
  if (!account) throw new AccessError(401, "کلید بازیابی معتبر نیست یا قبلاً استفاده شده است.");
  if (account.username) validatePassword(password);
  const newHash = account.username ? await passwordHash(password as string) : null;
  const recovery = secret("hr_"),
    token = secret("hs_");
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(workspaceAccess)
      .set({ recoveryHash: digest(recovery), ...(newHash ? { passwordHash: newHash } : {}) })
      .where(and(eq(workspaceAccess.workspace, account.workspace), eq(workspaceAccess.recoveryHash, hash)))
      .returning();
    if (!updated.length) throw new AccessError(401, "کلید بازیابی قبلاً استفاده شده است.");
    await tx.delete(workspaceSessions).where(eq(workspaceSessions.workspace, account.workspace));
    await tx
      .insert(workspaceSessions)
      .values({ workspace: account.workspace, tokenHash: digest(token), expiresAt: new Date(Date.now() + DAYS_30) });
  });
  return { token, recovery, username: account.username };
}
export async function logoutSession(credential: string | undefined) {
  if (credential && isSession(credential))
    await (await getDb()).delete(workspaceSessions).where(eq(workspaceSessions.tokenHash, digest(credential)));
}

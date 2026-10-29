import { AccessError, PRIVATE_HEADERS } from "./accessError";
import { SlabInputError } from "@/domain/studio/slabConfig";
import { DomainError } from "@/domain/layout";
import { UnsafeMethodDomainError } from "@/domain/engineering/methodValidity";
import { randomUUID } from "node:crypto";

/** خطاهای داخلی را در HTML سمت سرور نیز بدون جزئیات زیرساخت نمایش دهید. */
export function safePageError(error: unknown): string {
  if (error instanceof AccessError) return error.message;
  const reference = randomUUID();
  console.error("Unexpected page error", { reference, type: error instanceof Error ? error.name : "unknown" });
  return `خطای داخلی؛ مرجع پیگیری: ${reference}`;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AccessError)
    return Response.json({ error: error.message, detail: [] }, { status: error.status, headers: PRIVATE_HEADERS });
  if (error instanceof SlabInputError) return Response.json({ error: error.message, detail: [] }, { status: 422 });
  if (error instanceof UnsafeMethodDomainError)
    return Response.json({ error: error.message, detail: error.issues.map((item) => item.message) }, { status: 409, headers: PRIVATE_HEADERS });
  if (error instanceof DomainError) {
    return Response.json({ error: error.message, detail: error.detail }, { status: 422 });
  }
  // متن SQL، مسیر فایل، ورودی و اسرار را در پاسخ یا لاگ عمومی چاپ نکنید.
  const reference = randomUUID();
  console.error("Unexpected API error", { reference, type: error instanceof Error ? error.name : "unknown" });
  return Response.json(
    { error: "خطای داخلی رخ داد؛ بعداً دوباره تلاش کنید.", detail: [], reference },
    { status: 500, headers: PRIVATE_HEADERS },
  );
}

/** نسخهٔ دقیق نمایش‌داده‌شده برای دریافت وابسته به طرح (لینک‌های مرورگر). */
export function requireQueryRevision(request: Request): number {
  const value = new URL(request.url).searchParams.get("revision");
  if (value === null) throw new AccessError(428, "نسخهٔ طرح برای دریافت لازم است؛ پروژه را بازخوانی کنید.");
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647)
    throw new AccessError(400, "شمارهٔ نسخهٔ طرح نامعتبر است.");
  return Number(value);
}

/** ویرایش خوش‌بینانه: فقط نسخهٔ دقیقی که کاربر دیده قابل جایگزینی است. */
export function requireRevision(request: Request): number {
  const header = request.headers.get("if-match");
  if (!header) throw new AccessError(428, "نسخهٔ مبنای ویرایش لازم است؛ پروژه را بازخوانی کنید.");
  const match = /^"([1-9][0-9]*)"$/.exec(header.trim());
  const revision = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(revision) || revision > 2147483647) throw new AccessError(400, "سرآیند If-Match باید یک نسخهٔ صحیح و نقل‌قول‌شده باشد.");
  return revision;
}

export async function readJson<T>(request: Request): Promise<T> {
  const limit = 8 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new AccessError(413, "بدنهٔ درخواست بیش از ۸ مگابایت است.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(422, "بدنهٔ JSON لازم است.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AccessError(413, "بدنهٔ درخواست بیش از ۸ مگابایت است.");
    }
    chunks.push(value);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as T;
  } catch {
    throw new AccessError(422, "بدنه باید یک شیء JSON معتبر باشد.");
  }
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json(data as unknown as Record<string, unknown>, { status });
}

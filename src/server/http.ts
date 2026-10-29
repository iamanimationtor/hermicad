import { AccessError, PRIVATE_HEADERS } from "./accessError";
import { SlabInputError } from "@/domain/studio/slabConfig";
import { DomainError } from "@/domain/layout";

export function errorResponse(error: unknown): Response {
  if (error instanceof AccessError)
    return Response.json({ error: error.message, detail: [] }, { status: error.status, headers: PRIVATE_HEADERS });
  if (error instanceof SlabInputError) return Response.json({ error: error.message, detail: [] }, { status: 422 });
  if (error instanceof DomainError) {
    return Response.json({ error: error.message, detail: error.detail }, { status: 422 });
  }
  const raw = error instanceof Error ? error.message : "خطای ناشناخته";
  // پیام خطای دیتابیس می‌تواند شامل پارامترها و دادهٔ کاربر باشد؛ آن را کوتاه و
  // بدون افشای مقادیر برمی‌گردانیم.
  const message = raw.split("\n")[0].slice(0, 300);
  return Response.json({ error: message, detail: [message] }, { status: 400 });
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

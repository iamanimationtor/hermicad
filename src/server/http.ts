import { DomainError } from "@/domain/layout";

export function errorResponse(error: unknown): Response {
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
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("بدنه درخواست JSON معتبر نیست.");
  }
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json(data as unknown as Record<string, unknown>, { status });
}

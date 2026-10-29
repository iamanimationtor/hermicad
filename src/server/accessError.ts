/** خطاهای قابل نمایش؛ پیام پایگاه داده یا رمز نباید به کاربر برگردد. */
export class AccessError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  let host = "";
  try {
    host = new URL(origin ?? "").host;
  } catch {
    /* درخواست بدون مبدأ پذیرفته نیست */
  }
  if (!host || host !== (request.headers.get("host") ?? new URL(request.url).host)) {
    throw new AccessError(403, "مبدأ درخواست معتبر نیست؛ از داخل همین برنامه اقدام کنید.");
  }
}
export const PRIVATE_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

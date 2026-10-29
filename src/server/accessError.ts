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
  // در استقرار پشت proxy باید x-forwarded-proto فقط از proxy مورد اعتماد برسد
  // و ورودیِ ارسالیِ کلاینت توسط همان proxy بازنویسی شود.
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  const target = new URL(request.url);
  const protocol = forwarded ? `${forwarded}:` : target.protocol;
  const host = (request.headers.get("host") ?? target.host).toLowerCase();
  const origin = request.headers.get("origin");
  try {
    const parsed = new URL(origin ?? "");
    if ((protocol === "http:" || protocol === "https:") && parsed.origin === origin && parsed.protocol === protocol && parsed.host === host)
      return;
  } catch {
    // درخواست بدون مبدأ معتبر پذیرفته نیست.
  }
  throw new AccessError(403, "مبدأ درخواست معتبر نیست؛ از داخل همین برنامه اقدام کنید.");
}
export const PRIVATE_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

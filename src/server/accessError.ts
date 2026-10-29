/** خطاهای قابل نمایش؛ پیام پایگاه داده یا رمز نباید به کاربر برگردد. */
export class AccessError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const ORIGIN_ERROR = "مبدأ درخواست معتبر نیست؛ از داخل همین برنامه اقدام کنید.";

/**
 * میزبانِ رو به کاربر و طرح‌وارهٔ اعلامیِ پراکسی.
 *
 * نکتهٔ مهم عملیاتی: خودِ Next.js روی هر درخواست `x-forwarded-proto` را بر اساس
 * اتصالِ ورودی تنظیم می‌کند؛ پشت پراکسیِ TLS-خاتمه‌ده آن اتصال `http` است. پس این
 * سرآیند «طرح‌وارهٔ عمومی» را نشان نمی‌دهد و نباید مبنای ردِ درخواست باشد. تنها
 * زمانی که صریحاً `https` اعلام شود می‌توان طرح‌واره را سنجید.
 */
function requestTarget(request: Request): { host: string; publicHttps: boolean; forwardedProto?: string } {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim().toLowerCase();
  let target: URL | null = null;
  try {
    target = new URL(request.url);
  } catch {
    target = null;
  }
  const host = (forwardedHost || request.headers.get("host") || target?.host || "").toLowerCase();
  const rawProto = (request.headers.get("x-forwarded-proto") ?? request.headers.get("x-forwarded-scheme") ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const ssl = request.headers.get("x-forwarded-ssl")?.trim().toLowerCase();
  const forwardedProto = rawProto || (ssl === "on" ? "https" : "");
  return { host, publicHttps: forwardedProto === "https", ...(forwardedProto ? { forwardedProto } : {}) };
}

/** آیا درخواست از دید مرورگر روی https سرو می‌شود؟ (برای پرچم Secure کوکی) */
export function isHttpsRequest(request: Request): boolean {
  // مبدأ/ارجاعِ مرورگر معتبرترین نشانهٔ طرح‌وارهٔ عمومی است.
  const origin = request.headers.get("origin");
  if (origin?.startsWith("https://") === true) return true;
  const referer = request.headers.get("referer");
  if (referer?.startsWith("https://") === true) return true;
  const { publicHttps, forwardedProto } = requestTarget(request);
  if (publicHttps) return true;
  if (forwardedProto === "http") return false;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) throw new AccessError(403, ORIGIN_ERROR);
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new AccessError(403, ORIGIN_ERROR);
  }
  // رشتهٔ دقیقاً «scheme://host[:port]»؛ مسیر، کوئری، کاربر و «null» پذیرفته نیست.
  if (parsed.origin !== origin) throw new AccessError(403, ORIGIN_ERROR);

  const { host, publicHttps } = requestTarget(request);
  // همیشه: میزبان باید همان میزبانی باشد که درخواست به آن رسیده است.
  if (!host || parsed.host.toLowerCase() !== host) throw new AccessError(403, ORIGIN_ERROR);

  // نشانهٔ خودِ مرورگر: درخواست هم‌مبدأ است یا از سایت دیگر آمده.
  // این سرآیند را محتوای وب نمی‌تواند جعل کند، پس پشت پراکسی هم معتبر می‌ماند.
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new AccessError(403, ORIGIN_ERROR);

  // فقط وقتی پراکسی صریحاً https اعلام کرده، مبدأِ http پذیرفته نیست.
  if (publicHttps && parsed.protocol !== "https:") throw new AccessError(403, ORIGIN_ERROR);
}

export const PRIVATE_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

/**
 * ویژگی‌های کوکی نشست فضای کار.
 *
 * Secure بر پایهٔ طرح‌وارهٔ دیده‌شدهٔ مرورگر تعیین می‌شود (نه اتصال داخلی Next).
 * SameSite: اگر در https کار می‌کنیم «none» می‌گذاریم تا برنامه داخل iframe یا
 * دامنهٔ ميزبان ديگر هم نشست را حفظ کند؛ محافظت CSRF از مسیر بررسی مبدأ
 * (assertSameOrigin روی همهٔ متدهای نوشتاری) تأمین می‌شود، نه از SameSite.
 * روی http ساده SameSite=lax می‌ماند، چون مرورگر کوکیِ None بدون Secure را رد می‌کند.
 */
export function sessionCookieOptions(request: Request, maxAgeSeconds: number) {
  const secure = isHttpsRequest(request);
  return {
    httpOnly: true as const,
    secure,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

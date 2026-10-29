/**
 * میان‌بُر فضای کار بازدیدکننده.
 *
 * برای هر درخواست، اگر کوکی `hermi_workspace` نبود یا نامعتبر بود، یک شناسهٔ
 * تصادفی ساخته می‌شود؛ هم در کوکیِ پاسخ (HttpOnly، یک‌ساله) و هم در هدر
 * درخواست (`x-hermi-workspace`) قرار می‌گیرد تا همان درخواست اول هم اسناد
 * خودِ کاربر را ببیند.
 */

import { assertSameOrigin, PRIVATE_HEADERS, sessionCookieOptions } from "@/server/accessError";
import { NextResponse, type NextRequest } from "next/server";
import { WORKSPACE_COOKIE, WORKSPACE_HEADER, isValidWorkspace, newWorkspaceId } from "@/server/workspace";

export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    try {
      assertSameOrigin(request);
    } catch {
      return NextResponse.json({ error: "مبدأ درخواست معتبر نیست.", detail: [] }, { status: 403, headers: PRIVATE_HEADERS });
    }
  }
  /**
   * مسیرهای API که پاسخشان واقعاً عمومی و مستقل از فضای کار است.
   *
   * چرا فهرست صریح: در لایهٔ middleware، پاسخِ خودِ مسیر هنوز ساخته نشده؛ پس
   * نمی‌توان دید کدام مسیر Cache-Control اعلام کرده. سرآیند no-store این لایه روی
   * خروجی نهایی می‌نشیند و اعلام کش عمومی مسیر را بی‌اثر می‌کند. فقط مسیرهایی که
   * در تست و بازبینی «بدون دادهٔ کاربر» تأیید شده‌اند از این استثنا استفاده می‌کنند.
   */
  const PUBLIC_API = new Set(["/api/catalog"]);
  const privateResponse = (response: NextResponse) => {
    const pathname = request.nextUrl.pathname;
    if (pathname.startsWith("/api/")) {
      const publicCacheable = PUBLIC_API.has(pathname);
      for (const [key, value] of Object.entries(PRIVATE_HEADERS))
        if (!(publicCacheable && key === "Cache-Control")) response.headers.set(key, value);
    }
    return response;
  };
  const existing = request.cookies.get(WORKSPACE_COOKIE)?.value;
  if (isValidWorkspace(existing)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(WORKSPACE_HEADER, existing);
    return privateResponse(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const workspace = newWorkspaceId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(WORKSPACE_HEADER, workspace);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set({
    name: WORKSPACE_COOKIE,
    value: workspace,
    ...sessionCookieOptions(request, 60 * 60 * 24 * 365),
  });
  return privateResponse(response);
}

export const config = {
  // فایل‌های ثابت و تصاویر بهینه‌سازی‌شده نیازی به فضای کار ندارند
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

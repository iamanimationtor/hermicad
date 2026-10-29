/**
 * میان‌بُر فضای کار بازدیدکننده.
 *
 * برای هر درخواست، اگر کوکی `hermi_workspace` نبود یا نامعتبر بود، یک شناسهٔ
 * تصادفی ساخته می‌شود؛ هم در کوکیِ پاسخ (HttpOnly، یک‌ساله) و هم در هدر
 * درخواست (`x-hermi-workspace`) قرار می‌گیرد تا همان درخواست اول هم اسناد
 * خودِ کاربر را ببیند.
 */

import { NextResponse, type NextRequest } from "next/server";
import { WORKSPACE_COOKIE, WORKSPACE_HEADER, isValidWorkspace, newWorkspaceId } from "@/server/workspace";

export function middleware(request: NextRequest): NextResponse {
  const existing = request.cookies.get(WORKSPACE_COOKIE)?.value;
  if (isValidWorkspace(existing)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(WORKSPACE_HEADER, existing);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const workspace = newWorkspaceId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(WORKSPACE_HEADER, workspace);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set({
    name: WORKSPACE_COOKIE,
    value: workspace,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  // فایل‌های ثابت و تصاویر بهینه‌سازی‌شده نیازی به فضای کار ندارند
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

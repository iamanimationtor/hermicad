import type { NextConfig } from "next";

/**
 * سرآیندهای امنیتی.
 *
 * انتخاب‌ها با محدودیت‌های عمدی این برنامه هم‌خوان‌اند:
 *  - هیچ X-Frame-Options و هیچ frame-ancestors نگذاشته‌ام: برنامه باید داخل
 *    iframe پیش‌نمایش/جاسازی قابل نمایش بماند. جلوگیری از کلیک‌ربایی از مسیر
 *    بررسی مبدأ درخواست‌های تغییردهنده تأمین می‌شود (assertSameOrigin).
 *  - CSP فقط بخش‌های بی‌خطر را می‌بندد (object-src, base-uri, form-action).
 *    script-src را تنظیم نکرده‌ام چون Next اسکریپت درون‌خطی RSC دارد و CSP
 *    بدون nonce آن را می‌شکند؛ CSP ناقصِ اشتباه بدتر از نبودنش است.
 *  - Permissions-Policy قابلیت‌هایی را می‌بندد که برنامه هیچ‌کدام را لازم ندارد.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // فونت‌های محلی و تصاویر data: (SVG درون‌خطی) مجازند
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
    ].join("; "),
  },
  // روی http نادیده گرفته می‌شود؛ پشت https معتبر است.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // خروجی standalone: تصویر docker فقط فایل‌های لازم را حمل می‌کند، نه کل node_modules.
  // آزمون شده با اجرای مستقیم .next/standalone/server.js (شامل PGlite/WASM).
  // نسخهٔ فریم‌ورک را افشا نکن.
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app"],
  // PGlite ships a WASM build; keep it out of the bundler and load it at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // خروجی‌ها به کوکی فضای کار وابسته‌اند و نباید بین کاربران کش شوند.
        // سیاست کشِ هر مسیر در خودش اعلام می‌شود (پیش‌فرض no-store در proxy).
        source: "/api/:path*",
        headers: [{ key: "Vary", value: "Cookie, Accept-Encoding" }],
      },
    ];
  },
};

export default nextConfig;

import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/**
 * robots.txt برای پلتفرم عمومی.
 *
 * صفحه‌های معرفی (دامنه، معماری، دروازه کیفیت، راهنما) باید ایندکس شوند تا
 * کاربر تازه سامانه را پیدا کند. اما صفحه‌های کاری هر بازدیدکننده
 * (پروژه‌ها، اسناد طراحی، اشتراک‌گذاری، گزارش‌های سازه، راهنمای گام) محتوای
 * فضای کار همان کاربر است؛ ایندکس‌شدن آن‌ها هم بی‌معنا است (خزنده کوکی خودش را
 * دارد) و هم نشانی داخلی را بی‌دلیل منتشر می‌کند.
 *
 * مسیر «api» هم مسدود است: پاسخ‌ها JSON و وابسته به کوکی‌اند و خودشان هم
 * سرآیند X-Robots-Tag دارند.
 */
export const dynamic = "force-dynamic";

async function resolveBase(): Promise<string | null> {
  const configured = process.env.HERMICAD_PUBLIC_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");
  if (!host) return null;
  const proto = store.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${proto}://${host}`;
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  // دامنه در زمان درخواست خوانده می‌شود؛ نشانی حدسی در robots مضر است.
  const base = await resolveBase();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/architecture", "/quality", "/scope", "/structures", "/guide", "/projects", "/design"],
        disallow: ["/api/", "/share", "/projects/", "/design/", "/structures/", "/guide/"],
      },
    ],
    ...(base ? { sitemap: `${base}/sitemap.xml`, host: base } : {}),
  };
}

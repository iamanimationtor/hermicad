import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/**
 * نقشهٔ سایت — فقط صفحه‌های عمومی و بی‌داده.
 *
 * صفحه‌های کاریِ فضای کار (پروژه‌ها، اسناد، اشتراک‌گذاری) عمداً در نقشه نیستند:
 * محتوایشان به کوکی بازدیدکننده وابسته است و نشانی یکتای معنادار برای موتور
 * جست‌وجو نمی‌سازند.
 *
 * دامنه از `HERMICAD_PUBLIC_URL` و در نبود آن از سرآیندهای درخواست خوانده
 * می‌شود. چرا dinamیک و نه ثابت: اگر این مسیر در زمان ساخت ثابت تولید شود،
 * متغیر محیطی هنوز تنظیم نشده و نقشهٔ خالی منتشر می‌شد (دقیقاً همان اتفاقی که
 * در آزمون استقرار دیده شد).
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await resolveBase();
  if (!base) return [];
  const now = new Date();
  const routes: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/guide", priority: 0.9, changeFrequency: "weekly" },
    { path: "/scope", priority: 0.8, changeFrequency: "monthly" },
    { path: "/architecture", priority: 0.7, changeFrequency: "monthly" },
    { path: "/quality", priority: 0.7, changeFrequency: "weekly" },
    { path: "/structures", priority: 0.7, changeFrequency: "monthly" },
    { path: "/projects", priority: 0.6, changeFrequency: "weekly" },
    { path: "/design", priority: 0.6, changeFrequency: "weekly" },
  ];
  return routes.map((route) => ({
    url: `${base}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

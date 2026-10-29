import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { CODE_SET, ENGINE_VERSION } from "@/domain/constants";
import { RULE_COUNT } from "@/domain/codes";
import { SiteNav } from "@/components/site/SiteNav";
import { BrandMark } from "@/components/site/Brand";

/**
 * فرادادهٔ سراسری.
 *
 * metadataBase از `HERMICAD_PUBLIC_URL` خوانده می‌شود تا نشانی‌های مطلق
 * (Open Graph، canonical) به دامنهٔ واقعی استقرار اشاره کنند. بدون آن، Next
 * نشانی نسبی می‌سازد که در اشتراک‌گذاری لینک کار نمی‌کند.
 */
const publicUrl = process.env.HERMICAD_PUBLIC_URL?.replace(/\/+$/, "");

export const metadata: Metadata = {
  ...(publicUrl ? { metadataBase: new URL(publicUrl) } : {}),
  title: {
    default: "HERMICAD — از زمین تا چند طرح قابل مقایسه",
    template: "%s | HERMICAD",
  },
  description:
    "HERMICAD زمین نامنظم را می‌خواند، نیازمندی‌ها را می‌سازد، چند طرح مقدماتی تولید می‌کند و با محاسبه و ردیابی واقعی مقایسه‌شان می‌کند. خروجی‌ها برای بازبینی‌اند، نه تأییدیهٔ مهندسی.",
  applicationName: "HERMICAD",
  keywords: ["طراحی معماری", "پلان", "متره", "سازه", "هوش مهندسی", "HERMICAD"],
  openGraph: {
    type: "website",
    siteName: "HERMICAD",
    locale: "fa_IR",
    title: "HERMICAD — از زمین تا چند طرح قابل مقایسه",
    description:
      "از زمین نامنظم تا چند طرح قابل‌مقایسه، با محاسبه و ردیابی واقعی. خروجی‌ها طرح مقدماتی‌اند، نه تأییدیهٔ مهندسی.",
  },
  twitter: {
    card: "summary_large_image",
    title: "HERMICAD — از زمین تا چند طرح قابل مقایسه",
    description: "پلتفرم تولید و ترسیم طرح مقدماتی با موتور قطعی و خروجی‌های مهندسی.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b10",
  colorScheme: "dark",
};

const FOOTER_LINKS: { title: string; items: { href: string; label: string }[] }[] = [
  {
    title: "شروع کنید",
    items: [
      { href: "/guide", label: "راهنمای گام‌به‌گام" },
      { href: "/new", label: "تعریف هدایت‌شدهٔ زمین" },
      { href: "/projects", label: "کارگاه پروژه‌ها" },
      { href: "/design", label: "استودیو طراحی" },
    ],
  },
  {
    title: "شفافیت",
    items: [
      { href: "/scope", label: "دامنه و محدودیت‌ها" },
      { href: "/architecture", label: "معماری سیستم" },
      { href: "/quality", label: "دروازهٔ کیفیت" },
      { href: "/api/scope", label: "همین دفتر، به شکل JSON" },
    ],
  },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen antialiased">
        <a href="#content" className="skip-link">
          رفتن به محتوای اصلی
        </a>

        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b10]/85 backdrop-blur-xl">
          <div className="shell flex min-h-16 flex-wrap items-center gap-3 py-2">
            <SiteNav />
          </div>
        </header>

        <div id="content">{children}</div>

        <footer className="mt-20 border-t border-white/10 bg-[#05080d]">
          <div className="shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr] md:gap-8">
            <div>
              <div className="flex items-center gap-3">
                <BrandMark />
                <span className="text-sm font-extrabold tracking-[0.16em] text-white">HERMICAD</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-7 text-slate-400">
                ابزاری برای رسیدن سریع‌تر از زمین خالی به چند گزینهٔ قابل مقایسه؛ با محاسبهٔ شفاف،
                ردیابی هر عدد و خروجی‌هایی که می‌توانید بازبینی کنید.
              </p>
              <p className="mt-4 text-xs leading-6 text-slate-500">
                موتور {ENGINE_VERSION} · {RULE_COUNT} کنترل داخلی · {CODE_SET.code}@{CODE_SET.edition}
              </p>
            </div>

            {FOOTER_LINKS.map((group) => (
              <nav key={group.title} aria-label={group.title}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{group.title}</h2>
                <ul className="mt-3 space-y-1">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="inline-flex min-h-8 items-center text-sm text-slate-300 transition-colors hover:text-teal-200"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="border-t border-white/5">
            <div className="shell flex flex-col gap-3 py-5 text-xs leading-6 text-slate-500 md:flex-row md:items-center md:justify-between">
              <p className="max-w-3xl">
                خروجی‌های HERMICAD <strong className="font-semibold text-slate-300">طرح مقدماتی و غربالگری</strong> است،
                نه محاسبهٔ اجرایی یا تأییدیهٔ انطباق. کنترل‌ها بر پایهٔ آستانه‌های داخلی یا اظهاری‌اند و بازبینی
                متخصص دارای صلاحیت الزامی است.
              </p>
              <p className="shrink-0 text-slate-600">
                JURISDICTION {CODE_SET.jurisdiction}
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

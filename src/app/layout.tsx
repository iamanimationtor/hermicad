import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { CODE_SET, ENGINE_VERSION } from "@/domain/constants";
import { RULE_COUNT } from "@/domain/codes";

export const metadata: Metadata = {
  title: "HERMICAD — هوش مهندسی ساختمان",
  description:
    "HERMICAD: پلتفرم خودمختار هوش مهندسی ساختمان با موتور هندسه محاسباتی، موتور ضوابط نسخه‌بندی‌شده، طراحی مولد و بهینه‌سازی چندمعیاره روی مدل مهندسی مرکزی.",
};

const nav = [
  { href: "/", label: "نمای کلی" },
  { href: "/projects", label: "پروژه‌ها" },
  { href: "/design", label: "استودیو طراحی" },
  { href: "/architecture", label: "معماری سیستم" },
  { href: "/quality", label: "دروازه کیفیت" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#05080f]/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-5 py-3">
            <Link href="/" className="flex items-center gap-3">
              <span className="relative grid h-9 w-9 place-items-center rounded-lg border border-teal-300/40 bg-teal-400/10">
                <span className="absolute inset-1.5 rounded border border-teal-300/60" />
                <span className="absolute inset-x-1.5 inset-y-3 border-t border-teal-300/60" />
                <span className="text-[9px] font-bold tracking-tight text-teal-200">H</span>
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-extrabold tracking-[0.18em] text-white">HERMICAD</span>
                <span className="block text-[10px] text-slate-400">هوش مهندسی ساختمان · موتور قطعی</span>
              </span>
            </Link>
            <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-slate-300 transition hover:bg-white/5 hover:text-teal-200"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className="chip border-teal-400/30 bg-teal-400/10 text-teal-200">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-300" /> {ENGINE_VERSION}
              </span>
              <span className="chip">{RULE_COUNT} قاعده · {CODE_SET.edition}</span>
            </div>
          </div>
        </header>
        {children}
        <footer className="mt-16 border-t border-white/10 bg-[#04070d]">
          <div className="mx-auto max-w-[1400px] px-5 py-8 text-xs leading-6 text-slate-400">
            <p className="font-semibold text-slate-200">
              HERMICAD — خروجی الگوریتمی، نه تأییدیه مهندسی.
            </p>
            <p className="mt-2 max-w-4xl">
              تمام محاسبات قطعی و قابل بازتولید هستند (seed ثابت ⇒ طرح ثابت). ضوابط با شناسه، منبع و نسخه ثبت می‌شوند و
              فرضیات در هر خروجی همراه داده صادر می‌گردند. تأیید نهایی نقشه‌ها و محاسبات، مسئولیت مهندس دارای صلاحیت است.
            </p>
            <p className="mt-3 text-[11px] text-slate-500">
              Code set: {CODE_SET.code}@{CODE_SET.edition} · Engine: {ENGINE_VERSION} · JURISDICTION: {CODE_SET.jurisdiction}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

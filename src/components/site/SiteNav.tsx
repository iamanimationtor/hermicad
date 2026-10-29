"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "./Brand";

/**
 * سرصفحهٔ سایت: نشان، پیمایش اصلی و کلید منوی موبایل.
 *
 * چرا کلاینت: نشان‌دادن «کجای سایت هستید» به مسیر جاری نیاز دارد و `layout`
 * سرور به آن دسترسی ندارد. حجم این جزء چند کیلوبایت است.
 *
 * چرا ساختار تک‌ردیفه: پیش‌تر منوی موبایل داخل یک ستون فلکس تنگ رندر می‌شد و
 * عرضش می‌شکست. اکنون پنل موبایل مستقیماً فرزند همان ردیف سرصفحه است و با
 * `w-full` به خط بعد می‌رود.
 *
 * منوی «بیشتر» با کلیک بیرون و کلید Escape بسته می‌شود؛ پنل موبایل با انتخاب هر
 * پیوند بسته می‌شود تا روی محتوای صفحهٔ تازه نماند.
 */

const PRIMARY = [
  { href: "/", label: "خانه" },
  { href: "/guide", label: "شروع گام‌به‌گام" },
  { href: "/projects", label: "پروژه‌ها" },
  { href: "/design", label: "استودیو طراحی" },
];

const SECONDARY = [
  { href: "/structures", label: "مسیرهای سازه" },
  { href: "/scope", label: "دامنه و محدودیت‌ها" },
  { href: "/architecture", label: "معماری سیستم" },
  { href: "/quality", label: "دروازهٔ کیفیت" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // بستن فهرست «بیشتر» با کلیک بیرون یا Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const secondaryActive = SECONDARY.some((item) => isActive(pathname, item.href));

  return (
    <>
      <BrandLockup />

      {/* ── پیمایش دسکتاپ ─────────────────────────────────────────────── */}
      <nav aria-label="پیمایش اصلی" className="ms-auto hidden items-center gap-0.5 lg:flex">
        {PRIMARY.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
              {active && <span className="absolute inset-x-3 -bottom-px h-px bg-teal-400" aria-hidden="true" />}
            </Link>
          );
        })}

        <div className="relative" ref={moreRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((value) => !value)}
            aria-expanded={moreOpen}
            aria-haspopup="true"
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              secondaryActive || moreOpen ? "text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            بیشتر
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}>
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {moreOpen && (
            <div className="absolute end-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#0d131a] p-1.5 shadow-2xl shadow-black/60">
              {SECONDARY.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      active ? "bg-white/[0.07] text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <Link href="/new" className="btn btn-primary ms-2">
          شروع پروژه
        </Link>
      </nav>

      {/* ── کلید منوی موبایل ──────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="btn btn-ghost ms-auto !min-h-11 !px-2.5 lg:hidden"
      >
        <span className="sr-only">{open ? "بستن منو" : "باز کردن منو"}</span>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M3 6h14M3 10h14M3 14h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {/* ── پنل منوی موبایل (فرزند مستقیم ردیف سرصفحه) ────────────────── */}
      {open && (
        <div id="mobile-menu" className="w-full border-t border-white/10 pb-3 pt-2 lg:hidden">
          <nav aria-label="پیمایش موبایل" className="grid gap-1">
            {[...PRIMARY, ...SECONDARY].map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors ${
                    active ? "bg-white/[0.07] text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link href="/new" onClick={() => setOpen(false)} className="btn btn-primary btn-block mt-2">
              شروع پروژهٔ تازه
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}

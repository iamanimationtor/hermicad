import Link from "next/link";
import { ENGINE_VERSION } from "@/domain/constants";

/**
 * صفحهٔ ۴۰۴ فارسی.
 *
 * چرا لازم است: بدون این فایل، Next صفحهٔ پیش‌فرض انگلیسی «This page could not be
 * found» را نشان می‌دهد. برای سامانه‌ای که تمام رابط آن فارسی و راست‌به‌چپ است،
 * این صفحه هم ناهماهنگ است و هم کاربر را بی‌راهنما رها می‌کند.
 *
 * این صفحه عمداً هیچ ادعایی دربارهٔ اعتبار نقشه یا پروژه نمی‌کند؛ فقط مسیرهای
 * بازگشت را نشان می‌دهد.
 */
export const metadata = {
  title: "صفحه پیدا نشد — HERMICAD",
  robots: { index: false, follow: false },
};

const routes = [
  { href: "/", label: "نمای کلی", hint: "قابلیت‌ها و جریان موتور" },
  { href: "/projects", label: "پروژه‌های مولد", hint: "فهرست و ساخت پروژه" },
  { href: "/design", label: "استودیو طراحی", hint: "اسناد ترسیمی" },
  { href: "/guide", label: "شروع گام‌به‌گام", hint: "مسیر پیشنهادی" },
];

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <div className="panel p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip border-amber-400/40 bg-amber-400/10 text-amber-200">۴۰۴ · یافت نشد</span>
          <span className="chip">{ENGINE_VERSION}</span>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold text-white">این نشانی در سامانه وجود ندارد</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          ممکن است نشانی را اشتباه وارد کرده باشید، یا سند/پروژه‌ای که به آن ارجاع داده شده حذف شده باشد. اگر از
          لینک اشتراک‌گذاری استفاده می‌کنید، ممکن است آن لینک لغو شده یا منقضی شده باشد.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/projects" className="btn btn-primary">
            رفتن به پروژه‌ها
          </Link>
          <Link href="/" className="btn">
            صفحهٔ اصلی
          </Link>
        </div>

        <div className="mt-7 border-t border-white/10 pt-5">
          <p className="text-[11px] font-semibold text-slate-300">مسیرهای پرکاربرد</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {routes.map((route) => (
              <li key={route.href}>
                <Link href={route.href} className="panel-soft block px-3 py-2.5 transition hover:bg-white/5">
                  <span className="block text-xs font-semibold text-teal-200">{route.label}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">{route.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

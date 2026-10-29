import type { ReactNode } from "react";

/**
 * اسکلت بارگذاری مشترک.
 *
 * چرا لازم است: مسیرهایی مثل کارگاه پروژه و استودیو، در اولین درخواست موتور
 * هندسی و خروجی‌ها را محاسبه می‌کنند و می‌توانند صدها میلی‌ثانیه طول بکشند.
 * بدون loading.tsx، کاربر در این فاصله صفحهٔ خالی یا صفحهٔ قبلی بی‌واکنش
 * می‌بیند. این اسکلت ساختار صفحه را از پیش نشان می‌دهد تا جابه‌جایی چشمی کم شود.
 *
 * عمداً از انیمیشن‌های سنگین و کتابخانهٔ بیرونی استفاده نمی‌کند؛ فقط CSS خالص.
 */
export function PageLoading({
  title,
  rows = 3,
  children,
}: {
  title: string;
  rows?: number;
  children?: ReactNode;
}) {
  return (
    <main className="shell-wide py-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <span className="chip border-teal-400/30 bg-teal-400/10 text-teal-200">در حال آماده‌سازی</span>
        <h1 className="text-sm font-bold text-slate-200">{title}</h1>
      </div>

      <p className="mt-2 text-[0.8125rem] text-slate-500">
        محاسبهٔ هندسه و آماده‌سازی خروجی‌ها در جریان است؛ این صفحه به‌طور خودکار تکمیل می‌شود.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="panel p-5">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton mt-4 aspect-[4/3] w-full rounded" />
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="panel-soft px-3 py-3">
                <div className="skeleton h-2 w-16 rounded" />
                <div className="skeleton mt-2 h-4 w-10 rounded" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="panel p-5">
              <div className="skeleton h-3 w-24 rounded" />
              {Array.from({ length: 3 }).map((__, line) => (
                <div key={line} className="skeleton mt-3 h-2 w-full rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {children}
    </main>
  );
}

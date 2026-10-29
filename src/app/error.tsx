"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * مرز خطای سطح برنامه.
 *
 * چرا لازم است: بدون error.tsx، هر استثنای زمان رندرِ صفحه به صفحهٔ خام Next
 * می‌رسد (در تولید یک صفحهٔ بی‌پیام، در توسعه انبوهی از جزئیات فنی). کاربر باید
 * پیام فارسی، راه بازیابی و یک «مرجع پیگیری» ببیند — بدون افشای پشتهٔ خطا، مسیر
 * فایل یا محتوای پایگاه.
 *
 * نکته: digest همان شناسه‌ای است که Next برای خطای سمت سرور تولید می‌کند و برای
 * پیگیری در لاگ سرور کافی است؛ متن خطا عمداً نمایش داده نمی‌شود.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // فقط نوع و مرجع ثبت می‌شود؛ پیام ممکن است دادهٔ کاربر را در بر داشته باشد.
    console.error("Page error boundary", { digest: error.digest, name: error.name });
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-24">
      <div className="panel p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip border-rose-400/40 bg-rose-500/10 text-rose-200">خطای موقت</span>
          {error.digest && <span className="chip mono">{error.digest.slice(0, 12)}</span>}
        </div>

        <h1 className="mt-4 text-2xl font-extrabold text-white">نمایش این صفحه ممکن نشد</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          خطایی در سمت سرور رخ داد. داده‌های ذخیره‌شدهٔ شما حذف نشده‌اند؛ می‌توانید دوباره تلاش کنید. اگر دوباره
          تکرار شد، همین مرجع پیگیری را به پشتیبانی بدهید.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">
            تلاش دوباره
          </button>
          <Link href="/projects" className="btn">
            بازگشت به پروژه‌ها
          </Link>
          <Link href="/" className="btn">
            صفحهٔ اصلی
          </Link>
        </div>

        <p className="mt-6 border-t border-white/10 pt-4 text-[0.8125rem] leading-6 text-slate-400">
          اگر خطا هنگام بازکردن یک پروژه یا سند خاص رخ می‌دهد، از فهرست پروژه‌ها آن مورد را بررسی کنید؛ خروجی‌های
          قبلی روی سرور باقی می‌مانند.
        </p>
      </div>
    </main>
  );
}

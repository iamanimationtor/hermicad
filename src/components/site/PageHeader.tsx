import type { ReactNode } from "react";
import Link from "next/link";

/**
 * سرصفحهٔ مشترک صفحه‌های داخلی.
 *
 * چرا مشترک: پیش‌تر هر صفحه اندازهٔ تیتر، فاصله و چیدمان خودش را داشت و همین
 * باعث ناهماهنگی بصری می‌شد. اکنون همهٔ صفحه‌ها یک ریتم واحد دارند: مسیر
 * بازگشت، برچسب زمینه، تیتر، توضیح کوتاه و کنش‌ها.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  aside,
  back,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="grid gap-6 border-b border-white/8 pb-8 md:grid-cols-[1fr_auto] md:items-end md:gap-8">
      <div className="min-w-0">
        {(back || eyebrow) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {back && (
              <Link
                href={back.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-teal-400/40 hover:text-teal-200"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="rotate-180">
                  <path d="M13 8H4M7.5 4.5 4 8l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {back.label}
              </Link>
            )}
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          </div>
        )}
        <h1 className="text-[clamp(1.6rem,3.6vw,2.35rem)] font-extrabold leading-[1.4] text-white">{title}</h1>
        {lede && <p className="lede mt-3">{lede}</p>}
        {actions && <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {aside && <div className="md:justify-self-end">{aside}</div>}
    </header>
  );
}

/** بخش محتوایی با عنوان و توضیح، برای تقسیم صفحه‌های طولانی. */
export function Section({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`py-10 sm:py-12 ${className}`}>
      {(title || action) && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="section-title">{title}</h2>}
            {description && <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

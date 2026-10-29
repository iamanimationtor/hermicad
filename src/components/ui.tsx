import type { ReactNode } from "react";

/**
 * اجزای مشترک رابط.
 *
 * این فایل «واژه‌نامهٔ بصری» سایت است: هر بخشی که در چند صفحه تکرار می‌شود
 * (کارت، آمار، نشان وضعیت، نمودار میله‌ای، حالت خالی، جفت کلید/مقدار) فقط از
 * این‌جا ساخته می‌شود تا فاصله‌ها و اندازه‌ها یکدست بمانند.
 */

export function Panel({
  children,
  className = "",
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={`panel p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold leading-7 text-white">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm leading-6 text-slate-400">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-teal-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-rose-300"
          : "text-white";
  return (
    <div className="panel-soft px-4 py-3">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`mono text-xl font-bold tabular-nums ${toneClass}`}>{value}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</div>}
    </div>
  );
}

const STATUS_MAP: Record<string, { label: string; className: string; dot: string }> = {
  pass: {
    label: "نتیجهٔ مثبت این کنترل",
    className: "border-teal-400/30 bg-teal-400/10 text-teal-100",
    dot: "bg-teal-400",
  },
  fail: {
    label: "خارج از معیار این کنترل",
    className: "border-rose-400/40 bg-rose-400/10 text-rose-100",
    dot: "bg-rose-400",
  },
  warn: {
    label: "هشدار",
    className: "border-amber-400/40 bg-amber-400/10 text-amber-100",
    dot: "bg-amber-400",
  },
  insufficient: {
    label: "اطلاعات ناکافی",
    className: "border-amber-400/40 bg-amber-400/10 text-amber-100",
    dot: "bg-amber-400",
  },
  "not-blocked": {
    label: "خطای بحرانی ثبت نشده",
    className: "border-amber-400/40 bg-amber-400/5 text-amber-100",
    dot: "bg-amber-400",
  },
  present: {
    label: "ثبت شده؛ احراز نشده",
    className: "border-slate-400/25 bg-slate-400/10 text-slate-200",
    dot: "bg-slate-400",
  },
  na: {
    label: "نامرتبط",
    className: "border-slate-500/25 bg-slate-500/10 text-slate-300",
    dot: "bg-slate-500",
  },
  critical: {
    label: "بحرانی",
    className: "border-rose-500/45 bg-rose-500/15 text-rose-100",
    dot: "bg-rose-500",
  },
  major: {
    label: "مهم",
    className: "border-orange-400/40 bg-orange-400/10 text-orange-100",
    dot: "bg-orange-400",
  },
  minor: {
    label: "جزئی",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-100",
    dot: "bg-sky-400",
  },
  info: {
    label: "اطلاع",
    className: "border-slate-400/25 bg-slate-400/10 text-slate-200",
    dot: "bg-slate-400",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const item = STATUS_MAP[status] ?? {
    label: status,
    className: "border-slate-500/25 bg-slate-500/10 text-slate-300",
    dot: "bg-slate-500",
  };
  return (
    <span className={`chip ${item.className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`} aria-hidden="true" />
      {item.label}
    </span>
  );
}

export function Bar({ value, max, tone = "teal" }: { value: number; max: number; tone?: "teal" | "amber" | "rose" }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-9, max)) * 100));
  const color =
    tone === "teal"
      ? "bg-gradient-to-l from-teal-400 to-teal-300"
      : tone === "amber"
        ? "bg-gradient-to-l from-amber-400 to-amber-300"
        : "bg-gradient-to-l from-rose-400 to-rose-300";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
      <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-slate-400">
          <path d="M3.5 16.5V6l6.5-3.5L16.5 6v10.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M3.5 16.5h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="max-w-md text-sm leading-7 text-slate-400">{description}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-0 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-3 border-b border-white/5 py-2">
          <dt className="text-xs text-slate-400">{item.label}</dt>
          <dd className={`text-sm font-semibold text-slate-100 ${item.mono ? "mono" : ""}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

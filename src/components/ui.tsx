import type { ReactNode } from "react";

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
    <section className={`panel p-4 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-sm font-bold text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-1 text-[11px] leading-5 text-slate-400">{subtitle}</p>}
          </div>
          {action}
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
          : "text-slate-100";
  return (
    <div className="panel-soft px-3 py-2.5">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`mono text-lg font-bold ${toneClass}`}>{value}</span>
        {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[10px] leading-4 text-slate-500">{hint}</div>}
    </div>
  );
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pass: { label: "منطبق", className: "border-teal-400/40 bg-teal-400/10 text-teal-200" },
  fail: { label: "نقض", className: "border-rose-400/40 bg-rose-400/10 text-rose-200" },
  warn: { label: "هشدار", className: "border-amber-400/40 bg-amber-400/10 text-amber-200" },
  na: { label: "نامرتبط", className: "border-slate-500/30 bg-slate-500/10 text-slate-300" },
  critical: { label: "بحرانی", className: "border-rose-500/50 bg-rose-500/15 text-rose-200" },
  major: { label: "مهم", className: "border-orange-400/40 bg-orange-400/10 text-orange-200" },
  minor: { label: "جزئی", className: "border-sky-400/30 bg-sky-400/10 text-sky-200" },
  info: { label: "اطلاع", className: "border-slate-400/30 bg-slate-400/10 text-slate-300" },
};

export function StatusBadge({ status }: { status: string }) {
  const item = STATUS_MAP[status] ?? { label: status, className: "border-slate-500/30 bg-slate-500/10 text-slate-300" };
  return <span className={`chip ${item.className}`}>{item.label}</span>;
}

export function Bar({ value, max, tone = "teal" }: { value: number; max: number; tone?: "teal" | "amber" | "rose" }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-9, max)) * 100));
  const color = tone === "teal" ? "bg-teal-400" : tone === "amber" ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="panel-soft flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="max-w-lg text-xs leading-6 text-slate-400">{description}</p>
      {action}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-1.5">
          <dt className="text-[11px] text-slate-400">{item.label}</dt>
          <dd className={`text-xs font-semibold text-slate-100 ${item.mono ? "mono" : ""}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

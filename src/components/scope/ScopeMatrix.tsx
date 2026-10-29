"use client";

import { useMemo, useState } from "react";
import { STAGES, STAGE_STATE_LABELS, type ScopeRow, type StageState } from "@/domain/scope/registry";

const filters = [
  ["all", "همهٔ ردیف‌ها"],
  ["intake", "ثبت مشخصات سازه"],
  ["analysis", "مدل‌های محاسبه"],
  ["discipline", "نمای رشته‌ها"],
] as const;
type Filter = (typeof filters)[number][0];
const kindLabel: Record<ScopeRow["kind"], string> = {
  intake: "ثبت اطلاعات",
  analysis: "مدل محدود",
  discipline: "نمای رشته",
};
const stateStyle: Record<StageState, string> = {
  limited: "border-amber-400/30 bg-amber-400/5 text-amber-100",
  "not-implemented": "border-slate-500/30 bg-slate-500/5 text-slate-300",
  "separate-row": "border-slate-500/30 bg-slate-500/5 text-slate-300",
  "software-evidence": "border-sky-400/30 bg-sky-400/5 text-sky-100",
  "not-assessed": "border-slate-500/30 bg-slate-500/5 text-slate-300",
  "review-only": "border-amber-400/30 bg-amber-400/5 text-amber-100",
};

function TextList({ title, values }: { title: string; values: readonly string[] }) {
  return (
    <section>
      <h4 className="text-sm font-bold text-slate-100">{title}</h4>
      <ul className="mt-2 list-disc space-y-1 pr-5 text-xs leading-6 text-slate-300">
        {values.map((value) => <li key={value}>{value}</li>)}
      </ul>
    </section>
  );
}

function RowDetail({ row }: { row: ScopeRow }) {
  return (
    <details className="group rounded-xl border border-white/10 bg-[#0b1220] open:border-slate-500/50">
      <summary className="cursor-pointer list-none p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 sm:p-5">
        <span className="flex flex-wrap items-start justify-between gap-3">
          <span>
            <span className="mb-2 block text-[11px] text-slate-400">{kindLabel[row.kind]} · {row.discipline}</span>
            <span className="block text-sm font-bold leading-7 text-white">{row.title}</span>
          </span>
          <span className="chip border-amber-400/30 bg-amber-400/5 text-amber-100">تأیید نشده</span>
        </span>
        <span className="mt-3 block text-xs leading-6 text-slate-400">{row.system}</span>
        <span className="mt-3 flex flex-wrap gap-1.5" aria-label="خلاصهٔ وضعیت‌ها">
          {STAGES.map(([key, label]) => (
            <span key={key} className={`rounded-md border px-2 py-1 text-[10px] ${stateStyle[row.stages[key].state]}`}>
              {label}: {STAGE_STATE_LABELS[row.stages[key].state]}
            </span>
          ))}
        </span>
        <span className="mt-4 block text-xs font-semibold text-teal-200 group-open:hidden">مشاهدهٔ دامنه، محدودیت و شواهد +</span>
        <span className="mt-4 hidden text-xs font-semibold text-teal-200 group-open:block">بستن جزئیات −</span>
      </summary>
      <div className="space-y-6 border-t border-white/10 p-4 sm:p-5">
        <dl className="grid gap-4 text-xs leading-6 md:grid-cols-2">
          {[
            ["خانواده", row.family],
            ["سیستم", row.system],
            ["روش", row.method],
            ["کاربری", row.use],
            ["حوزهٔ مقررات", row.jurisdiction],
            ["منشأ ورودی", row.inputProvenance],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="font-bold text-slate-200">{label}</dt>
              <dd className="mt-1 text-slate-400">{value}</dd>
            </div>
          ))}
        </dl>
        <section>
          <h4 className="mb-2 text-sm font-bold text-slate-100">شش وضعیت مستقل</h4>
          <div className="overflow-x-auto">
            <table className="table-eng min-w-[620px]">
              <thead><tr><th>مرحله</th><th>وضعیت</th><th>معنا و محدودیت</th></tr></thead>
              <tbody>
                {STAGES.map(([key, label]) => (
                  <tr key={key}>
                    <th scope="row" className="text-right text-slate-200">{label}</th>
                    <td><span className={`chip ${stateStyle[row.stages[key].state]}`}>{STAGE_STATE_LABELS[row.stages[key].state]}</span></td>
                    <td className="text-slate-300">{row.stages[key].detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="grid gap-6 md:grid-cols-2">
          <TextList title="حدود و فرض‌ها" values={row.boundaries} />
          <TextList title="خارج از پوشش این ردیف" values={row.exclusions} />
          <TextList title="خروجی موجود؛ مقدماتی" values={row.availableOutputs} />
          <TextList title="مدارک لازم، نه لزوماً موجود" values={row.requiredDeliverables} />
        </div>
        {row.inputs.length > 0 && (
          <section>
            <h4 className="text-sm font-bold text-slate-100">ورودی‌های اصلی</h4>
            <p className="mt-1 text-xs leading-6 text-slate-400">این فهرست لزوماً همهٔ داده‌های لازم پروژه نیست. بازه‌های عددی زیر فقط محدودیت نرم‌افزارند.</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {row.inputs.map((input) => (
                <li key={input.key} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs leading-6 text-slate-300">
                  {input.label}{input.unit ? ` (${input.unit})` : ""}
                  {input.min !== null && input.max !== null && <span className="block text-[11px] text-slate-500">بازهٔ فرم: {input.min} تا {input.max}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <TextList title="برای پذیرش چه چیزهایی لازم است؟" values={row.acceptanceNeeds} />
        <div className="grid gap-6 md:grid-cols-2">
          <TextList title="نقاط شروع کد" values={row.codeReferences} />
          <TextList title="آزمون و شاهد نرم‌افزاری مرتبط" values={row.softwareEvidence} />
        </div>
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-6 text-amber-100">
          مسیر کد و آزمون، شاهد وجود یا رفتار نرم‌افزار است؛ تأیید منبع رسمی، کفایت مهندسی، پذیرش پروژه یا اجازهٔ اجرا نیست.
        </p>
      </div>
    </details>
  );
}

export function ScopeMatrix({ rows }: { rows: readonly ScopeRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("fa");
    return rows.filter((row) => {
      if (filter !== "all" && row.kind !== filter) return false;
      if (!term) return true;
      return [row.title, row.family, row.discipline, row.system, row.method, ...row.exclusions]
        .join(" ").toLocaleLowerCase("fa").includes(term);
    });
  }, [filter, query, rows]);
  return (
    <section aria-labelledby="matrix-title" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-teal-200">دفتر قابلیت‌های مشاهده‌شده</p>
          <h2 id="matrix-title" className="mt-2 text-xl font-extrabold text-white sm:text-2xl">چه چیزی در هر ردیف واقعاً وجود دارد؟</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">این فهرست تمام ترکیب‌های دامنهٔ نهایی را پوشش نمی‌دهد. ردیف‌های رشته‌ای باید پس از تصمیم مالک به سیستم‌ها و کاربری‌های قابل آزمون تفکیک شوند.</p>
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(220px,1fr)_2fr] md:items-end">
          <label className="block text-xs font-bold text-slate-200">
            جست‌وجو در ردیف‌ها
            <input className="field mt-2" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً مخزن، فولاد، حریق" />
          </label>
          <fieldset>
            <legend className="mb-2 text-xs font-bold text-slate-200">نوع ردیف</legend>
            <div className="flex flex-wrap gap-2">
              {filters.map(([id, label]) => (
                <label key={id} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs ${filter === id ? "border-teal-300/50 bg-teal-400/10 text-teal-100" : "border-white/10 text-slate-300"}`}>
                  <input type="radio" name="scope-filter" value={id} checked={filter === id} onChange={() => setFilter(id)} className="ml-2 accent-teal-300" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
      <p aria-live="polite" className="my-4 text-xs text-slate-400">نمایش {shown.length} از {rows.length} ردیف مشاهده‌شده؛ این تعداد معیار تکمیل نیست.</p>
      {shown.length ? (
        <div className="space-y-3">{shown.map((row) => <RowDetail key={row.id} row={row} />)}</div>
      ) : (
        <p className="rounded-xl border border-dashed border-white/20 p-6 text-sm text-slate-300">ردیفی با این جست‌وجو پیدا نشد؛ عبارت یا نوع ردیف را تغییر دهید.</p>
      )}
    </section>
  );
}

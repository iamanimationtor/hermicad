"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StudioDocument } from "@/domain/studio/document";
import {
  USES,
  TRADES,
  STEPS,
  emptyBrief,
  activeFields,
  activeReferences,
  availableOutputs,
  briefErrors,
  type Brief,
  type Field,
  type Trade,
} from "@/domain/journey/model";
import { reviewJourney } from "@/domain/journey/review";
function initialBrief(doc: StudioDocument): Brief {
  if (doc.brief) return doc.brief;
  const b = emptyBrief();
  const code = doc.project.code.toLowerCase();
  for (const use of ["office", "school", "clinic"] as const) if (code.includes(`t-${use}`)) b.use = use;
  return b;
}
export function JourneyWorkspace({ initial }: { initial: StudioDocument }) {
  const router = useRouter();
  const [doc, setDoc] = useState<StudioDocument>({ ...initial, brief: initialBrief(initial) });
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const brief = doc.brief!;
  const step = brief.step;
  const dirty = JSON.stringify(doc) !== saved;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  const errors = useMemo(() => briefErrors(brief), [brief]);
  const report = useMemo(() => (errors.length ? null : reviewJourney(doc)), [doc, errors]);
  const change = (patch: Partial<Brief>) => {
    setDoc((d) => ({ ...d, brief: { ...d.brief!, ...patch } }));
    setNotice("");
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const save = async (snapshot = doc) => {
    if (!snapshot.name.trim()) {
      setNotice("نام پروژه را وارد کنید.");
      return null;
    }
    const issues = briefErrors(snapshot.brief);
    if (issues.length) {
      setNotice(issues[0]);
      return null;
    }
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch(`/api/designs/${doc.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: snapshot }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setDoc(b.design);
      setSaved(JSON.stringify(b.design));
      setNotice(`ذخیره شد؛ نسخهٔ ${b.design.revision}`);
      return b.design as StudioDocument;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ذخیره ناموفق بود.");
      return null;
    } finally {
      setBusy(false);
    }
  };
  const next = async () => {
    await save({ ...doc, brief: { ...brief, step: Math.min(STEPS.length - 1, step + 1) } });
  };
  const openModel = async () => {
    const stored = dirty ? await save() : doc;
    if (stored) router.push(`/design/${doc.id}`);
  };
  const toggleTrade = (trade: Trade) => {
    const trades = brief.trades.includes(trade) ? brief.trades.filter((t) => t !== trade) : [...brief.trades, trade];
    if (!trades.length) {
      setNotice("حداقل یک رشته باید انتخاب شود.");
      return;
    }
    const candidate = { ...brief, trades };
    const allowed = availableOutputs(candidate);
    change({ trades, outputs: brief.outputs.filter((id) => allowed.some((o) => o.id === id)) });
  };
  const download = async () => {
    const stored = dirty ? await save() : doc;
    if (!stored) return;
    setBusy(true);
    setNotice("در حال ساخت بسته از نسخهٔ ذخیره‌شده…");
    try {
      const r = await fetch(`/api/designs/${doc.id}/delivery`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: stored.revision, purpose: "review" }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `hermicad-review-r${stored.revision}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`بستهٔ بازبینی نسخهٔ ${stored.revision} دریافت شد؛ آمادهٔ اجرا نیست.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ساخت بسته ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/guide"
            onClick={(e) => {
              if (dirty && !window.confirm("تغییرات ذخیره نشده‌اند. بدون ذخیره خارج می‌شوید؟")) e.preventDefault();
            }}
            className="text-xs text-teal-200"
          >
            ← پرونده‌های راهنما
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold">{doc.name}</h1>
          <p className="mt-2 text-sm text-slate-400">یک پرونده، یک مدل، یک نسخهٔ مشخص برای تحویل</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip">
            نسخهٔ {doc.revision} · {dirty ? "ذخیره‌نشده" : "ذخیره‌شده"}
          </span>
          <button
            className="btn"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `hermicad-local-${doc.id}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            پشتیبان محلی JSON
          </button>
          <button disabled={busy} onClick={() => save()} className="btn">
            ذخیرهٔ پرونده
          </button>
          <button disabled={busy} onClick={openModel} className="btn">
            ذخیره و بازکردن نقشه
          </button>
        </div>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="panel p-4 lg:sticky lg:top-24">
          <h2 className="mb-3 font-bold">مسیر انجام پروژه</h2>
          <select
            aria-label="مرحلهٔ جاری"
            className="field mb-3 lg:hidden"
            value={step}
            disabled={busy}
            onChange={(e) => change({ step: Number(e.target.value) })}
          >
            {STEPS.map((label, i) => (
              <option key={label} value={i}>
                {i + 1}. {label}
              </option>
            ))}
          </select>
          <nav aria-label="مراحل پروژه" className="hidden space-y-1 lg:block">
            {STEPS.map((label, i) => (
              <button
                key={label}
                disabled={busy}
                aria-current={i === step ? "step" : undefined}
                onClick={() => change({ step: i })}
                className={`flex w-full items-center gap-3 rounded-lg p-3 text-right text-sm ${i === step ? "bg-teal-400/15 text-teal-200" : "text-slate-300 hover:bg-white/5"}`}
              >
                <span className="mono text-xs">{i + 1}</span>
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-5 border-t border-white/10 pt-4 text-xs leading-6">
            <p>
              اطلاعات ثبت‌شده: {report?.information.completed ?? "—"} از {report?.information.total ?? "—"}
            </p>
            <p className="mt-2 text-amber-200">این عدد درصد تکمیل فرم است، نه درصد ایمنی یا انطباق.</p>
            <p className="mt-2 hidden text-slate-400 lg:block">اگر پاسخ را نمی‌دانید، خالی بگذارید. حدس زدن الزامی نیست.</p>
          </div>
        </aside>
        <div className="min-w-0">
          <section className="panel p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">
                {step + 1}. {STEPS[step]}
              </h2>
              <span className="chip">
                {step + 1} از {STEPS.length}
              </span>
            </div>
            <fieldset disabled={busy} className="min-w-0 space-y-5">
              {step === 0 && (
                <>
                  <label className="block text-sm">
                    نام پروژه
                    <input
                      className="field mt-2"
                      value={doc.name}
                      maxLength={150}
                      onChange={(e) => setDoc((d) => ({ ...d, name: e.target.value, project: { ...d.project, name: e.target.value } }))}
                    />
                  </label>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="text-sm">
                      کاربری اصلی
                      <select
                        className="field mt-2"
                        aria-label="کاربری اصلی"
                        value={brief.use}
                        onChange={(e) => change({ use: e.target.value as Brief["use"] })}
                      >
                        {USES.map(([id, label]) => (
                          <option value={id} key={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      هدف نهایی شما
                      <select
                        className="field mt-2"
                        aria-label="هدف نهایی شما"
                        value={brief.goal}
                        onChange={(e) => change({ goal: e.target.value as Brief["goal"] })}
                      >
                        <option value="concept">پیش‌طرح و بررسی گزینه‌ها</option>
                        <option value="permit">مدارک پروانه</option>
                        <option value="execution">نقشه‌ها و مدارک اجرایی</option>
                      </select>
                    </label>
                  </div>
                  <p className="rounded-lg bg-amber-400/5 p-4 text-sm leading-7 text-amber-100">
                    هدف شما ثبت می‌شود؛ انتخاب «اجرایی» یا «پروانه» به معنای توانایی تولید و تأیید خودکار آن نیست. نسخهٔ فعلی بستهٔ بازبینی
                    مقدماتی می‌دهد و موانع تحویل نهایی را نگه می‌دارد.
                  </p>
                  <p className="text-sm leading-7 text-slate-300">
                    سه قانون ساده: اطلاعات نامعلوم را خالی بگذارید؛ حدود مجاز را فقط از مدارک پروژه بردارید؛ قبل از تحویل، صفحهٔ کنترل و
                    کمبودها را ببینید.
                  </p>
                </>
              )}
              {(step === 1 || step === 2) && (
                <>
                  <p className="text-sm leading-7 text-slate-400">
                    {step === 1
                      ? "اطلاعات واقعی زمین و مجوز را وارد کنید. این کنترل اولیه برای ابعاد مستطیلی است؛ حدود دقیق زمین نامنظم نیاز به کنترل هندسی جدا دارد."
                      : "نیاز پروژه را ثبت کنید. این اطلاعات درخواست شماست و نقشه را خودکار بازطراحی نمی‌کند؛ مغایرت با مدل در مرحلهٔ کنترل نشان داده می‌شود."}
                  </p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    {activeFields(brief)
                      .filter((f) => f.step === step)
                      .map((f) => (
                        <Question
                          key={f.key}
                          field={f}
                          value={brief.values[f.key]}
                          onChange={(v) => change({ values: { ...brief.values, [f.key]: v } })}
                        />
                      ))}
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <h3 className="font-bold">کدام رشته‌ها در محدودهٔ کار شما هستند؟</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {TRADES.map(([id, label]) => (
                      <label key={id} className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-sm">
                        <input type="checkbox" checked={brief.trades.includes(id)} onChange={() => toggleTrade(id)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs leading-6 text-slate-400">
                    حذف یک رشته فقط محدودهٔ این پرونده و بسته را عوض می‌کند؛ به معنی معافیت قانونی پروژه نیست.
                  </p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    {activeFields(brief)
                      .filter((f) => f.step === 3)
                      .map((f) => (
                        <Question
                          key={f.key}
                          field={f}
                          value={brief.values[f.key]}
                          onChange={(v) => change({ values: { ...brief.values, [f.key]: v } })}
                        />
                      ))}
                  </div>
                  <h3 className="pt-4 font-bold">مدارک و مراجع مبنا</h3>
                  <p className="text-sm leading-7 text-amber-100">
                    این فهرست راهنمای اولیه است، نه فهرست جامع تمام الزامات. ویرایش آخر، اصلاحیه، تاریخ لازم‌الاجرا و دورهٔ گذار باید برای
                    پروژه بررسی شوند. ثبت اطلاعات زیر «تأیید مرجع توسط سیستم» نیست.
                  </p>
                  {activeReferences(brief).map((r) => {
                    const source = brief.sources[r.id] ?? { reference: "", edition: "", date: "" };
                    return (
                      <details key={r.id} className="rounded-lg border border-white/10 p-4">
                        <summary className="cursor-pointer text-sm font-semibold">
                          {r.label}{" "}
                          <span className="mr-2 text-xs text-amber-200">{source.reference ? "ثبت اولیه؛ تأییدنشده" : "اطلاعات لازم"}</span>
                        </summary>
                        <p className="my-3 text-xs leading-6 text-slate-400">{r.help}</p>
                        <div className="space-y-3">
                          {(["reference", "edition", "date"] as const).map((key) => (
                            <label key={key} className="block text-xs">
                              {key === "reference"
                                ? "شماره سند، مرجع صادرکننده و نشانی منبع"
                                : key === "edition"
                                  ? "ویرایش، اصلاحیه و مبنای لازم‌الاجرا بودن"
                                  : "تاریخ بررسی سند (میلادی)"}
                              <input
                                className="field mt-1"
                                type={key === "date" ? "date" : "text"}
                                maxLength={2000}
                                value={source[key]}
                                onChange={(e) => change({ sources: { ...brief.sources, [r.id]: { ...source, [key]: e.target.value } } })}
                              />
                            </label>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </>
              )}
              {step === 4 && (
                <>
                  <div className="rounded-lg border border-amber-400/30 p-4 text-sm leading-7">
                    <strong>تحویل اجرایی/پروانه: تأیید نشده</strong>
                    <p>حتی اگر اطلاعات فرم کامل باشد، انطباق همهٔ ضوابط و محاسبات اجرایی باید مستقل بررسی شوند.</p>
                  </div>
                  {report && (
                    <>
                      <p className="text-sm leading-7 text-slate-400">{report.basis}؛ برای هر مورد، اقدام بعدی مشخص شده است.</p>
                      <div className="space-y-3">
                        {report.findings.map((f, i) => (
                          <article
                            key={`${f.id}-${i}`}
                            className={`rounded-lg border p-4 ${f.kind === "conflict" ? "border-rose-400/40 bg-rose-400/5" : "border-white/10"}`}
                          >
                            <span className="text-xs text-amber-200">
                              {f.kind === "conflict" ? "مغایرت" : f.kind === "missing" ? "اطلاعات/مدل ناقص" : "نیازمند بررسی متخصص"}
                            </span>
                            <h3 className="mt-2 text-sm font-bold">{f.message}</h3>
                            <p className="my-2 text-xs leading-7 text-slate-300">{f.action}</p>
                            {f.step < 4 ? (
                              <button className="btn text-xs" onClick={() => change({ step: f.step })}>
                                رفتن به {STEPS[f.step]}
                              </button>
                            ) : (
                              f.id !== "engineering" && (
                                <button className="btn text-xs" onClick={openModel}>
                                  ذخیره و اصلاح نقشه
                                </button>
                              )
                            )}
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              {step === 5 && (
                <>
                  <p className="text-sm leading-7 text-slate-300">
                    خروجی‌های موردنیاز را انتخاب کنید. تمام فایل‌ها از یک نسخهٔ ذخیره‌شده ساخته می‌شوند؛ گزارش کمبودها و مدارک مبنا همراه
                    آن‌هاست. پلان هر طبقهٔ دارای مدل جداگانه صادر می‌شود؛ نبود مدل هر طبقه گزارش می‌شود. فایل خالیِ رشتهٔ طراحی‌نشده تحویل
                    نمی‌شود.
                  </p>
                  <div className="space-y-3">
                    {availableOutputs(brief).map((o) => (
                      <label key={o.id} className="flex items-start gap-3 rounded-lg border border-white/10 p-4 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={brief.outputs.includes(o.id)}
                          onChange={() =>
                            change({
                              outputs: brief.outputs.includes(o.id) ? brief.outputs.filter((id) => id !== o.id) : [...brief.outputs, o.id],
                            })
                          }
                        />
                        <span>
                          {o.label}
                          <span className="mt-1 block text-xs text-slate-400">
                            {o.trade && o.trade !== "architecture"
                              ? "جانمایی یا جزئیات تیپ؛ نه محاسبات اجرایی"
                              : "بر اساس هندسهٔ موجود؛ نیازمند بازبینی"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="rounded-lg bg-amber-400/5 p-4 text-sm leading-7 text-amber-100">
                    وضعیت بسته: مقدماتی و تأییدنشده. {report?.findings.length ?? "—"} مورد باز همراه فایل‌ها ثبت می‌شود. خروجی اجرایی و
                    پروانه در این مسیر قفل است.
                  </div>
                  <button
                    disabled={!report?.canDownloadReview || busy || errors.length > 0}
                    onClick={download}
                    className="btn btn-primary w-full justify-center py-3"
                  >
                    {busy ? "در حال آماده‌سازی…" : "دریافت بستهٔ بازبینی (ZIP)"}
                  </button>
                  {!report?.canDownloadReview && (
                    <p className="text-xs leading-6 text-rose-200">
                      حداقل یک خروجی انتخاب کنید؛ برای همهٔ رشته‌های انتخاب‌شده مدل لازم است. کمبودها را در مرحلهٔ کنترل ببینید.
                    </p>
                  )}
                  <p className="text-xs leading-6 text-slate-400">
                    بسته شامل نقشه‌ها، سند مبنا، راهنمای فارسی، فهرست موارد باز و هش SHA-256 فایل‌هاست. ذخیرهٔ موفق به‌تنهایی تأیید نقشه
                    نیست.
                  </p>
                </>
              )}
            </fieldset>
            {errors.length > 0 && (
              <div role="alert" className="mt-4 rounded-lg border border-rose-400/30 p-4 text-xs leading-7 text-rose-200">
                {errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
            <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-5">
              <button className="btn" disabled={step === 0 || busy} onClick={() => change({ step: step - 1 })}>
                مرحلهٔ قبل
              </button>
              {step < 5 && (
                <button className="btn btn-primary" disabled={busy || errors.length > 0} onClick={next}>
                  {busy ? "در حال ذخیره…" : "ذخیره و مرحلهٔ بعد"}
                </button>
              )}
            </div>
          </section>
          <p role="status" className="mt-3 text-sm leading-7 text-teal-200">
            {notice}
          </p>
        </div>
      </div>
    </main>
  );
}
function Question({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: string | number | null) => void }) {
  const id = `brief-${field.key}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {field.label}
        {field.unit && <span className="mr-1 text-xs font-normal text-slate-400">({field.unit})</span>}
      </label>
      {field.type === "select" ? (
        <select
          id={id}
          aria-describedby={`${id}-help`}
          className="field mt-2"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">هنوز مشخص نیست</option>
          {field.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : field.type === "text" ? (
        <textarea
          id={id}
          aria-describedby={`${id}-help`}
          className="field mt-2"
          rows={2}
          maxLength={2000}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          aria-describedby={`${id}-help`}
          className="field mt-2"
          type="number"
          min={field.min}
          max={field.max}
          step={field.integer ? 1 : "any"}
          value={typeof value === "number" ? value : ""}
          placeholder="نامشخص"
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      )}
      <p id={`${id}-help`} className="mt-2 text-xs leading-6 text-slate-400">
        {field.help}
      </p>
      {field.type === "number" && (
        <p className="mt-1 text-[10px] text-slate-500">
          بازهٔ پذیرش نرم‌افزار: {field.min} تا {field.max}؛ نه حد مجاز مقررات.
        </p>
      )}
    </div>
  );
}

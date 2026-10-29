"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { solveFrame } from "@/domain/structures/frame/solver";
import { FRAME_FORMULAS } from "@/domain/structures/frame/formulas";
import { FrameEditor } from "./FrameEditor";
import { FRAME_FAMILIES } from "@/domain/structures/frame/model";
import { structuralNumber } from "@/domain/structures/numbers";
import type { StudioDocument } from "@/domain/studio/document";
import {
  GROUPS,
  familyOf,
  fieldsFor,
  referenceList,
  structuralErrors,
  type StructuralField,
  type StructuralProfile,
} from "@/domain/structures/catalog";
import { assessStructure } from "@/domain/structures/assessment";
const STEPS = [...GROUPS.map((g) => g[1]), "گزارش و مدارک لازم"];
export function StructuralWorkspace({ initial }: { initial: StudioDocument }) {
  const [doc, setDoc] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [message, setMessage] = useState("");
  const p = doc.brief!.structural!,
    family = familyOf(p.family)!;
  const dirty = JSON.stringify(doc) !== saved;
  const errors = useMemo(() => structuralErrors(p), [p]);
  const baseAssessment = useMemo(() => (errors.length ? null : assessStructure(p, { includeFrame: false })), [p, errors]);
  const frameResult = useMemo(
    () => (p.frame ? { ...solveFrame(p.frame), formulaRecords: Object.values(FRAME_FORMULAS) } : null),
    [p.frame],
  );
  const assessment = useMemo(() => (baseAssessment ? { ...baseAssessment, frame: frameResult } : null), [baseAssessment, frameResult]);
  const patch = (data: Partial<StructuralProfile>) => {
    setDoc((d) => ({ ...d, brief: { ...d.brief!, structural: { ...d.brief!.structural!, ...data } } }));
    setMessage("");
  };
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [p.step]);
  const save = async (snapshot = doc) => {
    if (structuralErrors(snapshot.brief!.structural).length) {
      setMessage("ابتدا مقدارهای نامعتبر را اصلاح کنید.");
      return null;
    }
    setBusy(true);
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
      setMessage(`ذخیره شد؛ نسخهٔ ${b.design.revision}`);
      return b.design as StudioDocument;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "ذخیره ناموفق بود.");
      return null;
    } finally {
      setBusy(false);
    }
  };
  const reload = async () => {
    if (dirty && !confirm("تغییرات ذخیره‌نشده جایگزین می‌شوند. در صورت نیاز ابتدا پشتیبان محلی بگیرید. آخرین نسخه بارگیری شود؟")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/designs/${doc.id}`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setDoc(b.design);
      setSaved(JSON.stringify(b.design));
      setReloadKey((k) => k + 1);
      setMessage("آخرین نسخه بارگیری شد.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "بازخوانی ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };
  const localBackup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "structural-local.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const download = async () => {
    const stored = dirty ? await save() : doc;
    if (!stored) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/designs/${doc.id}/structural-report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: stored.revision, purpose: "review" }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `structural-review-r${stored.revision}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("گزارش مقدماتی دریافت شد؛ نقشه یا تأیید اجرایی نیست.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "دریافت ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap justify-between gap-4">
        <div>
          <Link
            href="/guide"
            className="text-xs text-teal-200"
            onClick={(e) => {
              if (dirty && !confirm("تغییرات ذخیره نشده‌اند. بدون ذخیره خارج می‌شوید؟")) e.preventDefault();
            }}
          >
            ← پرونده‌ها
          </Link>
          <h1 className="mt-3 text-2xl font-bold">{doc.name}</h1>
          <p className="mt-2 text-sm text-teal-200">
            {family.name} · نسخهٔ {doc.revision} · {dirty ? "ذخیره‌نشده" : "ذخیره‌شده"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={reload} className="btn">
            بارگیری آخرین نسخه
          </button>
          <button onClick={localBackup} className="btn">
            پشتیبان محلی
          </button>
          <button disabled={busy || errors.length > 0} onClick={() => save()} className="btn">
            ذخیرهٔ پرونده
          </button>
          {family.building && (
            <Link
              className="btn"
              href={`/design/${doc.id}`}
              onClick={(e) => {
                if (dirty && !confirm("نقشه فقط نسخهٔ ذخیره‌شده را باز می‌کند. ادامه می‌دهید؟")) e.preventDefault();
              }}
            >
              استودیو ترسیم
            </Link>
          )}
        </div>
      </header>
      {p.family === "timber" && (
        <div role="note" className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm leading-7 text-amber-100">
          این شناسه قبلاً «چوبی و سبک» نام داشت. اگر پروندهٔ قدیمی مربوط به فولاد سردنوردشده است، نوع آن را با مدارک بررسی کنید؛
          هیچ داده‌ای خودکار جابه‌جا نشده است. برای فولاد سبک یک پروندهٔ مستقل بسازید و داده‌ها را با بازبینی متخصص انتقال دهید.
        </div>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="panel p-4">
          <h2 className="font-bold">مسیر تخصصی</h2>
          <select
            aria-label="مرحلهٔ تخصصی"
            className="field mt-3 lg:hidden"
            disabled={busy}
            value={p.step}
            onChange={(e) => patch({ step: Number(e.target.value) })}
          >
            {STEPS.map((s, i) => (
              <option key={s} value={i}>
                {i + 1}. {s}
              </option>
            ))}
          </select>
          <nav aria-label="مراحل تخصصی" className="mt-4 hidden space-y-2 lg:block">
            {STEPS.map((s, i) => (
              <button
                disabled={busy}
                aria-current={i === p.step ? "step" : undefined}
                className={`block w-full rounded-lg p-3 text-right text-sm ${i === p.step ? "bg-teal-400/15 text-teal-200" : ""}`}
                key={s}
                onClick={() => patch({ step: i })}
              >
                {i + 1}. {s}
              </button>
            ))}
          </nav>
          <p className="mt-5 text-xs leading-7">
            اطلاعات: {assessment?.information.completed ?? "—"} از {assessment?.information.total ?? "—"}
            <br />
            تکمیل اطلاعات، تأیید طراحی نیست.
          </p>
          <p className="mt-3 text-xs leading-6 text-amber-200">خروجی اجرایی: تأیید نشده</p>
        </aside>
        <section className="panel min-w-0 p-5 sm:p-7">
          <h2 className="mb-3 text-xl font-bold">
            {p.step + 1}. {STEPS[p.step]}
          </h2>
          <p className="mb-5 text-sm leading-7 text-slate-400">
            {family.scope}. پاسخ نامعلوم را خالی بگذارید. همهٔ بازه‌های فرم حدود نرم‌افزارند، نه مجوز یا ضابطهٔ طراحی.
          </p>
          <fieldset key={reloadKey} disabled={busy} className="min-w-0 space-y-5">
            {p.step < 4 && (
              <div className="grid gap-5 sm:grid-cols-2">
                {fieldsFor(p)
                  .filter((f) => f.group === GROUPS[p.step][0])
                  .map((f) => (
                    <Input
                      key={f.key}
                      field={f}
                      value={p.values[f.key]}
                      change={(value) => patch({ values: { ...p.values, [f.key]: value } })}
                    />
                  ))}
              </div>
            )}
            {p.step === 0 && (
              <>
                <h3 className="font-bold">مدارک مبنا و نسخهٔ مرجع</h3>
                <p className="text-xs leading-7 text-amber-100">
                  نام مرجع کافی نیست. ویرایش، اصلاحیه، تاریخ لازم‌الاجرا و دورهٔ گذار باید برای همین پروژه بررسی شوند. اطلاعات زیر اظهاری
                  است؛ سیستم آن را تأیید رسمی نمی‌کند.
                </p>
                {referenceList(p.family).map((ref) => {
                  const r = p.references[ref.id] ?? { document: "", edition: "", checkedAt: "" };
                  return (
                    <details key={ref.id} className="rounded-lg border border-white/10 p-4">
                      <summary className="cursor-pointer text-sm">{ref.label} — تأییدنشده</summary>
                      {(["document", "edition", "checkedAt"] as const).map((key) => (
                        <label key={key} className="mt-3 block text-xs">
                          {key === "document"
                            ? "شماره، ناشر و منبع سند"
                            : key === "edition"
                              ? "ویرایش، اصلاحیه و مبنای لازم‌الاجرا بودن"
                              : "تاریخ بررسی (میلادی)"}
                          <input
                            className="field mt-1"
                            type={key === "checkedAt" ? "date" : "text"}
                            maxLength={2000}
                            value={r[key]}
                            onChange={(e) => patch({ references: { ...p.references, [ref.id]: { ...r, [key]: e.target.value } } })}
                          />
                        </label>
                      ))}
                    </details>
                  );
                })}
              </>
            )}
            {(p.step === 3 || p.step === 4) && FRAME_FAMILIES.some((f) => f === p.family) && (
              <FrameEditor
                model={p.frame}
                onChange={(frame) => patch({ frame })}
                result={assessment?.frame ?? null}
                readOnly={p.step === 4}
              />
            )}
            {(p.step === 3 || p.step === 4) && assessment && (
              <>
                <div role="status" className="rounded-lg border border-amber-400/30 p-4 text-sm leading-7">
                  <strong>
                    {
                      {
                        "not-implemented": "حل‌گر اختصاصی این خانواده هنوز موجود نیست.",
                        "missing-input": "برای محاسبهٔ محدود، ورودی بیشتری لازم است.",
                        "outside-domain": "شرایط خارج از دامنهٔ این مدل محدود است.",
                        "limited-result": "نتیجهٔ محاسبهٔ محدود اولیه آماده است؛ نه تأیید سازه.",
                      }[assessment.status]
                    }
                  </strong>
                </div>
                {assessment.metrics.map((m) => (
                  <article key={m.id} className="rounded-lg border border-white/10 p-4">
                    <h3 className="text-sm font-bold">{m.label}</h3>
                    <p dir="ltr" className="my-2 text-left font-mono text-lg text-teal-200">
                      {Number(m.value.toPrecision(8))} {m.unit}
                    </p>
                    <code dir="ltr" className="block break-words text-left text-xs leading-6 text-slate-400">
                      {m.expression}
                    </code>
                  </article>
                ))}
                {assessment.comparisons.map((c) => (
                  <p key={c.label} className={`text-sm leading-7 ${c.withinUserCriterion ? "text-slate-300" : "text-rose-200"}`}>
                    {c.label}: {c.withinUserCriterion ? "در محدودهٔ عدد واردشده" : "خارج از محدودهٔ عدد واردشده"}؛ این وضعیت تأیید
                    آیین‌نامه‌ای نیست.
                  </p>
                ))}
                <h3 className="font-bold">فرض‌ها و محدودیت‌ها</h3>
                <ul className="list-inside list-disc space-y-2 text-xs leading-7 text-amber-100">
                  {assessment.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </>
            )}
            {p.step === 4 && assessment && (
              <>
                <h3 className="font-bold">مدارک اجرایی لازم؛ هنوز طراحی نشده</h3>
                {assessment.requiredDeliverables.map((d) => (
                  <p key={d.label} className="rounded-lg border border-white/10 p-3 text-sm">
                    {d.label} <span className="text-xs text-amber-200">— طراحی نشده</span>
                  </p>
                ))}
                <details className="rounded-lg border border-white/10 p-4">
                  <summary className="cursor-pointer">{assessment.missing.length} ورودی فعال هنوز ناقص است</summary>
                  {assessment.missing.map((m) => (
                    <p key={m.key} className="mt-2 text-xs">
                      {m.label}
                    </p>
                  ))}
                </details>
                <p className="text-xs leading-7 text-slate-400">
                  گزارش PDF فارسی، دادهٔ ورودی، روابط و نتایج JSON و فهرست هش فایل‌ها در ZIP ارائه می‌شود. برای مسیر فاقد حل‌گر، فقط پرونده
                  و کمبودها تحویل می‌شود؛ هیچ نقشهٔ ساختمانی جای نقشهٔ تخصصی نمی‌نشیند.
                </p>
                <button disabled={busy || errors.length > 0} className="btn btn-primary w-full justify-center" onClick={download}>
                  دریافت گزارش مقدماتی تخصصی
                </button>
              </>
            )}
          </fieldset>
          {errors.length > 0 && (
            <div role="alert" className="mt-4 text-sm leading-7 text-rose-200">
              {errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
          <p role="status" className="mt-4 text-sm text-teal-200">
            {message}
          </p>
          <div className="mt-6 flex justify-between border-t border-white/10 pt-4">
            <button className="btn" disabled={busy || p.step === 0} onClick={() => patch({ step: p.step - 1 })}>
              مرحلهٔ قبل
            </button>
            {p.step < 4 && (
              <button
                className="btn btn-primary"
                disabled={busy || errors.length > 0}
                onClick={() => save({ ...doc, brief: { ...doc.brief!, structural: { ...p, step: p.step + 1 } } })}
              >
                ذخیره و مرحلهٔ بعد
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
function Input({ field: f, value, change }: { field: StructuralField; value: unknown; change: (v: number | string | null) => void }) {
  const id = "structure-" + f.key;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {f.label}
        {f.unit && <span className="mr-1 text-xs font-normal">({f.unit})</span>}
      </label>
      {f.type === "select" ? (
        <select
          id={id}
          aria-describedby={id + "-help"}
          className="field mt-2"
          value={String(value ?? "")}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">نامشخص</option>
          {f.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : f.type === "text" ? (
        <textarea
          id={id}
          aria-describedby={id + "-help"}
          className="field mt-2"
          rows={2}
          maxLength={2000}
          value={String(value ?? "")}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <NumericInput id={id} value={value} change={change} />
      )}
      <p id={id + "-help"} className="mt-2 text-xs leading-6 text-slate-400">
        {f.help}
        {f.type === "number" && ` بازهٔ نرم‌افزار: ${f.min} تا ${f.max}.`}
      </p>
    </div>
  );
}

/** مقدار خام هنگام تایپ حفظ می‌شود تا ممیز/عدد فارسی از بین نرود؛ مدل فقط عدد معتبر می‌گیرد. */
function NumericInput({ id, value, change }: { id: string; value: unknown; change: (v: number | string | null) => void }) {
  const [raw, setRaw] = useState(String(value ?? ""));
  return (
    <input
      id={id}
      aria-describedby={id + "-help"}
      className="field mt-2"
      type="text"
      inputMode="decimal"
      maxLength={100}
      value={raw}
      placeholder="نامعلوم؛ عدد فارسی یا لاتین"
      onChange={(e) => {
        setRaw(e.target.value);
        change(structuralNumber(e.target.value));
      }}
    />
  );
}

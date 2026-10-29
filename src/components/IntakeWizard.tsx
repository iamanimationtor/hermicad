"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DEFAULT_ANSWERS,
  PARCEL_SHAPE_LABEL,
  parcelBoundary,
  reviewIntake,
  type IntakeAnswers,
  type ParcelShape,
} from "@/domain/intake";
import { DWELLING_LABEL } from "@/domain/requirements";
import type { DwellingType } from "@/domain/types";

const STEPS = [
  { id: 0, label: "زمین", hint: "شکل، ابعاد، عقب‌نشینی" },
  { id: 1, label: "ساختمان", hint: "طبقات، واحدها" },
  { id: 2, label: "محدودیت‌ها", hint: "تراکم، پارکینگ، خاک" },
  { id: 3, label: "بازبینی", hint: "اطلاعات ناقص و ساخت پروژه" },
];

const TYPES: DwellingType[] = ["studio", "twoBed", "threeBed", "fourBed"];

export function IntakeWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<IntakeAnswers>(DEFAULT_ANSWERS);
  const [busy, setBusy] = useState<"idle" | "creating" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string[]>([]);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const review = useMemo(() => reviewIntake(answers), [answers]);
  const boundary = useMemo(() => parcelBoundary(answers), [answers]);

  const update = <K extends keyof IntakeAnswers>(key: K, value: IntakeAnswers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));
  const updateUnit = (type: DwellingType, value: number) =>
    setAnswers((prev) => ({ ...prev, units: { ...prev.units, [type]: Math.max(0, value) } }));
  const updateArea = (type: DwellingType, value: number) =>
    setAnswers((prev) => ({ ...prev, areas: { ...prev.areas, [type]: Math.max(20, value) } }));

  const submit = async () => {
    setBusy("creating");
    setError(null);
    setDetail([]);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: answers.projectName,
          client: answers.client || null,
          description: `ورودی هدایت‌شده: ${PARCEL_SHAPE_LABEL[answers.parcelShape]} ${answers.widthM}×${answers.depthM} m · ${answers.floors} طبقه · ${answers.city}`,
          site: review.site,
          requirements: review.requirements,
        }),
      });
      const payload = (await response.json()) as { project?: { id: string; siteRevision: number; requirementRevision: number }; error?: string; detail?: string[] };
      if (!response.ok || !payload.project) {
        setError(payload.error ?? "ساخت پروژه ناموفق بود.");
        setDetail(payload.detail ?? []);
        setBusy("idle");
        return;
      }
      setCreatedProjectId(payload.project.id);
      setBusy("generating");
      const generated = await fetch(`/api/projects/${payload.project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: 20260101, variants: 5, expectedSiteRevision: payload.project.siteRevision, expectedRequirementRevision: payload.project.requirementRevision }),
      });
      const generatedPayload = (await generated.json()) as { bundle?: { schemes: { freshness: { state: string } }[] }; activeAtRead?: boolean; error?: string; detail?: string[] };
      if (!generated.ok || !generatedPayload.bundle?.schemes.length) {
        setError(generatedPayload.error ?? "تولید طرح ناموفق بود.");
        setDetail(generatedPayload.detail ?? []);
        setBusy("idle");
        return;
      }
      if (!generatedPayload.activeAtRead || generatedPayload.bundle.schemes.some((scheme) => scheme.freshness.state !== "current")) {
        setError("اجرا ثبت شد، اما تا زمان پاسخ، ورودی یا اجرای فعال تغییر کرده بود؛ پروژه را باز کنید و وضعیت را بررسی کنید.");
        setBusy("idle");
        return;
      }
      router.push(`/projects/${payload.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای شبکه");
      setBusy("idle");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap gap-1">
          {STEPS.map((item) => (
            <button
              key={item.id}
              onClick={() => setStep(item.id)}
              className={`chip ${step === item.id ? "border-teal-400/60 bg-teal-400/15 text-teal-100" : ""}`}
              type="button"
            >
              {item.id + 1}. {item.label}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="project-name">نام پروژه *</label>
                <input id="project-name" className="field" value={answers.projectName} onChange={(e) => update("projectName", e.target.value)} placeholder="مثال: خانه حیاط‌دار نیلوفر" />
              </div>
              <div>
                <label className="label" htmlFor="project-city">شهر</label>
                <input id="project-city" className="field" value={answers.city} onChange={(e) => update("city", e.target.value)} />
              </div>
            </div>
            <div>
              <span className="label">شکل زمین</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(PARCEL_SHAPE_LABEL) as ParcelShape[]).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => update("parcelShape", shape)}
                    className={`btn text-[11px] ${answers.parcelShape === shape ? "border-teal-400/60 text-teal-200" : ""}`}
                  >
                    {PARCEL_SHAPE_LABEL[shape]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="label">عرض زمین (m)</span>
                <input type="number" min={6} className="field mono" value={answers.widthM} onChange={(e) => update("widthM", Number(e.target.value))} />
              </div>
              <div>
                <span className="label">عمق زمین (m)</span>
                <input type="number" min={6} className="field mono" value={answers.depthM} onChange={(e) => update("depthM", Number(e.target.value))} />
              </div>
            </div>
            <div>
              <span className="label">عقب‌نشینی شمال / جنوب / شرق / غرب (m)</span>
              <div className="grid grid-cols-4 gap-2">
                {(["north", "south", "east", "west"] as const).map((key) => (
                  <input
                    key={key}
                    type="number"
                    min={0}
                    step={0.5}
                    className="field mono"
                    value={answers.setbacks[key]}
                    onChange={(e) => update("setbacks", { ...answers.setbacks, [key]: Number(e.target.value) })}
                    aria-label={`عقب‌نشینی ${key}`}
                  />
                ))}
              </div>
            </div>
            <p className="text-[10px] leading-5 text-slate-400">
              مساحت محاسبه‌شده: <span className="mono text-teal-200">{review.plotAreaM2.toFixed(1)} m²</span> — از مرز تولیدشده با فرمول شولیس، نه از ضرب ابعاد.
              {answers.parcelShape !== "rectangle" && " برای شکل نامنظم، مختصات مرز از الگوی پیش‌فرض متناسب با ابعاد ساخته می‌شود و در کارگاه قابل ویرایش است."}
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="label">تعداد طبقات</span>
                <input type="number" min={1} max={12} className="field mono" value={answers.floors} onChange={(e) => update("floors", Math.max(1, Number(e.target.value)))} />
              </div>
              <div>
                <span className="label">ارتفاع طبقه (m)</span>
                <input type="number" min={2.6} max={5} step={0.1} className="field mono" value={answers.floorHeightM} onChange={(e) => update("floorHeightM", Number(e.target.value))} />
              </div>
            </div>
            <div>
              <span className="label">چند واحد و با چند اتاق خواب؟</span>
              <table className="table-eng">
                <thead><tr><th>گونه</th><th>تعداد</th><th>زیربنای هدف (m²)</th></tr></thead>
                <tbody>
                  {TYPES.map((type) => (
                    <tr key={type}>
                      <td className="text-slate-100">{DWELLING_LABEL[type]}</td>
                      <td><input type="number" min={0} className="field mono w-24" value={answers.units[type]} onChange={(e) => updateUnit(type, Number(e.target.value))} /></td>
                      <td><input type="number" min={20} className="field mono w-28" value={answers.areas[type]} onChange={(e) => updateArea(type, Number(e.target.value))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[10px] text-slate-400">حداقل زیربنا ۸۵٪ مقدار هدف فرض می‌شود و به‌عنوان همین فرض در گزارش ثبت می‌گردد.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="label">سقف تراکم (٪)</span>
                <input type="number" min={50} max={1200} className="field mono" value={answers.farPercent} onChange={(e) => update("farPercent", Number(e.target.value))} />
              </div>
              <div>
                <span className="label">سقف سطح اشغال (٪)</span>
                <input type="number" min={10} max={100} className="field mono" value={answers.coveragePercent} onChange={(e) => update("coveragePercent", Number(e.target.value))} />
              </div>
              <div>
                <span className="label">پارکینگ به ازای هر واحد</span>
                <input type="number" min={0} max={3} step={0.5} className="field mono" value={answers.parkingPerUnit} onChange={(e) => update("parkingPerUnit", Number(e.target.value))} />
              </div>
              <div>
                <span className="label">سطح مالی</span>
                <select className="field" value={answers.budget} onChange={(e) => update("budget", e.target.value as IntakeAnswers["budget"])}>
                  <option value="economy">اقتصادی</option>
                  <option value="standard">استاندارد</option>
                  <option value="premium">پریمیوم</option>
                </select>
              </div>
              <div>
                <span className="label">ظرفیت باربری خاک (kPa) — اختیاری</span>
                <input
                  type="number"
                  min={0}
                  className="field mono"
                  value={answers.soilBearingKPa ?? ""}
                  placeholder="نامشخص"
                  onChange={(e) => update("soilBearingKPa", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              <div>
                <span className="label">پهنه لرزه‌ای — اختیاری</span>
                <select className="field" value={answers.seismicZone ?? ""} onChange={(e) => update("seismicZone", e.target.value === "" ? null : (e.target.value as IntakeAnswers["seismicZone"]))}>
                  <option value="">نامشخص</option>
                  <option value="low">کم‌خطر</option>
                  <option value="moderate">متوسط</option>
                  <option value="high">زیاد</option>
                  <option value="veryHigh">بسیار زیاد</option>
                </select>
              </div>
              <div>
                <span className="label">اقلیم</span>
                <select className="field" value={answers.climate} onChange={(e) => update("climate", e.target.value as IntakeAnswers["climate"])}>
                  <option value="hotDry">گرم و خشک</option>
                  <option value="hotHumid">گرم و مرطوب</option>
                  <option value="cold">سرد</option>
                  <option value="moderate">معتدل</option>
                </select>
              </div>
              <label className="flex items-center gap-2 self-end text-[11px] text-slate-300">
                <input type="checkbox" checked={answers.includeBasementParking} onChange={(e) => update("includeBasementParking", e.target.checked)} />
                پارکینگ زیرزمینی مجاز است
              </label>
            </div>
            <div>
              <span className="label">نیاز یا محدودیت خاص</span>
              <textarea className="field h-20 resize-none text-[11px]" value={answers.note} onChange={(e) => update("note", e.target.value)} placeholder="مثال: حیاط مرکزی، نور جنوبی، آسانسور، ورودی مهمان…" />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="panel-soft p-3">
                <h3 className="text-[11px] font-bold text-slate-100">زمین و برنامه</h3>
                <ul className="mt-1 space-y-1 text-[10px] leading-5 text-slate-300">
                  <li>مساحت زمین: <span className="mono">{review.plotAreaM2.toFixed(1)} m²</span></li>
                  <li>شکل: {PARCEL_SHAPE_LABEL[answers.parcelShape]} · ابعاد {answers.widthM}×{answers.depthM} m</li>
                  <li>عقب‌نشینی: {answers.setbacks.north}/{answers.setbacks.east}/{answers.setbacks.south}/{answers.setbacks.west} m</li>
                  <li>طبقات: {answers.floors} × {answers.floorHeightM} m</li>
                  <li>
                    واحدها:{" "}
                    {review.requirements.dwellings.length === 0
                      ? "تعیین نشده"
                      : review.requirements.dwellings.map((d) => `${DWELLING_LABEL[d.type]}×${d.count}`).join(" · ")}
                  </li>
                  <li>تراکم/اشغال: {answers.farPercent}٪ / {answers.coveragePercent}٪</li>
                </ul>
              </div>
              <div className="panel-soft p-3">
                <h3 className="text-[11px] font-bold text-amber-200">اطلاعات ناقص ({review.missing.length})</h3>
                <ul className="mt-1 space-y-1 text-[10px] leading-5 text-slate-300">
                  {review.missing.map((item) => (
                    <li key={item.id}>
                      <span className={item.blocking ? "text-rose-300" : "text-amber-200"}>{item.blocking ? "● الزامی" : "○ اختیاری"}</span> {item.question}
                      <span className="block text-slate-500">{item.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="panel-soft p-3">
              <h3 className="text-[11px] font-bold text-teal-200">فرضیات صریح (پنهان نمی‌شوند)</h3>
              <ul className="mt-1 space-y-1 text-[10px] leading-5 text-slate-300">
                {review.assumptions.map((a) => (
                  <li key={a.label}>• <span className="text-slate-100">{a.label}:</span> <span className="mono">{a.value}</span> — {a.why}</li>
                ))}
              </ul>
            </div>
            {(review.errors.length > 0 || error) && (
              <div className="rounded border border-rose-400/40 bg-rose-500/10 p-2 text-[11px] text-rose-200">
                {error && <p>{error}</p>}
                <ul className="list-inside list-disc">
                  {[...review.errors, ...detail].map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            {review.warnings.length > 0 && (
              <ul className="space-y-1 text-[10px] leading-5 text-amber-200">
                {review.warnings.slice(0, 5).map((w) => <li key={w}>⚠ {w}</li>)}
              </ul>
            )}
            {createdProjectId && busy === "idle" ? (
              <div role="status" className="rounded border border-amber-400/40 bg-amber-400/10 p-3 text-xs leading-6 text-amber-100">
                پروژه ثبت شده است، اما تولید کامل نشد. برای جلوگیری از ساخت پروژهٔ تکراری، ادامه را در همان پروژه انجام دهید.
                <Link href={`/projects/${createdProjectId}`} className="btn mt-2 block text-center">باز کردن پروژهٔ ثبت‌شده</Link>
              </div>
            ) : (
              <button className="btn btn-primary w-full" onClick={submit} disabled={!review.ready || busy !== "idle" || createdProjectId !== null} type="button">
                {busy === "creating" ? "در حال ساخت پروژه…" : busy === "generating" ? "تولید طرح‌ها و اعتبارسنجی…" : "ساخت پروژه و تولید ۵ طرح"}
              </button>
            )}
            <p className="text-[10px] leading-5 text-slate-500">
              پس از ساخت، می‌توانید پلان بازبینی، کنترل‌های محدود، اصلاح و خروجی‌ها را ببینید؛ این‌ها نقشهٔ آمادهٔ اجرا یا تأیید مهندسی نیستند.
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-between">
          <button className="btn" type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>قبلی</button>
          {step < 3 && (
            <button className="btn btn-primary" type="button" onClick={() => setStep((s) => Math.min(3, s + 1))}>بعدی</button>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="panel p-4">
          <h2 className="text-sm font-bold text-slate-100">پیش‌نمایش زمین و پلان فرضی</h2>
          <p className="mt-1 text-[10px] leading-5 text-slate-400">
            مرز زمین و محدوده پس از عقب‌نشینی (برش نیم‌صفحه) بلافاصله محاسبه می‌شود. پلان واقعی پس از تولید در کارگاه با دیوار، بازشو و ابعاد نمایش داده می‌شود.
          </p>
          <IntakeSketch boundary={boundary} setbacks={answers.setbacks} />
        </div>
        <div className="panel p-4">
          <h3 className="text-[11px] font-bold text-slate-100">این مرحله چه چیزی می‌سازد؟</h3>
          <ul className="mt-1 space-y-1 text-[10px] leading-5 text-slate-300">
            <li>• مرز زمین از ابعاد/شکل انتخابی و عقب‌نشینی جهت‌دار → محدوده واقعی ساخت‌پذیر</li>
            <li>• برنامه واحدها و سقف‌های تراکم/اشغال به مدل مرکزی (CEM) منتقل می‌شود</li>
            <li>• ۵ راهبرد حجمی با دیوار، در، پنجره، پله/آسانسور و اندازه‌گذاری تولید می‌شود</li>
            <li>• اعتبارسنجی ۲۱ قاعده + لایه پلان اجرا و ایرادها نشان داده می‌شود</li>
          </ul>
          <p className="mt-2 rounded border border-amber-400/30 bg-amber-400/10 p-2 text-[10px] leading-5 text-amber-100">
            اعداد سازه/تأسیسات همچنان «غربالگری مقدماتی» و ضوابط «تأییدنشده» هستند؛ این مرحله ادعای طراحی اجرایی یا انطباق قانونی نمی‌کند.
          </p>
        </div>
      </section>
    </div>
  );
}

function IntakeSketch({ boundary, setbacks }: { boundary: { x: number; y: number }[]; setbacks: IntakeAnswers["setbacks"] }) {
  if (boundary.length < 3) return <p className="text-[11px] text-slate-400">مرز معتبر نیست.</p>;
  const xs = boundary.map((p) => p.x);
  const ys = boundary.map((p) => p.y);
  const minX = Math.min(...xs) - 3;
  const maxX = Math.max(...xs) + 3;
  const minY = Math.min(...ys) - 3;
  const maxY = Math.max(...ys) + 3;
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = 100 / Math.max(w, h);
  const pts = boundary.map((p) => `${p.x * scale},${(maxY - p.y) * scale}`).join(" ");
  // rough inset preview (not the engine result) to avoid duplicating geometry logic in UI
  const inset = boundary.map((p) => ({
    x: p.x + (p.x < (minX + maxX) / 2 ? setbacks.west : -setbacks.east),
    y: p.y + (p.y < (minY + maxY) / 2 ? setbacks.south : -setbacks.north),
  }));
  return (
    <div className="plan-frame mt-2">
      <svg viewBox={`-2 -2 ${w * scale + 4} ${h * scale + 4}`} style={{ background: "#f8fafc" }}>
        <polygon points={pts} fill="#dcfce7" stroke="#15803d" strokeWidth="0.6" />
        <polygon points={inset.map((p) => `${p.x * scale},${(maxY - p.y) * scale}`).join(" ")} fill="rgba(251,191,36,0.25)" stroke="#b45309" strokeWidth="0.4" strokeDasharray="2 1.5" />
      </svg>
    </div>
  );
}

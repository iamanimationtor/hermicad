"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeSite } from "@/domain/layout";
import { DWELLING_LABEL, applyRequirementsPatch, parseRequirementsText, validateRequirements, validateSite } from "@/domain/requirements";
import { polygonArea } from "@/domain/geometry";
import { DEFAULT_PROJECT_SITE } from "@/domain/requirements";
import { LEGACY_ASSUMED_SEISMIC_NOTE, UNKNOWN_SEISMIC_NOTE } from "@/domain/engineering/seismic";
import type { Climate, DwellingProgram, DwellingType, Requirements, SeismicZone, SiteModel, Vec2 } from "@/domain/types";
import { Bar, KeyValue, Panel, Stat, StatusBadge } from "@/components/ui";
import { fmt, type Ctx } from "./types";

/* --------------------------------------------------------------- site ----- */

function boundaryToText(boundary: Vec2[]): string {
  return boundary.map((p) => `${p.x}, ${p.y}`).join("\n");
}

function parseCoordinateLines(text: string, dimensions: 2 | 3): { points: number[][]; errors: string[] } {
  const points: number[][] = [], errors: string[] = [];
  text.split(/\n|;/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/[,،\s]+/);
    const numbers = parts.map(Number);
    if (parts.length !== dimensions || parts.some((part) => !part) || numbers.some((value) => !Number.isFinite(value)))
      errors.push(`خط ${index + 1}: دقیقاً ${dimensions} عدد متناهی وارد کنید.`);
    else points.push(numbers);
  });
  return { points, errors };
}

export function SiteView(ctx: Ctx) {
  const project = ctx.bundle.project;
  const [draft, setDraft] = useState<SiteModel>(project.site);
  const [text, setText] = useState(boundaryToText(project.site.boundary));
  const [spotText, setSpotText] = useState(project.site.spotLevels.map((s) => `${s.x}, ${s.y}, ${s.z}`).join("\n"));
  const [errors, setErrors] = useState<string[]>([]);

  // هم‌گام‌سازی با پروپ در فاز رندر (الگوی رسمی «تنظیم state هنگام تغییر پروپ»
  // به‌جای useEffect) — از رندر دوبارهٔ زنجیره‌ای جلوگیری می‌کند.
  const [syncedSite, setSyncedSite] = useState(project.site);
  if (syncedSite !== project.site) {
    setSyncedSite(project.site);
    setDraft(project.site);
    setText(boundaryToText(project.site.boundary));
    setSpotText(project.site.spotLevels.map((s) => `${s.x}, ${s.y}, ${s.z}`).join("\n"));
  }

  const analysis = useMemo(() => analyzeSite(draft), [draft]);
  const validation = useMemo(() => validateSite(draft), [draft]);

  const boundaryInput = parseCoordinateLines(text, 2);
  const levelsInput = parseCoordinateLines(spotText, 3);
  const coordinateErrors = [
    ...boundaryInput.errors.map((item) => `مرز: ${item}`),
    ...(boundaryInput.points.length < 3 ? ["مرز باید حداقل سه رأس معتبر داشته باشد."] : []),
    ...levelsInput.errors.map((item) => `تراز: ${item}`),
  ];

  const updateBoundary = (value: string) => {
    setText(value);
    const parsed = parseCoordinateLines(value, 2);
    if (!parsed.errors.length && parsed.points.length >= 3)
      setDraft((prev) => ({ ...prev, boundary: parsed.points.map(([x, y]) => ({ x, y })) }));
  };

  const updateSpotLevels = (value: string) => {
    setSpotText(value);
    const parsed = parseCoordinateLines(value, 3);
    if (!parsed.errors.length) setDraft((prev) => ({ ...prev, spotLevels: parsed.points.map(([x, y, z]) => ({ x, y, z })) }));
  };

  const save = async () => {
    ctx.setBusy("site");
    setErrors([]);
    try {
      const response = await fetch(`/api/projects/${ctx.projectId}/site`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": `"${project.siteRevision}"` },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json()) as { bundle?: Ctx["bundle"]; savedRevision?: number; error?: string; detail?: string[] };
      if (!response.ok || !payload.bundle) {
        ctx.setNotice({ kind: "error", text: payload.error ?? "ذخیره زمین ناموفق بود.", detail: payload.detail });
        setErrors(payload.detail ?? []);
        return;
      }
      ctx.applyBundle(payload.bundle);
      const superseded = payload.savedRevision !== payload.bundle.project.siteRevision;
      ctx.setNotice({ kind: superseded ? "info" : "ok", text: superseded
        ? `زمین شما در نسخهٔ ${payload.savedRevision} ذخیره شد، اما اکنون نسخهٔ جدیدتری وجود دارد؛ آن را بازبینی کنید.`
        : `زمین ذخیره شد (نسخه ${payload.savedRevision}). برای اعمال در طرح‌ها، مجدداً تولید کنید.` });
    } catch (e) {
      ctx.setNotice({ kind: "error", text: e instanceof Error ? e.message : "خطای شبکه" });
    } finally {
      ctx.setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <Panel title="مرز زمین" subtitle="هر خط یک رأس است: x, y (متر). زمین نامنظم با هر تعداد رأس مجاز است.">
          <textarea
            className="field field-mono h-40 resize-y"
            aria-label="رئوس مرز زمین (x, y)"
            value={text}
            onChange={(e) => updateBoundary(e.target.value)}
            spellCheck={false}
          />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="مساحت (شولیس)" value={fmt(polygonArea(draft.boundary), 1)} unit="m²" />
            <Stat label="رئوس" value={draft.boundary.length} />
            <Stat label="ساخت‌پذیر" value={fmt(analysis.buildableAreaM2, 1)} unit="m²" />
            <Stat label="نسبت ساخت‌پذیر" value={fmt(analysis.buildableRatio * 100, 1)} unit="%" />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <span className="label">تراز نقاط (x, y, z)</span>
              <textarea aria-label="تراز نقاط (x, y, z)" className="field field-mono h-24 resize-y" value={spotText} onChange={(e) => updateSpotLevels(e.target.value)} spellCheck={false} />
            </div>
            <div className="space-y-2">
              <div>
                <span className="label">عقب‌نشینی شمال / جنوب (m)</span>
                <div className="flex gap-2">
                  <input aria-label="عقب‌نشینی شمال" type="number" step="0.1" className="field" value={draft.setbacks.north} onChange={(e) => setDraft({ ...draft, setbacks: { ...draft.setbacks, north: Number(e.target.value) } })} />
                  <input aria-label="عقب‌نشینی جنوب" type="number" step="0.1" className="field" value={draft.setbacks.south} onChange={(e) => setDraft({ ...draft, setbacks: { ...draft.setbacks, south: Number(e.target.value) } })} />
                </div>
              </div>
              <div>
                <span className="label">عقب‌نشینی شرق / غرب (m)</span>
                <div className="flex gap-2">
                  <input aria-label="عقب‌نشینی شرق" type="number" step="0.1" className="field" value={draft.setbacks.east} onChange={(e) => setDraft({ ...draft, setbacks: { ...draft.setbacks, east: Number(e.target.value) } })} />
                  <input aria-label="عقب‌نشینی غرب" type="number" step="0.1" className="field" value={draft.setbacks.west} onChange={(e) => setDraft({ ...draft, setbacks: { ...draft.setbacks, west: Number(e.target.value) } })} />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <span className="label">ظرفیت باربری خاک (kPa)</span>
              <input aria-label="ظرفیت باربری خاک" type="number" className="field" value={draft.soilBearingKPa} onChange={(e) => setDraft({ ...draft, soilBearingKPa: Number(e.target.value) })} />
            </div>
            <div>
              <span className="label">زاویه شمال (deg)</span>
              <input aria-label="زاویه شمال" type="number" className="field" value={draft.northAngleDeg} onChange={(e) => setDraft({ ...draft, northAngleDeg: Number(e.target.value) })} />
            </div>
            <div>
              <span className="label">پهنه لرزه‌ای</span>
              <select aria-label="پهنه لرزه‌ای" className="field" value={draft.seismicZone ?? ""} onChange={(e) => {
                const zone = (e.target.value || null) as SeismicZone | null;
                setDraft({ ...draft, seismicZone: zone, notes: draft.notes.filter((note) => note !== LEGACY_ASSUMED_SEISMIC_NOTE && note !== UNKNOWN_SEISMIC_NOTE) });
              }}>
                <option value="">نامشخص — بدون محاسبهٔ لرزه‌ای</option>
                <option value="low">کم‌خطر</option>
                <option value="moderate">متوسط</option>
                <option value="high">زیاد</option>
                <option value="veryHigh">بسیار زیاد</option>
              </select>
            </div>
            <div>
              <span className="label">اقلیم</span>
              <select aria-label="اقلیم" className="field" value={draft.climate} onChange={(e) => setDraft({ ...draft, climate: e.target.value as Climate })}>
                <option value="hotDry">گرم و خشک</option>
                <option value="hotHumid">گرم و مرطوب</option>
                <option value="cold">سرد</option>
                <option value="moderate">معتدل</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={save} disabled={ctx.busy !== null || !validation.ok || coordinateErrors.length > 0} type="button">
              {ctx.busy === "site" ? "در حال ذخیره…" : "ذخیره زمین و نسخه جدید"}
            </button>
            <button className="btn" onClick={() => { setDraft(DEFAULT_PROJECT_SITE); setText(boundaryToText(DEFAULT_PROJECT_SITE.boundary)); setSpotText(DEFAULT_PROJECT_SITE.spotLevels.map((s) => `${s.x}, ${s.y}, ${s.z}`).join("\n")); }} type="button">
              بازیابی هندسهٔ نمونه (خاک و لرزه نامشخص)
            </button>
          </div>
          {(errors.length > 0 || validation.errors.length > 0 || coordinateErrors.length > 0) && (
            <ul className="mt-2 space-y-1 rounded border border-rose-400/40 bg-rose-500/10 p-2 text-[0.8125rem] text-rose-200">
              {[...coordinateErrors, ...validation.errors, ...errors].map((e, index) => <li key={`${index}-${e}`}>• {e}</li>)}
            </ul>
          )}
        </Panel>
      </div>
      <div className="space-y-4">
        <Panel title="پیش‌نمایش هندسی (بلادرنگ)" subtitle="خط سبز: مرز | خط‌چین نارنجی: محدوده ساخت‌پذیر | آبی: تراز نقاط">
          <SiteSketch site={draft} />
        </Panel>
        <Panel title="تحلیل زمین" subtitle="مقادیر بلافاصله از هندسه محاسبه می‌شوند (بدون دخالت UI).">
          <KeyValue
            items={[
              { label: "مساحت زمین", value: `${fmt(analysis.plotAreaM2, 1)} m²` },
              { label: "مساحت ساخت‌پذیر", value: `${fmt(analysis.buildableAreaM2, 1)} m²`, mono: true },
              { label: "شیب زمین", value: `${fmt(analysis.slope.averagePercent, 1)}٪ / افت ${fmt(analysis.slope.dropM, 2)} m` },
              { label: "جهت شیب", value: `${fmt(analysis.slope.directionDeg, 1)}°` },
              { label: "مستطیل محاطی بزرگ", value: analysis.primaryPlate ? `${fmt(analysis.primaryPlate.w, 1)} × ${fmt(analysis.primaryPlate.h, 1)} m` : "—", mono: true },
              { label: "بلوک ثانویه", value: analysis.secondaryPlate ? `${fmt(analysis.secondaryPlate.w, 1)} × ${fmt(analysis.secondaryPlate.h, 1)} m` : "ناموجود", mono: true },
            ]}
          />
          <div className="mt-3 space-y-1">
            {analysis.warnings.map((w) => (
              <p key={w} className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs leading-5 text-amber-200">• {w}</p>
            ))}
            <p className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs leading-5 text-slate-300">
              روش: عقب‌نشینی جهت‌دار با برش نیم‌صفحه و سپس جست‌وجوی بیشینه مستطیل محاطی روی شبکه ۱×۱ متر. برای زمین مقعر،
              نتیجه محدب و محافظه‌کارانه است.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SiteSketch({ site }: { site: SiteModel }) {
  const analysis = useMemo(() => analyzeSite(site), [site]);
  const points = site.boundary;
  if (points.length < 3) {
    return <p className="panel-soft p-6 text-center text-[0.8125rem] text-slate-400">برای پیش‌نمایش، حداقل سه رأس معتبر لازم است.</p>;
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - 4;
  const maxX = Math.max(...xs) + 4;
  const minY = Math.min(...ys) - 4;
  const maxY = Math.max(...ys) + 4;
  const w = maxX - minX;
  const h = maxY - minY;
  const poly = (list: Vec2[]) => list.map((p) => `${p.x.toFixed(2)},${(maxY - p.y).toFixed(2)}`).join(" ");
  return (
    <div className="plan-frame">
      <svg viewBox={`${minX} ${0} ${w} ${h}`} width="100%" style={{ background: "#f8fafc" }} role="img" aria-label="پیش‌نمایش زمین">
        <defs>
          <pattern id="site-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#e2e8f0" strokeWidth="0.08" />
          </pattern>
          <g id="north" />
        </defs>
        <rect x={minX} y={0} width={w} height={h} fill="url(#site-grid)" />
        <polygon points={poly(points)} fill="#dcfce7" stroke="#15803d" strokeWidth="0.16" />
        {analysis.buildablePolygon.length >= 3 && (
          <polygon points={poly(analysis.buildablePolygon)} fill="rgba(251,191,36,0.18)" stroke="#b45309" strokeWidth="0.12" strokeDasharray="0.8 0.5" />
        )}
        {site.spotLevels.map((s, i) => (
          <g key={`${s.x}-${s.y}-${i}`}>
            <circle cx={s.x} cy={maxY - s.y} r="0.4" fill="#0284c7" />
            <text x={s.x + 0.7} y={maxY - s.y + 0.3} fontSize="1" fill="#075985">{s.z.toFixed(1)}</text>
          </g>
        ))}
        <g transform={`translate(${maxX - 3} 4)`}>
          <line x1="0" y1="0" x2="0" y2="-2.4" stroke="#0f172a" strokeWidth="0.12" />
          <polygon points="-0.6,-1.5 0.6,-1.5 0,-2.6" fill="#0f172a" />
          <text x="0" y="1.4" fontSize="1" textAnchor="middle" fill="#0f172a">N</text>
        </g>
        <line x1={minX + 1} y1={h - 1.6} x2={minX + 11} y2={h - 1.6} stroke="#0f172a" strokeWidth="0.12" />
        <text x={minX + 1} y={h - 0.4} fontSize="0.9" fill="#0f172a">10 m</text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------- requirements ----- */

const TYPES: DwellingType[] = ["studio", "twoBed", "threeBed", "fourBed"];

export function RequirementsView(ctx: Ctx) {
  const project = ctx.bundle.project;
  const [draft, setDraft] = useState<Requirements>(project.requirements);
  const [raw, setRaw] = useState(project.requirements.rawText);
  const [parse, setParse] = useState(project.requirements.parse);

  const [syncedRequirements, setSyncedRequirements] = useState(project.requirements);
  if (syncedRequirements !== project.requirements) {
    setSyncedRequirements(project.requirements);
    setDraft(project.requirements);
    setRaw(project.requirements.rawText);
    setParse(project.requirements.parse);
  }

  const validation = validateRequirements(draft);
  const total = draft.dwellings.reduce((s, d) => s + d.count, 0);

  const setDwelling = (type: DwellingType, patch: Partial<DwellingProgram>) => {
    setDraft((prev) => ({
      ...prev,
      dwellings: prev.dwellings.some((d) => d.type === type)
        ? prev.dwellings.map((d) => (d.type === type ? { ...d, ...patch } : d))
        : [...prev.dwellings, { type, count: 0, targetAreaM2: 80, minAreaM2: 65, ...patch }],
    }));
  };

  const runParse = () => {
    const result = parseRequirementsText(raw, draft);
    const next = applyRequirementsPatch(draft, result.patch);
    setDraft({ ...next, rawText: raw, parse: result.parse });
    setParse(result.parse);
  };

  const save = async () => {
    ctx.setBusy("requirements");
    try {
      const response = await fetch(`/api/projects/${ctx.projectId}/requirements`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": `"${project.requirementRevision}"` },
        body: JSON.stringify({ ...draft, rawText: raw, parse }),
      });
      const payload = (await response.json()) as { bundle?: Ctx["bundle"]; savedRevision?: number; error?: string; detail?: string[] };
      if (!response.ok || !payload.bundle) {
        ctx.setNotice({ kind: "error", text: payload.error ?? "ذخیره نیازمندی ناموفق بود.", detail: payload.detail });
        return;
      }
      ctx.applyBundle(payload.bundle);
      const superseded = payload.savedRevision !== payload.bundle.project.requirementRevision;
      ctx.setNotice({ kind: superseded ? "info" : "ok", text: superseded
        ? `نیازمندی شما در نسخهٔ ${payload.savedRevision} ذخیره شد، اما اکنون نسخهٔ جدیدتری وجود دارد؛ آن را بازبینی کنید.`
        : `نیازمندی ذخیره شد (نسخه ${payload.savedRevision}).` });
    } catch (e) {
      ctx.setNotice({ kind: "error", text: e instanceof Error ? e.message : "خطای شبکه" });
    } finally {
      ctx.setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-4">
        <Panel title="متن نیازمندی و ساختاری‌سازی قطعی" subtitle="استخراج قاعده‌محور: هر مقدار با الگوی متن و اطمینان ثبت می‌شود؛ متن بدون الگو حدس زده نمی‌شود.">
          <textarea aria-label="متن نیازمندی" maxLength={100000} className="field h-24 resize-y text-[0.8125rem]" value={raw} onChange={(e) => {
            setRaw(e.target.value);
            setParse({ confidence: 0, warnings: ["متن تغییر کرده و هنوز استخراج مجدد نشده است؛ مقادیر ساختاریافتهٔ فعلی بدون تغییر می‌مانند."], trace: [], matched: [] });
          }} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="btn" onClick={runParse} type="button">استخراج و اعمال پیش‌نویس</button>
            <span className="chip">اطمینان پارس: {fmt(parse.confidence * 100, 0)}٪</span>
            <span className="chip">{parse.matched.length} تطبیق</span>
          </div>
          <div className="mt-2 space-y-1">
            <Bar value={parse.confidence * 100} max={100} tone={parse.confidence > 0.6 ? "teal" : "amber"} />
            {parse.trace.map((t) => (
              <p key={t} className="text-xs leading-5 text-slate-400">• {t}</p>
            ))}
            {parse.warnings.map((w) => (
              <p key={w} className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs leading-5 text-amber-200">• {w}</p>
            ))}
          </div>
        </Panel>

        <Panel title="برنامه واحدها" subtitle="تعداد، زیربنای هدف و حداقل زیربنای هر گونه واحد (خالص).">
          <div className="overflow-x-auto scroll-thin -mx-1 px-1">
            <table className="table-eng">
              <thead>
                <tr>
                  <th>گونه</th>
                  <th>تعداد</th>
                  <th>هدف (m²)</th>
                  <th>حداقل (m²)</th>
                </tr>
              </thead>
              <tbody>
                {TYPES.map((type) => {
                  const d = draft.dwellings.find((x) => x.type === type);
                  return (
                    <tr key={type}>
                      <td className="font-semibold text-slate-100">{DWELLING_LABEL[type]}</td>
                      <td>
                        <input type="number" min={0} className="field mono w-20" aria-label={`تعداد ${DWELLING_LABEL[type]}`} value={d?.count ?? 0} onChange={(e) => setDwelling(type, { count: Number(e.target.value) })} />
                      </td>
                      <td>
                        <input type="number" min={20} className="field mono w-24" aria-label={`مساحت هدف ${DWELLING_LABEL[type]}`} value={d?.targetAreaM2 ?? 80} onChange={(e) => setDwelling(type, { targetAreaM2: Number(e.target.value) })} />
                      </td>
                      <td>
                        <input type="number" min={20} className="field mono w-24" aria-label={`حداقل مساحت ${DWELLING_LABEL[type]}`} value={d?.minAreaM2 ?? 65} onChange={(e) => setDwelling(type, { minAreaM2: Number(e.target.value) })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between text-[0.8125rem]">
            <span className="text-slate-400">مجموع واحد درخواستی</span>
            <span className="mono font-bold text-teal-200">{total}</span>
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="محدودیت‌ها و شاخص‌های برنامه" subtitle="این مقادیر ورودی مستقیم موتور ضوابط هستند.">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <span className="label">حداکثر طبقات</span>
              <input aria-label="حداکثر طبقات" type="number" className="field" value={draft.floorsMax} onChange={(e) => setDraft({ ...draft, floorsMax: Number(e.target.value) })} />
            </div>
            <div>
              <span className="label">ارتفاع طبقه (m)</span>
              <input type="number" step="0.1" aria-label="ارتفاع طبقه" className="field" value={draft.floorHeightM} onChange={(e) => setDraft({ ...draft, floorHeightM: Number(e.target.value) })} />
            </div>
            <div>
              <span className="label">سقف تراکم (٪)</span>
              <input type="number" step="1" aria-label="سقف تراکم" className="field" value={Math.round(draft.farMax * 100)} onChange={(e) => setDraft({ ...draft, farMax: Number(e.target.value) / 100 })} />
            </div>
            <div>
              <span className="label">سقف سطح اشغال (٪)</span>
              <input type="number" step="1" aria-label="سقف سطح اشغال" className="field" value={Math.round(draft.coverageMax * 100)} onChange={(e) => setDraft({ ...draft, coverageMax: Number(e.target.value) / 100 })} />
            </div>
            <div>
              <span className="label">پارکینگ به ازای هر واحد</span>
              <input type="number" step="0.1" aria-label="پارکینگ به ازای هر واحد" className="field" value={draft.parkingPerDwelling} onChange={(e) => setDraft({ ...draft, parkingPerDwelling: Number(e.target.value) })} />
            </div>
            <div>
              <span className="label">پارکینگ مهمان (نسبت)</span>
              <input type="number" step="0.05" aria-label="نسبت پارکینگ مهمان" className="field" value={draft.visitorParkingRatio} onChange={(e) => setDraft({ ...draft, visitorParkingRatio: Number(e.target.value) })} />
            </div>
            <div>
              <span className="label">سطح مالی</span>
              <select aria-label="سطح مالی" className="field" value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value as Requirements["budget"] })}>
                <option value="economy">اقتصادی</option>
                <option value="standard">استاندارد</option>
                <option value="premium">پریمیوم</option>
              </select>
            </div>
            <div>
              <span className="label">جهت‌گیری ترجیحی</span>
              <select aria-label="جهت‌گیری ترجیحی" className="field" value={draft.orientationPreference} onChange={(e) => setDraft({ ...draft, orientationPreference: e.target.value as Requirements["orientationPreference"] })}>
                <option value="south">جنوب</option>
                <option value="east">شرق</option>
                <option value="west">غرب</option>
                <option value="north">شمال</option>
                <option value="balanced">متعادل</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-[0.8125rem] text-slate-300">
              <input type="checkbox" checked={draft.includeBasementParking} onChange={(e) => setDraft({ ...draft, includeBasementParking: e.target.checked })} />
              پارکینگ زیرزمینی مجاز است
            </label>
          </div>
          {!validation.ok && (
            <ul className="mt-2 space-y-1 rounded border border-rose-400/40 bg-rose-500/10 p-2 text-[0.8125rem] text-rose-200">
              {validation.errors.map((e) => <li key={e}>• {e}</li>)}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={save} disabled={ctx.busy === "requirements" || !validation.ok} type="button">
              {ctx.busy === "requirements" ? "در حال ذخیره…" : "ذخیره نیازمندی"}
            </button>
            <span className="chip">نسخه فعلی: {project.requirementRevision}</span>
            <StatusBadge status={validation.ok ? "pass" : "fail"} />
          </div>
        </Panel>

        <Panel title="یادداشت‌های ویژه پروژه" subtitle="در مدل مرکزی و خروجی‌ها ثبت می‌شود.">
          {draft.specialNotes.length === 0 ? (
            <p className="text-[0.8125rem] text-slate-400">یادداشتی ثبت نشده است.</p>
          ) : (
            <ul className="space-y-1 text-[0.8125rem] leading-5 text-slate-300">
              {draft.specialNotes.map((n) => <li key={n}>• {n}</li>)}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

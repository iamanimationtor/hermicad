"use client";

import { useMemo, useState } from "react";
import { floorPlanSvg, openingSchedule, planTotals, sitePlanSvg } from "@/domain/architecture/planApi";
import { auditScheme } from "@/domain/audit/geometryAudit";
import { buildFloorPlanScene } from "@/domain/drawing/scene";
import { DrawingBoard } from "./DrawingBoard";
import { CRITERIA, WEIGHT_GROUPS } from "@/domain/optimize";
import { unsafeMethodOutputIssues } from "@/domain/engineering/methodValidity";
import { EXPORT_FORMATS } from "@/domain/bundle";
import { Bar, KeyValue, Panel, Stat, StatusBadge } from "@/components/ui";
import { fmt, type Ctx } from "./types";

const EVIDENCE_LABEL: Record<string, string> = {
  "project-input": "ورودی پروژه",
  "internal-assumption": "فرض داخلی",
  "integrity-check": "کنترل یکپارچگی",
  "unverified-external": "ارجاع بیرونی تأییدنشده",
};

export function NoticeBar({ ctx }: { ctx: Ctx }) {
  if (!ctx.notice) return null;
  const tone =
    ctx.notice.kind === "ok"
      ? "border-teal-400/40 bg-teal-400/10 text-teal-100"
      : ctx.notice.kind === "error"
        ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
        : "border-sky-400/40 bg-sky-400/10 text-sky-100";
  return (
    <div role={ctx.notice.kind === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-[0.8125rem] leading-5 ${tone}`}>
      {ctx.notice.text}
      {ctx.notice.detail && ctx.notice.detail.length > 0 && (
        <ul className="mt-1 list-inside list-disc">
          {ctx.notice.detail.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </div>
  );
}

function PlanFigure({ ctx }: { ctx: Ctx }) {
  const scheme = ctx.active?.model;
  const svg = useMemo(() => {
    if (!scheme) return "";
    return ctx.planMode === "site"
      ? sitePlanSvg(scheme, `پلان زمین — ${scheme.code}`)
      : floorPlanSvg(scheme, ctx.levelIndex, `پلان طبقه — ${scheme.code}`);
  }, [scheme, ctx.planMode, ctx.levelIndex]);

  if (!scheme) {
    return <p className="panel-soft p-8 text-center text-[0.8125rem] text-slate-400">طرحی برای نمایش وجود ندارد.</p>;
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-white/15">
          <button className={`px-3 py-1.5 text-[0.8125rem] ${ctx.planMode === "site" ? "bg-teal-400/20 text-teal-100" : "text-slate-300"}`} onClick={() => ctx.setPlanMode("site")} type="button">
            پلان زمین
          </button>
          <button className={`px-3 py-1.5 text-[0.8125rem] ${ctx.planMode === "floor" ? "bg-teal-400/20 text-teal-100" : "text-slate-300"}`} onClick={() => ctx.setPlanMode("floor")} type="button">
            پلان طبقه نمونه
          </button>
        </div>
        {ctx.planMode === "floor" && (
          <select className="field w-auto py-1 text-[0.8125rem]" value={ctx.levelIndex} onChange={(e) => ctx.setLevelIndex(Number(e.target.value))}>
            {scheme.levels.map((level) => (
              <option key={level.index} value={level.index}>{level.name}</option>
            ))}
          </select>
        )}
        <span className="chip">{scheme.levels[ctx.levelIndex]?.plateAreaM2.toFixed(1)} m² در طبقه</span>
        <span className="chip">{scheme.levels[ctx.levelIndex]?.rooms.length} فضا</span>
      </div>
      <div className="plan-frame overflow-hidden border border-white/10" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-2 text-xs leading-5 text-slate-400">
        پلان شماتیک است: ضخامت دیوار، بازشو، مبلمان و مسیر تأسیسات مدل هندسی ندارند. مساحت خالص هر واحد ۸۸٪ ناخالص است.
      </p>
    </div>
  );
}

const OPENING_LABEL: Record<string, string> = {
  door: "در",
  entryDoor: "در ورودی",
  window: "پنجره",
  slidingDoor: "در کشویی",
};

const WALL_LABEL: Record<string, string> = {
  exterior: "پیرامونی (نما)",
  party: "مشترک بین واحدها",
  interior: "تیغه داخلی",
  shaft: "دیوار شفت/هسته",
};

export function PlanView(ctx: Ctx) {
  const scheme = ctx.active?.model;
  const [highlight, setHighlight] = useState<string[]>([]);
  if (!scheme) return <p className="panel-soft p-8 text-center text-[0.8125rem] text-slate-400">ابتدا طرح تولید کنید.</p>;
  const level = scheme.levels[Math.min(ctx.levelIndex, scheme.levels.length - 1)];
  const totals = planTotals(level);
  const schedule = openingSchedule(level);
  const stair = level.stair;
  const checks = level.planChecks ?? [];
  const failed = checks.filter((c) => !c.passed);
  const audit = auditScheme(scheme);
  const levelAudit = audit.levels.find((entry) => entry.level === level.index) ?? audit.levels[0];

  return (
    <div className="space-y-4">
      <Panel
        title={`پلان طبقه — ${level.name}`}
        subtitle={`${totals.walls} دیوار (${totals.wallLengthM} m) · ${totals.windows} پنجره · ${totals.doors} در · شیشه ${totals.glazedAreaM2} m² · سطح طبقه ${totals.floorAreaM2} m²`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select className="field w-auto py-1 text-[0.8125rem]" value={ctx.levelIndex} onChange={(e) => ctx.setLevelIndex(Number(e.target.value))}>
              {scheme.levels.map((item) => <option key={item.index} value={item.index}>{item.name}</option>)}
            </select>
            {failed.length === 0 ? <StatusBadge status="pass" /> : <span className="chip border-amber-400/40 bg-amber-400/10 text-amber-200">{failed.length} کنترل ناموفق</span>}
          </div>
        }
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="chip">الگوی چیدمان: {level.unitLayouts?.[0]?.patternLabel ?? "—"}</span>
          <span className="chip">{level.unitLayouts?.filter((u) => u.feasible).length ?? 0}/{level.unitLayouts?.length ?? 0} واحد با ابعاد قابل قبول</span>
          {highlight.length > 0 && (
            <button className="btn px-2 py-1 text-xs" onClick={() => setHighlight([])} type="button">پاک‌کردن نمایش مشکل</button>
          )}
        </div>
        <DrawingBoard
          scene={buildFloorPlanScene(scheme, ctx.levelIndex, { includeSiteContext: true })}
          projectId={ctx.projectId}
          schemeRowId={ctx.active!.rowId}
          schemeRevision={ctx.active!.revision}
          downloadAllowed={ctx.active?.freshness.state === "current" && unsafeMethodOutputIssues(scheme).length === 0}
          levelOptions={scheme.levels.map((item) => ({ index: item.index, name: item.name }))}
          levelIndex={ctx.levelIndex}
          onLevelChange={ctx.setLevelIndex}
        />
        <p className="mt-2 text-xs leading-5 text-slate-400">
          دیوارها با ضخامت مدل‌شده (نما ۰٫۲۵، مشترک ۰٫۲۰، تیغه ۰٫۱۰ m)، درها با کمان بازشدن، پنجره‌ها با سه خط، پله/آسانسور و اندازه‌گذاری مرجع ترسیم شده‌اند.
          این پلان «شواره طراحی» است: دیتیل اجرایی، مقاطع، آکس‌بندی و نقشه سازه/تأسیسات تأییدشده در آن نیست.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="کنترل‌های لایه پلان" subtitle="هر کنترل مستقل از ترسیم و از مدل مشتق شده است">
          <div className="overflow-x-auto scroll-thin -mx-1 px-1">
            <table className="table-eng">
              <thead><tr><th>کنترل</th><th>نتیجه</th><th>مقدار</th><th>الزام</th></tr></thead>
              <tbody>
                {checks.map((check) => (
                  <tr key={check.id}>
                    <td>
                      <div className="text-slate-100">{check.title}</div>
                      {check.reason && <div className="mt-0.5 text-xs leading-5 text-amber-200">{check.reason}</div>}
                    </td>
                    <td>
                      <StatusBadge status={check.passed ? "pass" : check.severity === "integrity" ? "fail" : "warn"} />
                      <div className="mt-1 text-[9px] text-slate-500">{check.severity === "integrity" ? "سلامت مدل" : "کیفیت طراحی (معیار داخلی)"}</div>
                    </td>
                    <td className="mono text-xs text-slate-300">{check.value}</td>
                    <td className="text-xs text-slate-400">
                      {check.requirement}
                      {(check.roomIds?.length ?? 0) > 0 && (
                        <button
                          className="mt-1 block text-xs text-teal-300 underline"
                          onClick={() => setHighlight(check.roomIds ?? [])}
                          type="button"
                        >
                          نمایش {check.roomIds!.length} فضای مرتبط در پلان
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="پله و آسانسور" subtitle="محاسبه ارتفاع/کف‌پله از ارتفاع طبقه و ابعاد واقعی هسته">
          {stair ? (
            <>
              <KeyValue
                items={[
                  { label: "ارتفاع طبقه", value: `${stair.floorToFloorM} m`, mono: true },
                  { label: "تعداد ارتفاع پله", value: String(stair.riserCount), mono: true },
                  { label: "ارتفاع هر پله", value: `${stair.riserHeightM} m`, mono: true },
                  { label: "کف‌پله (going)", value: `${stair.goingM} m`, mono: true },
                  { label: "عمق لازم (U شکل)", value: `${stair.requiredDepthM} m`, mono: true },
                  { label: "عمق موجود هسته", value: `${stair.availableDepthM} m`, mono: true },
                  { label: "عرض مفید پله", value: `${stair.stairWidthM} m`, mono: true },
                  { label: "ابعاد لازم آسانسور", value: `${stair.elevatorShaftM.requiredW}×${stair.elevatorShaftM.requiredH} m`, mono: true },
                ]}
              />
              <p className="mt-2"><StatusBadge status={stair.fits ? "pass" : "fail"} /></p>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-slate-400">
                {stair.notes.map((note) => <li key={note}>• {note}</li>)}
              </ul>
            </>
          ) : (
            <p className="text-[0.8125rem] text-slate-400">برای این طبقه پله محاسبه نشده است.</p>
          )}
        </Panel>
      </div>

      <Panel
        title="بازبینی مستقل هندسه و نورگیری"
        subtitle={`${audit.passed} در محدودهٔ کنترل · ${audit.warnings} هشدار · ${audit.failed} خارج از معیار · ${audit.insufficient} ارزیابی‌نشده — مرجع عقب‌نشینی: ${audit.setbackReference}`}
        action={<StatusBadge status={audit.planValid ? "pass" : "fail"} />}
      >
        <p className="mb-2 rounded border border-white/10 bg-white/5 p-2 text-xs leading-5 text-slate-300">
          {audit.setbackReferenceNote}
        </p>
        <div className="overflow-x-auto scroll-thin">
          <table className="table-eng">
            <thead><tr><th>کنترل مستقل</th><th>وضعیت</th><th>مقدار</th><th>الزام / علت</th></tr></thead>
            <tbody>
              {levelAudit.findings.map((finding) => (
                <tr key={finding.id}>
                  <td className="text-slate-100">{finding.title}<div className="mono mt-0.5 text-[9px] text-slate-500">{finding.id}</div></td>
                  <td><StatusBadge status={finding.status === "warning" ? "warn" : finding.status === "fail" ? "fail" : finding.status === "insufficient" ? "insufficient" : "pass"} /></td>
                  <td className="mono text-xs text-slate-300">{finding.value}</td>
                  <td className="text-xs leading-5 text-slate-400">
                    <div>{finding.requirement}</div>
                    <div className="mt-0.5 text-slate-500">{finding.detail}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Stat label="فضاهای قابل سکونت" value={levelAudit.daylight.habitable} />
          <Stat label="با پنجره معتبر" value={levelAudit.daylight.withValidWindow} tone={levelAudit.daylight.withValidWindow === levelAudit.daylight.habitable ? "good" : "warn"} />
          <Stat label="کمینه فاصله وجه دیوار تا مرز" value={levelAudit.minClearanceM === null ? "—" : `${levelAudit.minClearanceM.toFixed(3)}`} unit="m" tone={(levelAudit.minClearanceM ?? 0) >= -0.01 ? "good" : "bad"} />
        </div>
        {levelAudit.daylight.rejected.length > 0 && (
          <div className="mt-2 rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs leading-5 text-amber-100">
            <div className="font-bold">فضاهای بدون پنجره معتبر و علت دقیق:</div>
            <ul className="mt-1 space-y-0.5">
              {levelAudit.daylight.rejected.map((row) => (
                <li key={row.roomId}>• {row.label} (نمای {row.facadeM} m): {row.reason}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-2 text-xs leading-5 text-slate-500">{audit.disclaimer}</p>
      </Panel>

      <Panel title="الگوی چیدمان داخلی واحدها" subtitle="موتور برای هر واحد چند الگو می‌سازد، امتیاز می‌دهد و بهترین را انتخاب می‌کند؛ دلایل رد شدن بقیه ثبت می‌شود.">
        <div className="overflow-x-auto scroll-thin">
          <table className="table-eng">
            <thead><tr><th>واحد</th><th>گونه</th><th>الگوی انتخابی</th><th>امتیاز</th><th>وضعیت</th><th>الگوهای ردشده و دلیل</th><th>نکات</th></tr></thead>
            <tbody>
              {(level.unitLayouts ?? []).map((layout) => (
                <tr key={layout.unitIndex}>
                  <td className="mono text-xs text-teal-200">{layout.unitIndex}</td>
                  <td className="text-slate-100">{layout.type}</td>
                  <td className="text-slate-100">{layout.patternLabel}</td>
                  <td className="mono text-xs">{layout.score.toFixed(1)}</td>
                  <td><StatusBadge status={layout.feasible ? "pass" : "warn"} /></td>
                  <td className="text-xs leading-5 text-slate-400">
                    {layout.alternatives.filter((alt) => !alt.feasible).map((alt) => (
                      <div key={alt.patternId}>• {alt.label}: {alt.reason}</div>
                    ))}
                  </td>
                  <td className="text-xs leading-5 text-amber-200">
                    {layout.notes.map((note) => <div key={note}>• {note}</div>)}
                    {layout.darkHabitable.length > 0 && <div>• فضاهای بی‌نور: {layout.darkHabitable.join("، ")}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {scheme.layoutDecision && (
          <div className="mt-2 rounded border border-white/10 bg-white/5 p-2 text-xs leading-5 text-slate-300">
            <span className="font-bold text-white">تصمیم تعداد واحد در طبقه:</span>{" "}
            {scheme.layoutDecision.candidates
              .map((c) => `${c.unitsPerFloor} واحد → امتیاز ${c.adjusted}`)
              .join(" · ")}{" "}
            · انتخاب‌شده: <span className="mono text-teal-200">{scheme.layoutDecision.chosenUnitsPerFloor}</span>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="جدول بازشوها" subtitle="ابعاد، ارتفاع کف‌پنجره و دیوار میزبان">
          <div className="max-h-80 overflow-y-auto scroll-thin">
            <div className="overflow-x-auto scroll-thin -mx-1 px-1">
              <table className="table-eng">
                <thead><tr><th>دیوار</th><th>نوع</th><th>عرض</th><th>ارتفاع</th><th>کف</th><th>توضیح</th></tr></thead>
                <tbody>
                  {(level.openings ?? []).map((opening) => (
                    <tr key={opening.id}>
                      <td className="mono text-xs text-teal-200">{opening.wallId}</td>
                      <td className="text-slate-100">{OPENING_LABEL[opening.kind] ?? opening.kind}</td>
                      <td className="mono text-xs">{opening.widthM.toFixed(2)} m</td>
                      <td className="mono text-xs">{opening.heightM.toFixed(2)} m</td>
                      <td className="mono text-xs">{opening.sillM.toFixed(2)} m</td>
                      <td className="text-xs text-slate-400">{opening.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>

        <Panel title="جمع‌بندی دیوارها و اندازه‌ها" subtitle="برای کنترل سریع کاربر غیرمتخصص">
          <div className="grid grid-cols-2 gap-2">
            {(["exterior", "party", "interior", "shaft"] as const).map((kind) => {
              const list = (level.walls ?? []).filter((wall) => wall.kind === kind);
              return (
                <Stat
                  key={kind}
                  label={WALL_LABEL[kind]}
                  value={`${list.length}`}
                  unit={`دیوار / ${list.reduce((sum, wall) => sum + wall.lengthM, 0).toFixed(1)} m`}
                />
              );
            })}
          </div>
          <div className="mt-3 max-h-56 overflow-y-auto scroll-thin">
            <div className="overflow-x-auto scroll-thin -mx-1 px-1">
              <table className="table-eng">
                <thead><tr><th>اندازه</th><th>مقدار</th><th>نوع</th></tr></thead>
                <tbody>
                  {(level.dimensions ?? []).map((dim) => (
                    <tr key={dim.id}>
                      <td className="text-xs text-slate-300">{dim.label}</td>
                      <td className="mono text-xs text-slate-100">{dim.valueM.toFixed(2)} m</td>
                      <td className="text-xs text-slate-500">{dim.kind === "overall" ? "کلی" : "جزئی"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="دسترسی به خروجی‌ها" subtitle="همان مدل مرکزی، بدون بازسازی دستی">
        {ctx.active?.freshness.state === "current" && unsafeMethodOutputIssues(ctx.active.model).length === 0 ? <div className="flex flex-wrap gap-2">
          {["pdf", "dxf", "svg", "ifc", "xlsx", "csv", "json"].map((format) => (
            <a key={format} className="btn text-[0.8125rem]" href={`/api/projects/${ctx.projectId}/schemes/${encodeURIComponent(ctx.active!.rowId)}/export?format=${format}&revision=${ctx.active!.revision}`}>
              {format.toUpperCase()}
            </a>
          ))}
        </div> : <p className="text-amber-200">دریافت خروجی به‌دلیل تازگی نامعلوم/قدیمی یا روش خارج از دامنه غیرفعال است.</p>}
        <p className="mt-2 text-xs leading-5 text-slate-400">
          DXF در متر صادر می‌شود و SVG پلان دارای برچسب فارسی است. IFC صرفاً زیرمجموعهٔ فضایی IfcSpace را صادر می‌کند؛ سازگاری با نرم‌افزار مقصد و اسکیمای رسمی باید مستقل بررسی شود.
        </p>
      </Panel>
    </div>
  );
}

export function SchemesView(ctx: Ctx) {
  const schemes = ctx.bundle.schemes;
  const rankingById = useMemo(() => new Map(ctx.ranking.map((r) => [r.schemeId, r])), [ctx.ranking]);
  const active = ctx.active;
  if (schemes.length === 0) {
    return (
      <Panel title="طرحی وجود ندارد" subtitle="با اجرای تولید، پنج راهبرد حجم از زمین و برنامه واحدها ساخته می‌شود.">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="label">seed (قطعی)</span>
            <input type="number" className="field mono w-40" value={ctx.seed} onChange={(e) => ctx.setSeed(Number(e.target.value))} />
          </div>
          <div>
            <span className="label">تعداد راهبرد</span>
            <input type="range" min={1} max={5} value={ctx.variants} onChange={(e) => ctx.setVariants(Number(e.target.value))} className="w-40" />
          </div>
          <button className="btn btn-primary" onClick={ctx.onGenerate} disabled={ctx.busy === "generate"} type="button">
            {ctx.busy === "generate" ? "در حال تولید…" : "تولید طرح‌ها"}
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title="کنترل تولید و وزن تصمیم"
        subtitle="وزن‌ها بر رتبه‌بندی و جبهه پارتو اثر می‌گذارند؛ با تغییر هر وزن، رتبه‌بندی بلافاصله بازمحاسبه می‌شود."
        action={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <span className="label">seed</span>
              <input type="number" className="field mono w-32 py-1 text-[0.8125rem]" value={ctx.seed} onChange={(e) => ctx.setSeed(Number(e.target.value))} />
            </div>
            <div>
              <span className="label">راهبردها: {ctx.variants}</span>
              <input type="range" min={1} max={5} value={ctx.variants} onChange={(e) => ctx.setVariants(Number(e.target.value))} className="w-28" />
            </div>
            <button className="btn" onClick={ctx.onGenerate} disabled={ctx.busy === "generate"} type="button">
              {ctx.busy === "generate" ? "تولید…" : "بازتولید"}
            </button>
            <button className="btn" onClick={ctx.onSaveWeights} disabled={ctx.busy !== null || active?.freshness.state !== "current"} type="button">
              ذخیره وزن‌ها
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {WEIGHT_GROUPS.map((group) => (
            <div key={group.id}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-300">{group.label}</span>
                <span className="mono text-teal-200">{Math.round((ctx.weights[group.id] ?? group.default) * 100)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                value={Math.round((ctx.weights[group.id] ?? group.default) * 100)}
                onChange={(e) => ctx.onWeightsChange({ ...ctx.weights, [group.id]: Number(e.target.value) / 100 })}
                className="w-full"
              />
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
        {schemes.map((stored) => {
          const rank = rankingById.get(stored.model.id);
          const isActive = active?.model.id === stored.model.id;
          return (
            <button
              key={stored.rowId}
              onClick={() => ctx.onSelectScheme(stored.model.id)}
              className={`panel-soft p-3 text-right transition ${isActive ? "border-teal-400/60 bg-teal-400/10" : "hover:border-white/25"}`}
              type="button"
            >
              <div className="flex items-center justify-between">
                <span className="mono text-xs text-teal-200">{stored.model.code}</span>
                <span className="mono text-[0.8125rem] font-bold text-white">{fmt(rank?.score ?? stored.score, 1)}{rank && !rank.comparisonComplete ? " (جزئی)" : ""}</span>
              </div>
              <div className="mt-1 text-[0.8125rem] font-semibold leading-5 text-slate-100">{stored.model.strategyLabel}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {rank?.pareto && <span className="chip border-teal-400/40 bg-teal-400/10 text-teal-200">پارتو</span>}
                {stored.report.blocked ? (
                  <span className="chip border-rose-400/40 bg-rose-500/10 text-rose-200">نقص بحرانی</span>
                ) : (
                  <span className="chip">بدون نقص بحرانی</span>
                )}
                {(rank?.verification.insufficientRules ?? 0) > 0 && (
                  <span className="chip border-amber-400/40 bg-amber-400/10 text-amber-200">
                    {rank?.verification.insufficientRules} ارزیابی‌نشده
                  </span>
                )}
                <span className="chip border-slate-400/30 bg-slate-400/10 text-slate-300">مشورتی</span>
              </div>
              <div className="mono mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>{stored.model.unitsTotal} واحد</span>
                <span>{(stored.model.grossFloorAreaM2 / stored.model.plotAreaM2).toFixed(2)} FAR</span>
              </div>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <Panel
            title={`${active.model.code} — ${active.model.strategyLabel}`}
            subtitle={`seed ${active.model.seed} · موتور ${active.model.engineVersion} · ${active.model.unitsPerFloor} واحد در طبقه × ${active.model.floors} طبقه`}
            action={
              <div className="flex flex-wrap items-center gap-1">
                <StatusBadge status={active.report.blocked ? "fail" : "not-blocked"} />
                {rankingById.get(active.model.id)?.pareto && <span className="chip border-teal-400/40 bg-teal-400/10 text-teal-200">جبهه پارتو</span>}
              </div>
            }
          >
            <PlanFigure ctx={ctx} />
          </Panel>
          <div className="space-y-3">
            <Panel title="شاخص‌های کلیدی طرح">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="زیربنای کل" value={fmt(active.model.grossFloorAreaM2, 0)} unit="m²" />
                <Stat label="سطح اشغال" value={fmt(active.model.footprintAreaM2, 0)} unit="m²" />
                <Stat label="واحدها" value={`${active.model.unitsTotal}`} unit="واحد" hint={`درخواست: ${active.model.requirements.dwellings.reduce((s, d) => s + d.count, 0)}`} />
                <Stat label="بهره‌وری سطوح" value={fmt((active.model.netAreaM2 / Math.max(1, active.model.grossFloorAreaM2)) * 100, 1)} unit="%" />
                <Stat label="پارکینگ" value={`${active.model.parking.providedStalls}/${active.model.parking.requiredStalls}`} tone={active.model.parking.providedStalls >= active.model.parking.requiredStalls ? "good" : "bad"} />
                <Stat
                  label={rankingById.get(active.model.id)?.comparisonComplete ? "امتیاز مشورتی" : "امتیاز جزئی — مقایسه ناقص"}
                  value={fmt(rankingById.get(active.model.id)?.score ?? active.score, 1)}
                  unit={`از ${fmt(rankingById.get(active.model.id)?.rawScore ?? active.score, 0)} خام`}
                  hint={`ضریب اطمینان ${(rankingById.get(active.model.id)?.verification.confidencePenalty ?? 1).toFixed(2)}`}
                />
                <Stat label="نور برآوردی در حد داخلی" value={`${active.model.daylight.compliantRooms}/${active.model.daylight.habitableRooms}`} tone="warn" hint="نور واقعی و انطباق احراز نشده" />
              </div>
              <div className="mt-3 space-y-1.5">
                {["density", "daylight", "cost", "structure"].map((id) => {
                  const criterion = rankingById.get(active.model.id)?.criteria.find((c) => c.id === id);
                  if (!criterion) return null;
                  return (
                    <div key={id}>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{criterion.label}</span>
                        <span className="mono">{criterion.raw === null ? "نامشخص" : `${fmt(criterion.normalized * 100, 0)}٪`}</span>
                      </div>
                      {criterion.raw !== null && <Bar value={criterion.normalized * 100} max={100} />}
                    </div>
                  );
                })}
              </div>
            </Panel>
            <Panel title="وضعیت کنترل مقدماتی" subtitle={`${active.report.passed} در محدودهٔ معیار · ${active.report.warnings} هشدار · ${active.report.failed} خارج از معیار · ${active.report.insufficient ?? 0} ارزیابی‌نشده`}>
              <div className="flex flex-wrap gap-1">
                {Object.entries(active.report.categorySummary).map(([category, counts]) => (
                  <span key={category} className={`chip ${counts.fail > 0 ? "border-rose-400/40 bg-rose-500/10 text-rose-200" : counts.warn > 0 || (counts.insufficient ?? 0) > 0 ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-slate-400/30 bg-slate-400/5 text-slate-200"}`}>
                    {category}: {counts.pass} نتیجهٔ مثبت · {counts.insufficient ?? 0} ارزیابی‌نشده
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{active.report.disclaimer}</p>
              {rankingById.get(active.model.id) && (
                <div className="mt-2 rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs leading-5 text-amber-100">
                  <div className="font-bold">{rankingById.get(active.model.id)!.verification.label}</div>
                  <div className="mt-1">انحراف ورودی پروژه: {rankingById.get(active.model.id)!.verification.projectInputFailures} · آستانه داخلی: {rankingById.get(active.model.id)!.verification.internalAssumptionFailures} · ارجاع تأییدنشده: {rankingById.get(active.model.id)!.verification.unverifiedExternalFailures} · ارزیابی‌نشده: {rankingById.get(active.model.id)!.verification.insufficientRules}</div>
                  <ul className="mt-1 space-y-0.5">
                    {rankingById.get(active.model.id)!.verification.notes.map((note) => (
                      <li key={note}>• {note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      <Panel title="ماتریس مقایسه چندمعیاره" subtitle="خانه تیره‌تر = بهترین مقدار در آن معیار. جهت بهتر بودن هر معیار لحاظ شده است.">
        <div className="overflow-x-auto scroll-thin">
          <table className="table-eng">
            <thead>
              <tr>
                <th>معیار</th>
                <th>واحد</th>
                {schemes.map((s) => <th key={s.rowId} className="mono">{s.model.code}</th>)}
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((criterion) => {
                const values = schemes.map((s) => rankingById.get(s.model.id)?.criteria.find((item) => item.id === criterion.id)?.raw ?? null);
                const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
                const best = known.length === values.length && known.length > 0
                  ? (criterion.direction === "higher" ? Math.max(...known) : Math.min(...known))
                  : null;
                return (
                  <tr key={criterion.id}>
                    <td className="font-semibold text-white">{criterion.label}</td>
                    <td className="mono text-xs text-slate-400">{criterion.unit}</td>
                    {values.map((value, i) => (
                      <td key={schemes[i].rowId} className={`mono ${value !== null && best !== null && Math.abs(value - best) < 1e-9 ? "text-teal-300" : "text-slate-300"}`}>
                        {value === null ? "نامشخص" : fmt(value, value > 100 ? 0 : 2)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td className="font-semibold text-white">امتیاز مشورتی (پس از جریمه)</td>
                <td className="mono text-xs text-slate-400">0-100</td>
                {schemes.map((s) => {
                  const rank = rankingById.get(s.model.id);
                  return (
                    <td key={s.rowId} className="mono font-bold text-teal-200">
                      {fmt(rank?.score ?? s.score, 1)}{rank && !rank.comparisonComplete ? " (جزئی)" : ""}
                      {rank?.blocked ? <span className="mr-1 text-rose-300">*</span> : null}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="font-semibold text-white">جبهه پارتو</td>
                <td />
                {schemes.map((s) => (
                  <td key={s.rowId}>{rankingById.get(s.model.id)?.pareto === true ? <StatusBadge status="pass" /> : <span className="text-[0.8125rem] text-slate-500">{rankingById.get(s.model.id)?.pareto === null ? "نامشخص" : "—"}</span>}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
          <p className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-amber-100">
            این امتیاز <span className="font-bold">مشورتی</span> است و انطباق قانونی یا ایمنی را اثبات نمی‌کند: سند ضوابط تأییدنشده است، بخشی از آستانه‌ها داخلی و بخشی ورودی پروژه‌اند. رتبه‌بندی فقط برای مقایسه گزینه‌هاست.
          </p>
          <p>* جریمه‌ها: نقص بحرانی ×۰٫۶ · وجود قاعده ارزیابی‌نشده ×۰٫۹ · انحراف از آستانه داخلی ×۰٫۹۵؛ امتیاز خام برای ردیابی حفظ می‌شود. در دادهٔ ناقص، امتیاز فقط مجموع جزئی است و برترین طرح یا پارتو تعیین نمی‌شود.</p>
        </div>
      </Panel>
    </div>
  );
}

export function ValidationView(ctx: Ctx) {
  const active = ctx.active;
  if (!active) return <p className="panel-soft p-8 text-center text-[0.8125rem] text-slate-400">ابتدا طرح تولید کنید.</p>;
  const report = active.report;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[0.8125rem] leading-6 text-amber-100">
        <span className="font-bold">مجموعه آستانه‌های داخلی ({report.codeSetCode}@{report.codeSetEdition}) — وضعیت: {report.codeSetVerification ?? "unverified"}.</span>{" "}
        {report.codeSetNote ?? "این ضوابط رسمی نیستند و باید با سند تأییدشده پروژه جایگزین شوند."}
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        <Stat label="در محدودهٔ معیار" value={report.passed} hint="مقایسهٔ محدود؛ نه تأیید ضابطه" />
        <Stat label="هشدار" value={report.warnings} tone="warn" hint="مبتنی بر آستانه غیررسمی" />
        <Stat label="خارج از معیار" value={report.failed} tone={report.failed ? "bad" : "default"} hint="نه تخلف قانونی احرازشده" />
        <Stat label="اطلاعات ناکافی" value={report.insufficient ?? 0} tone={(report.insufficient ?? 0) > 0 ? "warn" : "default"} hint="نه انطباق، نه نقض" />
        <Stat label="کنترل بحرانی" value={report.blocked ? "مسدود" : "خطا ثبت نشده"} tone={report.blocked ? "bad" : "warn"} hint="به معنی تأیید پروژه نیست" />
      </div>

      <div className="panel-soft p-3">
        <h3 className="text-[0.8125rem] font-bold text-white">تفکیک سطوح شواهد</h3>
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(report.evidenceSummary ?? {}).map(([tier, count]) => (
            <span key={tier} className="chip">
              {EVIDENCE_LABEL[tier] ?? tier}: {count}
            </span>
          ))}
        </div>
        <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
          <li>• «نتیجهٔ مثبت این کنترل» فقط مقایسه با معیار موجود است؛ انطباق مقرراتی یا ایمنی احراز نشده است.</li>
          <li>• «ورودی پروژه» = آستانه از خود پروژه آمده، نه از سند قانونی.</li>
          <li>• «فرض داخلی» = آستانه پیش‌فرض غیررسمی HERMICAD؛ خروج از آن تخلف قانونی اثبات‌شده نیست.</li>
          <li>• «اطلاعات ناکافی» = ورودی لازم موجود نبوده؛ این وضعیت به معنی انطباق نیست.</li>
        </ul>
        {(report.dataCompleteness?.length ?? 0) > 0 && (
          <div className="mt-2 overflow-x-auto scroll-thin">
            <table className="table-eng">
              <thead><tr><th>کامل‌بودن داده</th><th>وضعیت</th><th>اثر</th></tr></thead>
              <tbody>
                {report.dataCompleteness!.map((item) => (
                  <tr key={item.item}>
                    <td className="text-slate-200">{item.item}</td>
                    <td>{item.present ? <StatusBadge status="present" /> : <span className="chip border-amber-400/40 bg-amber-400/10 text-amber-200">موجود نیست</span>}</td>
                    <td className="text-xs leading-5 text-slate-400">{item.impact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Panel
        title="اصلاح خودکار و بازاعتبارسنجی"
        subtitle="حلقه اصلاح فقط تغییرات قابل‌اجرا را اعمال می‌کند و اقدامات غیرقابل‌اجرا را صریحاً گزارش می‌دهد."
        action={
          <button className="btn btn-primary" onClick={ctx.onRepair} disabled={ctx.busy !== null || active.freshness.state !== "current"} type="button">
            {ctx.busy === "repair" ? "در حال اصلاح…" : "اجرای حلقه اصلاح"}
          </button>
        }
      >
        {ctx.repair ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              <span className="chip">طرح {ctx.repair.schemeCode}</span>
              <span className="chip">{ctx.repair.iterations} تکرار</span>
              <span className="chip">نقض: {ctx.repair.beforeFailed} → {ctx.repair.afterFailed}</span>
              <span className="chip">هشدار: {ctx.repair.beforeWarnings} → {ctx.repair.afterWarnings}</span>
            </div>
            <div className="overflow-x-auto scroll-thin -mx-1 px-1">
              <table className="table-eng">
                <thead>
                  <tr><th>قاعده</th><th>اقدام</th><th>وضعیت</th><th>جزئیات</th></tr>
                </thead>
                <tbody>
                  {ctx.repair.actions.map((action) => (
                    <tr key={`${action.ruleId}-${action.action}`}>
                      <td className="mono text-xs text-teal-200">{action.ruleId}</td>
                      <td className="text-slate-100">{action.action}</td>
                      <td><StatusBadge status={action.applied ? "pass" : "warn"} /></td>
                      <td className="text-[0.8125rem] leading-5 text-slate-300">{action.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-[0.8125rem] leading-6 text-slate-400">
            با اجرای اصلاح، تغییرات مجاز (کاهش طبقات، پارکینگ زیرزمینی، ادغام فضای کوچک، افزایش طبقات، اصلاح پی) اعمال و
            گزارش اعتبارسنجی بازتولید می‌شود.
          </p>
        )}
      </Panel>

      <Panel title="ارزیابی قاعده‌به‌قاعده" subtitle={`${report.evaluations.length} قاعده از ${report.codeSetCode}@${report.codeSetEdition}`}>
        <div className="overflow-x-auto scroll-thin">
          <table className="table-eng">
            <thead>
              <tr>
                <th>قاعده</th>
                <th>عنوان</th>
                <th>وضعیت</th>
                <th>سطح شواهد</th>
                <th>مقدار</th>
                <th>حد</th>
                <th>سند / بند</th>
                <th>متخذ از</th>
              </tr>
            </thead>
            <tbody>
              {report.evaluations.map((evaluation) => (
                <tr key={evaluation.ruleId}>
                  <td className="mono text-xs text-teal-200">{evaluation.ruleId}</td>
                  <td>
                    <span className="font-semibold text-white">{evaluation.title}</span>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-slate-400">پیام و ردیابی</summary>
                      <p className="mt-1 text-[0.8125rem] leading-5 text-slate-300">{evaluation.message}</p>
                      <ul className="mt-1 space-y-0.5 text-xs leading-5 text-slate-400">
                        {evaluation.trace.map((t) => <li key={t}>– {t}</li>)}
                      </ul>
                      <p className="mt-1 text-xs text-slate-400">روش: {evaluation.method}</p>
                      <p className="mt-1 text-xs text-amber-200">اقدام پیشنهادی: {evaluation.remediation}</p>
                      <p className="mt-1 text-xs text-slate-500">ممیزی منبع: {evaluation.document?.auditNote ?? "ثبت نشده"}</p>
                    </details>
                  </td>
                  <td>
                    <StatusBadge status={evaluation.status} />
                    {evaluation.status === "fail" && <div className="mt-1"><StatusBadge status={evaluation.severity} /></div>}
                  </td>
                  <td>
                    <span className="chip">{EVIDENCE_LABEL[evaluation.evidence] ?? evaluation.evidence}</span>
                    <div className="mt-1 text-[9px] text-slate-500">{evaluation.verification === "externally-verified" ? "تأییدشده بیرونی" : "تأییدنشده"}</div>
                  </td>
                  <td className="mono text-[0.8125rem] text-slate-200">{typeof evaluation.observed === "number" ? `${fmt(evaluation.observed, 2)} ${evaluation.unit}` : evaluation.observed}</td>
                  <td className="mono text-[0.8125rem] text-slate-400">{evaluation.required === null ? "نامشخص" : `${fmt(evaluation.required, 2)} ${evaluation.unit}`}</td>
                  <td className="text-xs leading-4 text-slate-400">
                    {evaluation.document?.title ?? "سند رسمی: در دسترس نیست"}
                    <div className="text-[9px] text-slate-500">
                      بند: {evaluation.document?.clause ?? "—"} · نسخه: {evaluation.document?.version ?? "—"} · {evaluation.document?.availability ?? "official-text-not-obtained"}
                    </div>
                  </td>
                  <td className="text-xs leading-4 text-slate-400">
                    {evaluation.source} · {evaluation.edition}
                    <div className="mt-1 text-[9px] text-slate-500">فرمول: {evaluation.formula}</div>
                    {evaluation.tests && <div className="mt-1 text-[9px] text-slate-500">آزمون منفی: {evaluation.tests.negative}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function AnalysisView(ctx: Ctx) {
  const scheme = ctx.active?.model;
  if (!scheme) return <p className="panel-soft p-8 text-center text-[0.8125rem] text-slate-400">ابتدا طرح تولید کنید.</p>;
  const status = scheme.analysisStatus;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-[0.8125rem] leading-6 text-sky-100">
        <span className="font-bold">مرحله تحلیل: {status?.level ?? "preliminary-screening"} — قابل استفاده برای ساخت: خیر.</span>{" "}
        این اعداد برآورد غربالگری‌اند و جایگزین محاسبات و تأیید مهندس دارای صلاحیت نیستند.
        <ul className="mt-1 list-inside list-disc text-xs leading-5">
          {(status?.limitations ?? []).map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="سازه — طرح مقدماتی" subtitle="روابط سرانگشتی با فرضیات صریح؛ جایگزین تحلیل سازه نیست.">
          <KeyValue
            items={[
              { label: "شبکه سازه", value: `${scheme.structural.gridX} × ${scheme.structural.gridY}`, mono: true },
              { label: "تعداد ستون", value: String(scheme.structural.columns), mono: true },
              { label: "مقطع ستون", value: `${scheme.structural.columnSizeMm} mm`, mono: true },
              { label: "عمق تیر", value: `${scheme.structural.beamDepthMm} mm`, mono: true },
              { label: "ضخامت سقف", value: `${scheme.structural.slabThicknessMm} mm`, mono: true },
              { label: "ضریب زلزله C", value: scheme.structural.seismicCoefficient == null ? (scheme.structural.seismicScreening?.status === "outside-domain" ? "محاسبه نشد — خارج از دامنه" : "محاسبه نشد — پهنه نامشخص") : scheme.structural.seismicCoefficient.toFixed(4), mono: true },
              { label: "وزن لرزه‌ای", value: `${fmt(scheme.structural.buildingWeightKN, 0)} kN`, mono: true },
              { label: "برش پایه", value: scheme.structural.seismicBaseShearKN == null ? (scheme.structural.seismicScreening?.status === "outside-domain" ? "محاسبه نشد — خارج از دامنه" : "محاسبه نشد — اطلاعات ناکافی") : `${fmt(scheme.structural.seismicBaseShearKN, 0)} kN`, mono: true },
              { label: "بار محوری طراحی ستون", value: `${fmt(scheme.structural.columnLoadKN, 0)} kN`, mono: true },
              { label: "عرض پی منفرد", value: scheme.structural.requiredFoundationWidthM === null ? "محاسبه نشد / قابل استفاده نیست" : `${scheme.structural.requiredFoundationWidthM} m`, mono: true },
            ]}
          />
          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
            {scheme.structural.assumptions.map((a) => <li key={a.id}>• {a.label}: {a.value} {a.unit} — {a.basis}</li>)}
          </ul>
          {scheme.structural.formulaRefs.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1">
              {scheme.structural.formulaRefs.map((id) => <span key={id} className="chip mono text-[9px]">{id}</span>)}
            </p>
          )}
          {scheme.structural.validityNotes.length > 0 && (
            <ul className="mt-1 space-y-1 text-xs leading-5 text-amber-200">
              {scheme.structural.validityNotes.map((n) => <li key={n}>⚠ {n}</li>)}
            </ul>
          )}
        </Panel>
        <Panel title="MEP — برآورد مقدماتی" subtitle="آب، فاضلاب، برق، سرمایش/گرمایش و گاز با روش صریح.">
          <KeyValue
            items={[
              { label: "جمعیت معادل", value: `${scheme.mep.occupancy} نفر`, mono: true },
              { label: "مصرف روزانه آب", value: `${fmt(scheme.mep.waterDailyLiters, 0)} L`, mono: true },
              { label: "حجم مخزن", value: `${fmt(scheme.mep.waterTankLiters, 0)} L`, mono: true },
              { label: "قطر لوله اصلی آب", value: `${scheme.mep.waterMainDiameterMm} mm`, mono: true },
              { label: "قطر لوله فاضلاب", value: `${scheme.mep.sewageMainDiameterMm} mm`, mono: true },
              { label: "توان نصب‌شده", value: `${fmt(scheme.mep.electricalConnectedKVA, 1)} kVA`, mono: true },
              { label: "تقاضای همزمان", value: `${fmt(scheme.mep.electricalDemandKVA, 1)} kVA`, mono: true },
              { label: "ترانسفورماتور", value: `${scheme.mep.transformerKVA} kVA`, mono: true },
              { label: "بار سرمایش", value: `${fmt(scheme.mep.coolingLoadKW, 0)} kW`, mono: true },
              { label: "بار گرمایش", value: `${fmt(scheme.mep.heatingLoadKW, 0)} kW`, mono: true },
              { label: "گاز", value: `${fmt(scheme.mep.gasDemandM3h, 1)} m³/h`, mono: true },
            ]}
          />
          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
            {scheme.mep.assumptions.map((a) => <li key={a.id}>• {a.label}: {a.value} {a.unit} — {a.basis}</li>)}
          </ul>
        </Panel>
        <Panel title="پارکینگ و گردش" subtitle="تأمین جایگاه و ایمنی تخلیه">
          <KeyValue
            items={[
              { label: "نیاز ضابطه‌ای", value: `${scheme.parking.requiredStalls} جایگاه`, mono: true },
              { label: "تأمین‌شده", value: `${scheme.parking.providedStalls} جایگاه`, mono: true },
              { label: "طبقات زیرزمین", value: String(scheme.parking.basementLevels), mono: true },
              { label: "ابعاد جایگاه", value: `${scheme.parking.stallWidthM}×${scheme.parking.stallLengthM} m`, mono: true },
              { label: "عرض رمپ/شبکه", value: `${scheme.parking.aisleWidthM} m`, mono: true },
              { label: "مساحت مؤثر هر جایگاه", value: `${scheme.parking.effectiveAreaPerStallM2} m²`, mono: true },
              { label: "حداکثر فاصله تا خروج", value: `${fmt(scheme.circulation.maxTravelDistanceM, 1)} m`, mono: true },
              { label: "حد مجاز", value: `${scheme.circulation.allowedTravelDistanceM} m`, mono: true },
              { label: "هسته در طبقه", value: String(scheme.circulation.coresPerFloor), mono: true },
              { label: "عرض راهرو", value: `${scheme.circulation.corridorWidthM} m`, mono: true },
            ]}
          />
          <p className="mt-2 rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs leading-5 text-amber-100">
            {scheme.parking.note} — روش فاصله: {scheme.circulation.routeMethod}
          </p>
        </Panel>
        <Panel title="نور روز و کیفیت فضایی" subtitle="نسبت شیشه به سطح به‌عنوان برآورد حداقلی نور روز">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="فضاهای قابل سکونت" value={scheme.daylight.habitableRooms} />
            <Stat label="در محدودهٔ برآورد داخلی نور" value={scheme.daylight.compliantRooms} tone="warn" hint="انطباق مقرراتی نیست" />
            <Stat label="میانگین نسبت شیشه" value={fmt(scheme.daylight.averageWindowRatio * 100, 1)} unit="%" />
            <Stat label="تهویه دوطرفه" value={fmt((scheme.metrics.find((m) => m.id === "crossVent")?.value ?? 0), 1)} unit="%" />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            حد آستانه نسبت شیشه ۸٪ سطح کف است. این معیار «برآورد جایگزین» است و تحلیل دقیق نور روز (DF/DA) نیست.
          </p>
          <div className="mt-3">
            <h3 className="mb-1 text-[0.8125rem] font-bold text-white">معیارهای کامل طرح</h3>
            <div className="max-h-64 overflow-y-auto scroll-thin">
              <div className="overflow-x-auto scroll-thin -mx-1 px-1">
                <table className="table-eng">
                  <tbody>
                    {scheme.metrics.map((m) => (
                      <tr key={m.id}>
                        <td className="text-slate-300">{m.label}</td>
                        <td className="mono text-left text-slate-100">{fmt(m.value, m.value > 100 ? 0 : 2)} {m.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="فرضیات مدل مرکزی" subtitle="هر فرض با مبنا و سطح اطمینان">
          <div className="max-h-72 overflow-y-auto scroll-thin">
            <div className="overflow-x-auto scroll-thin -mx-1 px-1">
              <table className="table-eng">
                <thead><tr><th>فرض</th><th>مقدار</th><th>مبنا</th><th>سطح</th></tr></thead>
                <tbody>
                  {scheme.assumptions.map((a) => (
                    <tr key={a.id}>
                      <td className="text-slate-100">{a.label}</td>
                      <td className="mono text-xs text-slate-200">{a.value} {a.unit}</td>
                      <td className="text-xs leading-4 text-slate-400">{a.basis}</td>
                      <td><span className="chip">{a.confidence}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
        <Panel title="ردیابی تصمیم‌ها" subtitle="از زمین تا معیار — قابل بازتولید با seed یکسان">
          <ol className="space-y-2">
            {scheme.trace.map((step) => (
              <li key={step.step} className="panel-soft p-2.5">
                <div className="text-[0.8125rem] font-bold text-teal-200">{step.step}</div>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">{step.detail}</p>
                <p className="mt-0.5 text-[0.8125rem] leading-5 text-slate-100">{step.output}</p>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="chip mono">seed {scheme.seed}</span>
            <span className="chip mono">{scheme.engineVersion}</span>
            <span className="chip mono">{new Date(scheme.generatedAt).toLocaleString("fa-IR")}</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function ExportsView(ctx: Ctx) {
  const active = ctx.active;
  if (!active) return <p className="panel-soft p-8 text-center text-[0.8125rem] text-slate-400">ابتدا طرح تولید کنید.</p>;
  const scheme = active.model;
  const projectId = ctx.projectId;
  return (
    <div className="space-y-4">
      <Panel
        title="خروجی‌های مهندسی"
        subtitle={`طرح ${scheme.code} · موتور ${scheme.engineVersion} · ضوابط ${active.report.codeSetEdition} — فایل‌ها از مدل مرکزی تولید می‌شوند.`}
      >
        {active.freshness.state === "current" && unsafeMethodOutputIssues(scheme).length === 0 ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORT_FORMATS.map((format) => (
            <a
              key={format.id}
              href={`/api/projects/${projectId}/schemes/${encodeURIComponent(active.rowId)}/export?format=${format.id}&revision=${active.revision}`}
              className="panel-soft block p-3 transition hover:border-teal-400/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{format.label}</span>
                <span className="mono text-xs text-teal-200">.{format.id}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">{format.note}</p>
            </a>
          ))}
        </div> : <p className="text-amber-200">خروجی این نسخه تا تولید مجدد یا رفع روش خارج از دامنه قابل دریافت نیست.</p>}
        <p className="mt-3 rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs leading-5 text-amber-100">
          محدودیت‌های صادرشده: PDF با برچسب لاتین و بدون فونت فارسی؛ IFC فقط زیرمجموعه فضایی (IfcSpace)؛ XLSX بدون فشرده‌سازی؛
          DXF در مقیاس متر. این محدودیت‌ها در متادیتای هر خروجی ثبت می‌شوند.
        </p>
        <p className="mt-2 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-xs leading-5 text-rose-100">
          <span className="font-bold">IFC:</span> بررسی انجام‌شده «ساختاری/محتوایی» است (صحت نحوی، حل ارجاع‌ها و قاعده صوری IfcProduct بر پایه مستند رسمی buildingSMART).
          اعتبارسنجی اسکیمای رسمی IFC4 (EXPRESS/STEP) در این محیط انجام <span className="font-bold">نشده</span> است، چون هیچ ابزار ifcopenshell/IfcValidator نصب نیست.
          مبنای فرمول‌ها و طبقه‌بندی اعتبار آن‌ها در شیت «Basis» فایل XLSX و بخش engineeringBasis فایل JSON صادر می‌شود.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="اقلام خروجی ثبت‌شده" subtitle="فقط فراداده ثبت می‌شود؛ فایل‌ها روی سرور ذخیره نمی‌شوند و هش امضای دیجیتال نیست.">
          {ctx.bundle.artifacts.length === 0 ? (
            <p className="text-[0.8125rem] text-slate-400">هنوز فایلی صادر نشده است. با کلیک روی هر قالب، خروجی ساخته و ثبت می‌شود.</p>
          ) : (
            <div className="overflow-x-auto scroll-thin -mx-1 px-1">
              <table className="table-eng">
                <thead><tr><th>فایل</th><th>قالب</th><th>حجم</th><th>زمان</th></tr></thead>
                <tbody>
                  {ctx.bundle.artifacts.map((artifact) => (
                    <tr key={artifact.id}>
                      <td className="text-xs text-slate-200"><span className="mono">{artifact.filename}</span><br /><a className="text-teal-200 underline" href={`/api/projects/${projectId}/artifacts/${artifact.id}`} target="_blank" rel="noreferrer">فراداده و هش</a></td>
                      <td><span className="chip">{artifact.format}</span></td>
                      <td className="mono text-xs text-slate-400">{(artifact.bytes / 1024).toFixed(1)} KB</td>
                      <td className="text-xs text-slate-400">{new Date(artifact.createdAt).toLocaleString("fa-IR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <a className="mt-3 inline-block text-xs text-teal-200 underline" href={`/api/projects/${projectId}/artifacts`} target="_blank" rel="noreferrer">فهرست صفحه‌بندی‌شدهٔ همهٔ فراداده‌ها</a>
        </Panel>
        <Panel title="سازگاری و بازتولید" subtitle="اطلاعات لازم برای حسابرسی خروجی">
          <KeyValue
            items={[
              { label: "کد پروژه", value: ctx.bundle.project.code, mono: true },
              { label: "نسخه زمین", value: String(ctx.bundle.project.siteRevision), mono: true },
              { label: "نسخه نیازمندی", value: String(ctx.bundle.project.requirementRevision), mono: true },
              { label: "seed طرح", value: String(scheme.seed), mono: true },
              { label: "نسخه موتور", value: scheme.engineVersion, mono: true },
              { label: "سند ضوابط", value: `${active.report.codeSetCode}@${active.report.codeSetEdition}`, mono: true },
              { label: "تاریخ اعتبارسنجی", value: new Date(active.report.evaluatedAt).toLocaleString("fa-IR") },
              { label: "قواعد اجراشده", value: String(active.report.evaluations.length), mono: true },
              { label: "اعتبار سند ضوابط", value: active.report.codeSetVerification ?? "unverified", mono: true },
              { label: "روش محدوده ساخت‌پذیر", value: scheme.geometryStatus?.buildableMethod ?? "convex-halfplane-setback", mono: true },
              { label: "دقت هندسه", value: scheme.geometryStatus?.exact ? "دقیق (زمین محدب)" : "محافظه‌کارانه (زمین مقعر)", mono: true },
            ]}
          />
          <div className="mt-3 space-y-1">
            {ctx.bundle.warnings.slice(0, 4).map((warning) => (
              <p key={warning} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs leading-5 text-slate-300">• {warning}</p>
            ))}
          </div>
          <p className="mt-3 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-xs leading-5 text-rose-100">
            {active.report.disclaimer}
          </p>
        </Panel>
      </div>
    </div>
  );
}

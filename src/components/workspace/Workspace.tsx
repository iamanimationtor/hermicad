"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { ProjectBundle, RepairResponse, RepairSummary } from "@/domain/bundle";
import { rankSchemes, DEFAULT_WEIGHTS, normalizeWeights, type WeightMap } from "@/domain/optimize";
import { unsafeMethodOutputIssues } from "@/domain/engineering/methodValidity";
import type { ValidationReport } from "@/domain/types";
import { Stat } from "@/components/ui";
import { SiteView, RequirementsView } from "./editors";
import { AnalysisView, ExportsView, NoticeBar, PlanView, SchemesView, ValidationView } from "./studio";
import { SheetBoard } from "./SheetBoard";
import type { Ctx, Notice, PlanMode, WorkspaceTab } from "./types";

const TABS: { id: WorkspaceTab; label: string; hint: string }[] = [
  { id: "schemes", label: "طرح‌ها و مقایسه", hint: "تولید، پلان، پارتو" },
  { id: "plan", label: "پلان بازبینی", hint: "دیوار، در، پنجره، ابعاد" },
  { id: "sheets", label: "برگ‌های معماری", hint: "نما، برش، جداول" },
  { id: "site", label: "زمین و محدودیت‌ها", hint: "مرز، شیب، عقب‌نشینی" },
  { id: "requirements", label: "نیازمندی‌ها", hint: "پارس و برنامه واحد" },
  { id: "validation", label: "اعتبارسنجی و اصلاح", hint: "قواعد، ایرادها" },
  { id: "analysis", label: "تحلیل مهندسی", hint: "سازه، MEP، پارکینگ" },
  { id: "exports", label: "خروجی و ردیابی", hint: "PDF، DXF، IFC، XLSX" },
];

export function Workspace({ initialBundle }: { initialBundle: ProjectBundle }) {
  const [bundle, setBundle] = useState<ProjectBundle>(initialBundle);
  const [tab, setTab] = useState<WorkspaceTab>(initialBundle.schemes.length ? "schemes" : "site");
  const [weights, setWeights] = useState<WeightMap>(
    normalizeWeights(initialBundle.runs[0]?.weights ?? DEFAULT_WEIGHTS),
  );
  const [seed, setSeed] = useState<number>(initialBundle.runs[0]?.seed ?? 20260101);
  const [variants, setVariants] = useState<number>(initialBundle.runs[0]?.variants ?? 5);
  const [activeId, setActiveId] = useState<string>(initialBundle.schemes[0]?.model.id ?? "");
  const [planMode, setPlanMode] = useState<PlanMode>("site");
  const [levelIndex, setLevelIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [repair, setRepair] = useState<RepairSummary | null>(null);

  const reportsByModelId = useMemo<Record<string, ValidationReport>>(() => {
    const map: Record<string, ValidationReport> = {};
    for (const stored of bundle.schemes) map[stored.model.id] = stored.report;
    return map;
  }, [bundle.schemes]);

  const ranking = useMemo(
    () => (bundle.schemes.length ? rankSchemes(bundle.schemes.map((s) => s.model), reportsByModelId, weights) : []),
    [bundle.schemes, reportsByModelId, weights],
  );

  const active = useMemo(() => {
    const found = bundle.schemes.find((s) => s.model.id === activeId);
    return found ?? bundle.schemes[0];
  }, [bundle.schemes, activeId]);

  const best = ranking[0]?.comparisonComplete ? ranking[0] : undefined;
  const comparisonIncomplete = ranking.length > 0 && !ranking[0].comparisonComplete;
  const unsafeOutputs = active ? unsafeMethodOutputIssues(active.model) : [];

  const applyBundle = useCallback((next: ProjectBundle) => {
    setBundle(next);
    setActiveId((current) => (next.schemes.some((s) => s.model.id === current) ? current : next.schemes[0]?.model.id ?? ""));
  }, []);

  const post = useCallback(
    async (path: string, body: unknown, label: string, revision?: number) => {
      setBusy(label);
      setNotice(null);
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(revision !== undefined ? { "If-Match": `"${revision}"` } : {}) },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as {
          bundle?: ProjectBundle;
          repair?: RepairSummary;
          generatedRunId?: string;
          activeAtRead?: boolean;
          error?: string;
          detail?: string[];
        };
        if (!response.ok || !payload.bundle) {
          setNotice({ kind: "error", text: payload.error ?? "درخواست ناموفق بود.", detail: payload.detail });
          return null;
        }
        applyBundle(payload.bundle);
        return payload;
      } catch (error) {
        setNotice({ kind: "error", text: error instanceof Error ? error.message : "خطای شبکه" });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [applyBundle],
  );

  const refresh = useCallback(async () => {
    if ((tab === "site" || tab === "requirements") && !window.confirm("بازخوانی، ویرایش‌های ذخیره‌نشدهٔ فرم باز را کنار می‌گذارد. ادامه می‌دهید؟")) return;
    setBusy("refresh");
    try {
      const response = await fetch(`/api/projects/${bundle.project.id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "بازخوانی ناموفق بود.");
      const next = payload as ProjectBundle;
      applyBundle(next);
      setWeights(normalizeWeights(next.runs[0]?.weights ?? DEFAULT_WEIGHTS));
      setSeed(next.runs[0]?.seed ?? 20260101);
      setVariants(next.runs[0]?.variants ?? 5);
      setRepair(null);
      setNotice({ kind: "info", text: "آخرین وضعیت پروژه بازخوانی شد." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "خطای شبکه" });
    } finally {
      setBusy(null);
    }
  }, [applyBundle, bundle.project.id, tab]);

  const onGenerate = useCallback(async () => {
    const result = await post(`/api/projects/${bundle.project.id}/generate`, {
      seed, variants, weights, expectedSiteRevision: bundle.project.siteRevision,
      expectedRequirementRevision: bundle.project.requirementRevision,
    }, "generate");
    if (result) {
      setRepair(null);
      setPlanMode("site");
      setTab("schemes");
      const currentAtRead = result.activeAtRead && result.bundle?.schemes.every((scheme) => scheme.freshness.state === "current");
      setNotice(currentAtRead ? {
        kind: "ok",
        text: `اجرا ثبت شد: ${result.bundle?.schemes.length} طرح در آخرین بازخوانی فعال بودند. نتیجه، تأیید مهندسی نیست.`,
      } : {
        kind: "info",
        text: "اجرای شما ثبت شد، اما تا بازخوانی پاسخ، اجرا یا ورودی پروژه تغییر کرده بود. شناسهٔ اجرا در سابقه قابل بررسی است.",
      });
    }
  }, [bundle.project.id, bundle.project.siteRevision, bundle.project.requirementRevision, post, seed, variants, weights]);

  const onRepair = useCallback(async () => {
    if (!active) return;
    const result = await post(
      `/api/projects/${bundle.project.id}/schemes/${encodeURIComponent(active.rowId)}/repair`,
      {},
      "repair",
      active.revision,
    );
    if (result?.repair) {
      const stillVisible = result.bundle?.schemes.some((scheme) => scheme.rowId === result.repair!.schemeRowId && scheme.revision === result.repair!.revision);
      if (!stillVisible) {
        setRepair(null);
        setNotice({ kind: "info", text: "اصلاح ثبت شد، اما تا بازخوانی پاسخ، نسخه یا اجرای فعال تغییر کرده بود؛ نتیجه را در آرشیو همان طرح بررسی کنید." });
      } else {
        setRepair(result.repair);
        setNotice({
          kind: result.repair.actions.some((a) => a.applied) ? "ok" : "info",
          text: `حلقه اصلاح اجرا شد: ${result.repair.actions.filter((a) => a.applied).length} اقدام اعمال‌شده؛ نقض‌ها ${result.repair.beforeFailed} → ${result.repair.afterFailed}.`,
        });
      }
    }
  }, [active, bundle.project.id, post]);

  const onSaveWeights = useCallback(async () => {
    const result = await post(`/api/projects/${bundle.project.id}/weights`, { weights, expectedRunId: bundle.project.activeRunId }, "weights");
    if (result) setNotice({ kind: "ok", text: "وزن‌های تصمیم ذخیره و رتبه‌بندی با همان وزن‌ها بازمحاسبه شد." });
  }, [bundle.project.id, bundle.project.activeRunId, post, weights]);

  const ctx: Ctx = {
    projectId: bundle.project.id,
    bundle,
    active,
    ranking,
    weights,
    busy,
    notice,
    planMode,
    levelIndex,
    repair,
    seed,
    variants,
    setSeed,
    setVariants,
    onGenerate,
    onRepair,
    onSaveWeights,
    onWeightsChange: (next) => setWeights(normalizeWeights(next)),
    onSelectScheme: setActiveId,
    applyBundle,
    setNotice,
    setBusy,
    setPlanMode,
    setLevelIndex,
    setRepair,
  };

  const project = bundle.project;

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6">
      <div className="panel mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <Link href="/projects" className="chip hover:border-teal-400/50">← پروژه‌ها</Link>
              <span className="mono chip text-teal-200">{project.code}</span>
              <span className="chip">{project.status}</span>
              <span className="chip">زمین v{project.siteRevision}</span>
              <span className="chip">نیازمندی v{project.requirementRevision}</span>
              <span className="chip mono">{project.jurisdiction}</span>
            </div>
            <h1 className="mt-2 text-xl font-extrabold text-white">{project.name}</h1>
            {project.client && <p className="mt-0.5 text-[11px] text-slate-400">کارفرما: {project.client}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" onClick={refresh} disabled={busy !== null}>بازخوانی پروژه</button>
            <button className="btn btn-primary" onClick={onGenerate} disabled={busy !== null}>
              {busy === "generate" ? "اجرای پایپ‌لاین…" : bundle.schemes.length ? "تولید مجدد پنج طرح" : "تولید طرح‌ها"}
            </button>
            {active?.freshness.state === "current" && unsafeOutputs.length === 0 && (
              <a
                className="btn"
                href={`/api/projects/${project.id}/schemes/${encodeURIComponent(active.rowId)}/export?format=pdf&revision=${active.revision}`}
              >
                دانلود PDF
              </a>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="طرح‌ها" value={bundle.schemes.length} hint={best ? `برتر: ${best.schemeCode}` : comparisonIncomplete ? "مقایسه ناقص است" : "هنوز تولید نشده"} />
          <Stat
            label="طرح برتر (مشورتی)"
            value={best ? best.score.toFixed(1) : "—"}
            unit="/100"
            tone={best?.blocked || comparisonIncomplete ? "warn" : "good"}
            hint={best ? `خام ${best.rawScore.toFixed(1)} · انطباق اثبات‌نشده` : comparisonIncomplete ? "با دادهٔ ناقص تعیین نمی‌شود" : "وزن‌دهی فعلی"}
          />
          <Stat label="واحد در برترین طرح" value={bundle.schemes.find((s) => s.model.id === (best?.schemeId))?.model.unitsTotal ?? "—"} />
          <Stat
            label="نقص بحرانی"
            value={bundle.schemes.reduce((sum, s) => sum + s.report.issues.filter((i) => i.severity === "critical").length, 0)}
            tone={bundle.schemes.some((s) => s.report.blocked) ? "bad" : "good"}
          />
          <Stat
            label="زمین"
            value={project.site.boundary.length}
            unit="رأس"
            hint={`عقب‌نشینی ${project.site.setbacks.north}/${project.site.setbacks.east}/${project.site.setbacks.south}/${project.site.setbacks.west} m`}
          />
          <Stat label="سند ضوابط" value={`${active?.report.codeSetEdition ?? "—"}`} hint={active?.report.engineVersion ?? "—"} />
        </div>
      </div>

      {notice && <div className="mb-4"><NoticeBar ctx={ctx} /></div>}
      {bundle.dataIssues.length > 0 && (
        <section role="alert" className="mb-4 rounded-lg border border-rose-400/50 bg-rose-500/10 p-3 text-xs leading-6 text-rose-100">
          <strong>بخشی از دادهٔ ثبت‌شده قابل استفاده نیست</strong>
          <ul className="list-inside list-disc">{bundle.dataIssues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>
          <p>هیچ گزارش جایگزین ساخته نشده است. در صورت سالم‌بودن ورودی‌ها، تولید مجدد یا بررسی آرشیو امکان‌پذیر است.</p>
        </section>
      )}
      {unsafeOutputs.length > 0 && (
        <section role="alert" aria-label="روش خارج از دامنه" className="mb-4 rounded-lg border border-rose-400/50 bg-rose-500/10 p-3 text-xs leading-6 text-rose-100">
          <strong>روش خارج از دامنه است؛ اعداد مربوط غیرقابل استفاده‌اند و صدور فایل مسدود است.</strong>
          <ul className="list-inside list-disc">{unsafeOutputs.map((issue, index) => <li key={`${issue.formulaId}-${index}`}>{issue.message}</li>)}</ul>
          <p>این تشخیص فقط حدود عددی پیاده‌سازی‌شده را پوشش می‌دهد و جایگزین انتخاب و بازبینی روش تخصصی نیست.</p>
        </section>
      )}
      {active && (
        <section aria-label="وضعیت تازگی طرح" role="status" className={`mb-4 rounded-lg border p-3 text-xs leading-6 ${active.freshness.state === "current" ? "border-teal-400/40 bg-teal-400/10 text-teal-100" : "border-amber-400/50 bg-amber-400/10 text-amber-100"}`}>
          <strong>{active.freshness.state === "current" ? "در آخرین بازخوانی، مبنای طرح با ورودی هم‌خوان بود" : active.freshness.state === "stale" ? "این طرح نسبت به پروژه قدیمی است" : "تازگی این طرح احراز نشده است"}</strong>
          <p>{active.freshness.state === "current" ? "پس از بازخوانی ممکن است داده تغییر کرده باشد؛ سرور پیش از دریافت و اصلاح دوباره بررسی می‌کند. تطابق شناسه‌ها صحت مهندسی یا انطباق مقررات را اثبات نمی‌کند." : "نمایش فقط برای بازبینی است؛ اصلاح و دریافت خروجی تا تولید مجدد در سرور مسدود است."}</p>
          {active.freshness.reasons.length > 0 && <ul className="list-inside list-disc">{active.freshness.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          <p className="text-[10px]">مبنای طرح: زمین v{active.freshness.generatedFrom?.siteRevision ?? "نامعلوم"}، نیازمندی v{active.freshness.generatedFrom?.requirementRevision ?? "نامعلوم"}، موتور {active.freshness.generatedFrom?.engineVersion ?? "نامعلوم"}؛ نسخهٔ طرح {active.revision}.</p>
        </section>
      )}
      {bundle.runs.length > 0 && (
        <details className="panel-soft mb-4 p-3 text-xs leading-6">
          <summary className="cursor-pointer font-bold">سابقهٔ اجراها و بازیابی برای بازبینی</summary>
          <p className="text-slate-400">فایل تاریخی فقط برای بازبینی است؛ اثرانگشت قواعد هش کد یا گواهی بازتولید نیست. آخرین هشت اجرا نمایش داده می‌شوند. <a className="text-teal-200 underline" href={`/api/projects/${project.id}/runs`} target="_blank" rel="noreferrer">فهرست صفحه‌بندی‌شدهٔ همهٔ اجراها</a> · <a className="text-teal-200 underline" href={`/api/projects/${project.id}/artifacts`} target="_blank" rel="noreferrer">فهرست فرادادهٔ خروجی‌ها</a></p>
          <ul className="mt-1 space-y-1">{bundle.runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-2">
              <span>{run.id === active?.freshness.runId ? "اجرای فعال" : "اجرای قبلی"} · {new Date(run.createdAt).toLocaleString("fa-IR")} · زمین v{run.siteRevision} / نیازمندی v{run.requirementRevision}</span>
              <a className="text-teal-200 underline" href={`/api/projects/${project.id}/runs/${run.id}`} target="_blank" rel="noreferrer">مشاهدهٔ آرشیو JSON</a>
            </li>
          ))}</ul>
        </details>
      )}

      <nav className="mb-4 flex flex-wrap gap-x-5 overflow-x-auto border-b border-white/10 px-1">
        {TABS.map((item) => (
          <button key={item.id} className="tab" data-active={tab === item.id} onClick={() => setTab(item.id)}>
            <span className="font-semibold">{item.label}</span>
            <span className="mr-1 text-[10px] text-slate-500">{item.hint}</span>
          </button>
        ))}
      </nav>

      {tab === "site" && <SiteView {...ctx} />}
      {tab === "requirements" && <RequirementsView {...ctx} />}
      {tab === "schemes" && <SchemesView {...ctx} />}
      {tab === "plan" && <PlanView {...ctx} />}
      {tab === "sheets" && active && <SheetBoard scheme={active.model} schemeRowId={active.rowId} schemeRevision={active.revision} projectId={ctx.projectId} downloadAllowed={active.freshness.state === "current" && unsafeOutputs.length === 0} />}
      {tab === "validation" && <ValidationView {...ctx} />}
      {tab === "analysis" && <AnalysisView {...ctx} />}
      {tab === "exports" && <ExportsView {...ctx} />}
    </main>
  );
}

export type { RepairResponse };

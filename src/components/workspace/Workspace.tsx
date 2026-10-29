"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { ProjectBundle, RepairResponse, RepairSummary } from "@/domain/bundle";
import { rankSchemes, DEFAULT_WEIGHTS, normalizeWeights, type WeightMap } from "@/domain/optimize";
import type { ValidationReport } from "@/domain/types";
import { Stat } from "@/components/ui";
import { SiteView, RequirementsView } from "./editors";
import { AnalysisView, ExportsView, PlanView, SchemesView, ValidationView } from "./studio";
import { SheetBoard } from "./SheetBoard";
import type { Ctx, Notice, PlanMode, WorkspaceTab } from "./types";

const TABS: { id: WorkspaceTab; label: string; hint: string }[] = [
  { id: "schemes", label: "طرح‌ها و مقایسه", hint: "تولید، پلان، پارتو" },
  { id: "plan", label: "پلان اجرایی", hint: "دیوار، در، پنجره، ابعاد" },
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

  const best = ranking[0];

  const applyBundle = useCallback((next: ProjectBundle) => {
    setBundle(next);
    setActiveId((current) => (next.schemes.some((s) => s.model.id === current) ? current : next.schemes[0]?.model.id ?? ""));
  }, []);

  const post = useCallback(
    async (path: string, body: unknown, label: string) => {
      setBusy(label);
      setNotice(null);
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as {
          bundle?: ProjectBundle;
          repair?: RepairSummary;
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

  const onGenerate = useCallback(async () => {
    const result = await post(`/api/projects/${bundle.project.id}/generate`, { seed, variants, weights }, "generate");
    if (result) {
      setRepair(null);
      setPlanMode("site");
      setTab("schemes");
      setNotice({
        kind: "ok",
        text: `پایپ‌لاین اجرا شد: ${result.bundle?.schemes.length} طرح تولید، اعتبارسنجی و رتبه‌بندی شدند.`,
      });
    }
  }, [bundle.project.id, post, seed, variants, weights]);

  const onRepair = useCallback(async () => {
    if (!active) return;
    const result = await post(
      `/api/projects/${bundle.project.id}/schemes/${encodeURIComponent(active.model.id)}/repair`,
      {},
      "repair",
    );
    if (result?.repair) {
      setRepair(result.repair as RepairSummary);
      setNotice({
        kind: result.repair.actions.some((a) => a.applied) ? "ok" : "info",
        text: `حلقه اصلاح اجرا شد: ${result.repair.actions.filter((a) => a.applied).length} اقدام اعمال‌شده؛ نقض‌ها ${result.repair.beforeFailed} → ${result.repair.afterFailed}.`,
      });
    }
  }, [active, bundle.project.id, post]);

  const onSaveWeights = useCallback(async () => {
    const result = await post(`/api/projects/${bundle.project.id}/weights`, { weights }, "weights");
    if (result) setNotice({ kind: "ok", text: "وزن‌های تصمیم ذخیره و رتبه‌بندی با همان وزن‌ها بازمحاسبه شد." });
  }, [bundle.project.id, post, weights]);

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
            <button className="btn btn-primary" onClick={onGenerate} disabled={busy === "generate"}>
              {busy === "generate" ? "اجرای پایپ‌لاین…" : bundle.schemes.length ? "تولید مجدد پنج طرح" : "تولید طرح‌ها"}
            </button>
            {active && (
              <a
                className="btn"
                href={`/api/projects/${project.id}/schemes/${encodeURIComponent(active.model.id)}/export?format=pdf`}
              >
                دانلود PDF
              </a>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="طرح‌ها" value={bundle.schemes.length} hint={best ? `برتر: ${best.schemeCode}` : "هنوز تولید نشده"} />
          <Stat
            label="طرح برتر (مشورتی)"
            value={best ? best.score.toFixed(1) : "—"}
            unit="/100"
            tone={best?.blocked ? "warn" : "good"}
            hint={best ? `خام ${best.rawScore.toFixed(1)} · انطباق اثبات‌نشده` : "وزن‌دهی فعلی"}
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
      {tab === "sheets" && active && <SheetBoard scheme={active.model} projectId={ctx.projectId} />}
      {tab === "validation" && <ValidationView {...ctx} />}
      {tab === "analysis" && <AnalysisView {...ctx} />}
      {tab === "exports" && <ExportsView {...ctx} />}
    </main>
  );
}

export type { RepairResponse };

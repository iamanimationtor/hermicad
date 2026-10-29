import { WorkspaceAccess } from "@/components/design/WorkspaceAccess";
import Link from "next/link";
import { listDesigns, seedSampleDesign } from "@/server/designs";
import { CATALOG_STATS, CATEGORIES } from "@/domain/studio/catalog";
import { Panel, Stat } from "@/components/ui";
import { NewDesignPanel } from "@/components/design/NewDesignPanel";
import { currentWorkspace } from "@/server/workspace";
import { safePageError } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function DesignIndexPage() {
  let designs: Awaited<ReturnType<typeof listDesigns>> = [];
  let error: string | null = null;
  try {
    const workspace = await currentWorkspace();
    await seedSampleDesign(workspace);
    designs = await listDesigns(workspace);
  } catch (e) {
    error = safePageError(e);
  }

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="chip border-teal-400/40 bg-teal-400/10 text-teal-200">Design Studio</span>
            <span className="chip">{CATALOG_STATS.items} شیء آماده</span>
            <span className="chip">{CATALOG_STATS.categories} دسته</span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold text-white">استودیو طراحی — ترسیم آزاد با کتابخانهٔ کامل</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
            هر چیزی که در بازار کار لازم است: مبلمان، آشپزخانه، سرویس، اداری، درمانی، صنعتی، ستون و تیر و پی، تأسیسات،
            ایمنی حریق و محوطه. تغییر اندازه و فرم، چرخش، بزرگ‌نمایی، لایه‌بندی و خروجی نقشه بر اساس رشته — همه در یک بوم.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="اشیای کتابخانه" value={CATALOG_STATS.items} hint="با کلاس IFC و لایه" />
          <Stat label="اسناد طراحی" value={designs.length} hint="ذخیره‌شده روی سرور" />
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          <span className="mono">{error}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-3">
          {designs.length === 0 && (
            <Panel title="هنوز سندی نساخته‌اید" subtitle="با یک سند خالی شروع کنید یا از نمونهٔ آماده الگو بگیرید.">
              <p className="text-xs text-slate-400">از پنل کنار، «سند جدید» یا «نمونهٔ آماده» را انتخاب کنید.</p>
            </Panel>
          )}
          {designs.map((design) => (
            <div key={design.id} className="panel block p-4 transition hover:border-teal-400/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-[10px] text-teal-200">{design.fingerprint}</span>
                    <span className="chip">{design.sheet}</span>
                    <span className="chip">تجدیدنظر {design.revision}</span>
                  </div>
                  <h2 className="mt-1 text-sm font-bold text-slate-100">
                    <Link href={`/design/${design.id}`} className="hover:text-teal-200">
                      {design.name}
                    </Link>
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">{design.items} شیء · آخرین تغییر {new Date(design.updatedAt).toLocaleString("fa-IR")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/design/${design.id}/gallery`} className="btn px-3 py-1.5 text-[11px]">
                    گالری رندرها
                  </Link>
                  <Link href={`/design/${design.id}`} className="btn btn-primary px-3 py-1.5 text-[11px]">
                    باز کردن استودیو
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <WorkspaceAccess />
          <NewDesignPanel />
          <Panel title="دسته‌بندی کتابخانه" subtitle="همهٔ اشیا با ابعاد پیش‌فرض واقعی و کلاس IFC">
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((category) => (
                <span key={category.id} className="chip" title={category.blurb}>
                  {category.label}
                </span>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

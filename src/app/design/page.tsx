import Link from "next/link";
import { WorkspaceAccess } from "@/components/design/WorkspaceAccess";
import { listDesigns, seedSampleDesign } from "@/server/designs";
import { CATALOG_STATS, CATEGORIES } from "@/domain/studio/catalog";
import { NewDesignPanel } from "@/components/design/NewDesignPanel";
import { currentWorkspace } from "@/server/workspace";
import { PageHeader } from "@/components/site/PageHeader";
import { safePageError } from "@/server/http";

export const dynamic = "force-dynamic";
export const metadata = { title: "استودیو طراحی" };

const dateTimeFa = (value: Date | string) =>
  new Date(value).toLocaleString("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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
    <main className="shell py-10 sm:py-14">
      <PageHeader
        eyebrow="ترسیم آزاد"
        title="استودیو طراحی"
        lede={`یک بوم ساده با ${CATALOG_STATS.items} شیء آماده در ${CATALOG_STATS.categories} دسته: مبلمان، آشپزخانه، سرویس، اداری، سازه، تأسیسات و محوطه. اندازه و چرخش را زنده تغییر دهید و نقشه را در قالب رشتهٔ خودتان بگیرید.`}
        actions={
          <>
            <Link href="#new-design" className="btn btn-primary">
              سند تازه
            </Link>
            <Link href="#saved-designs" className="btn">
              سندهای من ({designs.length})
            </Link>
          </>
        }
        aside={
          <div className="grid grid-cols-2 gap-2">
            <div className="panel-soft px-4 py-3 text-center">
              <div className="mono text-xl font-extrabold tabular-nums text-white">{CATALOG_STATS.items}</div>
              <div className="mt-0.5 text-xs text-slate-400">شیء آماده</div>
            </div>
            <div className="panel-soft px-4 py-3 text-center">
              <div className="mono text-xl font-extrabold tabular-nums text-white">{CATALOG_STATS.categories}</div>
              <div className="mt-0.5 text-xs text-slate-400">دسته</div>
            </div>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mt-6 rounded-xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          فضای کار در دسترس نیست. <span className="mono text-xs opacity-70">{error}</span>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr] lg:gap-8">
        {/* ── سندهای ذخیره‌شده ─────────────────────────────────────────── */}
        <section id="saved-designs" aria-labelledby="saved-designs-title">
          <h2 id="saved-designs-title" className="section-title mb-4">
            سندهای شما
          </h2>

          {designs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
              <h3 className="text-base font-bold text-white">هنوز سندی نساخته‌اید</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-slate-400">
                از ستون کنار، «سند خالی» را بسازید یا از نمونهٔ آماده شروع کنید.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {designs.map((design) => (
                <li key={design.id}>
                  <article className="panel card-link flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 text-base font-bold leading-7 text-white">
                        <Link href={`/design/${design.id}`} className="hover:text-teal-200">
                          {design.name}
                        </Link>
                      </h3>
                      <span className="chip shrink-0">{design.sheet}</span>
                    </div>
                    <p className="mono mt-1.5 text-xs text-teal-200/80">{design.fingerprint}</p>
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{design.items} شیء</span>
                      <span className="h-1 w-1 rounded-full bg-slate-700" aria-hidden="true" />
                      <span>نسخهٔ {design.revision}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-700" aria-hidden="true" />
                      <span>{dateTimeFa(design.updatedAt)}</span>
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
                      <Link href={`/design/${design.id}`} className="btn btn-primary flex-1">
                        باز کردن
                      </Link>
                      <Link href={`/design/${design.id}/gallery`} className="btn">
                        گالری
                      </Link>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── ستون کنش‌ها ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div id="new-design">
            <NewDesignPanel />
          </div>
          <WorkspaceAccess />
          <section className="panel p-5">
            <h2 className="text-sm font-bold text-white">دسته‌بندی کتابخانه</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-400">
              هر شیء ابعاد پیش‌فرض واقعی و کلاس IFC دارد، پس در خروجی قابل استفاده است.
            </p>
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {CATEGORIES.map((category) => (
                <li key={category.id}>
                  <span className="chip" title={category.blurb}>
                    {category.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}

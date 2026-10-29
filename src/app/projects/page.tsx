import Link from "next/link";
import { ensureDemoProject, listProjects } from "@/server/projects";
import { NewProjectForm } from "@/components/NewProjectForm";
import { SeedButton } from "@/components/SeedButton";
import { PageHeader } from "@/components/site/PageHeader";
import { safePageError } from "@/server/http";

export const dynamic = "force-dynamic";
export const metadata = { title: "کارگاه پروژه‌ها" };

/** برچسب فارسی وضعیت‌های داخلی پروژه؛ کاربر نباید با واژهٔ خام انگلیسی روبه‌رو شود. */
const STATUS_LABEL: Record<string, string> = {
  draft: "پیش‌نویس",
  generated: "طرح تولیدشده",
  reviewed: "بازبینی‌شده",
  archived: "بایگانی",
};

const dateFa = (value: Date | string) =>
  new Date(value).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });

export default async function ProjectsPage() {
  let projects: Awaited<ReturnType<typeof listProjects>> = [];
  let error: string | null = null;
  try {
    await ensureDemoProject();
    projects = await listProjects();
  } catch (e) {
    error = safePageError(e);
  }

  return (
    <main className="shell py-10 sm:py-14">
      <PageHeader
        eyebrow="کارگاه"
        title="پروژه‌های شما"
        lede="هر پروژه یک زمین و یک نسخهٔ روشن از نیازمندی‌ها دارد. تولید، اعتبارسنجی، اصلاح و خروجی همه از یک مدل مرکزی می‌آیند و با نسخهٔ موتور ثبت می‌شوند."
        aside={
          <div className="panel-soft px-5 py-4 text-center">
            <div className="mono text-2xl font-extrabold tabular-nums text-white">{projects.length}</div>
            <div className="mt-1 text-xs text-slate-400">پروژهٔ ثبت‌شده</div>
          </div>
        }
      />

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm leading-7 text-rose-100"
        >
          دسترسی به پایگاه داده ممکن نشد. چند لحظه بعد دوباره تلاش کنید.
          <span className="mono ms-2 text-xs text-rose-200/70">{error}</span>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:gap-8">
        {/* ── فهرست پروژه‌ها ───────────────────────────────────────────── */}
        <div className="space-y-3">
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center">
              <h2 className="text-base font-bold text-white">هنوز پروژه‌ای نساخته‌اید</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-400">
                از فرم کنار یک پروژه بسازید، یا با پروژهٔ نمایشی شروع کنید تا کل جریان تولید، کنترل و خروجی را با
                دادهٔ واقعی ببینید.
              </p>
              <Link href="/new" className="btn btn-primary mt-5">
                تعریف هدایت‌شدهٔ زمین
              </Link>
            </div>
          ) : (
            projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="panel card-link block p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip border-teal-400/25 bg-teal-400/10 text-teal-100">
                        {STATUS_LABEL[project.status] ?? "در جریان"}
                      </span>
                      <span className="mono text-xs text-slate-500">{project.code}</span>
                    </div>
                    <h2 className="mt-2.5 text-base font-bold text-white">{project.name}</h2>
                    {project.client && (
                      <p className="mt-1 text-sm text-slate-400">کارفرما: {project.client}</p>
                    )}
                    {project.description && (
                      <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-7 text-slate-400">
                        {project.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>ایجاد {dateFa(project.createdAt)}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-700" aria-hidden="true" />
                      <span>آخرین تغییر {dateFa(project.updatedAt)}</span>
                    </div>
                  </div>
                  <span className="btn btn-primary shrink-0">ورود به کارگاه</span>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* ── ستون کنش‌ها ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="panel p-5">
            <h2 className="text-sm font-bold text-white">ساده‌ترین راه شروع</h2>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              شکل زمین، ابعاد، تعداد واحدها و محدودیت‌ها را انتخاب کنید؛ بقیه را HERMICAD انجام می‌دهد. برای این مسیر
              لازم نیست با نرم‌افزار نقشه‌کشی کار کرده باشید.
            </p>
            <Link href="/new" className="btn btn-primary btn-block mt-4">
              تعریف هدایت‌شده
            </Link>
          </div>

          <NewProjectForm />

          <div className="panel p-5">
            <h2 className="text-sm font-bold text-white">پروژهٔ نمایشی مرجع</h2>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              یک زمین شش‌ضلعی نامنظم ۸۶۸ متری با ۱۴ واحد؛ همهٔ عددهایش از موتور واقعی همین نسخه آمده‌اند.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs leading-6 text-slate-400">
              <li>• ۶ رأس، شیب ۲٫۸ متر</li>
              <li>• ۸ واحد دوخوابه + ۶ واحد سه‌خوابه</li>
              <li>• خروجی PDF، DXF، IFC، XLSX، CSV، SVG و JSON</li>
            </ul>
            <div className="mt-4">
              <SeedButton />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

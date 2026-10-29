import Link from "next/link";
import { ensureDemoProject, listProjects } from "@/server/projects";
import { Panel, Stat, EmptyState } from "@/components/ui";
import { NewProjectForm } from "@/components/NewProjectForm";
import { SeedButton } from "@/components/SeedButton";
import { safePageError } from "@/server/http";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto max-w-[1400px] px-5 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">کارگاه پروژه‌ها</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
            هر پروژه دارای زمین و نیازمندی نسخه‌بندی‌شده است. تولید، اعتبارسنجی، اصلاح و خروجی همه از یک مدل مرکزی
            انجام می‌شود و در پایگاه داده با فرضیات و نسخه موتور ثبت می‌گردد.
          </p>
        </div>
        <div className="flex gap-2">
          <Stat label="پروژه‌های ثبت‌شده" value={projects.length} />
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          دسترسی به پایگاه داده یا ایجاد پروژه نمونه ناموفق بود: <span className="mono">{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          {projects.length === 0 ? (
            <EmptyState
              title="هیچ پروژه‌ای وجود ندارد"
              description="از فرم سمت چپ یک پروژه بسازید؛ یا با پروژه نمایشی شروع کنید تا کل جریان تولید، اعتبارسنجی و خروجی را ببینید."
            />
          ) : (
            projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="panel block p-4 transition hover:border-teal-400/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono text-[10px] text-teal-200">{project.code}</span>
                      <span className="chip">{project.status}</span>
                      <span className="chip">{project.jurisdiction}</span>
                    </div>
                    <h2 className="mt-1 text-sm font-bold text-slate-100">{project.name}</h2>
                    {project.client && <p className="mt-0.5 text-[11px] text-slate-400">کارفرما: {project.client}</p>}
                    {project.description && (
                      <p className="mt-2 max-w-2xl text-[11px] leading-5 text-slate-400">{project.description}</p>
                    )}
                  </div>
                  <div className="text-left text-[10px] text-slate-500">
                    <div>ایجاد: {new Date(project.createdAt).toLocaleDateString("fa-IR")}</div>
                    <div>آخرین تغییر: {new Date(project.updatedAt).toLocaleString("fa-IR")}</div>
                    <span className="btn mt-2 px-3 py-1.5 text-[11px]">ورود به کارگاه</span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
        <div className="space-y-4">
          <div className="panel p-4">
            <h2 className="text-sm font-bold text-slate-100">تعریف هدایت‌شده (پیشنهادی)</h2>
            <p className="mt-1 text-[11px] leading-6 text-slate-300">
              برای کاربران غیرمتخصص: انتخاب شکل زمین با ابعاد، تعداد واحدها و محدودیت‌ها، سپس تولید و بررسی پلان با
              دیوار، در، پنجره، پله و اندازه‌گذاری — بدون نیاز به ترسیم.
            </p>
            <Link href="/new" className="btn btn-primary mt-2 w-full">شروع تعریف هدایت‌شده</Link>
          </div>
          <NewProjectForm />
          <Panel title="پروژه نمایشی مرجع" subtitle="زمین نامنظم شش‌ضلعی ۸۶۸ m²، ۱۴ واحد، ۵ راهبرد حجم">
            <p className="text-[11px] leading-6 text-slate-300">
              در اولین بازدید، اگر هیچ پروژه‌ای وجود نداشته باشد، HERMICAD پروژه نمونه را می‌سازد و پایپ‌لاین کامل را
              اجرا می‌کند. تمام اعداد آن از موتور واقعی (هندسه، تحلیل، ضوابط، بهینه‌سازی) آمده است.
            </p>
            <div className="mt-3">
              <SeedButton />
            </div>
            <div className="mt-3 space-y-1 text-[10px] leading-5 text-slate-400">
              <p>• زمین نامنظم با ۶ رأس و شیب ۲.۸ متر</p>
              <p>• ۸ واحد ۲خوابه + ۶ واحد ۳خوابه</p>
              <p>• خروجی PDF/DXF/IFC/XLSX/CSV/SVG/JSON</p>
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

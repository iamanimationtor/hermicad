import { notFound } from "next/navigation";
import Link from "next/link";
import { getBundle } from "@/server/projects";
import { Workspace } from "@/components/workspace/Workspace";
import { AccessError } from "@/server/accessError";
import { safePageError } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let bundle = null;
  let error: string | null = null;
  try {
    bundle = await getBundle(id);
  } catch (e) {
    if (e instanceof AccessError && e.status === 404) notFound();
    error = safePageError(e);
  }
  if (!bundle) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <div className="panel p-6">
          <h1 className="text-lg font-bold text-white">بارگذاری پروژه ناموفق بود</h1>
          <p className="mt-2 text-xs leading-6 text-slate-300">
            اتصال به پایگاه داده یا خواندن مدل پروژه ممکن نشد. پایگاه داده را بررسی کنید و سپس دوباره تلاش کنید.
          </p>
          <p className="mono mt-2 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-[0.8125rem] text-rose-200">{error}</p>
          <Link href="/projects" className="btn mt-4">بازگشت به پروژه‌ها</Link>
        </div>
      </main>
    );
  }
  return <Workspace initialBundle={bundle} />;
}

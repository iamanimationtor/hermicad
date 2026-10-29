import { notFound, redirect } from "next/navigation";
import { familyOf } from "@/domain/structures/catalog";
import Link from "next/link";
import { getDesign } from "@/server/designs";
import { DesignStudio } from "@/components/design/DesignStudio";
import { currentWorkspace } from "@/server/workspace";
import { safePageError } from "@/server/http";
import { AccessError } from "@/server/accessError";

export const dynamic = "force-dynamic";

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let design = null;
  let error: string | null = null;
  try {
    design = await getDesign(id, await currentWorkspace());
  } catch (e) {
    // سند متعلق به فضای کار دیگر هم ۴۰۴ می‌گیرد تا وجودش افشا نشود.
    if (e instanceof AccessError && e.status === 404) notFound();
    error = safePageError(e);
  }
  // نبودِ سند باید کد وضعیت ۴۰۴ بدهد، نه ۲۰۰ با پیام داخل صفحه؛ وگرنه لینک
  // حذف‌شده در پایش و موتور جست‌وجو «صفحهٔ سالم» دیده می‌شود.
  if (!design && !error) notFound();
  if (!design) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <div className="panel p-6">
          <h1 className="text-lg font-bold text-white">بارگذاری سند ممکن نشد</h1>
          <p className="mt-2 text-xs leading-6 text-slate-300">
            خواندن سند از پایگاه داده ممکن نشد. کمی بعد دوباره تلاش کنید.
          </p>
          <p className="mono mt-2 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-[0.8125rem] text-rose-200">{error}</p>
          <Link href="/design" className="btn mt-4">
            بازگشت به استودیو
          </Link>
        </div>
      </main>
    );
  }
  const family = familyOf(design.brief?.structural?.family);
  if (family && !family.building) redirect(`/structures/${family.id}/${id}`);
  return <DesignStudio initialDesign={design} />;
}

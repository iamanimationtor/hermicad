import { redirect } from "next/navigation";
import { familyOf } from "@/domain/structures/catalog";
import Link from "next/link";
import { getDesign } from "@/server/designs";
import { DesignStudio } from "@/components/design/DesignStudio";
import { currentWorkspace } from "@/server/workspace";
import { safePageError } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let design = null;
  let error: string | null = null;
  try {
    design = await getDesign(id, await currentWorkspace());
  } catch (e) {
    error = safePageError(e);
  }
  if (!design) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <div className="panel p-6">
          <h1 className="text-lg font-bold text-white">سند طراحی پیدا نشد</h1>
          <p className="mt-2 text-xs leading-6 text-slate-300">{error ?? "شناسهٔ سند معتبر نیست یا حذف شده است."}</p>
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

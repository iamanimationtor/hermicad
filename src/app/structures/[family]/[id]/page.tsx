import { notFound } from "next/navigation";
import Link from "next/link";
import { getDesign } from "@/server/designs";
import { currentWorkspace } from "@/server/workspace";
import { StructuralWorkspace } from "@/components/structures/StructuralWorkspace";
export const dynamic = "force-dynamic";
export default async function StructuralPage({ params }: { params: Promise<{ family: string; id: string }> }) {
  const { family, id } = await params;
  let doc;
  try {
    doc = await getDesign(id, await currentWorkspace());
  } catch {
    return (
      <main className="p-8">
        <p>دسترسی به پرونده ممکن نشد؛ حساب و اتصال را بررسی کنید.</p>
        <Link href="/design" className="btn mt-4">
          حساب و بازیابی
        </Link>
      </main>
    );
  }
  if (!doc || doc.brief?.structural?.family !== family) notFound();
  return <StructuralWorkspace initial={doc} />;
}

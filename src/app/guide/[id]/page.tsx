import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getDesign } from "@/server/designs";
import { currentWorkspace } from "@/server/workspace";
import { JourneyWorkspace } from "@/components/journey/JourneyWorkspace";
export const dynamic = "force-dynamic";
export default async function GuidedProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let doc;
  try {
    doc = await getDesign(id, await currentWorkspace());
  } catch {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <section className="panel p-6">
          <h1 className="text-lg font-bold">بازکردن پرونده ممکن نشد</h1>
          <p className="my-4 text-sm leading-7">
            ممکن است نشست شما منقضی شده یا ارتباط با پایگاه داده قطع باشد. از بخش حساب وارد شوید یا فضای کار را بازیابی کنید؛ فایل پشتیبان
            محلی را نگه دارید.
          </p>
          <Link href="/design" className="btn btn-primary">
            حساب و بازیابی
          </Link>
        </section>
      </main>
    );
  }
  if (!doc) notFound();
  if (doc.brief?.structural) redirect(`/structures/${doc.brief.structural.family}/${doc.id}`);
  return <JourneyWorkspace initial={doc} />;
}

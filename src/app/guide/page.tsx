import Link from "next/link";
import { listDesigns, seedSampleDesign } from "@/server/designs";
import { currentWorkspace } from "@/server/workspace";
import { JourneyStart } from "@/components/journey/JourneyStart";
export const dynamic = "force-dynamic";
export const metadata = { title: "مسیر راهنمای پروژه | هرمیکد" };
export default async function GuidePage() {
  let designs: Awaited<ReturnType<typeof listDesigns>> = [];
  let error = "";
  try {
    const ws = await currentWorkspace();
    await seedSampleDesign(ws);
    designs = await listDesigns(ws);
  } catch {
    error = "دسترسی به فضای کار ممکن نشد؛ از صفحهٔ حساب وارد شوید یا بازیابی کنید.";
  }
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <span className="chip">از نیاز پروژه تا بستهٔ بازبینی</span>
      <h1 className="mt-4 text-3xl font-extrabold">قدم بعدی را سیستم به شما نشان می‌دهد</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate-300">
        کاربری و نیازتان را انتخاب کنید. فقط اطلاعات مرتبط پرسیده می‌شود؛ موارد نامعلوم را خالی بگذارید. کنترل‌ها، کمبودها و خروجی‌های
        انتخابی در یک پرونده و کنار مدل طراحی نگهداری می‌شوند.
      </p>
      <div className="my-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm leading-7 text-amber-100">
        این مسیر، ثبت نیازها و تحویل پیش‌طرح را یکپارچه می‌کند؛ هنوز تولید خودکار نقشهٔ اجرایی همهٔ رشته‌ها نیست. تکمیل فرم به معنی انطباق
        با همهٔ مقررات نیست.
      </div>
      <Link href="/structures" className="btn btn-primary mb-5">شروع مسیر تخصصی بر اساس خانوادهٔ سازه</Link>
      {error ? (
        <p role="alert">
          {error}{" "}
          <Link href="/design" className="text-teal-200">
            حساب و بازیابی
          </Link>
        </p>
      ) : (
        <JourneyStart />
      )}
      <h2 className="mb-3 mt-8 text-lg font-bold">ادامهٔ یک سند موجود</h2>
      <p className="mb-3 text-xs text-slate-400">مدل و فرم روی همان سند ذخیره می‌شوند؛ نسخهٔ جداگانه و ناسازگار ساخته نمی‌شود.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {designs.map((d) => (
          <Link key={d.id} href={`/guide/${d.id}`} className="panel p-4 transition hover:border-teal-400/60">
            <strong>{d.name}</strong>
            <p className="mt-2 text-xs text-slate-400">
              {d.items} شیء · نسخهٔ {d.revision} · ادامهٔ مسیر ←
            </p>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-sm">
        <Link className="text-teal-200" href="/new">
          تولید الگوریتمی گزینه‌های مسکونی از اطلاعات زمین ←
        </Link>
      </p>
    </main>
  );
}

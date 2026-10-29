import Link from "next/link";
import { listDesigns, seedSampleDesign } from "@/server/designs";
import { currentWorkspace } from "@/server/workspace";
import { JourneyStart } from "@/components/journey/JourneyStart";
import { PageHeader } from "@/components/site/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "مسیر گام‌به‌گام" };

/**
 * نقطهٔ ورود مسیر هدایت‌شده.
 *
 * چرا این ترتیب: کاربر تازه اول باید بفهمد «چه چیزی می‌گیرم و چقدر وقت می‌برد»،
 * بعد فرم را ببیند. توضیح طولانی فنی به پایین صفحه و به لینک‌های شفافیت رفته است.
 */
export default async function GuidePage() {
  let designs: Awaited<ReturnType<typeof listDesigns>> = [];
  let error = "";
  try {
    const ws = await currentWorkspace();
    await seedSampleDesign(ws);
    designs = await listDesigns(ws);
  } catch {
    error = "فضای کار در دسترس نیست؛ از صفحهٔ استودیو حساب را وارد یا بازیابی کنید.";
  }

  return (
    <main className="shell py-10 sm:py-14">
      <PageHeader
        back={{ href: "/", label: "خانه" }}
        eyebrow="مسیر هدایت‌شده"
        title="قدم بعدی را خودِ سیستم نشان می‌دهد"
        lede="کاربری و نیاز پروژه را انتخاب می‌کنید و فقط همان چیزی پرسیده می‌شود که به کارتان مربوط است. هر چه را نمی‌دانید خالی بگذارید — سیستم آن را «نامعلوم» ثبت می‌کند، نه حدس."
        actions={
          <>
            <Link href="/structures" className="btn">
              شروع از خانوادهٔ سازه
            </Link>
            <Link href="/new" className="btn btn-ghost">
              ترجیح می‌دهم از زمین شروع کنم
            </Link>
          </>
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_0.5fr] lg:gap-8">
        <div>
          {error ? (
            <div role="alert" className="rounded-xl border border-rose-400/35 bg-rose-500/10 px-4 py-4 text-sm leading-7 text-rose-100">
              {error}{" "}
              <Link href="/design" className="font-semibold text-rose-50 underline underline-offset-4">
                رفتن به حساب و بازیابی
              </Link>
            </div>
          ) : (
            <JourneyStart />
          )}

          <section className="mt-10" aria-labelledby="continue-title">
            <h2 id="continue-title" className="section-title">
              ادامهٔ یک سند موجود
            </h2>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              مدل و فرم روی همان سند ذخیره می‌شوند؛ نسخهٔ جداگانه و ناسازگار ساخته نمی‌شود.
            </p>

            {designs.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-6 text-sm text-slate-400">
                هنوز سندی ندارید. اولین سند با تکمیل فرم بالا ساخته می‌شود.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {designs.map((design) => (
                  <li key={design.id}>
                    <Link href={`/guide/${design.id}`} className="panel card-link flex h-full flex-col p-5">
                      <span className="text-sm font-bold text-white">{design.name}</span>
                      <span className="mt-2 text-xs text-slate-400">
                        {design.items} شیء · نسخهٔ {design.revision}
                      </span>
                      <span className="mt-4 text-xs font-semibold text-teal-300">ادامهٔ مسیر ←</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── ستون کنار: انتظارات واقع‌بینانه ─────────────────────────── */}
        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="text-sm font-bold text-white">در پایان این مسیر چه دارید</h2>
            <ul className="mt-3 space-y-2.5 text-sm leading-7 text-slate-300">
              {["پروندهٔ نیازها با نسخه", "مدل طراحی و پلان قابل ویرایش", "فهرست کمبودها و کنترل‌های انجام‌شده", "بستهٔ خروجی برای بازبینی"].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="mt-2 shrink-0 text-teal-400">
                    <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 text-sm leading-7 text-amber-100/90">
            <strong className="block text-sm font-bold text-amber-50">صادقانه:</strong>
            این مسیر ثبت نیاز و تحویل پیش‌طرح را یکپارچه می‌کند، اما هنوز نقشهٔ اجرایی همهٔ رشته‌ها را تولید نمی‌کند.
            تکمیل فرم به معنای انطباق با همهٔ مقررات نیست.
          </div>

          <div className="panel p-5">
            <h2 className="text-sm font-bold text-white">اگر عجله دارید</h2>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              سریع‌ترین راه دیدن خروجی واقعی، ساخت پروژهٔ نمایشی از کارگاه پروژه‌ها است.
            </p>
            <Link href="/projects" className="btn btn-block mt-4">
              کارگاه پروژه‌ها
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

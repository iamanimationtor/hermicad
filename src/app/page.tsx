import Link from "next/link";
import { CODE_SET, ENGINE_VERSION } from "@/domain/constants";
import { RULE_COUNT } from "@/domain/codes";
import { qualitySummary } from "@/domain/testing/suite";
import { CATALOG_STATS } from "@/domain/studio/catalog";

/**
 * صفحهٔ اصلی.
 *
 * تصمیم‌های این صفحه:
 *  - هیچ دادهٔ زمان‌درخواستی ندارد؛ در زمان ساخت آماده می‌شود. عددهای کیفیت از
 *    همین بیلد می‌آیند، پس بازدیدکنندهٔ اول هزینهٔ اجرای موتور آزمون را نمی‌دهد.
 *  - به‌جای فهرست بلند قابلیت‌ها، سه وعدهٔ روشن و یک بخش صادقانهٔ «چه چیزی
 *    نیست». جزئیات فنی به `/scope` و `/architecture` سپرده شده است.
 */
export const dynamic = "force-static";

const STEPS = [
  {
    title: "زمین را توصیف کنید",
    detail: "مختصات، شیب، عقب‌نشینی و محدودیت‌های محلی — یا شکل زمین را از چند قالب آماده انتخاب کنید.",
  },
  {
    title: "نیازمندی را روشن کنید",
    detail: "تعداد واحدها و برنامهٔ فضاها را بنویسید؛ موتور پارامترها را استخراج و برای تأیید شما نمایش می‌دهد.",
  },
  {
    title: "گزینه‌ها را مقایسه کنید",
    detail: "پنج راهبرد حجم تولید می‌شود، هر کدام تحلیل و کنترل می‌شود، و در پایان با نمودار پارتو مقایسه می‌شوند.",
  },
];

const PILLARS = [
  {
    title: "هندسهٔ واقعی، نه تقریب",
    body: "مساحت با فرمول شولیس، کنترل خودمتقاطع، عقب‌نشینی جهت‌دار با برش نیم‌صفحه و بیشینهٔ مستطیل محاطی روی شبکه — همه با کد قابل بازبینی.",
    points: ["زمین نامنظم و شیب‌دار", "محدودهٔ ساخت‌پذیر با محاسبهٔ دقیق", "چیدمان خودکار فضا با seed قطعی"],
    icon: (
      <path
        d="M3.5 6.5 10 3l6.5 3.5v7L10 17l-6.5-3.5v-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "هر عدد، قابل ردیابی",
    body: "هر کنترل می‌گوید از کدام آستانه، کدام فرض و کدام نسخهٔ قواعد آمده است. چیزی که نمی‌دانیم، «نامعلوم» می‌ماند — نه حدس.",
    points: ["منشأ آستانه روی هر کنترل", "تفکیک «نتیجهٔ مثبت» از «تأیید»", "تاریخچهٔ نسخه‌ها و خروجی‌ها"],
    icon: (
      <>
        <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 6.5v4l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: "خروجی‌های آمادهٔ کار",
    body: "نقشه، جدول و مدل را در قالبی بگیرید که ابزار بعدی‌تان می‌فهمد؛ همه بدون وابستگی به کتابخانهٔ تجاری.",
    points: ["PDF، DXF، SVG، IFC4", "Excel متره و میلگرد، CSV، JSON", "استودیو با کتابخانهٔ اشیای آماده"],
    icon: (
      <>
        <path d="M5 3.5h6l4 4v9H5z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M11 3.5v4h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </>
    ),
  },
];

export default function HomePage() {
  const suite = qualitySummary();
  const checksHealthy = suite.failed === 0;

  return (
    <main>
      {/* ── قهرمان ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(56,217,172,0.16),transparent_70%)]" />
        <div className="shell relative grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-16">
          <div className="rise-in">
            <span className="eyebrow">موتور قطعی · خروجی قابل بازبینی</span>
            <h1 className="display mt-4">
              از زمین نامنظم
              <br className="hidden sm:block" /> تا چند طرح قابل مقایسه
            </h1>
            <p className="lede mt-5">
              HERMICAD زمین را می‌خواند، نیازمندی‌ها را ساختار می‌دهد، چند گزینهٔ مقدماتی می‌سازد و با
              محاسبه و ردیابی واقعی کنار هم می‌گذارد — تا پیش از کشیدن اولین خط، تصمیم روشنی گرفته باشید.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/new" className="btn btn-primary btn-lg">
                شروع پروژهٔ تازه
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="rotate-180">
                  <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <Link href="/guide" className="btn btn-lg">
                راهنمای گام‌به‌گام
              </Link>
              <Link href="/projects" className="btn btn-ghost btn-lg">
                دیدن یک نمونهٔ کامل
              </Link>
            </div>

            <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                بدون ثبت‌نام شروع می‌کنید
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                رایگان و عمومی
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                موتور {ENGINE_VERSION.replace("hermicad-engine/", "نسخهٔ ")}
              </span>
            </p>
          </div>

          {/* مسیر سه‌گامی، به‌شکل یک کارت کنار متن */}
          <div className="panel relative overflow-hidden p-6 sm:p-7">
            <div className="pointer-events-none absolute -end-16 -top-16 h-40 w-40 rounded-full bg-teal-400/10 blur-2xl" />
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-white">مسیر کار در سه گام</h2>
              <span className="chip border-teal-400/30 bg-teal-400/10 text-teal-100">حدود چند دقیقه</span>
            </div>
            <ol className="mt-6 space-y-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="mono grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-teal-400/30 bg-teal-400/10 text-xs font-bold text-teal-200">
                    {["۰۱", "۰۲", "۰۳"][index]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{step.title}</span>
                    <span className="mt-1 block text-sm leading-7 text-slate-400">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex items-center gap-2 border-t border-white/8 pt-4 text-xs text-slate-400">
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-teal-300">
                <path d="M8 1.8 13 4v4.2c0 3-2.1 5.2-5 6-2.9-.8-5-3-5-6V4l5-2.2Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="m6 8 1.6 1.6L10.4 7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              خروجی‌ها مقدماتی‌اند و برای بازبینی متخصص ساخته شده‌اند.
            </div>
          </div>
        </div>
      </section>

      {/* ── نوار عددها ──────────────────────────────────────────────────── */}
      <section aria-label="نمای کلی موتور" className="border-y border-white/8 bg-white/[0.02]">
        <dl className="shell grid grid-cols-2 gap-x-6 gap-y-8 py-9 sm:grid-cols-4">
          {[
            { label: "کنترل داخلی روی هر طرح", value: RULE_COUNT, hint: `${CODE_SET.code}@${CODE_SET.edition} · تأییدنشده` },
            { label: "آزمون خودکار", value: `${suite.passed}/${suite.total}`, hint: checksHealthy ? "همه سبز" : "نیازمند بررسی" },
            { label: "قالب خروجی واقعی", value: 7, hint: "PDF · DXF · SVG · IFC · XLSX · CSV · JSON" },
            { label: "شیء آماده در کتابخانه", value: CATALOG_STATS.items, hint: `${CATALOG_STATS.categories} دستهٔ کاربردی` },
          ].map((item) => (
            <div key={item.label}>
              <dd className="mono text-2xl font-extrabold tabular-nums text-white sm:text-3xl">{item.value}</dd>
              <dt className="mt-1 text-sm font-medium text-slate-300">{item.label}</dt>
              <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>
            </div>
          ))}
        </dl>
      </section>

      {/* ── سه ستون ارزش ────────────────────────────────────────────────── */}
      <section className="shell py-16 sm:py-20">
        <div className="max-w-2xl">
          <span className="eyebrow">چرا HERMICAD</span>
          <h2 className="section-title mt-3">سه چیزی که همیشه سرِ جایش می‌ماند</h2>
          <p className="lede mt-3">
            سرعت بی‌فایده است اگر نتیجه قابل اعتماد نباشد. هر بخش این ابزار حول یک پرسش ساخته شده:
            آیا می‌توانم به این عدد تکیه کنم و خودم بازبینی‌اش کنم؟
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <article key={pillar.title} className="panel card-link p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-teal-400/25 bg-teal-400/10 text-teal-300">
                <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true">
                  {pillar.icon}
                </svg>
              </span>
              <h3 className="mt-5 text-base font-bold text-white">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-400">{pillar.body}</p>
              <ul className="mt-4 space-y-2 border-t border-white/8 pt-4">
                {pillar.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-slate-300">
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="mt-1.5 shrink-0 text-teal-400">
                      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* ── صداقت: چه چیزی نیست ─────────────────────────────────────────── */}
      <section className="shell pb-16 sm:pb-20">
        <div className="panel overflow-hidden">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="border-b border-white/8 p-6 sm:p-8 md:border-b-0 md:border-e">
              <h2 className="text-lg font-bold text-white">این ابزار برای چه ساخته شده</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                {[
                  "رسیدن سریع از زمین خالی به چند گزینهٔ مقدماتیِ قابل مقایسه",
                  "بررسی محدودیت‌های هندسی، پارکینگ، نور و تراکم پیش از طراحی دستی",
                  "ساخت خروجی‌های نیمه‌آماده برای شروع کار در نرم‌افزار تخصصی",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-teal-400" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-amber-400/[0.04] p-6 sm:p-8">
              <h2 className="text-lg font-bold text-white">و برای چه ساخته نشده</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                {[
                  "جای مهندس دارای صلاحیت را نمی‌گیرد و تأییدیهٔ انطباق صادر نمی‌کند",
                  "تحلیل سازهٔ اجرایی و طراحی شبکهٔ تأسیسات در دامنهٔ این نسخه نیست",
                  "آستانه‌ها داخلی یا اظهاری‌اند؛ متن رسمی برای پروژهٔ شما احراز نشده است",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/scope" className="btn mt-6">
                دامنه و محدودیت‌ها را ببینید
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── فراخوان پایانی ──────────────────────────────────────────────── */}
      <section className="shell pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-teal-400/20 bg-gradient-to-bl from-teal-400/[0.12] via-white/[0.02] to-transparent p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute -start-20 -top-24 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl" />
          <h2 className="relative text-2xl font-extrabold text-white sm:text-3xl">اولین زمین را همین حالا شروع کنید</h2>
          <p className="relative mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            نیازی به ثبت‌نام نیست. یک زمین تعریف کنید و در چند دقیقه چند طرح مقدماتی با تحلیل کامل ببینید —
            هر زمان بخواهید می‌توانید همهٔ اعدادش را باز کنید.
          </p>
          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/new" className="btn btn-primary btn-lg">
              شروع تعریف هدایت‌شده
            </Link>
            <Link href="/design" className="btn btn-lg">
              ورود به استودیو طراحی
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

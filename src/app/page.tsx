import Link from "next/link";
import { CODE_SET, ENGINE_VERSION } from "@/domain/constants";
import { RULE_COUNT } from "@/domain/codes";
import { runQualitySuite } from "@/domain/testing/suite";
import { WEIGHT_GROUPS } from "@/domain/optimize";
import { Panel, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const capabilities: { area: string; detail: string; status: "done" | "limited" | "out" }[] = [
  { area: "مدل مهندسی مرکزی (CEM)", detail: "یک سند نسخه‌بندی‌شده به‌ازای هر طرح؛ هندسه، نیازمندی، تحلیل، فرضیات و ردیابی در یک مرجع", status: "done" },
  { area: "هندسه محاسباتی زمین نامنظم", detail: "مساحت شولیس، کنترل خودمتقاطع، عقب‌نشینی جهت‌دار با برش نیم‌صفحه، بیشینه مستطیل محاطی روی شبکه", status: "done" },
  { area: "ساختاری‌سازی نیازمندی", detail: "استخراج قطعی پارامترها از متن فارسی/انگلیسی با ثبت الگو و اطمینان؛ بدون حدس پنهان", status: "done" },
  { area: "موتور ضوابط نسخه‌بندی‌شده", detail: `${RULE_COUNT} قاعده با شناسه، منبع، نسخه، شدت، مقدار مشاهده‌شده و ردیابی`, status: "done" },
  { area: "طراحی مولد و مقایسه", detail: "۵ راهبرد حجم، چیدمان خودکار فضا با seed قطعی، تحلیل و رتبه‌بندی چندمعیاره + جبهه پارتو", status: "done" },
  { area: "اصلاح خودکار و بازاعتبارسنجی", detail: "حلقه اصلاح (تراکم، پارکینگ، ادغام فضا، پی) با ثبت اقدامات اعمال‌شده و اعمال‌نشده", status: "done" },
  { area: "تحلیل معماری/سازه/MEP/پارکینگ/گردش", detail: "روابط سرانگشتی مهندسی با فرمول و فرضیات صریح؛ طرح مقدماتی نه محاسبات اجرایی", status: "done" },
  { area: "خروجی PDF/DXF/SVG/IFC/XLSX/CSV/JSON", detail: "فایل‌های واقعی و مستقل از کتابخانه تجاری؛ IFC فقط زیرمجموعه فضایی", status: "limited" },
  { area: "بارگذاری DWG/IFC موجود و ویرایشگر گرافیکی", detail: "در نقشه راه؛ ورودی فعلی مختصات عددی و فرم است", status: "out" },
  { area: "تحلیل سازه اجرایی و MEP دقیق", detail: "نیازمند نرم‌افزار تخصصی و مهندس دارای صلاحیت؛ HERMICAD فقط طرح مقدماتی و کنترل اولیه می‌دهد", status: "out" },
  { area: "استنتاج با مدل زبانی ابری", detail: "عمداً وابسته نیستیم؛ هوشمندی از الگوریتم، هندسه، قواعد و بهینه‌سازی می‌آید", status: "out" },
];

const statusMap = {
  done: { label: "پیاده‌سازی‌شده", className: "border-teal-400/40 bg-teal-400/10 text-teal-200" },
  limited: { label: "محدود و مستند", className: "border-amber-400/40 bg-amber-400/10 text-amber-200" },
  out: { label: "خارج از دامنه نسخه فعلی", className: "border-slate-500/30 bg-slate-500/10 text-slate-300" },
};

export default function HomePage() {
  const suite = runQualitySuite();
  return (
    <main>
      <section className="grid-bg border-b border-white/10">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-5 py-14 lg:grid-cols-[1.35fr_0.65fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="chip border-teal-400/40 bg-teal-400/10 text-teal-200">Autonomous Engineering Intelligence</span>
              <span className="chip">Deterministic engine · no external AI</span>
              <span className="chip">{ENGINE_VERSION}</span>
            </div>
            <h1 className="mt-5 text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-[44px]">
              HERMICAD — از زمین نامنظم تا چند طرح قابل‌مقایسه، با محاسبه و ردیابی واقعی
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              یک پلتفرم مهندسی، نه داشبورد نمایشی: نیازمندی‌ها ساختاری‌سازی می‌شوند، هندسه زمین تحلیل می‌شود، ضوابط
              نسخه‌بندی‌شده اجرا می‌گردند، طرح‌ها به‌صورت مولد تولید و اعتبارسنجی می‌شوند و در نهایت نقشه، BIM و گزارش
              از یک مدل مرکزی صادر می‌شود. هر عدد، منبع، فرمول و فرض دارد.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/projects" className="btn btn-primary px-5 py-2.5 text-sm">
                ورود به کارگاه پروژه‌ها
              </Link>
              <Link href="/architecture" className="btn px-5 py-2.5 text-sm">
                معماری و مدل داده
              </Link>
              <Link href="/quality" className="btn px-5 py-2.5 text-sm">
                دروازه کیفیت ({suite.passed}/{suite.results.length})
              </Link>
            </div>
            <div className="mt-7 grid gap-2 sm:grid-cols-4">
              <Stat label="قواعد نسخه‌بندی‌شده" value={RULE_COUNT} hint={`${CODE_SET.code}@${CODE_SET.edition}`} />
              <Stat label="آزمون خودکار" value={`${suite.passed}/${suite.results.length}`} tone={suite.failed === 0 ? "good" : "bad"} hint="unit · integration · regression" />
              <Stat label="معیارهای بهینه‌سازی" value={10} hint="رتبه‌بندی وزنی + جبهه پارتو" />
              <Stat label="قالب خروجی واقعی" value={7} hint="PDF, DXF, SVG, IFC, XLSX, CSV, JSON" />
            </div>
          </div>
          <Panel title="جریان اجرایی موتور" subtitle="وابستگی یک‌طرفه: UI → API → موتور ← مدل مرکزی">
            <ol className="space-y-2 text-[11px] leading-5">
              {[
                ["۱", "زمین و محدودیت‌ها", "مختصات، شیب، عقب‌نشینی"],
                ["۲", "ساختاری‌سازی نیازمندی", "پارس قطعی + فرم تأیید"],
                ["۳", "محدوده ساخت‌پذیر", "برش نیم‌صفحه + شبکه محاطی"],
                ["۴", "تولید گزینه‌ها", "۵ راهبرد، seed قطعی"],
                ["۵", "تحلیل مهندسی", "سازه، MEP، پارکینگ، نور"],
                ["۶", "موتور ضوابط", "انطباق/نقض + ردیابی"],
                ["۷", "اصلاح و بهینه‌سازی", "حلقه اصلاح + پارتو"],
                ["۸", "خروجی مهندسی", "نقشه، BIM، گزارش"],
              ].map(([step, title, detail]) => (
                <li key={step} className="flex gap-2">
                  <span className="mono mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-teal-400/15 text-[10px] text-teal-200">
                    {step}
                  </span>
                  <span>
                    <span className="font-semibold text-slate-100">{title}</span>
                    <span className="block text-slate-400">{detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-5 py-12">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel
            title="ماتریس صداقت قابلیت‌ها"
            subtitle="هر قابلیت با وضعیت واقعی خودش آمده است؛ قابلیت ناقص، «کامل» نمایش داده نمی‌شود."
          >
            <div className="overflow-x-auto scroll-thin">
              <table className="table-eng">
                <thead>
                  <tr>
                    <th>حوزه</th>
                    <th>آنچه واقعاً انجام می‌شود</th>
                    <th>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {capabilities.map((c) => (
                    <tr key={c.area}>
                      <td className="font-semibold text-slate-100">{c.area}</td>
                      <td className="text-slate-300">{c.detail}</td>
                      <td>
                        <span className={`chip ${statusMap[c.status].className}`}>{statusMap[c.status].label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="space-y-6">
            <Panel title="مدل مهندسی مرکزی" subtitle="Canonical Engineering Model — مرجع واحد داده">
              <ul className="space-y-2 text-[11px] leading-5 text-slate-300">
                <li className="panel-soft p-3">
                  <span className="font-semibold text-teal-200">SiteModel</span> — مرز، رأس‌ها، ترازها، عقب‌نشینی، پهنه
                  لرزه‌ای، ظرفیت باربری، اقلیم.
                </li>
                <li className="panel-soft p-3">
                  <span className="font-semibold text-teal-200">Requirements</span> — برنامه واحدها، حداقل‌ها، تراکم، سطح
                  اشغال، پارکینگ + نتیجه پارس با اطمینان و ردیابی.
                </li>
                <li className="panel-soft p-3">
                  <span className="font-semibold text-teal-200">CanonicalScheme</span> — بلوک‌ها، طبقات، فضاها، هسته‌ها،
                  تحلیل سازه/MEP/پارکینگ/گردش/نور، معیارها، فرضیات، گام‌های ردیابی.
                </li>
                <li className="panel-soft p-3">
                  <span className="font-semibold text-teal-200">ValidationReport</span> — ارزیابی هر قاعده با نسخه سند،
                  مقدار مشاهده‌شده، حد مجاز، منبع، راهکار اصلاح.
                </li>
              </ul>
            </Panel>
            <Panel title="وزن‌های پیش‌فرض تصمیم" subtitle="قابل تغییر در کارگاه؛ رتبه‌بندی و پارتو بلافاصله بازمحاسبه می‌شود">
              <div className="space-y-2">
                {WEIGHT_GROUPS.map((g) => (
                  <div key={g.id} className="flex items-center justify-between border-b border-white/5 pb-1.5 text-[11px]">
                    <span className="text-slate-300">{g.label}</span>
                    <span className="mono text-teal-200">{(g.default * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-5 pb-14">
        <Panel
          title="اولین محصول عملی: پروژه مسکونی روی زمین نامنظم"
          subtitle="این مسیر کامل و قابل اجراست؛ از ورودی تا PDF/DXF. پروژه نمایشی با داده واقعی موتور ساخته می‌شود."
        >
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["ورودی", "زمین شش‌ضلعی ۸۶۸ m² با شیب ۲.۸ m، ۱۴ واحد، عقب‌نشینی جهت‌دار"],
              ["تولید", "۵ طرح با بلوک فشرده/کم‌عمق/دوبلوک؛ هر طرح با seed مستقل"],
              ["اعتبارسنجی", "اجرای کامل موتور ضوابط + اصلاح خودکار + بازاعتبارسنجی"],
              ["خروجی", "PDF برداری، DXF لایه‌بندی‌شده، IFC4 فضایی، XLSX/CSV/JSON/SVG"],
            ].map(([title, body]) => (
              <div key={title} className="panel-soft p-3">
                <div className="text-xs font-bold text-teal-200">{title}</div>
                <p className="mt-1 text-[11px] leading-5 text-slate-300">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/projects" className="btn btn-primary">
              شروع با پروژه نمونه
            </Link>
            <Link href="/architecture#roadmap" className="btn">
              نقشه راه توسعه
            </Link>
            <a href="/api/quality" className="btn">
              /api/quality
            </a>
          </div>
        </Panel>
      </section>
    </main>
  );
}

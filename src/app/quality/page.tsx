import { runQualitySuiteCached } from "@/domain/testing/suite";
import { Panel, Stat, StatusBadge } from "@/components/ui";
import { PageHeader } from "@/components/site/PageHeader";

export const dynamic = "force-dynamic";

export default function QualityPage() {
  const suite = runQualitySuiteCached();
  const suites = Array.from(new Set(suite.results.map((r) => r.suite)));
  return (
    <main className="shell py-10 sm:py-14">
      <PageHeader
        back={{ href: "/", label: "خانه" }}
        eyebrow="شفافیت · قابل تکرار"
        title="دروازهٔ کیفیت"
        lede="همان مجموعه‌ای که CI اجرا می‌کند، همین‌جا روی دادهٔ نمونهٔ واقعی اجرا می‌شود: هندسه با مقادیر دستی مستقل، آزمون مثبت و منفی قاعده‌به‌قاعده، بازمحاسبهٔ مستقل سازه و تأسیسات و پارکینگ، زنجیرهٔ یکپارچگی هندسی، اعتبارسنجی محتوایی هفت قالب خروجی و خط مبنای رگرسیون. «سبز» یعنی محتوا بررسی شده است، نه فقط پاسخ HTTP."
        aside={
          <div className="flex flex-wrap gap-2">
            <span className={`chip ${suite.failed === 0 ? "border-teal-400/40 bg-teal-400/10 text-teal-100" : "border-rose-400/40 bg-rose-400/10 text-rose-100"}`}>
              {suite.failed === 0 ? "همه سبز" : `${suite.failed} آزمون ناموفق`}
            </span>
            <a href="/api/quality" className="chip hover:border-teal-400/40">JSON خروجی</a>
          </div>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="آزمون موفق" value={suite.passed} tone="good" />
        <Stat label="آزمون ناموفق" value={suite.failed} tone={suite.failed === 0 ? "default" : "bad"} />
        <Stat label="زمان اجرا" value={`${suite.durationMs}`} unit="ms" />
        <Stat label="زمان آخرین اجرا" value={new Date(suite.generatedAt).toLocaleTimeString("fa-IR")} />
        <Stat label="مجموعه‌ها" value={new Set(suite.results.map((r) => r.suite)).size} />
      </div>

      <div className="mt-8 space-y-5">
        {suites.map((name) => {
          const results = suite.results.filter((r) => r.suite === name);
          const failed = results.filter((r) => !r.passed).length;
          return (
            <Panel
              key={name}
              title={`مجموعه ${name}`}
              subtitle={`${results.length - failed}/${results.length} موفق`}
              action={<StatusBadge status={failed === 0 ? "pass" : "fail"} />}
            >
              <div className="overflow-x-auto scroll-thin -mx-1 px-1">
                <table className="table-eng">
                  <thead>
                    <tr>
                      <th>آزمون</th>
                      <th>نتیجه</th>
                      <th>جزئیات</th>
                      <th>زمان</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.name}>
                        <td className="font-semibold text-slate-100">{r.name}</td>
                        <td><StatusBadge status={r.passed ? "pass" : "fail"} /></td>
                        <td className="mono text-[0.8125rem] text-slate-300">{r.detail}</td>
                        <td className="mono text-xs text-slate-500">{r.durationMs} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel className="mt-6" title="معنای این آزمون‌ها" subtitle="چه چیزی تضمین می‌شود و چه چیزی نمی‌شود">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="panel-soft p-3">
            <p className="text-xs font-bold text-teal-200">تضمین‌شده</p>
            <ul className="mt-1 space-y-1 text-[0.8125rem] leading-5 text-slate-300">
              <li>• قطعیت: ورودی یکسان + seed یکسان ⇒ خروجی یکسان.</li>
              <li>• یکپارچگی هندسی: مساحت‌ها با چندضلعی‌ها و مجموع سطح طبقات با GFA سازگار است.</li>
              <li>• استقرار: هیچ بلوکی خارج از محدوده پس از عقب‌نشینی قرار نمی‌گیرد.</li>
              <li>• قابلیت ردیابی: هر قاعده منبع/نسخه و هر فرض، مبنای خود را دارد.</li>
            </ul>
          </div>
          <div className="panel-soft p-3">
            <p className="text-xs font-bold text-amber-200">تضمین‌نشده</p>
            <ul className="mt-1 space-y-1 text-[0.8125rem] leading-5 text-slate-300">
              <li>• صحت کدگذاری همه بندهای ضوابط در همه حوزه‌های قضایی.</li>
              <li>• کفایت تحلیل سازه/MEP برای اجرا یا اخذ مجوز؛ اعداد مرحله «غربالگری مقدماتی» هستند.</li>
              <li>• صحت آستانه‌های ضوابط: مجموعه فعلی داخلی و تأییدنشده است (بدون نسخه رسمی).</li>
              <li>• دقت منطقه ساخت‌پذیر برای زمین مقعر: روش نیم‌صفحه محافظه‌کارانه است.</li>
              <li>• دقت نقشه اجرایی (پلان شماتیک است).</li>
              <li>• جایگزینی بازبینی مهندس دارای صلاحیت.</li>
            </ul>
          </div>
        </div>
      </Panel>
    </main>
  );
}

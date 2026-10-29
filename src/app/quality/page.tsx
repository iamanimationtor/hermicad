import { runQualitySuite } from "@/domain/testing/suite";
import { Panel, Stat, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function QualityPage() {
  const suite = runQualitySuite();
  const suites = Array.from(new Set(suite.results.map((r) => r.suite)));
  return (
    <main className="mx-auto max-w-[1200px] px-5 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">دروازه کیفیت HERMICAD</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
            این مجموعه، هر بار که صفحه/API فراخوانی می‌شود روی داده نمونه واقعی اجرا می‌شود: هندسه با مقادیر دستی
            مستقل، آزمون مثبت و منفی قاعده‌به‌قاعده، بازمحاسبه مستقل سازه/تأسیسات/پارکینگ، زنجیره یکپارچگی هندسی،
            اعتبارسنجی محتوایی هفت قالب خروجی، و خط مبنای رگرسیون. «سبز» بودن یعنی محتوا بررسی شده است، نه فقط
            پاسخ HTTP.
          </p>
        </div>
        <div className="flex gap-2">
          <span className={`chip ${suite.failed === 0 ? "border-teal-400/40 bg-teal-400/10 text-teal-200" : "border-rose-400/40 bg-rose-400/10 text-rose-200"}`}>
            {suite.failed === 0 ? "دروازه باز است" : `${suite.failed} آزمون ناموفق`}
          </span>
          <a href="/api/quality" className="chip">GET /api/quality</a>
        </div>
      </header>

      <div className="mb-6 grid gap-2 sm:grid-cols-4">
        <Stat label="آزمون موفق" value={suite.passed} tone="good" />
        <Stat label="آزمون ناموفق" value={suite.failed} tone={suite.failed === 0 ? "default" : "bad"} />
        <Stat label="زمان اجرا" value={`${suite.durationMs}`} unit="ms" />
        <Stat label="زمان آخرین اجرا" value={new Date(suite.generatedAt).toLocaleTimeString("fa-IR")} />
        <Stat label="مجموعه‌ها" value={new Set(suite.results.map((r) => r.suite)).size} />
      </div>

      <div className="space-y-5">
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
                      <td className="mono text-[11px] text-slate-300">{r.detail}</td>
                      <td className="mono text-[10px] text-slate-500">{r.durationMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          );
        })}
      </div>

      <Panel className="mt-6" title="معنای این آزمون‌ها" subtitle="چه چیزی تضمین می‌شود و چه چیزی نمی‌شود">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="panel-soft p-3">
            <p className="text-xs font-bold text-teal-200">تضمین‌شده</p>
            <ul className="mt-1 space-y-1 text-[11px] leading-5 text-slate-300">
              <li>• قطعیت: ورودی یکسان + seed یکسان ⇒ خروجی یکسان.</li>
              <li>• یکپارچگی هندسی: مساحت‌ها با چندضلعی‌ها و مجموع سطح طبقات با GFA سازگار است.</li>
              <li>• استقرار: هیچ بلوکی خارج از محدوده پس از عقب‌نشینی قرار نمی‌گیرد.</li>
              <li>• قابلیت ردیابی: هر قاعده منبع/نسخه و هر فرض، مبنای خود را دارد.</li>
            </ul>
          </div>
          <div className="panel-soft p-3">
            <p className="text-xs font-bold text-amber-200">تضمین‌نشده</p>
            <ul className="mt-1 space-y-1 text-[11px] leading-5 text-slate-300">
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

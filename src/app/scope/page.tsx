import Link from "next/link";
import { ScopeMatrix } from "@/components/scope/ScopeMatrix";
import { scopeRegister } from "@/domain/scope/registry";

export const metadata = { title: "دامنه و وضعیت قابلیت‌ها | هرمیکد" };

export default function ScopePage() {
  const register = scopeRegister();
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
      <header className="rounded-2xl border border-white/10 bg-gradient-to-bl from-teal-400/[0.07] to-transparent p-6 sm:p-9">
        <div className="flex flex-wrap gap-2">
          <span className="chip border-amber-400/40 bg-amber-400/10 text-amber-100">ک۰۱ · پیش‌نویس، نیازمند تصویب</span>
          <span className="chip">مبنای بررسی کد: <bdi dir="ltr">{register.baseline.slice(0, 7)}</bdi></span>
          <span className="chip">تاریخ بررسی مبنا: <bdi dir="ltr">{register.reviewedAt}</bdi></span>
        </div>
        <h1 className="mt-5 text-3xl font-extrabold leading-tight text-white sm:text-4xl">دامنه، محدودیت و شواهد</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate-300">
          آنچه نرم‌افزار اکنون ثبت، محاسبه یا ترسیم می‌کند را از طراحی معتبر و انتشار عمومی جدا ببینید. این دفتر، فهرستی برای آغاز
          تصمیم‌گیری است؛ دامنهٔ نهایی، منابع رسمی و پذیرش متخصص هنوز تصویب نشده‌اند.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/api/scope" className="btn btn-primary">دریافت دفتر به شکل JSON</a>
          <Link href="/structures" className="btn">مسیرهای تخصصی سازه</Link>
          <Link href="/guide" className="btn">شروع پروندهٔ مقدماتی</Link>
        </div>
      </header>

      <div role="note" className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm leading-7 text-amber-100">
        <strong>هیچ ردیفی مجوز اجرا یا گواهی انطباق نیست.</strong> ثبت یک منبع، موفقیت آزمون نرم‌افزار، رسم نقشه یا نبود خطای بحرانی
        به‌تنهایی آن را تأیید نمی‌کند. این صفحه خودْ سامانهٔ تأیید و صدور نیست؛ کنترل‌های موجودِ تحویل مقدماتی همچنان جداگانه اعمال می‌شوند.
      </div>

      <section aria-labelledby="gates-title" className="mt-12">
        <p className="text-xs font-semibold text-teal-200">سه دروازهٔ مستقل</p>
        <h2 id="gates-title" className="mt-2 text-xl font-extrabold text-white sm:text-2xl">چه چیزی برای اعلام آمادگی لازم است؟</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {register.gates.map((gate, index) => (
            <article key={gate.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-500">دروازهٔ {index + 1}</span>
                <span className="chip border-amber-400/30 bg-amber-400/5 text-amber-100">ارزیابی نشده</span>
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-100">{gate.title}</h3>
              <ul className="mt-3 list-disc space-y-2 pr-5 text-xs leading-6 text-slate-300">
                {gate.needs.map((need) => <li key={need}>{need}</li>)}
              </ul>
              <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-6 text-slate-400">این دروازه {gate.doesNotProve}</p>
            </article>
          ))}
        </div>
      </section>

      <ScopeMatrix rows={register.rows} />

      <section className="mt-12 rounded-xl border border-white/10 p-5 sm:p-6">
        <h2 className="text-lg font-bold text-white">تصمیم‌هایی که همچنان باز هستند</h2>
        <p className="mt-2 text-sm leading-7 text-slate-300">
          مالک محصول باید خانواده‌ها، زیرسیستم‌ها، کاربری‌ها، حوزهٔ مکانی، قالب‌های مقصد و اهداف ظرفیت و بازیابی را تصویب کند؛
          مسئول مهندسی و بازبین مستقل نیز باید روش‌ها، منابع و معیار پذیرش را تعیین کنند. تا آن زمان وضعیت ک۰۱ بسته‌شده نیست.
        </p>
        <p className="mt-3 text-xs leading-6 text-slate-400">
          دفتر خواندنی است و تأیید، تاریخچهٔ غیرقابل‌بازنویسی یا نقش‌های مسئول را پیاده‌سازی نمی‌کند. برای ادامه، راهنمای تکمیل و
          پیش‌نویس قرارداد دامنه در مخزن را ببینید.
        </p>
      </section>
    </main>
  );
}

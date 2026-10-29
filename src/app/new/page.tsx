import Link from "next/link";
import { IntakeWizard } from "@/components/IntakeWizard";

export const metadata = { title: "تعریف هوشمند پروژه | HERMICAD" };

export default function NewProjectPage() {
  return (
    <main className="mx-auto max-w-[1400px] px-5 py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <Link href="/projects" className="chip hover:border-teal-400/50">← پروژه‌ها</Link>
            <span className="chip border-teal-400/40 bg-teal-400/10 text-teal-200">ورودی هدایت‌شده</span>
            <span className="chip">بدون نیاز به دانش CAD</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-white">تعریف هوشمند پروژه</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
            ابعاد زمین، تعداد واحدها و محدودیت‌ها را انتخاب کنید. HERMICAD اطلاعات ناقص را فهرست می‌کند، فرضیات را
            صریح ثبت می‌کند، سپس ۵ طرح با دیوار، بازشو، پله و اندازه‌گذاری تولید و اعتبارسنجی می‌کند.
          </p>
        </div>
      </header>
      <IntakeWizard />
    </main>
  );
}

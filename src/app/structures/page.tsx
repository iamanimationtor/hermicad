import Link from "next/link";
import { StructureStart } from "@/components/structures/StructureStart";
export const metadata = { title: "مسیرهای تخصصی سازه | هرمیکد" };
export default function Structures() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <span className="chip">پروندهٔ واحد · مسیر متناسب با سازه</span>
      <h1 className="mt-4 text-3xl font-extrabold">هر سازه، مسیر تخصصی خودش</h1>
      <p className="my-5 text-sm leading-8 text-slate-300">
        ابتدا خانوادهٔ سازه را انتخاب کنید. هندسه، مصالح، بارها، مدارک مبنا و ارزیابی‌های قابل اجرا فقط در مسیر مرتبط نمایش داده می‌شوند.
        هیچ الگوی ساختمانی به پل، مخزن یا دکل نسبت داده نمی‌شود.
      </p>
      <div className="mb-6 rounded-xl border border-amber-400/30 p-4 text-sm leading-7 text-amber-100">
        دامنهٔ فعلی هر مسیر روی کارت مشخص است. وجود مسیر به معنی وجود موتور طراحی کامل آن خانواده یا پوشش همهٔ ضوابط نیست؛ خروجی اجرایی
        تأییدشده همچنان صادر نمی‌شود.
      </div>
      <StructureStart />
      <Link href="/guide" className="mt-8 block text-teal-200">
        ادامهٔ پرونده‌های موجود ←
      </Link>
    </main>
  );
}

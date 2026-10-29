import Link from "next/link";
import { StructureStart } from "@/components/structures/StructureStart";
import { PageHeader } from "@/components/site/PageHeader";

export const metadata = { title: "مسیرهای تخصصی سازه" };

export default function Structures() {
  return (
    <main className="shell py-10 sm:py-14">
      <PageHeader
        back={{ href: "/guide", label: "مسیر گام‌به‌گام" }}
        eyebrow="پروندهٔ واحد · مسیر متناسب با سازه"
        title="هر سازه، مسیر خودش"
        lede="اول خانوادهٔ سازه را انتخاب می‌کنید. هندسه، مصالح، بارها، مدارک مبنا و ارزیابی‌ها فقط در همان مسیر و به‌اندازهٔ دامنهٔ واقعی‌اش نمایش داده می‌شوند؛ الگوی ساختمانی به پل، مخزن یا دکل نسبت داده نمی‌شود."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.55fr_0.45fr] lg:gap-8">
        <StructureStart />

        <aside className="space-y-4">
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 text-sm leading-7 text-amber-100/90">
            <strong className="block text-sm font-bold text-amber-50">دامنهٔ هر مسیر روی کارت نوشته شده</strong>
            وجود یک مسیر یعنی وجود موتور طراحی کامل آن خانواده نیست. خروجی اجرایی تأییدشده از این مسیر صادر نمی‌شود.
          </div>
          <div className="panel p-5">
            <h2 className="text-sm font-bold text-white">پرونده‌های موجود</h2>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              اگر پیش‌تر پرونده‌ای ساخته‌اید، از مسیر گام‌به‌گام ادامه دهید.
            </p>
            <Link href="/guide" className="btn btn-block mt-4">
              ادامهٔ پرونده‌ها
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

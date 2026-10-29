import Link from "next/link";
import { IntakeWizard } from "@/components/IntakeWizard";
import { PageHeader } from "@/components/site/PageHeader";

export const metadata = { title: "تعریف پروژه از زمین" };

export default function NewProjectPage() {
  return (
    <main className="shell py-10 sm:py-14">
      <PageHeader
        back={{ href: "/projects", label: "پروژه‌ها" }}
        eyebrow="ورودی هدایت‌شده · بدون نیاز به نرم‌افزار نقشه‌کشی"
        title="زمین را توصیف کنید، بقیه را ما می‌سازیم"
        lede="ابعاد زمین، تعداد واحدها و محدودیت‌ها را انتخاب می‌کنید. HERMICAD اطلاعات ناقص را فهرست می‌کند، فرض‌ها را صریح ثبت می‌کند و پنج طرح با دیوار، بازشو، پله و اندازه‌گذاری تولید و کنترل می‌کند."
        actions={
          <>
            <Link href="/design" className="btn">
              ترجیح می‌دهم خودم بکشم
            </Link>
            <Link href="/projects" className="btn btn-ghost">
              دیدن نمونهٔ آماده
            </Link>
          </>
        }
      />
      <div className="mt-8">
        <IntakeWizard />
      </div>
    </main>
  );
}

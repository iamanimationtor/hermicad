import Link from "next/link";
import { notFound } from "next/navigation";

import { CLASSIFICATION_LABELS } from "@/domain/studio/document";
import { getDesign } from "@/server/designs";

export const dynamic = "force-dynamic";

/**
 * گالری رندرهای طبقه‌بندی‌شده.
 *
 * چرا وجود دارد: کاربر خواسته «رندرها بر اساس طبقه‌بندی، مرتب و منظم» باشد.
 * اینجا همهٔ برگه‌های یک سند (پلان ترکیبی + هر رشته + نماها + برش) کنار هم
 * دیده می‌شوند، بدون نیاز به دانلود تک‌تک فایل‌ها. تصاویر همان خروجی SVG
 * رسمی‌اند (همان چیزی که چاپ/تحویل می‌شود)، نه یک بازنمایی جداگانه.
 */
const DISCIPLINES = CLASSIFICATION_LABELS.filter((entry) => entry.id !== "all");

export default async function DesignGalleryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const design = await getDesign(id).catch(() => null);
  if (!design) notFound();

  const base = `/api/designs/${design.id}/export`;
  const sheets = [
    { key: "all", label: "پلان ترکیبی (معماری + سازه)", url: `${base}?format=svg&classification=all` },
    ...DISCIPLINES.map((entry) => ({
      key: entry.id,
      label: `پلان ${entry.label}`,
      url: `${base}?format=svg&classification=${entry.id}`,
    })),
    { key: "elevations", label: "برگهٔ نماها (۴ جهت)", url: `${base}?format=elevations` },
    { key: "section", label: "برش A-A", url: `${base}?format=section` },
    { key: "details", label: "جزئیات اجرایی سازه و جدول میلگرد", url: `${base}?format=details` },
    { key: "schedules", label: "جداول، کیپلان و بازشوها", url: `${base}?format=schedules` },
  ];

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <header className="panel mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-[11px] text-teal-300">گالری رندرهای طبقه‌بندی‌شده</p>
          <h1 className="mt-1 text-xl font-bold text-white">{design.name}</h1>
          <p className="mt-1 text-xs text-slate-400">
            {design.project.code} · {design.sheet.format} · مقیاس 1:{design.sheet.scale} · {design.levels} طبقه ·{" "}
            {design.items.length} شیء
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/design/${design.id}`} className="btn btn-primary">
            ویرایش سند
          </Link>
          <a href={`${base}?format=pdf-bundle`} className="btn">
            PDF چندبرگی
          </a>
          <a href={`${base}?format=elevations-pdf`} className="btn">
            PDF نماها و برش
          </a>
          <a href={`${base}?format=xlsx`} className="btn">
            XLSX متره
          </a>
          <a href={`${base}?format=ifc`} className="btn">
            IFC4
          </a>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {sheets.map((sheet) => (
          <section key={sheet.key} className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <h2 className="text-xs font-semibold text-slate-200">{sheet.label}</h2>
              <a href={sheet.url} download className="text-[11px] text-teal-300 hover:underline">
                دانلود SVG
              </a>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sheet.url}
              alt={sheet.label}
              className="block w-full bg-white"
              loading="lazy"
              style={{ aspectRatio: "420 / 297", objectFit: "contain" }}
            />
          </section>
        ))}
      </div>

      {/* بستهٔ چاپی: PDF برگه‌های رسمی برای چاپ، امضا و تحویل */}
      <section className="panel mt-6 p-5">
        <h2 className="text-sm font-bold text-white">بستهٔ چاپی PDF</h2>
        <p className="mt-1 text-[11px] leading-6 text-slate-400">
          همان برگه‌های SVG، این‌بار به‌صورت PDF برداری با فونت فارسی جاسازی‌شده (متن قابل جست‌وجو و کپی).
          برای چاپ A3 و تحویل به شهرداری/ناظر آماده است.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`${base}?format=elevations-pdf`} className="btn" download>
            نماها و برش (۵ برگه)
          </a>
          <a href={`${base}?format=section-pdf`} className="btn" download>
            برش A-A (PDF)
          </a>
          <a href={`${base}?format=details-pdf`} className="btn" download>
            جزئیات سازه و جدول میلگرد
          </a>
          <a href={`${base}?format=schedules-pdf`} className="btn" download>
            جداول، کیپلان و بازشوها
          </a>
          <a href={`${base}?format=dxf`} className="btn" download>
            پلان DXF (اتوکد)
          </a>
          <a href={`${base}?format=elevations-dxf`} className="btn" download>
            نماها DXF (۱:۱)
          </a>
          <a href={`${base}?format=section-dxf`} className="btn" download>
            برش DXF (۱:۱)
          </a>
          {DISCIPLINES.map((entry) => (
            <a
              key={entry.id}
              href={`${base}?format=pdf&classification=${entry.id}`}
              className="btn"
              download
            >
              PDF {entry.label}
            </a>
          ))}
        </div>
      </section>

      <p className="mt-6 text-[11px] leading-6 text-slate-500">
        تصاویر، همان برگه‌های رسمی SVG هستند (چاپ‌پذیر در A3). هر برگه فقط اشیای رشتهٔ خودش را با رنگ
        اختصاصی نشان می‌دهد و رشته‌های دیگر به‌صورت زمینهٔ محو برای انطباق می‌آیند. کنترل نهایی نقشه‌ها با
        مهندس دارای صلاحیت است.
      </p>
    </main>
  );
}

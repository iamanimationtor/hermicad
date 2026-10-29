import { createHash } from "node:crypto";
import { zipStore } from "@/domain/exporters/reports";
import { exportStudio, type StudioFormat } from "@/domain/studio/render";
import { assertStudioDocument } from "@/domain/studio/input";
import type { StudioDocument } from "@/domain/studio/document";
import { reviewJourney } from "@/domain/journey/review";
import { activeFields, activeReferences } from "@/domain/journey/model";
import { AccessError } from "./accessError";
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
/** بسته از یک snapshot ساخته می‌شود؛ نه چند GET که ممکن است نسخه‌های متفاوت ببینند. */
export function deliveryPackage(document: StudioDocument, purpose: unknown) {
  if (purpose !== "review") throw new AccessError(422, "تحویل اجرایی/پروانه تأیید نشده است؛ فقط بستهٔ بازبینی مقدماتی قابل تولید است.");
  assertStudioDocument(document);
  if (document.brief?.structural) throw new AccessError(422, "برای این پرونده از بستهٔ گزارش تخصصی سازه استفاده کنید.");
  if (!document.brief) throw new AccessError(422, "ابتدا پروندهٔ راهنما و خروجی‌های موردنیاز را ذخیره کنید.");
  const review = reviewJourney(document);
  if (!review.canDownloadReview)
    throw new AccessError(422, "خروجی انتخاب نشده یا مدل یک یا چند رشته خالی است؛ ابتدا موارد مرحلهٔ کنترل را رفع کنید.");
  const doc: StudioDocument = {
    ...document,
    name: `پیش‌طرح — ${document.name}`,
    project: {
      ...document.project,
      name: `پیش‌طرح — ${document.project.name}`,
      note: "صرفاً بازبینی مقدماتی؛ غیرقابل استفاده به عنوان نقشهٔ تأییدشدهٔ اجرا یا پروانه.",
    },
  };
  const files: { name: string; data: Buffer }[] = [];
  let size = 0;
  for (const output of review.outputs)
    for (const format of output.formats) {
      const levels = format === "pdf" || format === "dxf" ? output.levels : [null];
      for (const level of levels) {
        const view = level === null ? doc : { ...doc, currentLevel: level };
        const artifact = exportStudio(view, format as StudioFormat, { classification: output.trade ?? undefined });
        size += artifact.data.length;
        if (size > 100 * 1024 * 1024) throw new AccessError(422, "بسته بیش از ۱۰۰ مگابایت است؛ خروجی‌های کمتری انتخاب کنید.");
        const folder = level === null ? "" : `level-${String(level + 1).padStart(2, "0")}/`;
        files.push({
          name: `review-only/${output.id}/${folder}${format}.${artifact.filename.split(".").pop()}`,
          data: Buffer.from(artifact.data),
        });
      }
    }
  const source = Buffer.from(JSON.stringify(document, null, 2));
  files.push({ name: "source/document.json", data: source });
  const brief = document.brief;
  const manifest = {
    version: 1,
    purpose: "review-only",
    approval: "not-approved",
    designId: document.id,
    revision: document.revision,
    createdAt: new Date().toISOString(),
    sourceSha256: sha(source),
    information: review.information,
    selectedOutputs: review.outputs.map((o) => ({ id: o.id, label: o.label, levels: o.levels.map((l) => l + 1) })),
    executionReady: false,
    permitReady: false,
    findings: review.findings,
    activeInputs: activeFields(brief).map((f) => ({
      key: f.key,
      label: f.label,
      value: brief.values[f.key] ?? null,
      unit: f.unit ?? null,
    })),
    references: activeReferences(brief).map((r) => ({ id: r.id, label: r.label, submitted: brief.sources[r.id] ?? null, verified: false })),
    files: files.map((f) => ({ path: f.name, bytes: f.data.length, sha256: sha(f.data) })),
  };
  files.push({ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) });
  files.push({
    name: "راهنمای-تحویل.txt",
    data: Buffer.from(
      `هرمیکد — بستهٔ بازبینی مقدماتی\nسند: ${document.name}\nنسخه: ${document.revision}\nاین بسته نقشهٔ تأییدشدهٔ اجرایی یا پروانه نیست.\nتکمیل اطلاعات: ${review.information.completed} از ${review.information.total}؛ این عدد امتیاز انطباق نیست.\nمرجع ثبت‌شده توسط کاربر، مرجع راستی‌آزمایی‌شده محسوب نمی‌شود.\nفایل‌های هر رشته فقط جانمایی/ترسیم دادهٔ موجودند؛ به معنی طراحی مدار، تحلیل سازه یا محاسبات تأسیسات نیستند.\nنقشه‌های نما/برش و جدول‌ها شماتیک‌اند؛ ضخامت‌ها و هماهنگی رشته‌ها باید کنترل شوند.\n\nموارد باز:\n${review.findings.map((f, i) => `${i + 1}. ${f.message}\nاقدام: ${f.action}`).join("\n")}\n\nmanifest.json شامل نسخهٔ سند، کمبودها و هش SHA-256 تمام فایل‌های خروجی و سند مبناست.\n`,
    ),
  });
  return zipStore(files);
}

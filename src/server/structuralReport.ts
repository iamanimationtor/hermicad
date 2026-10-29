import { createHash } from "node:crypto";
import { assessStructure } from "@/domain/structures/assessment";
import { fieldsFor } from "@/domain/structures/catalog";
import { assertStudioDocument } from "@/domain/studio/input";
import type { StudioDocument } from "@/domain/studio/document";
import { Scene } from "@/domain/studio/draw";
import { sheetsPdf } from "@/domain/studio/sheetKit";
import { zipStore } from "@/domain/exporters/reports";
import { AccessError } from "./accessError";
export function structuralReport(doc: StudioDocument, purpose: unknown) {
  if (purpose !== "review") throw new AccessError(422, "گزارش تخصصی فقط برای بازبینی مقدماتی است؛ تأیید اجرایی صادر نمی‌شود.");
  assertStudioDocument(doc);
  const profile = doc.brief?.structural;
  if (!profile) throw new AccessError(422, "مسیر تخصصی سازه برای سند تعیین نشده است.");
  const assessment = assessStructure(profile);
  const lines: { text: string; ltr?: boolean }[] = [];
  const line = (text: string, ltr = false) => {
    for (const paragraph of text.split("\n")) {
      const words = paragraph.match(/.{1,65}(?:\s|$)|.{1,65}/gu) ?? [""];
      for (const text of words) lines.push({ text, ltr });
    }
  };
  line(`${assessment.label} — گزارش اولیه، نه طراحی اجرایی`);
  line(`پروژه: ${doc.name} | نسخه سند: ${doc.revision}`);
  line(`اطلاعات ثبت‌شده: ${assessment.information.completed} از ${assessment.information.total}؛ نه درصد ایمنی`);
  line(
    "وضعیت محاسبه: " +
      {
        "not-implemented": "حل‌گر اختصاصی موجود نیست",
        "missing-input": "ورودی محاسبه ناقص است",
        "outside-domain": "خارج از دامنهٔ مجاز مدل محدود",
        "limited-result": "فقط نتیجهٔ محاسبه محدود",
      }[assessment.status],
  );
  line("ورودی‌های فعال و واحدها");
  for (const f of fieldsFor(profile)) line(`${f.label}: ${profile.values[f.key] ?? "نامعلوم"} ${f.unit ?? ""}`);
  line("نتایج و روابط؛ اعداد گردنشده در گزارش JSON");
  for (const m of assessment.metrics) {
    line(m.label);
    line(`${m.value.toPrecision(8)} ${m.unit}`, true);
    line(m.expression, true);
    line(m.formulaId, true);
  }
  for (const c of assessment.comparisons)
    line(`${c.label}: ${c.withinUserCriterion ? "در محدودهٔ عدد واردشده" : "خارج از محدودهٔ عدد واردشده"}؛ این وضعیت تأیید ضابطه نیست.`);
  line("فرض‌ها و محدودیت‌ها");
  assessment.limitations.forEach((x) => line(x));
  line("موارد ناقص");
  assessment.missing.forEach((x) => line(x.label));
  line("مدارک و مراجع؛ همه تأییدنشده");
  for (const r of assessment.references) {
    line(r.label);
    line(r.submitted ? `${r.submitted.document} | ${r.submitted.edition} | ${r.submitted.checkedAt}` : "هنوز ارائه نشده است.");
  }
  line("مدارک اجرایی موردنیاز که هنوز طراحی نشده‌اند");
  assessment.requiredDeliverables.forEach((x) => line(x.label));
  const pages: Scene[] = [];
  const perPage = 36;
  for (let i = 0; i < lines.length; i += perPage) {
    const scene = new Scene();
    scene.rect(10, 10, 190, 277, { width: 0.3, gray: 0.5 });
    scene.text(195, 20, "هرمیکد — گزارش تخصصی تأییدنشده", 4, { anchor: "end", bold: true });
    let y = 32;
    for (const row of lines.slice(i, i + perPage)) {
      scene.text(row.ltr ? 16 : 194, y, row.text, 2.7, { direction: row.ltr ? "ltr" : "rtl", anchor: row.ltr ? "start" : "end" });
      y += 6.5;
    }
    scene.text(195, 281, `صفحه ${pages.length + 1} | نسخه ${doc.revision} | غیرقابل استناد به عنوان طراحی اجرایی`, 2.4, { anchor: "end" });
    pages.push(scene);
  }
  const reportDoc = { ...doc, sheet: { format: "A4" as const, orientation: "portrait" as const, scale: 100 } };
  const files = [
    { name: "گزارش-اولیه.pdf", data: Buffer.from(sheetsPdf(pages, reportDoc)) },
    { name: "assessment.json", data: Buffer.from(JSON.stringify(assessment, null, 2)) },
    { name: "source.json", data: Buffer.from(JSON.stringify(doc, null, 2)) },
  ];
  const manifest = {
    version: 1,
    designId: doc.id,
    revision: doc.revision,
    family: profile.family,
    approval: "not-approved",
    engine: assessment.engine,
    executionReady: false,
    permitReady: false,
    sourceSha256: createHash("sha256").update(files[2].data).digest("hex"),
    purpose: "review-only",
    files: files.map((f) => ({ path: f.name, bytes: f.data.length, sha256: createHash("sha256").update(f.data).digest("hex") })),
  };
  return zipStore([...files, { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) }]);
}

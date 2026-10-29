import { frameCsv } from "@/domain/structures/frame/exports";
import { frameSvg, frameDrawing, type FrameView } from "@/domain/structures/frame/drawing";
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
  if (assessment.frame) {
    const f = assessment.frame;
    line("تحلیل مشترک قاب دوبعدی — نه طراحی مقاومت یا تأیید ضابطه");
    line("مبنای مدل: " + profile.frame!.basis);
    line("وضعیت: " + { blocked: "حل متوقف شده است", solved: "حل خطی عددی", "outside-domain": "خارج از دامنه تغییرشکل کوچک" }[f.status]);
    f.issues.forEach((t) => line(t));
    f.assumptions.forEach((t) => line(t));
    line("مشخصات کامل گره‌ها، اعضا و بارها در سند مبنا؛ تمام نتایج در JSON و CSV است.");
    for (const c of profile.frame!.cases) {
      line(`حالت ${c.id}: ${c.name} — منبع: ${c.source}`);
    }
    for (const c of profile.frame!.combinations) {
      line(`ترکیب ${c.id}: ${c.name} — منبع: ${c.source}`);
      line(JSON.stringify(c.factors), true);
    }
    for (const r of f.results) {
      line(`${r.kind === "case" ? "حالت" : "ترکیب"} ${r.id}: ${r.name}`);
      line(`equilibrium relative=${r.equilibrium.relative.toExponential(3)}; residual=${r.residual.toExponential(3)}`, true);
      r.warnings.slice(0, 10).forEach((t) => line(t));
      if (r.warnings.length > 10)
        line(`${r.warnings.length - 10} هشدار دیگر این حالت در assessment.json درج شده است؛ PDF خلاصهٔ هشدارهاست.`);
    }
    line("پوش همه حالات و ترکیب‌ها؛ مقادیر حداکثری الزاماً هم‌زمان نیستند.");
    for (const e of f.envelopes) {
      line(e.member, true);
      line(`N [kN]: ${e.nMin.toPrecision(6)} .. ${e.nMax.toPrecision(6)}`, true);
      line(`V [kN]: ${e.vMin.toPrecision(6)} .. ${e.vMax.toPrecision(6)}`, true);
      line(`M [kN.m]: ${e.mMin.toPrecision(6)} .. ${e.mMax.toPrecision(6)}`, true);
    }
    line("روابط ثبت‌شده مدل قاب");
    for (const formula of f.formulaRecords) {
      line(formula.label);
      line(formula.id + ": " + formula.expression, true);
    }
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
  const drawings: { name: string; data: Buffer }[] = [];
  if (profile.frame && profile.frame.nodes.length) {
    const first = assessment.frame?.results[0];
    for (const view of (first ? ["model", "deformed", "moment"] : ["model"]) as FrameView[]) {
      drawings.push({ name: `frame-${view}.svg`, data: Buffer.from(frameSvg(profile.frame, first, view), "utf8") });
      const drawing = frameDrawing(profile.frame, first, view).scene;
      const sheet = new Scene();
      // همان بردارهای SVG با جابه‌جایی روی A4؛ هیچ تصویر پیکسلی جای مدل نمی‌نشیند.
      sheet.prims.push(
        ...drawing.prims.map((p) => {
          if (p.kind === "line") return { ...p, x1: p.x1 + 10, x2: p.x2 + 10, y1: p.y1 + 20, y2: p.y2 + 20 };
          if (p.kind === "poly") return { ...p, points: p.points.map(([x, y]) => [x + 10, y + 20] as [number, number]) };
          if (p.kind === "circle") return { ...p, cx: p.cx + 10, cy: p.cy + 20 };
          return { ...p, x: p.x + 10, y: p.y + 20 };
        }),
      );
      sheet.text(195, 170, `نسخه ${doc.revision} — ${doc.name.slice(0, 50)}`, 3, { anchor: "end" });
      sheet.text(195, 180, "نمودار فقط برای حالت انتخاب‌شده است؛ تمام حالات در داده‌های گزارش آمده‌اند.", 2.7, { anchor: "end" });
      sheet.text(195, 281, `صفحه ${pages.length + 1} | غیرقابل استناد به عنوان نقشهٔ اجرایی`, 2.4, { anchor: "end" });
      pages.push(sheet);
    }
  }
  const reportDoc = { ...doc, sheet: { format: "A4" as const, orientation: "portrait" as const, scale: 100 } };
  const files = [
    { name: "گزارش-اولیه.pdf", data: Buffer.from(sheetsPdf(pages, reportDoc)) },
    { name: "assessment.json", data: Buffer.from(JSON.stringify(assessment, null, 2)) },
    { name: "source.json", data: Buffer.from(JSON.stringify(doc, null, 2)) },
    ...drawings,
    ...(assessment.frame?.results.length
      ? Object.entries(frameCsv(assessment.frame)).map(([name, data]) => ({ name, data: Buffer.from(data, "utf8") }))
      : []),
  ];
  if (files.reduce((sum, f) => sum + f.data.length, 0) > 100 * 1024 * 1024)
    throw new AccessError(422, "گزارش بیش از سقف ۱۰۰ مگابایت است؛ مدل یا تعداد حالات را کاهش دهید.");
  const manifest = {
    version: 1,
    designId: doc.id,
    revision: doc.revision,
    family: profile.family,
    approval: "not-approved",
    engine: assessment.engine,
    frameEngine: assessment.frame?.engine ?? null,
    executionReady: false,
    permitReady: false,
    sourceSha256: createHash("sha256").update(files[2].data).digest("hex"),
    purpose: "review-only",
    files: files.map((f) => ({ path: f.name, bytes: f.data.length, sha256: createHash("sha256").update(f.data).digest("hex") })),
  };
  return zipStore([...files, { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) }]);
}

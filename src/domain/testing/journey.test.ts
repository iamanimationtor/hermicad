import { assert, test } from "./harness";
import { emptyBrief, activeFields, activeReferences, briefErrors, FIELDS, OUTPUTS } from "../journey/model";
import { reviewJourney } from "../journey/review";
import { createStudioDocument, documentFingerprint } from "../studio/document";
import { assertStudioDocument } from "../studio/input";
import { createDesignTemplate } from "../studio/templates";
import { deliveryPackage } from "@/server/delivery";
import { createHash } from "node:crypto";
function fixture() {
  return { ...createDesignTemplate("office"), brief: { ...emptyBrief(), use: "office" as const } };
}
function unzipStored(buffer: Buffer) {
  const map = new Map<string, Buffer>();
  let p = 0;
  while (buffer.readUInt32LE(p) === 0x04034b50) {
    assert((buffer.readUInt16LE(p+6)&0x0800)!==0,"پرچم UTF-8 نام فایل لازم است");
    const size = buffer.readUInt32LE(p + 18),
      name = buffer.readUInt16LE(p + 26),
      extra = buffer.readUInt16LE(p + 28),
      start = p + 30 + name + extra;
    map.set(buffer.subarray(p + 30, p + 30 + name).toString(), buffer.subarray(start, start + size));
    p = start + size;
  }
  return map;
}
test("journey", "پیش‌نویس خالی بدون حدس پذیرفته می‌شود، نه به‌عنوان آمادهٔ اجرا", () => {
  const doc = createStudioDocument({ brief: emptyBrief() });
  assertStudioDocument(doc);
  const r = reviewJourney(doc);
  assert(r.information.completed === 0, "اطلاعات ساختگی");
  assert(
    r.findings.some((f) => f.id === "city"),
    "شهر نامعلوم",
  );
  assert(!r.canDownloadReview && !r.executionReady && !r.permitReady, "نباید قابل تحویل نهایی باشد");
});
test("journey", "فیلتر کاربری و رشته و منابع تخصصی", () => {
  const b = emptyBrief();
  b.use = "school";
  assert(
    activeFields(b).some((f) => f.key === "classrooms"),
    "کلاس لازم است",
  );
  assert(!activeFields(b).some((f) => f.key === "units" || f.key === "bearing"), "فیلد نامرتبط");
  assert(
    activeReferences(b).some((r) => r.id === "education"),
    "مرجع آموزشی",
  );
  assert(!activeReferences(b).some((r) => r.id === "healthcare"), "مرجع نامرتبط");
  b.trades.push("structure");
  assert(
    activeFields(b).some((f) => f.key === "bearing"),
    "خاک با انتخاب سازه لازم است",
  );
});
test("journey", "حدود عددی، اعشار طبقات و ورودی خراب رد می‌شوند", () => {
  for (const f of FIELDS.filter((f) => f.type === "number")) {
    const b = emptyBrief();
    b.values[f.key] = f.max! + 1;
    assert(briefErrors(b).length > 0, f.key);
    b.values[f.key] = NaN;
    assert(briefErrors(b).length > 0, "NaN");
  }
  for (const v of [
    null,
    [],
    { ...emptyBrief(), sources: { x: null } },
    { ...emptyBrief(), values: { floors: 1.5 } },
    { ...emptyBrief(), trades: [] },
    { ...emptyBrief(), outputs: ["electrical"] },
    { ...emptyBrief(), values: { unknown: 1 } },
  ])
    assert(briefErrors(v).length > 0, "ورودی خراب پذیرفته شد");
});
test("journey", "عقب‌نشینی، تراکم، سطح اشغال و تعداد طبقه کنترل می‌شوند", () => {
  const doc = fixture();
  doc.brief.values = {
    plotWidth: 20,
    plotDepth: 20,
    north: 5,
    south: 5,
    east: 5,
    west: 5,
    width: 18,
    depth: 12,
    coverage: 40,
    far: 100,
    floors: 4,
    allowedFloors: 2,
  };
  const ids = reviewJourney(doc).findings.map((f) => f.id);
  for (const id of ["envelope-x", "envelope-y", "coverage", "far", "floors-limit", "model-levels", "empty-level-1"])
    assert(ids.includes(id), id);
});
test("journey", "صفرِ معتبر، نامعلوم نیست؛ اطلاعات پنهان روی شمارنده اثر نمی‌گذارد", () => {
  const doc = fixture();
  doc.brief.values = { north: 0, parking: 0, units: 8 };
  const r = reviewJourney(doc);
  assert(r.information.completed === 2, "صفر باید ثبت‌شده و واحد مسکونی نامرتبط کنار گذاشته شود");
  assert(!r.findings.some((f) => f.id === "north" || f.id === "parking"), "صفر نامعلوم شد");
});
test("journey", "اطلاعات کامل و مدارک ثبت‌شده هرگز به تأیید خودکار تبدیل نمی‌شوند", () => {
  const doc = fixture();
  for (const f of activeFields(doc.brief)) doc.brief.values[f.key] = f.type === "number" ? f.min! : (f.options?.[0] ?? "ثبت شده");
  for (const r of activeReferences(doc.brief))
    doc.brief.sources[r.id] = { reference: "اظهار کاربر", edition: "نسخهٔ ادعایی", date: "2026-10-29" };
  const review = reviewJourney(doc);
  assert(review.information.completed === review.information.total, "تکمیل اطلاعات");
  assert(!review.executionReady && !review.permitReady, "تأیید جعلی");
  assert(
    review.findings.some((f) => f.kind === "review"),
    "کنترل تخصصی باید باقی بماند",
  );
});
test("journey", "خروجی رشتهٔ بدون مدل مسدود است", () => {
  const doc = fixture();
  doc.brief.trades.push("mechanical");
  doc.brief.outputs = ["mechanical"];
  assert(!reviewJourney(doc).canDownloadReview, "مکانیک خالی");
  let rejected = false;
  try {
    deliveryPackage(doc, "review");
  } catch {
    rejected = true;
  }
  assert(rejected, "بسته نباید ساخته شود");
});
test("journey", "مغایرت فرم و مدل تشخیص داده می‌شود", () => {
  const doc = fixture();
  doc.brief.values = { height: 4, width: 40, depth: 20 };
  const ids = reviewJourney(doc).findings.map((f) => f.id);
  assert(ids.includes("model-height") && ids.includes("model-envelope"), "مغایرت پنهان");
});
test("journey", "بسته از snapshot واحد با هش واقعی و بدون ادعای اجرا ساخته می‌شود", () => {
  const doc = fixture();
  doc.brief.outputs = ["architecture", "bim"];
  doc.revision = 7;
  const files = unzipStored(deliveryPackage(doc, "review"));
  const manifest = JSON.parse(files.get("manifest.json")!.toString());
  assert(manifest.revision === 7 && manifest.approval === "not-approved", "وضعیت/نسخه");
  for (const f of manifest.files) {
    const bytes = files.get(f.path);
    assert(!!bytes, "فایل گم‌شده");
    assert(createHash("sha256").update(bytes!).digest("hex") === f.sha256, "هش اشتباه");
  }
  assert(files.has("review-only/architecture/level-01/pdf.pdf") && files.has("review-only/bim/ifc.ifc"), "فایل واقعی");
  assert(files.get("source/document.json")!.toString() === JSON.stringify(doc, null, 2), "سند مبنا باید تغییرنکرده باشد");
  assert(
    manifest.references.every((r: { verified: boolean }) => r.verified === false),
    "مرجع نباید خودکار تأیید شود",
  );
});
test("journey", "مسیر نهایی با تغییر purpose یا جعلی‌کردن وضعیت باز نمی‌شود", () => {
  for (const purpose of ["execution", "permit", null, "approved"]) {
    let rejected = false;
    try {
      deliveryPackage(fixture(), purpose);
    } catch {
      rejected = true;
    }
    assert(rejected, "تغییر purpose نباید تأیید ایجاد کند");
  }
});
test("journey", "پرونده در مدل و اثر انگشت نگهداری می‌شود", () => {
  const doc = fixture();
  const clone = createStudioDocument(doc);
  assert(!!clone.brief, "پرونده از مدل حذف شد");
  const fp = documentFingerprint(doc);
  doc.brief.values.city = "شیراز";
  assert(fp !== documentFingerprint(doc), "اثر انگشت تغییر نکرد");
});
test("journey", "شناسه‌های کاتالوگ فرم و خروجی یکتا هستند", () => {
  assert(new Set(FIELDS.map((f) => f.key)).size === FIELDS.length, "فیلد تکراری");
  assert(new Set(OUTPUTS.map((o) => o.id)).size === OUTPUTS.length, "خروجی تکراری");
});

test("journey", "لایهٔ مخفی فایل ظاهراً کامل ایجاد نمی‌کند", () => {
  const doc = fixture();
  doc.brief.outputs = ["architecture"];
  doc.layers = Object.fromEntries(Object.entries(doc.layers).map(([k]) => [k, false])) as typeof doc.layers;
  assert(!reviewJourney(doc).canDownloadReview, "همهٔ لایه‌ها مخفی‌اند");
});
test("journey", "پلان هر طبقه جدا صادر می‌شود، نه فقط طبقهٔ جاری", () => {
  const doc = fixture();
  doc.levels = 2;
  doc.items = [...doc.items, ...doc.items.map((i) => ({ ...i, id: i.id + "-second", level: 1 }))];
  doc.brief.outputs = ["architecture"];
  const files = unzipStored(deliveryPackage(doc, "review"));
  for (const level of ["01", "02"])
    for (const ext of ["pdf", "dxf"])
      assert(files.has(`review-only/architecture/level-${level}/${ext}.${ext}`), "طبقه یا قالب در بسته نیست");
});

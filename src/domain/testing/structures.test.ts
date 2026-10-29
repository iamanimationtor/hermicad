import { structuralNumber } from "../structures/numbers";
import { test, assert, approx } from "./harness";
import { FAMILIES, STRUCTURAL_FIELDS, emptyStructure, fieldsFor, structuralErrors } from "../structures/catalog";
import { assessStructure } from "../structures/assessment";
import { createStudioDocument } from "../studio/document";
import { emptyBrief } from "../journey/model";
import { exportStudio } from "../studio/render";
import { structuralReport } from "@/server/structuralReport";
export function beamFixture() {
  const p = emptyStructure("steel");
  p.values = {
    beamModel: "تیر ساده منشوری؛ بار گسترده یکنواخت و تحلیل خطی",
    beamL: 6,
    beamDepth: 0.3,
    beamE: 200,
    beamI: 8000,
    beamQ: 10,
    beamLimit: 20,
    criteria: "معیار ورودی آزمون؛ نه ضابطه",
  };
  return p;
}
export function wallFixture() {
  const p = emptyStructure("retaining");
  p.values = {
    wallModel: "دیوار ثقلی؛ خاک خشک هموار بدون چسبندگی، زلزله و آب",
    wallH: 3,
    gamma: 18,
    phi: 30,
    surcharge: 0,
    baseB: 3,
    weight: 100,
    lever: 1.5,
    mu: 0.5,
    bearing: 150,
    slideCriterion: 1.5,
    overturnCriterion: 2,
    criteria: "معیار تست",
  };
  return p;
}
export function tankFixture() {
  const p = emptyStructure("tank");
  p.values = { hydroModel: "مایع ساکن؛ دیوار قائم، سطح آزاد و فشار جو", liquidH: 3, density: 1000 };
  return p;
}
for (const family of FAMILIES)
  test("structures/catalog", `مسیر ${family.name}: ورودی و مرجع مستقل و بدون تأیید خودکار`, () => {
    const p = emptyStructure(family.id);
    assert(!structuralErrors(p).length, "پروندهٔ خالی نامعتبر");
    const r = assessStructure(p);
    assert(!r.executionReady && r.missing.length > 0, "تأیید جعلی");
    assert(
      r.requiredDeliverables.every((d) => d.status === "not-designed"),
      "مدرک ساخته نشده نباید تکمیل باشد",
    );
    if (family.calculator === "none") assert(r.status === "not-implemented" && r.metrics.length === 0, "حل‌گر جعلی");
  });
test("structures/fields", "پرسش‌های وابسته به جرثقیل، اتصال و نوع مخزن", () => {
  const p = emptyStructure("shed");
  assert(!fieldsFor(p).some((f) => f.key === "craneCapacity"), "پرسش زودهنگام");
  p.values.crane = "بله";
  p.values.connection = "پیچی";
  assert(
    fieldsFor(p).some((f) => f.key === "craneCapacity"),
    "جرثقیل",
  );
  assert(fieldsFor(p).some((f) => f.key === "bolt") && !fieldsFor(p).some((f) => f.key === "weld"), "فیلتر اتصال");
  p.values.crane = "خیر";
  assert(!fieldsFor(p).some((f) => f.key === "craneCapacity"), "حذف ورودی نامرتبط");
  const tank = emptyStructure("tank");
  tank.values.tankShape = "مدور";
  assert(
    fieldsFor(tank).some((f) => f.key === "tankDiameter"),
    "قطر",
  );
  assert(!fieldsFor(tank).some((f) => f.key === "tankRectangle"), "مستطیل نامرتبط");
});
test("structures/fields", "ورودی مخرب و مقدار غیرمتناهی و خانوادهٔ نادرست رد می‌شوند", () => {
  for (const value of [
    null,
    [],
    { ...emptyStructure("tank"), family: "fake" },
    { ...emptyStructure("steel"), values: { fc: 30 } },
    { ...emptyStructure("tank"), values: { density: NaN } },
    { ...emptyStructure("tank"), executionReady: true },
  ])
    assert(structuralErrors(value).length > 0, "ورودی نامعتبر پذیرفته شد");
  assert(new Set(STRUCTURAL_FIELDS.map((f) => f.key)).size === STRUCTURAL_FIELDS.length, "کلید تکراری");
});
test("structures/beam", "تیر شش متری؛ تعادل، لنگر و خیز با تبدیل واحد مستقل", () => {
  const r = assessStructure(beamFixture());
  const v = (id: string) => r.metrics.find((m) => m.id === id)!.value;
  assert(r.status === "limited-result", "محاسبه اجرا نشد");
  approx(v("reaction"), 30, 1e-10, "واکنش");
  approx(v("moment"), 45, 1e-10, "لنگر");
  approx(v("deflection"), 10.546875, 1e-9, "خیز mm");
  assert(r.comparisons[0].withinUserCriterion, "معیار ورودی");
});
test("structures/beam", "خیز با توان چهار طول و عکس سختی تغییر می‌کند", () => {
  const p = beamFixture();
  const base = assessStructure(p).metrics.find((m) => m.id === "deflection")!.value;
  p.values.beamL = 12;
  approx(assessStructure(p).metrics.find((m) => m.id === "deflection")!.value, base * 16, 1e-8, "L4");
  p.values.beamE = 400;
  approx(assessStructure(p).metrics.find((m) => m.id === "deflection")!.value, base * 8, 1e-8, "1/E");
});
test("structures/beam", "تیر عمیق، مدل دیگر و منبع معیار نامعلوم تأیید نمی‌شوند", () => {
  const p = beamFixture();
  p.values.beamDepth = 1;
  assert(assessStructure(p).status === "outside-domain", "تیر عمیق");
  p.values.beamModel = "شرایط دیگر";
  assert(assessStructure(p).metrics.length === 0, "مدل دیگر");
  const q = beamFixture();
  delete q.values.criteria;
  assert(assessStructure(q).comparisons.length === 0, "بدون منبع معیار، پذیرش عددی ممنوع");
});
test("structures/wall", "فشار رانکین و تعادل دیوار با خاک سی درجه", () => {
  const r = assessStructure(wallFixture());
  const v = (id: string) => r.metrics.find((m) => m.id === id)!.value;
  approx(v("ka"), 1 / 3, 1e-10, "Ka");
  approx(v("thrust"), 27, 1e-10, "Pa");
  approx(v("sliding"), 50 / 27, 1e-10, "FSs");
  approx(v("overturning"), 150 / 27, 1e-10, "FSo");
  approx(v("qmax"), (100 / 3) * 1.54, 1e-8, "qmax");
  approx(v("qmin"), (100 / 3) * 0.46, 1e-8, "qmin");
});
test("structures/wall", "خارج هستهٔ میانی، فشار تمام‌تماس صادر نمی‌شود", () => {
  const p = wallFixture();
  p.values.weight = 20;
  const r = assessStructure(p);
  assert(r.status === "outside-domain" && !r.metrics.some((m) => m.id === "qmax"), "فشار نامعتبر");
  assert(!r.comparisons.length, "پذیرش نامعتبر");
  p.values.lever = 4;
  assert(assessStructure(p).metrics.length === 0, "بازوی خارج پی");
});
test("structures/hydro", "فشار، نیرو و لنگر هیدرواستاتیک", () => {
  const r = assessStructure(tankFixture());
  const v = (id: string) => r.metrics.find((m) => m.id === id)!.value;
  approx(v("pressure"), 29.41995, 1e-9, "p");
  approx(v("force"), 44.129925, 1e-9, "F");
  approx(v("loadMoment"), 44.129925, 1e-9, "M");
});
test("structures/gates", "خروجی ساختمانی به پل و جزئیات بتنی به فولاد نسبت داده نمی‌شود", () => {
  const doc = createStudioDocument({ brief: { ...emptyBrief(), structural: emptyStructure("bridge") } });
  for (const format of ["pdf", "ifc", "details-pdf"] as const) {
    let failed = false;
    try {
      exportStudio(doc, format);
    } catch {
      failed = true;
    }
    assert(failed, "قالب نامرتبط صادر شد");
  }
  assert(exportStudio(doc, "json").data.length > 0, "دادهٔ مبنا لازم است");
  doc.brief!.structural = emptyStructure("steel");
  let failed = false;
  try {
    exportStudio(doc, "details-pdf");
  } catch {
    failed = true;
  }
  assert(failed, "جزئیات بتنی برای فولاد");
});
test("structures/report", "گزارش واقعی و قفل تحویل اجرایی", () => {
  const doc = createStudioDocument({ brief: { ...emptyBrief(), structural: tankFixture() } });
  const zip = structuralReport(doc, "review");
  assert(zip.readUInt32LE(0) === 0x04034b50 && zip.includes(Buffer.from("%PDF-")), "گزارش PDF داخل ZIP");
  for (const purpose of ["execution", "approved", undefined]) {
    let failed = false;
    try {
      structuralReport(doc, purpose);
    } catch {
      failed = true;
    }
    assert(failed, "تأیید اجرایی نباید صادر شود");
  }
});

test("structures/fields", "تعداد تراز صحیح و تاریخ واقعی و مرجع با ساختار شناخته‌شده لازم است", () => {
  const p = emptyStructure("steel");
  p.values.storeys = 2.5;
  assert(structuralErrors(p).length > 0, "تراز کسری");
  p.values.storeys = 2;
  p.references["ref-0"] = { document: "منبع آزمون", edition: "آزمایشی", checkedAt: "2026-02-30" };
  assert(structuralErrors(p).length > 0, "تاریخ ناموجود");
  p.references["ref-0"].checkedAt = "2026-02-28";
  assert(!structuralErrors(p).length, "تاریخ صحیح");
  assert(
    structuralErrors({ ...p, references: { "ref-0": { ...p.references["ref-0"], approved: true } } }).length > 0,
    "تأیید اظهاری نباید کلید مجاز باشد",
  );
});
test("structures/beam", "خیز بزرگ و بار صفر با دامنهٔ مدل هماهنگ‌اند", () => {
  const p = beamFixture();
  p.values.beamI = 100;
  const r = assessStructure(p);
  assert(r.status === "outside-domain" && !r.comparisons.length, "تغییرشکل بزرگ");
  p.values.beamQ = 0;
  assert(
    assessStructure(p).metrics.every((m) => m.value === 0),
    "بار صفر",
  );
});
test("structures/wall", "سربار یکنواخت در نیمهٔ ارتفاع اثر می‌کند", () => {
  const p = wallFixture();
  p.values.surcharge = 10;
  const r = assessStructure(p);
  approx(r.metrics.find((m) => m.id === "thrust")!.value, 37, 1e-9, "نیرو");
  approx(r.metrics.find((m) => m.id === "overturningMoment")!.value, 42, 1e-9, "لنگر");
});

test("structures/trace", "همه نتایج رابطهٔ ثبت‌شده، واحد و محدودیت قابل ردیابی دارند", () => {
  for (const p of [beamFixture(), wallFixture(), tankFixture()]) {
    const r = assessStructure(p);
    assert(r.formulaRecords.length === r.metrics.length, "رابطه گم شده");
    for (const m of r.metrics) {
      const f = r.formulaRecords.find((f) => f.id === m.formulaId);
      if (!f) throw new Error("رابطه یافت نشد.");
      assert(f.resultUnit === m.unit && f.expression === m.expression, "واحد یا رابطه ناسازگار");
      assert(f.verification === "internally-tested" && !f.externalRef, "ادعای منبع رسمی");
      assert(f.validity.limits.length > 0 && f.assumptions.length > 0, "دامنه نامشخص");
    }
  }
});

test("structures/numbers", "رقم فارسی و عربی، ممیز و جداساز معتبر بدون تبدیل خاموش خطا", () => {
  assert(structuralNumber("۱۲٫۵") === 12.5, "ممیز فارسی");
  assert(structuralNumber("١٢.٥") === 12.5, "رقم عربی");
  assert(structuralNumber("۱٬۰۰۰") === 1000, "هزارگان");
  assert(structuralNumber("  ") === null, "خالی");
  for (const raw of ["۱٬۲", "Infinity", "1e309", "abc", "-", "."])
    assert(typeof structuralNumber(raw) === "string", "ورودی نامعتبر نباید عدد یا صفر شود");
});

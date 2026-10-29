import { RULES, validateScheme } from "../codes";
import { RULE_DOCS, RULE_DOC_LIST, SOURCE_AUDIT, ruleDoc, rulesetFingerprint } from "../rules/docs";
import { isLegacyReport, normalizeStoredReport, normalizeStoredEvaluation } from "../rules/compat";
import type { CanonicalScheme, RuleEvaluation, ValidationReport } from "../types";
import { FIXTURES } from "./fixtures";
import { assert, approx, test } from "./harness";

const clone = (scheme: CanonicalScheme): CanonicalScheme => JSON.parse(JSON.stringify(scheme)) as CanonicalScheme;
const RULESET_FINGERPRINT = "hpm-d612f0e6";

const statusOf = (report: ValidationReport, ruleId: string) =>
  report.evaluations.find((e) => e.ruleId === ruleId)?.status ?? "missing";

test("ruleset", "بسته ضوابط: هر ۲۱ قاعده با مدل مستندات کامل ثبت شده است", () => {
  approx(RULE_DOC_LIST.length, RULES.length, 0, "documented rule count");
  const missing = RULES.filter((r) => !RULE_DOCS[r.id]).map((r) => r.id);
  assert(missing.length === 0, `قواعد بدون مستندات: ${missing.join(", ")}`);
  const orphanDocs = RULE_DOC_LIST.filter((d) => !RULES.some((r) => r.id === d.id)).map((d) => d.id);
  assert(orphanDocs.length === 0, `مستندات بدون قاعده اجرایی: ${orphanDocs.join(", ")}`);
  for (const rule of RULES) {
    const doc = ruleDoc(rule.id);
    assert(doc.inputsDetailed.length > 0, `${rule.id}: ورودی‌های دارای واحد ثبت نشده`);
    assert(doc.inputsDetailed.every((i) => i.unit.length > 0), `${rule.id}: واحد ورودی خالی است`);
    assert(doc.formula.length > 8, `${rule.id}: فرمول ثبت نشده`);
    assert(doc.tests.positive.length > 5, `${rule.id}: آزمون مثبت ثبت نشده`);
    assert(doc.tests.negative.length > 5, `${rule.id}: آزمون منفی ثبت نشده`);
    assert(doc.tests.boundary.length > 5, `${rule.id}: آزمون مرزی ثبت نشده`);
    assert(doc.document.auditNote.length > 10, `${rule.id}: یادداشت ممیزی منبع ثبت نشده`);
    assert(doc.evidence.length > 0, `${rule.id}: سطح شواهد ثبت نشده`);
  }
  return `${RULE_DOC_LIST.length} قاعده × ۶ فیلد مستندسازی`;
});

test("ruleset", "هیچ شماره بند، نسخه آیین‌نامه یا ادعای انطباق ساخته نشده است", () => {
  const withClause = RULE_DOC_LIST.filter((d) => d.document.clause !== null);
  assert(withClause.length === 0, `قواعد با شماره بند ساختگی: ${withClause.map((d) => d.id).join(", ")}`);
  const withVersion = RULE_DOC_LIST.filter((d) => d.document.version !== null && d.sourceStatus !== "internal-integrity-check");
  assert(withVersion.length === 0, `قواعد با نسخه سند ادعاشده: ${withVersion.map((d) => d.id).join(", ")}`);
  const verified = RULE_DOC_LIST.filter((d) => d.verifiedAgainstOfficialText !== false);
  assert(verified.length === 0, `ادعای تأیید متن رسمی: ${verified.map((d) => d.id).join(", ")}`);
  const externally = RULE_DOC_LIST.filter((d) => d.verification === "externally-verified");
  assert(externally.length === 0, `قواعد تأییدشده بیرونی بدون سند: ${externally.map((d) => d.id).join(", ")}`);
  const inventedLegal = RULE_DOC_LIST.filter((d) => /مبحث\s*[۰-۹0-9]+\s*[،:]?\s*بند/.test(d.citation));
  assert(inventedLegal.length === 0, `ارجاع بند ساختگی: ${inventedLegal.map((d) => d.id).join(", ")}`);
  return "۰ شماره بند، ۰ نسخه ادعاشده، ۰ ادعای تأیید";
});

test("ruleset", "منبع هر قاعده از منشأ آستانه تفکیک‌پذیر و سازگار است", () => {
  const allowed: Record<string, string[]> = {
    "project-requirement": ["project-input"],
    "internal-engineering-threshold": ["internal-assumption"],
    "internal-integrity-check": ["integrity-check"],
    "unverified-citation": ["unverified-external"],
  };
  for (const doc of RULE_DOC_LIST) {
    const expected = allowed[doc.sourceStatus];
    assert(!!expected, `${doc.id}: وضعیت منبع نامعتبر ${doc.sourceStatus}`);
    assert(expected.includes(doc.evidence), `${doc.id}: ناسازگاری منبع (${doc.sourceStatus}) و شواهد (${doc.evidence})`);
    if (doc.sourceStatus === "project-requirement") {
      assert(doc.thresholdBasis === "project-input", `${doc.id}: آستانه باید ورودی پروژه باشد`);
      assert(doc.document.availability === "project-supplied-only", `${doc.id}: دسترس‌پذیری سند نامنطبق است`);
    }
    if (doc.sourceStatus === "internal-engineering-threshold") {
      assert(doc.document.availability === "official-text-not-obtained", `${doc.id}: باید فقدان سند رسمی اعلام شود`);
      assert(doc.document.clause === null, `${doc.id}: بند نباید مقدار داشته باشد`);
    }
    if (doc.sourceStatus === "internal-integrity-check") {
      assert(doc.document.availability === "no-legal-source-applicable", `${doc.id}: کنترل داخلی بدون ادعای قانونی`);
    }
  }
  const counts = RULE_DOC_LIST.reduce<Record<string, number>>((acc, d) => {
    acc[d.sourceStatus] = (acc[d.sourceStatus] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" · ");
});

test("ruleset", "ممیزی منابع ثبت و صادقانه است (متن رسمی به‌دست نیامده)", () => {
  assert(SOURCE_AUDIT.officialTextObtained === false, "ادعای دسترسی به متن رسمی مجاز نیست");
  assert(SOURCE_AUDIT.consultedSources.length >= 2, "فهرست منابع بررسی‌شده لازم است");
  assert(SOURCE_AUDIT.consultedSources.every((s) => s.usedForValues === false), "هیچ منبعی نباید برای مقادیر استفاده شده باشد");
  assert(SOURCE_AUDIT.consequence.includes("unverified"), "نتیجه ممیزی باید وضعیت تأییدنشده را اعلام کند");
  return `${SOURCE_AUDIT.consultedSources.length} منبع بررسی‌شده، هیچ‌کدام مبنای مقدار قانونی نشد`;
});

test("ruleset", "نبود ورودی به «اطلاعات ناکافی» می‌انجامد، نه انطباق", () => {
  const scenarios: { ruleId: string; mutate: (s: CanonicalScheme) => void; input: string }[] = [
    { ruleId: "CODE-04-FAR", mutate: (s) => { s.requirements.farMax = 0; }, input: "سقف تراکم" },
    { ruleId: "CODE-04-COVERAGE", mutate: (s) => { s.requirements.coverageMax = 0; }, input: "سقف سطح اشغال" },
    { ruleId: "CODE-04-HEIGHT", mutate: (s) => { s.requirements.floorsMax = 0; }, input: "سقف طبقات" },
    { ruleId: "CODE-04-UNIT-SUPPLY", mutate: (s) => { s.requirements.dwellings = []; }, input: "برنامه واحدها" },
    { ruleId: "FIRE-03-TRAVEL", mutate: (s) => { s.levels[0].cores = []; }, input: "هسته" },
    { ruleId: "NBR-15-DAYLIGHT", mutate: (s) => { s.daylight.habitableRooms = 0; }, input: "فضای قابل سکونت" },
    { ruleId: "STRUCT-02-FOUNDATION", mutate: (s) => { s.site.soilBearingKPa = 0; }, input: "ظرفیت خاک" },
    { ruleId: "MEP-16-WATER", mutate: (s) => { s.mep.occupancy = 0; }, input: "جمعیت" },
    { ruleId: "ARCH-04-EFFICIENCY", mutate: (s) => { s.grossFloorAreaM2 = 0; }, input: "زیربنای کل" },
  ];
  const outcomes: string[] = [];
  for (const scenario of scenarios) {
    const mutant = clone(FIXTURES.cleanScheme);
    scenario.mutate(mutant);
    const report = validateScheme(mutant);
    const status = statusOf(report, scenario.ruleId);
    assert(status === "insufficient", `${scenario.ruleId}: انتظار insufficient بود، دریافت شد ${status}`);
    const evaluation = report.evaluations.find((e) => e.ruleId === scenario.ruleId)!;
    assert(evaluation.required === null, `${scenario.ruleId}: حد نامشخص نباید مقدار داشته باشد`);
    assert(evaluation.message.includes("اطلاعات کافی"), `${scenario.ruleId}: پیام باید نبود اطلاعات را صریح بگوید`);
    assert(evaluation.trace.some((t) => t.includes("انطباق")), `${scenario.ruleId}: باید اعلام کند که انطباق نیست`);
    assert(report.passed === report.evaluations.filter((e) => e.status === "pass").length, "شمارش pass نباید شامل insufficient شود");
    assert(!report.issues.some((i) => i.ruleId === scenario.ruleId && i.severity !== "info"), `${scenario.ruleId}: insufficient نباید تخلف سخت تلقی شود`);
    outcomes.push(`${scenario.ruleId}(${scenario.input})`);
  }
  return `${outcomes.length} سناریوی نبود ورودی → insufficient: ${outcomes.join("، ")}`;
});

test("ruleset", "انطباق کاذب حذف شده است (نور روز ۰/۰ و فاصله بدون هسته)", () => {
  const daylightMutant = clone(FIXTURES.cleanScheme);
  daylightMutant.levels = daylightMutant.levels.map((level) => ({
    ...level,
    rooms: level.rooms.map((r) => ({ ...r, habitable: false })),
  }));
  daylightMutant.daylight = { ...daylightMutant.daylight, habitableRooms: 0, compliantRooms: 0 };
  const daylightReport = validateScheme(daylightMutant);
  assert(statusOf(daylightReport, "NBR-15-DAYLIGHT") === "insufficient", "۰ از ۰ نباید انطباق باشد");

  const travelMutant = clone(FIXTURES.cleanScheme);
  travelMutant.levels[0].cores = [];
  travelMutant.circulation.maxTravelDistanceM = 0;
  const travelReport = validateScheme(travelMutant);
  assert(statusOf(travelReport, "FIRE-03-TRAVEL") === "insufficient", "فاصله صفر بدون هسته نباید انطباق باشد");
  assert(statusOf(travelReport, "FIRE-03-EXITS") === "fail", "حذف هسته‌ها باید نقص خروج بدهد");
  return "دو مسیر انطباق کاذب بسته شد";
});

test("ruleset", "گزارش، تفکیک «تخلف تأییدشده»، «فرض داخلی» و «اطلاعات ناکافی» را حمل می‌کند", () => {
  const report = FIXTURES.stressReport;
  const evidence = report.evidenceSummary ?? {};
  const keys = Object.keys(evidence);
  assert(keys.length >= 2, `تنوع سطوح شواهد کم است: ${keys.join(",")}`);
  assert((evidence["internal-assumption"] ?? 0) > 0, "قواعد مبتنی بر فرض داخلی باید شمارش شوند");
  assert((evidence["project-input"] ?? 0) > 0, "قواعد مبتنی بر ورودی پروژه باید شمارش شوند");
  assert((report.insufficient ?? 0) === report.evaluations.filter((e) => e.status === "insufficient").length, "شمارش insufficient ناسازگار");
  assert(report.evaluations.every((e) => e.evidence !== undefined), "هر ارزیابی باید سطح شواهد داشته باشد");
  assert(report.evaluations.every((e) => e.document && e.document.clause === null), "هر ارزیابی باید سند بدون بند داشته باشد");
  assert((report.dataCompleteness?.length ?? 0) >= 3, "فهرست کامل‌بودن داده لازم است");
  assert(report.dataCompleteness!.some((d) => d.item.includes("رسمی") && d.present === false), "نبود سند رسمی باید در گزارش باشد");
  assert(report.disclaimer.includes("اطلاعات ناکافی"), "سلب مسئولیت باید به insufficient اشاره کند");
  return `شواهد: ${Object.entries(evidence).map(([k, v]) => `${k}=${v}`).join(" · ")} | insufficient=${report.insufficient}`;
});

test("ruleset", "هر قاعده آزمون مرزی واقعی دارد (نه فقط شرح)", () => {
  const corridor = RULES.find((r) => r.id === "FIRE-03-CORRIDOR")!;
  const at = clone(FIXTURES.cleanScheme);
  at.levels[0].corridorWidthM = 1.5;
  const below = clone(FIXTURES.cleanScheme);
  below.levels[0].corridorWidthM = 1.4999;
  assert(corridor.evaluate(at).status === "pass", "مرز ۱.۵ باید منطبق باشد");
  assert(corridor.evaluate(below).status === "fail", "کمتر از ۱.۵ باید نقض باشد");

  const height = RULES.find((r) => r.id === "CODE-04-HEIGHT")!;
  const exact = clone(FIXTURES.cleanScheme);
  exact.floors = exact.requirements.floorsMax;
  const over = clone(FIXTURES.cleanScheme);
  over.floors = over.requirements.floorsMax + 1;
  assert(height.evaluate(exact).status === "pass", "floors = floorsMax باید منطبق باشد");
  assert(height.evaluate(over).status === "fail", "floorsMax + 1 باید نقض باشد");

  const far = RULES.find((r) => r.id === "CODE-04-FAR")!;
  const farExact = clone(FIXTURES.cleanScheme);
  farExact.grossFloorAreaM2 = farExact.plotAreaM2 * farExact.requirements.farMax;
  const farOver = clone(FIXTURES.cleanScheme);
  farOver.grossFloorAreaM2 = farOver.plotAreaM2 * farOver.requirements.farMax + 0.01;
  assert(far.evaluate(farExact).status === "pass", "FAR دقیقاً برابر سقف باید منطبق باشد");
  assert(far.evaluate(farOver).status === "fail", "FAR کمی بیشتر از سقف باید نقض شود");
  return "۳ مرز دقیق (راهرو، طبقات، تراکم) در دو طرف آزمون شد";
});

test("ruleset", "سازگاری با گزارش‌های ذخیره‌شده قدیمی حفظ می‌شود", () => {
  const legacyEvaluation = {
    ruleId: "CODE-04-FAR",
    title: "کنترل تراکم ساختمانی (FAR)",
    category: "massing",
    source: "مبحث ۴ مقررات ملی / طرح تفصیلی",
    edition: "1403.1",
    severity: "major" as const,
    status: "fail" as const,
    observed: 5.2,
    required: 2.4,
    unit: "-",
    message: "تراکم بیش از سقف",
    remediation: "کاهش طبقات",
    trace: ["GFA 4000 m²", "plot 800 m²"],
  };
  const legacyReport = {
    reportId: "old-1",
    schemeId: "old-scheme",
    schemeCode: "HMC-A-000",
    codeSetCode: "IR-NBR-RES",
    codeSetEdition: "1403.1",
    engineVersion: "hermicad-engine/1.0.0",
    evaluatedAt: "2026-01-01T00:00:00.000Z",
    iteration: 0,
    evaluations: [legacyEvaluation],
    issues: [],
    passed: 0,
    failed: 1,
    warnings: 0,
    blocked: false,
    categorySummary: { massing: { pass: 0, fail: 1, warn: 0, na: 0 } },
    disclaimer: "legacy",
  };
  assert(isLegacyReport(legacyReport), "گزارش قدیمی باید شناسایی شود");
  const normalized = normalizeStoredReport(legacyReport)!;
  assert(normalized.evaluations.length === 1, "تعداد ارزیابی‌ها باید حفظ شود");
  const e = normalized.evaluations[0];
  assert(e.status === "fail" && e.observed === 5.2 && e.required === 2.4, "داده عددی اصلی باید حفظ شود");
  assert(e.evidence === "internal-assumption" && e.document?.clause === null, "متادیتای غایب نباید جعل شود");
  assert(e.formula === "ثبت نشده", "فرمول غایب باید صریحاً ثبت‌نشده اعلام شود");
  assert(normalized.codeSetVerification === "unverified", "گزارش قدیمی باید تأییدنشده تلقی شود");
  assert(normalized.reportId === "old-1" && normalized.evaluatedAt === legacyReport.evaluatedAt, "هویت گزارش باید حفظ شود");
  assert(normalized.disclaimer.includes("گزارش قدیمی"), "سلب مسئولیت گزارش قدیمی باید نشانه قدیمی‌بودن داشته باشد");
  assert(normalizeStoredReport(FIXTURES.cleanReport)?.disclaimer === FIXTURES.cleanReport.disclaimer, "گزارش جدید نباید دستکاری شود");
  assert(normalizeStoredReport({ evaluations: [] }) === null, "گزارش ناقص باید رد شود");
  const minimal = normalizeStoredEvaluation({});
  assert(minimal.status === "insufficient", "ارزیابی بدون وضعیت نباید pass فرض شود");
  return "گزارش قدیمی بدون جعل متادیتا بازخوانی شد";
});

test("ruleset", "اثر انگشت بسته ضوابط پایدار است (ردیابی تغییر آینده)", () => {
  const fingerprint = rulesetFingerprint();
  assert(/^hpm-[0-9a-f]{8}$/.test(fingerprint), `قالب اثر انگشت نامعتبر: ${fingerprint}`);
  assert(fingerprint === RULESET_FINGERPRINT, `بسته ضوابط تغییر کرده است: ${fingerprint}`);
  return fingerprint;
});

test("ruleset", "کاتالوگ عمومی بدون فیلد تأییدنشده‌ی پنهان و با شمارش صحیح است", () => {
  const report = FIXTURES.cleanReport;
  const withEvidenceField = report.evaluations.filter((e: RuleEvaluation) => e.evidence === undefined);
  assert(withEvidenceField.length === 0, "ارزیابی بدون سطح شواهد وجود دارد");
  const summaryTotal = Object.values(report.categorySummary).reduce(
    (sum, c) => sum + c.pass + c.fail + c.warn + c.na + (c.insufficient ?? 0),
    0,
  );
  approx(summaryTotal, report.evaluations.length, 0, "category summary total");
  approx(
    report.passed + report.failed + report.warnings + (report.insufficient ?? 0),
    report.evaluations.length,
    0,
    "status totals",
  );
  return `${report.evaluations.length} ارزیابی؛ خلاصه دسته‌بندی و وضعیت‌ها هم‌خوان`;
});

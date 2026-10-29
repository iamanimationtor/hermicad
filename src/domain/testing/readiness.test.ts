import { RULES, runRule, validateScheme } from "../codes";
import { DEFAULT_WEIGHTS, rankSchemes } from "../optimize";
import { computeStructural } from "../analysis";
import { normalizeScreeningScheme } from "../engineering/screening";
import { exportScheme } from "../exporters/reports";
import { normalizeStoredEvaluation, normalizeStoredReport } from "../rules/compat";
import { qualifyRuleMessage, RULE_COMPARISON_NOTE } from "../rules/resultStatus";
import type { CanonicalScheme } from "../types";
import { FIXTURES } from "./fixtures";
import { assert, test } from "./harness";

const clone = (scheme: CanonicalScheme): CanonicalScheme => JSON.parse(JSON.stringify(scheme)) as CanonicalScheme;

test("readiness/missing", "دادهٔ جزئی نامعلوم، نتیجهٔ مثبت کنترل تولید نمی‌کند", () => {
  const scenarios: { rule: string; change: (scheme: CanonicalScheme) => void }[] = [
    {
      rule: "CODE-04-MIN-DWELLING",
      change: (s) => { s.requirements.dwellings.find((d) => d.type === s.units[0].type)!.minAreaM2 = 0; },
    },
    {
      rule: "CODE-04-ROOM-MIN",
      change: (s) => { s.levels[0].rooms.find((r) => r.unitIndex >= 0)!.minAreaM2 = 0; },
    },
    { rule: "FIRE-03-CORRIDOR", change: (s) => { s.levels[0].corridors = []; } },
    { rule: "FIRE-03-EXITS", change: (s) => { s.unitsPerFloor = 0; } },
    { rule: "FIRE-03-EXITS", change: (s) => { s.floorHeightM = 0; } },
    { rule: "FIRE-03-TRAVEL", change: (s) => { s.circulation.maxTravelDistanceM = 0; } },
    { rule: "NBR-15-CROSSVENT", change: (s) => { s.units[0].rect.h = 0; } },
    { rule: "NBR-15-DAYLIGHT", change: (s) => { s.daylight.compliantRooms = s.daylight.habitableRooms + 1; } },
  ];
  for (const scenario of scenarios) {
    const scheme = clone(FIXTURES.cleanScheme);
    scenario.change(scheme);
    const report = validateScheme(scheme);
    const result = report.evaluations.find((item) => item.ruleId === scenario.rule)!;
    assert(result.status === "insufficient" && result.required === null, `${scenario.rule}: دادهٔ ناقص نباید مثبت شود`);
    assert(result.regulatoryCompliance === "not-established", `${scenario.rule}: انطباق کاذب`);
  }
});

test("readiness/status", "مقایسهٔ مثبت، نامنبع رسمی یا پرچم اظهاری به تأیید مقررات تبدیل نمی‌شود", () => {
  const report = validateScheme(FIXTURES.cleanScheme);
  const positive = report.evaluations.find((item) => item.status === "pass");
  assert(!!positive, "آزمون باید شامل نتیجهٔ مثبت باشد");
  assert(report.regulatoryCompliance === "not-established", "کل گزارش نباید تأیید شود");
  assert(report.evaluations.every((item) => item.regulatoryCompliance === "not-established" && item.message.includes(RULE_COMPARISON_NOTE)), "هر ارزیابی باید محدوده را صریح بگوید");
  assert(qualifyRuleMessage(positive!.message) === positive!.message, "یادداشت چندبار افزوده نشود");
  const forged = { ...positive, regulatoryCompliance: "approved" };
  const normalized = normalizeStoredEvaluation(forged);
  assert(normalized.status === "pass" && normalized.regulatoryCompliance === "not-established", "وضعیت مقایسه حفظ و تأیید جعلی حذف شود");
  const legacy = { ...report, regulatoryCompliance: "approved", evaluations: [forged] };
  const read = normalizeStoredReport(legacy)!;
  assert(read.regulatoryCompliance === "not-established" && read.evaluations[0].regulatoryCompliance === "not-established", "گزارش ذخیره‌شده نباید تأیید را جعل کند");
  assert(legacy.regulatoryCompliance === "approved", "دادهٔ تاریخی در محل بازنویسی نشود");
});

test("readiness/export", "معنای کنترل و عدم احراز انطباق در JSON، CSV، XLSX و PDF ثبت می‌شود", () => {
  const scheme = FIXTURES.cleanScheme;
  const report = validateScheme(scheme);
  const json = JSON.parse(exportScheme(scheme, report, "json").data.toString("utf8"));
  assert(json.validation.regulatoryCompliance === "not-established", "وضعیت گزارش در JSON");
  assert(json.validation.evaluations.every((item: { regulatoryCompliance: string }) => item.regulatoryCompliance === "not-established"), "وضعیت هر قاعده در JSON");
  const csv = exportScheme(scheme, report, "csv").data.toString("utf8");
  assert(csv.includes("regulatory_compliance=not-established") && csv.includes("pass is a threshold comparison only"), "توضیح CSV");
  const xlsx = exportScheme(scheme, report, "xlsx").data.toString("utf8");
  assert(xlsx.includes("regulatory_compliance") && xlsx.includes("not-established") && xlsx.includes("pass is a threshold comparison only"), "توضیح XLSX");
  const pdf = exportScheme(scheme, report, "pdf").data.toString("latin1");
  assert(pdf.includes("WITHIN is only a comparison") && pdf.includes("Regulatory compliance: NOT ESTABLISHED"), "توضیح PDF");
});

test("readiness/foundation", "ظرفیت خاک نامعلوم یا خارج‌دامنه جایگزین و نتیجهٔ قابل استفاده نمی‌شود", () => {
  const geometry = {
    footprintAreaM2: 120, floors: 4, grossFloorAreaM2: 480,
    footprintRects: [{ x: 0, y: 0, w: 10, h: 12 }], requirements: FIXTURES.requirements,
  };
  for (const q of [0, Number.NaN, 30, 99.9, 400.1, 1000]) {
    const site = { ...FIXTURES.site, soilBearingKPa: q };
    const structural = computeStructural({ ...geometry, site });
    assert(structural.requiredFoundationWidthM === null, `q=${q}: عدد پی نباید صادر شود`);
    assert(structural.foundationScreening?.status === (Number.isFinite(q) && q > 0 ? "outside-domain" : "insufficient"), `q=${q}: وضعیت صریح لازم است`);
    const scheme = { ...clone(FIXTURES.cleanScheme), site, structural };
    const evaluation = validateScheme(scheme).evaluations.find((item) => item.ruleId === "STRUCT-02-FOUNDATION")!;
    assert(evaluation.status === "insufficient" && evaluation.required === null, `q=${q}: نتیجه نباید مثبت شود`);
    if (Number.isFinite(q) && q > 0) assert(evaluation.observed === "خارج از دامنه" && evaluation.message.includes("غیرقابل استفاده"), `q=${q}: خارج‌دامنه باید صریح باشد`);
  }
  for (const q of [100, 200, 400]) {
    const site = { ...FIXTURES.site, soilBearingKPa: q };
    const structural = computeStructural({ ...geometry, site });
    const expected = Number(Math.sqrt(((120 / structural.columns) * 4 * 8.5 * 1.1) / q).toFixed(2));
    assert(structural.foundationScreening?.status === "available" && structural.requiredFoundationWidthM === expected, `q=${q}: نسبت به دادهٔ واقعی خاک محاسبه شود`);
  }
  for (const footprintAreaM2 of [1, 10000]) {
    const structural = computeStructural({ ...geometry, footprintAreaM2, floors: footprintAreaM2 === 1 ? 1 : 100, footprintRects: undefined, site: FIXTURES.site });
    assert(structural.requiredFoundationWidthM === null && structural.foundationScreening?.status === "outside-domain", `b برای سطح ${footprintAreaM2}: خارج‌دامنه`);
  }
});

test("readiness/foundation-legacy", "گزارش و مدل قدیمیِ خارج‌دامنه در نمایش و صادرات ایمن می‌شوند، نه بازنویسی", () => {
  const legacy = clone(FIXTURES.cleanScheme);
  legacy.site.soilBearingKPa = 30;
  legacy.structural.requiredFoundationWidthM = 1.2; // عدد تاریخیِ دارای جایگزینی پنهان خاک
  delete legacy.structural.foundationScreening;
  legacy.analysisStatus = { level: "preliminary-screening", requiresEngineerReview: false, notForConstruction: false, limitations: [] };
  const report = JSON.parse(JSON.stringify(validateScheme(FIXTURES.cleanScheme)));
  const oldEvaluation = report.evaluations.find((item: { ruleId: string }) => item.ruleId === "STRUCT-02-FOUNDATION");
  oldEvaluation.status = "pass";
  oldEvaluation.observed = 1.2;

  const model = normalizeScreeningScheme(legacy);
  const normalized = normalizeStoredReport(report, model)!;
  const evaluation = normalized.evaluations.find((item) => item.ruleId === "STRUCT-02-FOUNDATION")!;
  assert(model.structural.requiredFoundationWidthM === null && model.structural.foundationScreening?.status === "outside-domain", "عدد تاریخی مخفی شود");
  assert(model.analysisStatus?.notForConstruction === true && model.analysisStatus.requiresEngineerReview === true, "وضعیت ساخت نمی‌تواند جعل شود");
  assert(evaluation.status === "insufficient" && evaluation.observed === "خارج از دامنه", "قبولی قدیمی باید در نمای فعلی بی‌اعتبار شود");
  assert(evaluation.trace.some((item) => item.includes("رکورد تاریخی تغییر نکرده")), "سابقه و دلیل تصحیح نمایش روشن باشد");
  assert(normalized.issues.some((item) => item.ruleId === "STRUCT-02-FOUNDATION" && item.required === null), "مسئلهٔ گزارش با وضعیت تازه همسو شود");
  assert(legacy.structural.requiredFoundationWidthM === 1.2 && oldEvaluation.status === "pass" && legacy.analysisStatus.notForConstruction === false, "رکورد اصلی تغییر نکند");

  const json = JSON.parse(exportScheme(legacy, report, "json").data.toString("utf8"));
  assert(json.canonicalModel.structural.requiredFoundationWidthM === null && json.canonicalModel.analysisStatus.notForConstruction === true, "خروجی JSON ایمن باشد");
  assert(json.validation.evaluations.find((item: { ruleId: string }) => item.ruleId === "STRUCT-02-FOUNDATION").status === "insufficient", "گزارش JSON ایمن باشد");
  assert(json.engineeringBasis.notForConstruction === true, "مبنای خروجی ساخت را مجاز اعلام نکند");
  const xlsx = exportScheme(legacy, report, "xlsx").data.toString("utf8");
  assert(xlsx.includes("not_for_construction") && xlsx.includes(">true<"), "پرچم ساخت در XLSX موجود باشد");
});

test("readiness/legacy-guards", "نتیجهٔ مثبت قدیمی با ورودی ناقص در نمای فعلی مثبت باقی نمی‌ماند", () => {
  const model = clone(FIXTURES.cleanScheme);
  model.requirements.dwellings.find((item) => item.type === model.units[0].type)!.minAreaM2 = 0;
  model.levels[0].corridors = [];
  const report = JSON.parse(JSON.stringify(validateScheme(FIXTURES.cleanScheme)));
  for (const id of ["CODE-04-MIN-DWELLING", "FIRE-03-CORRIDOR"]) {
    report.evaluations.find((item: { ruleId: string }) => item.ruleId === id).status = "pass";
  }
  const view = normalizeStoredReport(report, model)!;
  for (const id of ["CODE-04-MIN-DWELLING", "FIRE-03-CORRIDOR"]) {
    const evaluation = view.evaluations.find((item) => item.ruleId === id)!;
    assert(evaluation.status === "insufficient" && evaluation.required === null, `${id}: نتیجهٔ قدیمی نباید مثبت نمایش داده شود`);
    assert(evaluation.message.includes("غیرقابل استفاده") && evaluation.trace.some((item) => item.includes("رکورد تاریخی تغییر نکرده")), `${id}: علت و تاریخچه صریح باشد`);
    assert(view.issues.some((item) => item.ruleId === id && item.required === null), `${id}: مسئلهٔ بازنمایی ثبت شود`);
    assert(report.evaluations.find((item: { ruleId: string }) => item.ruleId === id).status === "pass", `${id}: رکورد تاریخی دست‌نخورده بماند`);
  }
  assert(view.passed === view.evaluations.filter((item) => item.status === "pass").length, "شمارش با نمای فعلی همسو شود");
  const exported = JSON.parse(exportScheme(model, report, "json").data.toString("utf8"));
  assert(exported.validation.evaluations.find((item: { ruleId: string }) => item.ruleId === "FIRE-03-CORRIDOR").status === "insufficient", "صدور مستقیم نیز guardها را اعمال کند");
});

test("readiness/incomplete-results", "خلاصهٔ ناقص یا ناسازگار نمی‌تواند حتی با evaluator مستقیم مثبت شود", () => {
  const missing = null as unknown as number;
  const cases: { rule: string; change: (s: CanonicalScheme) => void }[] = [
    { rule: "SITE-GEOM-01", change: (s) => { s.footprintRects = []; } },
    { rule: "SITE-GEOM-01", change: (s) => { s.site.boundary[0].x = missing; } },
    { rule: "CODE-04-HEIGHT", change: (s) => { s.floorHeightM = missing; } },
    { rule: "CODE-04-UNIT-SUPPLY", change: (s) => { s.requirements.dwellings[0].count = missing; } },
    { rule: "CODE-04-UNIT-MIX", change: (s) => { s.unitMix[s.units[0].type] = missing; } },
    { rule: "NBR-21-PARKING", change: (s) => { s.parking.requiredStalls = missing; } },
    { rule: "NBR-21-PARKING", change: (s) => { s.parking.providedStalls = missing; } },
    { rule: "NBR-21-PARKING", change: (s) => { s.requirements.visitorParkingRatio = missing; } },
    { rule: "NBR-15-DAYLIGHT", change: (s) => { s.daylight.averageWindowRatio = missing; } },
    { rule: "NBR-15-DAYLIGHT", change: (s) => { s.levels[0].rooms.find((r) => r.habitable)!.daylightFactorProxy = missing; } },
    { rule: "NBR-15-DAYLIGHT", change: (s) => { s.daylight.compliantRooms = 0; } },
    { rule: "STRUCT-02-COLUMN", change: (s) => { s.structural.columns = 0; } },
    { rule: "STRUCT-02-COLUMN", change: (s) => { s.structural.columnLoadKN = missing; } },
    { rule: "STRUCT-02-COLUMN", change: (s) => { s.structural.spansX = []; } },
    { rule: "MEP-16-WATER", change: (s) => { s.mep.waterTankLiters = missing; } },
    { rule: "ARCH-04-EFFICIENCY", change: (s) => { s.metrics = s.metrics.filter((m) => m.id !== "efficiency"); } },
    { rule: "DATA-01-INTEGRITY", change: (s) => { s.levels[0].rooms[0].areaM2 = missing; } },
  ];
  const oldReport = validateScheme(FIXTURES.cleanScheme);
  for (const entry of cases) {
    const model = clone(FIXTURES.cleanScheme); entry.change(model);
    const rule = RULES.find((candidate) => candidate.id === entry.rule)!;
    assert(rule.evaluate(model).status === "insufficient", `${entry.rule}: evaluator مستقیم باید ناکافی باشد`);
    assert(runRule(rule, model).status === "insufficient", `${entry.rule}: گزارش باید ناکافی باشد`);
    const old = { ...oldReport, evaluations: oldReport.evaluations.map((e) => e.ruleId === entry.rule ? { ...e, status: "pass" as const } : e) };
    assert(normalizeStoredReport(old, model)!.evaluations.find((e) => e.ruleId === entry.rule)?.status === "insufficient",
      `${entry.rule}: مثبت تاریخی باید در نمای امن به ناکافی تبدیل شود`);
  }
});

test("readiness/incomplete-ranking", "معیار با ورودی ناکافی یا مقدار ناسازگار در مجموع جزئی پنهان نمی‌شود", () => {
  const missing = null as unknown as number;
  const cases: { criterion: string; change: (s: CanonicalScheme) => void }[] = [
    { criterion: "parking", change: (s) => { s.parking.requiredStalls = missing; } },
    { criterion: "parking", change: (s) => { s.parking.providedStalls += 1; } },
    { criterion: "daylight", change: (s) => { s.daylight.compliantRooms = 0; } },
    { criterion: "egress", change: (s) => { s.circulation.maxTravelDistanceM += 1; } },
    { criterion: "unitYield", change: (s) => { s.requirements.dwellings[0].count = missing; } },
    { criterion: "efficiency", change: (s) => { s.metrics = s.metrics.filter((m) => m.id !== "efficiency"); } },
    { criterion: "cost", change: (s) => { s.structural.columnLoadKN = missing; } },
  ];
  for (const entry of cases) {
    const model = clone(FIXTURES.cleanScheme); entry.change(model);
    // حتی گزارش مثبتِ مانده از اجرای قبلی، ورودی ناقص را کامل نمی‌کند.
    const ranked = rankSchemes([model], { [model.id]: FIXTURES.cleanReport }, DEFAULT_WEIGHTS)[0];
    assert(ranked.criteria.find((criterion) => criterion.id === entry.criterion)?.raw === null, `${entry.criterion}: معیار نامعلوم`);
    assert(!ranked.comparisonComplete && ranked.pareto === null, `${entry.criterion}: بهترین و پارتو نامعلوم‌اند`);
  }
});

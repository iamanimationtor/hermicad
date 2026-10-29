import { RULES, validateScheme } from "../codes";
import { RULE_DOCS } from "../rules/docs";
import { CODE_SET, DISCLAIMER, GLAZING_RATIO_MIN, MAX_CROSS_VENTILATION_DEPTH_M, TRAVEL_DISTANCE_LIMIT_M } from "../constants";
import type { CanonicalScheme, ValidationReport } from "../types";
import { FIXTURES } from "./fixtures";
import { assert, approx, test } from "./harness";

const clone = (scheme: CanonicalScheme): CanonicalScheme => JSON.parse(JSON.stringify(scheme)) as CanonicalScheme;

type Mutation = (scheme: CanonicalScheme) => void;

const mutations: Record<string, Mutation> = {
  "SITE-GEOM-01": (s) => {
    s.footprintRects = s.footprintRects.map((r) => ({ ...r, x: r.x - 500 }));
  },
  "CODE-04-FAR": (s) => {
    s.grossFloorAreaM2 = s.plotAreaM2 * (s.requirements.farMax + 1);
  },
  "CODE-04-COVERAGE": (s) => {
    s.footprintAreaM2 = s.plotAreaM2 * (s.requirements.coverageMax + 0.2);
  },
  "CODE-04-HEIGHT": (s) => {
    s.floors = s.requirements.floorsMax + 2;
  },
  "CODE-04-UNIT-SUPPLY": (s) => {
    s.unitsTotal = 1;
  },
  "CODE-04-UNIT-MIX": (s) => {
    s.unitMix = { twoBed: 1, threeBed: 0 };
  },
  "CODE-04-MIN-DWELLING": (s) => {
    s.units = s.units.map((u) => ({ ...u, areaM2: 20 }));
  },
  "CODE-04-ROOM-MIN": (s) => {
    const room = s.levels[0].rooms.find((r) => r.minAreaM2 > 5 && r.unitIndex >= 0);
    if (room) room.areaM2 = 0.5;
  },
  "FIRE-03-CORRIDOR": (s) => {
    s.levels[0].corridorWidthM = 0.9;
  },
  "FIRE-03-EXITS": (s) => {
    s.levels[0].cores = [];
  },
  "FIRE-03-TRAVEL": (s) => {
    s.circulation.maxTravelDistanceM = TRAVEL_DISTANCE_LIMIT_M + 10;
  },
  "NBR-21-PARKING": (s) => {
    s.parking.providedStalls = 0;
  },
  "NBR-15-DAYLIGHT": (s) => {
    for (const room of s.levels.flatMap((level) => level.rooms)) if (room.habitable) room.daylightFactorProxy = 0;
    s.daylight.compliantRooms = 0;
    s.daylight.averageWindowRatio = 0;
  },
  "NBR-15-CROSSVENT": (s) => {
    s.units = s.units.map((u) => ({ ...u, rect: { ...u.rect, h: MAX_CROSS_VENTILATION_DEPTH_M + 8 } }));
  },
  "STRUCT-02-COLUMN": (s) => {
    s.structural.columnSizeMm = 900;
  },
  "STRUCT-02-FOUNDATION": (s) => {
    s.structural.requiredFoundationWidthM = 3.5;
  },
  "STRUCT-02-SEISMIC": (s) => {
    s.structural.seismicCoefficient = 0.4;
  },
  "MEP-16-WATER": (s) => {
    s.mep.waterTankLiters = 10;
    s.mep.waterDailyLiters = 10_000;
  },
  "MEP-13-ELECTRICAL": (s) => {
    s.mep.transformerKVA = 5;
    s.mep.electricalDemandKVA = 120;
  },
  "DATA-01-INTEGRITY": (s) => {
    s.levels[0].rooms[0].areaM2 += 5;
  },
  "ARCH-04-EFFICIENCY": (s) => {
    s.metrics = s.metrics.map((m) => (m.id === "efficiency" ? { ...m, value: 10 } : m));
  },
};

const statusOf = (report: ValidationReport, ruleId: string) =>
  report.evaluations.find((e) => e.ruleId === ruleId)?.status ?? "missing";

test("rules", "هر قاعده دارای مستندات کامل (ورودی، روش، آستانه، محدودیت، منبع) است", () => {
  const missing = RULES.filter((rule) => !RULE_DOCS[rule.id]);
  assert(missing.length === 0, `قواعد بدون مستندات: ${missing.map((r) => r.id).join(", ")}`);
  for (const rule of RULES) {
    const doc = RULE_DOCS[rule.id];
    assert(doc.inputs.length > 0, `${rule.id}: ورودی‌ها مستند نشده`);
    assert(doc.method.length > 15, `${rule.id}: روش محاسبه مستند نشده`);
    assert(doc.limitations.length > 15, `${rule.id}: محدودیت مستند نشده`);
    assert(doc.citation.length > 5, `${rule.id}: منبع/ارجاع مستند نشده`);
    assert(doc.threshold.length > 2, `${rule.id}: آستانه مستند نشده`);
    assert(doc.id === rule.id, `${rule.id}: شناسه مستندات ناسازگار است`);
  }
  return `${RULES.length} قاعده با مستندات کامل`;
});

test("rules", "هیچ قاعده‌ای ادعای تأیید رسمی یا انطباق قانونی ندارد", () => {
  const dishonest = Object.values(RULE_DOCS).filter((doc) => doc.verifiedAgainstOfficialText !== false);
  assert(dishonest.length === 0, `ادعای تأیید رسمی: ${dishonest.map((d) => d.id).join(", ")}`);
  assert(CODE_SET.verification === "unverified", "وضعیت مجموعه ضوابط باید unverified باشد");
  assert(CODE_SET.officialSourceAvailable === false, "دسترسی به سند رسمی باید صریحاً رد شود");
  assert(CODE_SET.status === "internal-thresholds-unverified", "وضعیت سند باید داخلی/تأییدنشده باشد");
  assert(DISCLAIMER.includes("غیررسمی"), "سلب مسئولیت باید غیررسمی بودن را اعلام کند");
  const cited = Object.values(RULE_DOCS).filter((d) => d.sourceStatus === "unverified-citation");
  return `${cited.length} قاعده با ارجاع تأییدنشده (اعلام‌شده) از ${Object.keys(RULE_DOCS).length}`;
});

test("rules", "طرح معتبر (بدون نقض) توسط قواعد اصلی رد نمی‌شود", () => {
  const report = FIXTURES.cleanReport;
  const mustPass = [
    "SITE-GEOM-01",
    "CODE-04-FAR",
    "CODE-04-COVERAGE",
    "CODE-04-HEIGHT",
    "CODE-04-UNIT-SUPPLY",
    "FIRE-03-CORRIDOR",
    "FIRE-03-EXITS",
    "NBR-21-PARKING",
    "MEP-13-ELECTRICAL",
    "MEP-16-WATER",
    "STRUCT-02-COLUMN",
    "STRUCT-02-FOUNDATION",
    "DATA-01-INTEGRITY",
  ];
  const failures = mustPass.filter((id) => statusOf(report, id) !== "pass");
  assert(failures.length === 0, `قواعدی که به‌اشتباه رد شده‌اند: ${failures.map((id) => `${id}=${statusOf(report, id)}`).join(", ")}`);
  assert(report.failed === 0, `طرح مرجع نباید نقض داشته باشد: ${report.failed}`);
  return `${mustPass.length} قاعده اصلی روی ${FIXTURES.cleanScheme.code} منطبق است`;
});

test("rules", "هر قاعده با ورودی هدفمند قابل نقض است (آزمون منفی قاعده‌به‌قاعده)", () => {
  const results: string[] = [];
  const notTriggered: string[] = [];
  for (const rule of RULES) {
    const mutant = clone(FIXTURES.cleanScheme);
    const mutate = mutations[rule.id];
    assert(!!mutate, `${rule.id}: آزمون منفی تعریف نشده است`);
    if (mutate) mutate(mutant);
    const report = validateScheme(mutant);
    const status = statusOf(report, rule.id);
    const baseline = statusOf(FIXTURES.cleanReport, rule.id);
    if (status === "fail" || status === "warn" || baseline !== "pass") {
      results.push(`${rule.id}:${status}`);
    } else {
      notTriggered.push(rule.id);
    }
  }
  assert(notTriggered.length === 0, `قواعدی که با ورودی نامعتبر همچنان pass می‌مانند: ${notTriggered.join(", ")}`);
  return `${results.length} قاعده با ورودی نامعتبر غیرمنطبق شد`;
});

test("rules", "هر نقض گزارش‌شده از نظر عددی توجیه‌شده است", () => {
  // direction: true = higher is worse beyond the limit, false = lower is worse
  const higherIsWorse: Record<string, boolean> = {
    "CODE-04-FAR": true,
    "CODE-04-COVERAGE": true,
    "CODE-04-HEIGHT": true,
    "FIRE-03-TRAVEL": true,
    "STRUCT-02-COLUMN": true,
    "STRUCT-02-FOUNDATION": true,
    "STRUCT-02-SEISMIC": true,
    "NBR-15-CROSSVENT": true,
  };
  const lowerIsWorse: string[] = [
    "CODE-04-UNIT-SUPPLY",
    "CODE-04-MIN-DWELLING",
    "FIRE-03-CORRIDOR",
    "FIRE-03-EXITS",
    "NBR-21-PARKING",
    "NBR-15-DAYLIGHT",
    "NBR-16-WATER",
    "MEP-16-WATER",
    "MEP-13-ELECTRICAL",
    "ARCH-04-EFFICIENCY",
  ];
  const checked: string[] = [];
  for (const scheme of FIXTURES.schemes) {
    const report = FIXTURES.reports[scheme.id];
    for (const evaluation of report.evaluations) {
      if (evaluation.status !== "fail" && evaluation.status !== "warn") continue;
      if (typeof evaluation.observed !== "number" || typeof evaluation.required !== "number") continue;
      if (evaluation.ruleId in higherIsWorse) {
        assert(
          higherIsWorse[evaluation.ruleId] ? evaluation.observed > evaluation.required : evaluation.observed < evaluation.required,
          `${evaluation.ruleId}: مقدار ${evaluation.observed} خارج از حد ${evaluation.required} نیست اما نقض گزارش شده`,
        );
        checked.push(evaluation.ruleId);
      } else if (lowerIsWorse.includes(evaluation.ruleId)) {
        assert(
          evaluation.observed < evaluation.required,
          `${evaluation.ruleId}: مقدار ${evaluation.observed} کمتر از حد ${evaluation.required} نیست اما نقض گزارش شده`,
        );
        checked.push(evaluation.ruleId);
      }
    }
  }
  assert(checked.length > 0, "هیچ نقض عددی برای بررسی وجود ندارد (آزمون بی‌اثر است)");
  return `${checked.length} نقض عددی بازبینی شد؛ همه واقعی`;
});

test("rules", "آستانه‌های کلیدی پنهانی تضعیف نشده‌اند", () => {
  approx(TRAVEL_DISTANCE_LIMIT_M, 30, 1e-9, "travel limit");
  approx(GLAZING_RATIO_MIN, 0.08, 1e-9, "glazing ratio");
  approx(MAX_CROSS_VENTILATION_DEPTH_M, 14, 1e-9, "cross ventilation depth");
  const corridor = RULES.find((r) => r.id === "FIRE-03-CORRIDOR")!;
  const outcome = corridor.evaluate(FIXTURES.cleanScheme);
  assert(outcome.status === "pass", "راهرو نمونه باید منطبق باشد");
  const mutant = clone(FIXTURES.cleanScheme);
  mutant.levels[0].corridorWidthM = 1.49;
  assert(corridor.evaluate(mutant).status === "fail", "عرض ۱.۴۹ باید نقض شود (مرز ۱.۵)");
  mutant.levels[0].corridorWidthM = 1.5;
  assert(corridor.evaluate(mutant).status === "pass", "عرض ۱.۵ باید مرزی-منطبق باشد");
  return `مرز راهرو دقیقاً ۱.۵ m است؛ حد فاصله ${TRAVEL_DISTANCE_LIMIT_M} m`;
});

test("rules", "گزارش، منبع/روش/محدودیت هر ارزیابی و خلاصه دسته‌بندی را حمل می‌کند", () => {
  const report = FIXTURES.cleanReport;
  for (const evaluation of report.evaluations) {
    assert(evaluation.source.length > 5, `${evaluation.ruleId}: منبع خالی`);
    assert(evaluation.method.length > 10, `${evaluation.ruleId}: روش خالی`);
    assert(evaluation.inputs.length > 0, `${evaluation.ruleId}: ورودی خالی`);
    assert(evaluation.limitations.length > 10, `${evaluation.ruleId}: محدودیت خالی`);
    assert(evaluation.verification === "internally-tested" || evaluation.verification === "unverified", `${evaluation.ruleId}: سطح اعتبار نامعتبر`);
  }
  const counted = Object.values(report.categorySummary).reduce(
    (sum, c) => sum + c.pass + c.fail + c.warn + c.na,
    0,
  );
  assert(counted === report.evaluations.length, `خلاصه دسته‌بندی ${counted} ≠ ارزیابی‌ها ${report.evaluations.length}`);
  assert(report.codeSetVerification === "unverified", "گزارش باید وضعیت تأییدنشدگی را حمل کند");
  assert(!!report.codeSetNote && report.codeSetNote.length > 20, "یادداشت سند ضوابط لازم است");
  assert(
    report.passed + report.failed + report.warnings + (report.insufficient ?? 0) === report.evaluations.length,
    "جمع وضعیت‌ها (با احتساب اطلاعات ناکافی) ناسازگار است",
  );
  return `${report.evaluations.length} ارزیابی مستند · ${Object.keys(report.categorySummary).length} دسته`;
});

test("rules", "شناسه قواعد پایدار و بدون تکرار است", () => {
  const ids = RULES.map((r) => r.id);
  assert(new Set(ids).size === ids.length, "شناسه تکراری وجود دارد");
  approx(ids.length, 21, 0, "rule count");
  const expected = [
    "SITE-GEOM-01",
    "CODE-04-FAR",
    "CODE-04-COVERAGE",
    "CODE-04-HEIGHT",
    "CODE-04-UNIT-SUPPLY",
    "CODE-04-UNIT-MIX",
    "CODE-04-MIN-DWELLING",
    "CODE-04-ROOM-MIN",
    "FIRE-03-CORRIDOR",
    "FIRE-03-EXITS",
    "FIRE-03-TRAVEL",
    "NBR-21-PARKING",
    "NBR-15-DAYLIGHT",
    "NBR-15-CROSSVENT",
    "STRUCT-02-COLUMN",
    "STRUCT-02-FOUNDATION",
    "STRUCT-02-SEISMIC",
    "MEP-16-WATER",
    "MEP-13-ELECTRICAL",
    "DATA-01-INTEGRITY",
    "ARCH-04-EFFICIENCY",
  ];
  const drift = expected.filter((id) => !ids.includes(id));
  assert(drift.length === 0, `شناسه‌های ازدست‌رفته: ${drift.join(", ")}`);
  return `${ids.length} شناسه پایدار`;
});

test("rules", "ارزیابی قواعد مستقل از وزن‌های تصمیم است (قانون با وزن معامله نمی‌شود)", () => {
  const mutant = clone(FIXTURES.cleanScheme);
  mutant.grossFloorAreaM2 = mutant.plotAreaM2 * (mutant.requirements.farMax + 1);
  const a = validateScheme(mutant);
  const b = validateScheme({ ...mutant });
  assert(statusOf(a, "CODE-04-FAR") === "fail", "تراکم بیش از حد باید نقض شود");
  assert(statusOf(b, "CODE-04-FAR") === statusOf(a, "CODE-04-FAR"), "نتیجه نباید با تکرار تغییر کند");
  return "نقض تراکم مستقل از رتبه‌بندی و تکرارپذیر است";
});

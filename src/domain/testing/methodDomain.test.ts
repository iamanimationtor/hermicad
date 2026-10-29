import { RULES, runRule } from "../codes";
import { computeStructural } from "../analysis";
import { checkValidity } from "../engineering/registry";
import { UnsafeMethodDomainError, methodDomainIssues } from "../engineering/methodValidity";
import { normalizeScreeningScheme } from "../engineering/screening";
import { exportScheme } from "../exporters/reports";
import { rankSchemes, DEFAULT_WEIGHTS } from "../optimize";
import { normalizeStoredReport } from "../rules/compat";
import type { CanonicalScheme } from "../types";
import { FIXTURES } from "./fixtures";
import { assert, test } from "./harness";

const clone = () => structuredClone(FIXTURES.cleanScheme);

test("method-domain/guards", "خارج از حدود عددی ثبت‌شده نه کنترل مثبت است و نه فایل قابل صدور", () => {
  const scenarios: { rule: string; formula: string; change: (s: CanonicalScheme) => void }[] = [
    { rule: "STRUCT-02-COLUMN", formula: "STRUCT-GRID", change: (s) => { s.structural.spansX[0] = 3; } },
    { rule: "STRUCT-02-COLUMN", formula: "STRUCT-AXIAL-SCREEN", change: (s) => { s.floors = 21; } },
    { rule: "STRUCT-02-COLUMN", formula: "STRUCT-BEAM-DEPTH", change: (s) => { s.structural.spansX[0] = 11; } },
    { rule: "STRUCT-02-COLUMN", formula: "STRUCT-SLAB-DEPTH", change: (s) => { s.structural.spansX = [9]; s.structural.spansY = [9]; } },
    { rule: "MEP-16-WATER", formula: "MEP-WATER-DEMAND", change: (s) => { s.mep.occupancy = 2001; } },
    { rule: "MEP-16-WATER", formula: "MEP-PIPE-FLOW", change: (s) => { s.mep.waterMainDiameterMm = 201; } },
    { rule: "MEP-13-ELECTRICAL", formula: "MEP-ELECTRICAL-DEMAND", change: (s) => { s.unitsTotal = 61; } },
    { rule: "NBR-21-PARKING", formula: "PARKING-BRUTE-AREA", change: (s) => { s.footprintAreaM2 = 99; } },
    { rule: "FIRE-03-TRAVEL", formula: "CIRC-TRAVEL-LOWERBOUND", change: (s) => { s.circulation.maxTravelDistanceM = 101; } },
    { rule: "NBR-15-DAYLIGHT", formula: "DAYLIGHT-PROXY", change: (s) => { s.levels[0].rooms.find((room) => room.habitable)!.areaM2 = 61; } },
  ];
  for (const scenario of scenarios) {
    const scheme = clone();
    scenario.change(scheme);
    const rule = RULES.find((item) => item.id === scenario.rule)!;
    const issue = methodDomainIssues(scheme).find((item) => item.formulaId === scenario.formula);
    assert(!!issue && issue.message.includes("غیرقابل استفاده"), scenario.formula);
    const result = runRule(rule, scheme);
    assert(result.status === "insufficient" && result.observed === "خارج از دامنه", `${scenario.rule}: نباید مثبت شود`);
    assert(rule.evaluate(scheme).status === "insufficient", `${scenario.rule}: evaluator مستقیم`);
    const safe = normalizeScreeningScheme(scheme);
    const previous = normalizeStoredReport(FIXTURES.cleanReport, safe)!;
    assert(previous.evaluations.find((item) => item.ruleId === scenario.rule)?.status === "insufficient", `${scenario.rule}: گزارش قدیمی`);
    assert(safe.analysisStatus?.outsideDomain?.some((item) => item.formulaId === scenario.formula) === true, "وضعیت دامنه در مدل");
    let failure: unknown;
    try { exportScheme(safe, previous, "json"); } catch (error) { failure = error; }
    assert(failure instanceof UnsafeMethodDomainError, `${scenario.formula}: عدد خام خارج‌دامنه نباید صادر شود`);
  }
});

test("method-domain/ranking", "معیارهای خارج‌دامنه در رتبه‌بندی و پارتو مقدار مثبت نمی‌گیرند", () => {
  const scenarios: { criterion: string; change: (s: CanonicalScheme) => void }[] = [
    { criterion: "parking", change: (s) => { s.footprintAreaM2 = 99; } },
    { criterion: "egress", change: (s) => { s.circulation.maxTravelDistanceM = 101; } },
    { criterion: "daylight", change: (s) => { s.levels[0].rooms.find((room) => room.habitable)!.areaM2 = 61; } },
    { criterion: "structure", change: (s) => { s.floors = 21; } },
  ];
  for (const scenario of scenarios) {
    const scheme = clone();
    scenario.change(scheme);
    const ranked = rankSchemes([scheme], { [scheme.id]: FIXTURES.cleanReport }, DEFAULT_WEIGHTS)[0];
    assert(ranked.criteria.find((item) => item.id === scenario.criterion)?.raw === null, scenario.criterion);
    assert(!ranked.comparisonComplete && ranked.pareto === null, "مقایسه و پارتو باید نامشخص بمانند");
  }
});

test("method-domain/seismic", "نتیجهٔ لرزه‌ای خارج‌دامنه به null و وضعیت خارج‌دامنه تبدیل می‌شود", () => {
  const structural = computeStructural({
    footprintAreaM2: 120, floors: 21, grossFloorAreaM2: 2520, site: FIXTURES.site, requirements: FIXTURES.requirements,
  });
  assert(structural.seismicCoefficient === null && structural.seismicBaseShearKN === null && structural.seismicScreening?.status === "outside-domain", "طبقات بیرون از حد");
  const raw = clone();
  raw.structural.seismicCoefficient = 0.7;
  const safe = normalizeScreeningScheme(raw);
  assert(safe.structural.seismicCoefficient === null && safe.structural.seismicBaseShearKN === null && safe.structural.seismicScreening?.status === "outside-domain", "ضریب قدیمی خارج‌دامنه");
  const report = normalizeStoredReport(FIXTURES.cleanReport, safe)!;
  const result = report.evaluations.find((item) => item.ruleId === "STRUCT-02-SEISMIC")!;
  assert(result.status === "insufficient" && result.observed === "خارج از دامنه", "علت خارج‌دامنه پس از حذف عدد حفظ شود");
  const json = JSON.parse(exportScheme(safe, report, "json").data.toString("utf8"));
  assert(json.canonicalModel.structural.seismicBaseShearKN === null, "فایل فقط نتیجهٔ خنثی‌شده را نگه دارد");
});

test("method-domain/bounds", "مرزهای ثبت‌شده شامل حد و بیرون از حد صریح‌اند", () => {
  assert(checkValidity("STRUCT-GRID", "span", 4) === null && checkValidity("STRUCT-GRID", "span", 10) === null, "دو حد در بازه‌اند");
  assert(checkValidity("STRUCT-GRID", "span", 3.99)?.message.includes("غیرقابل استفاده") === true, "زیر حد");
  assert(checkValidity("STRUCT-GRID", "span", 10.01)?.message.includes("غیرقابل استفاده") === true, "بالای حد");
});

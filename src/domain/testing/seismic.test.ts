import { computeStructural } from "../analysis";
import { RULES, runRule, validateScheme } from "../codes";
import { ENGINE_VERSION, SEISMIC_PARAMS } from "../constants";
import { normalizeScreeningScheme } from "../engineering/screening";
import { LEGACY_ASSUMED_SEISMIC_NOTE } from "../engineering/seismic";
import { exportScheme, schemeCsv, schemePdf, schemeXlsx } from "../exporters/reports";
import { buildSite, DEFAULT_ANSWERS, reviewIntake } from "../intake";
import { generateSchemes } from "../layout";
import { comparisonMatrix, DEFAULT_WEIGHTS, rankSchemes } from "../optimize";
import { DEFAULT_PROJECT_SITE, validateSite } from "../requirements";
import { normalizeStoredReport } from "../rules/compat";
import type { CanonicalScheme, SeismicZone } from "../types";
import { FIXTURES } from "./fixtures";
import { assert, test } from "./harness";

const clone = (scheme: CanonicalScheme) => structuredClone(scheme);
const seismicRule = RULES.find((rule) => rule.id === "STRUCT-02-SEISMIC")!;

function unknownScheme(): CanonicalScheme {
  return generateSchemes({ ...FIXTURES.site, seismicZone: null }, FIXTURES.requirements, {
    seed: 20260101, variants: 1, generatedAt: "2026-01-01T00:00:00.000Z",
  })[0];
}

function legacyScheme(): CanonicalScheme {
  const scheme = clone(FIXTURES.cleanScheme);
  scheme.site.seismicZone = "high";
  scheme.site.notes = [LEGACY_ASSUMED_SEISMIC_NOTE];
  return scheme;
}

test("seismic/intake", "پهنه و خاک پروژهٔ جدید بدون انتخاب کاربر نامعلوم‌اند", () => {
  const answers = { ...DEFAULT_ANSWERS, projectName: "پروژهٔ آزمایشی" };
  const site = buildSite(answers);
  const review = reviewIntake(answers);
  assert(site.seismicZone === null && validateSite(site).ok, "پهنهٔ نامشخص باید قابل ثبت باشد");
  assert(review.ready && review.missing.some((item) => item.id === "seismic" && !item.blocking), "سؤال اختیاری اما صریح است");
  assert(review.assumptions.some((item) => item.label === "پهنه لرزه‌ای" && item.value === "نامشخص"), "فرض زیاد نباید ساخته شود");
  assert(DEFAULT_PROJECT_SITE.seismicZone === null && DEFAULT_PROJECT_SITE.soilBearingKPa === 0, "مقادیر نمونه نباید دادهٔ واقعی پروژه وانمود شوند");
  assert(ENGINE_VERSION === "hermicad-engine/1.3.1", "نسخه باید تغییر معنای موتور را نشان دهد");
});

test("seismic/unknown", "دادهٔ نامعلوم نه عدد و نه کنترل مثبت تولید می‌کند", () => {
  const scheme = unknownScheme();
  const s = scheme.structural;
  assert(s.seismicCoefficient === null && s.seismicBaseShearKN === null && s.seismicScreening?.status === "insufficient", "بدون پهنه نباید عددی ساخته شود");
  assert(!scheme.metrics.some((item) => item.id === "baseShear"), "معیار مجهول نباید صفر یا عدد فرضی باشد");
  assert(s.assumptions.find((item) => item.id === "st-zone")?.value === "نامشخص", "فرض لرزه‌ای");
  assert(scheme.trace.some((step) => step.output.includes("برش پایه محاسبه نشده")), "ردیابی نامعلوم");
  const result = runRule(seismicRule, scheme);
  assert(result.status === "insufficient" && result.required === null, "قاعده نباید pass شود");
  assert(seismicRule.evaluate(scheme).status === "insufficient", "حتی فراخوانی مستقیم evaluator نباید مثبت شود");
});

test("seismic/known", "مقادیر ثبت‌شده فقط به‌عنوان محاسبهٔ داخلی و بدون احراز مقررات به کار می‌روند", () => {
  for (const zone of ["low", "moderate", "high", "veryHigh"] as SeismicZone[]) {
    const structural = computeStructural({
      footprintAreaM2: 120, floors: 4, grossFloorAreaM2: 480,
      site: { ...FIXTURES.site, seismicZone: zone }, requirements: FIXTURES.requirements,
    });
    const p = SEISMIC_PARAMS[zone];
    assert(structural.seismicCoefficient === Number((p.A * p.B * p.I / p.R).toFixed(4)), `${zone}: ضریب داخلی`);
    assert(structural.seismicBaseShearKN !== null && structural.seismicBaseShearKN > 0, `${zone}: برش`);
    assert(structural.seismicScreening?.status === "available" && !!structural.assumptions.find((item) => item.id === "st-zone")?.basis.includes("تطبیق"), "وضعیت غیررسمی باید آشکار بماند");
  }
});

test("seismic/ranking", "معیار نامعلوم بهترین، صفر فیزیکی یا عضو پارتو نیست", () => {
  const unknown = unknownScheme();
  const known = { ...clone(FIXTURES.cleanScheme), id: "known-comparison" };
  const reports = { [unknown.id]: validateScheme(unknown), [known.id]: validateScheme(known) };
  const ranked = rankSchemes([unknown, known], reports, DEFAULT_WEIGHTS);
  const missing = ranked.find((item) => item.schemeId === unknown.id)!;
  assert(missing.criteria.find((criterion) => criterion.id === "structure")?.raw === null, "مقدار خام مجهول");
  assert(ranked.every((item) => !item.comparisonComplete && item.pareto === null), "در حضور گزینهٔ ناقص مقایسهٔ کامل یا پارتو احراز نمی‌شود");
  assert(ranked.every((item) => item.verification.notes.some((note) => note.includes("مقایسه کامل نیست"))), "جزئی بودن امتیاز باید آشکار باشد");
  const column = comparisonMatrix([unknown, known]).find((item) => item.criterion.metricId === "baseShear")!;
  assert(column.best === null && column.values.find((value) => value.schemeId === unknown.id)?.value === null, "انتخاب برترین با دادهٔ ناقص ممنوع است");
});

test("seismic/legacy", "فرض پیش‌فرض قدیمی در نمای خواندنی خنثی و رکورد خام حفظ می‌شود", () => {
  const raw = legacyScheme();
  const original = JSON.stringify(raw);
  const oldReport = FIXTURES.cleanReport;
  const safe = normalizeScreeningScheme(raw);
  const report = normalizeStoredReport(oldReport, safe)!;
  assert(safe.site.seismicZone === null && safe.structural.seismicCoefficient === null && safe.structural.seismicBaseShearKN === null, "پیش‌فرض تاریخی نامشخص است");
  assert(!safe.metrics.some((item) => item.id === "baseShear") && safe.assumptions.find((item) => item.id === "st-zone")?.value === "نامشخص", "معیار و فرض قبلی حذف شوند");
  assert(report.evaluations.find((item) => item.ruleId === "STRUCT-02-SEISMIC")?.status === "insufficient", "گزارش قدیمی نباید مثبت بماند");
  assert(runRule(seismicRule, raw).status === "insufficient" && seismicRule.evaluate(raw).status === "insufficient", "guard مستقیم هم دادهٔ قدیمی را تشخیص دهد");
  const rank = rankSchemes([raw], { [raw.id]: oldReport }, DEFAULT_WEIGHTS)[0];
  assert(rank.criteria.find((item) => item.id === "structure")?.raw === null && rank.pareto === null, "رتبه‌بندی خام هم امن باشد");
  assert(JSON.stringify(raw) === original, "بازنمایی نباید رکورد خام را تغییر دهد");
  const explicit = clone(raw);
  explicit.site.notes = [];
  assert(normalizeScreeningScheme(explicit).structural.seismicBaseShearKN === raw.structural.seismicBaseShearKN, "انتخاب صریح high نباید با پیش‌فرض یکسان فرض شود");
});

test("seismic/exports", "JSON، CSV، XLSX و PDF دادهٔ قدیمی و جدید نامعلوم را قابل استفاده اعلام نمی‌کنند", () => {
  for (const scheme of [unknownScheme(), legacyScheme()]) {
    const report = FIXTURES.cleanReport;
    const json = JSON.parse(exportScheme(scheme, report, "json").data.toString("utf8"));
    assert(json.canonicalModel.structural.seismicBaseShearKN === null && json.canonicalModel.structural.seismicCoefficient === null, "JSON");
    assert(json.validation.evaluations.find((item: { ruleId: string }) => item.ruleId === "STRUCT-02-SEISMIC").status === "insufficient", "کنترل JSON");
    assert(schemeCsv(scheme, report).includes("NOT CALCULATED - INSUFFICIENT DATA"), "CSV مستقیم");
    assert(schemeXlsx(scheme, report).toString("utf8").includes("NOT CALCULATED - INSUFFICIENT DATA"), "XLSX مستقیم");
    assert(schemePdf(scheme, report).toString("latin1").includes("NOT CALCULATED - INSUFFICIENT DATA"), "PDF مستقیم");
  }
});

test("seismic/inconsistent", "ضریب، برش یا معیار ناسازگار در رتبه‌بندی قابل استفاده نیست", () => {
  for (const change of [
    (scheme: CanonicalScheme) => { scheme.structural.seismicCoefficient = null; },
    (scheme: CanonicalScheme) => { scheme.structural.seismicBaseShearKN = null; },
    (scheme: CanonicalScheme) => { scheme.metrics.find((metric) => metric.id === "baseShear")!.value = 0; },
  ]) {
    const scheme = clone(FIXTURES.cleanScheme);
    change(scheme);
    const safe = normalizeScreeningScheme(scheme);
    assert(safe.structural.seismicBaseShearKN === null && !safe.metrics.some((metric) => metric.id === "baseShear"), "نتیجهٔ ناقص حذف شود");
    assert(rankSchemes([scheme], { [scheme.id]: FIXTURES.cleanReport }, DEFAULT_WEIGHTS)[0].comparisonComplete === false, "مقایسه ناقص است");
  }
});

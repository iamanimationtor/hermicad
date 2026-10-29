import { analyzeSite } from "../layout";
import {
  STEPS_FOR_TEST,
} from "./accuracyFixtures";
import {
  computeCirculation,
  computeDaylight,
  computeMep,
  computeParking,
  computeStructural,
} from "../analysis";
import { FORMULAS, FORMULA_LIST, checkValidity, EXTERNAL_SPEC_REFERENCES } from "../engineering/registry";
import { buildVerification, rankSchemes, DEFAULT_WEIGHTS } from "../optimize";
import { validateScheme } from "../codes";
import { exportScheme } from "../exporters/reports";
import { validateExport } from "../exporters/validate";
import type { CanonicalScheme } from "../types";
import { FIXTURES } from "./fixtures";
import { approx, assert, test } from "./harness";

const clone = (s: CanonicalScheme): CanonicalScheme => JSON.parse(JSON.stringify(s)) as CanonicalScheme;

test("accuracy", "رجیستری فرمول‌ها کامل و طبقه‌بندی‌شده است", () => {
  assert(FORMULA_LIST.length >= 15, `تعداد فرمول‌های ثبت‌شده کم است: ${FORMULA_LIST.length}`);
  const classes = new Set(FORMULA_LIST.map((f) => f.classification));
  assert(classes.has("closed-form-geometry") && classes.has("screening-estimate") && classes.has("arbitrary-index"), "طبقه‌بندی‌ها ناقص‌اند");
  for (const f of FORMULA_LIST) {
    assert(f.expression.length > 8, `${f.id}: رابطه ثبت نشده`);
    assert(f.resultUnit.length > 0, `${f.id}: واحد ثبت نشده`);
    assert(f.inputs.length > 0 && f.inputs.every((i) => i.unit.length > 0), `${f.id}: ورودی بدون واحد`);
    assert(f.assumptions.length > 0, `${f.id}: فرض ثبت نشده`);
    assert(f.limitations.length > 15, `${f.id}: محدودیت ثبت نشده`);
    assert(f.validity.domain.length > 5 && f.validity.limits.length > 0, `${f.id}: دامنه اعتبار ثبت نشده`);
    assert(f.validity.failureMode.length > 10, `${f.id}: حالت شکست ثبت نشده`);
  }
  const seismic = FORMULAS["STRUCT-SEISMIC-CW"];
  assert(seismic.classification === "unverified-code-derived" && seismic.verification === "unverified", "رابطه لرزه‌ای نباید تأییدشده تلقی شود");
  assert(FORMULAS["COST-RELATIVE-INDEX"].classification === "arbitrary-index", "شاخص هزینه باید غیرمهندسی اعلام شود");
  assert(!FORMULAS["COST-RELATIVE-INDEX"].resultUnit.includes("ریال") && !FORMULAS["COST-RELATIVE-INDEX"].resultUnit.includes("تومان"), "شاخص هزینه نباید واحد پول داشته باشد");
  return `${FORMULA_LIST.length} فرمول · ${[...classes].join(", ")}`;
});

test("accuracy", "هر تحلیل مدل به فرمول‌های ثبت‌شده ارجاع می‌دهد", () => {
  for (const scheme of FIXTURES.schemes) {
    const summaries = [scheme.structural, scheme.mep, scheme.parking, scheme.circulation, scheme.daylight];
    for (const summary of summaries) {
      assert(summary.formulaRefs.length > 0, "تحلیل بدون ارجاع فرمول");
      for (const id of summary.formulaRefs) assert(!!FORMULAS[id], `فرمول ثبت‌نشده: ${id}`);
      assert(Array.isArray(summary.validityNotes), "یادداشت دامنه اعتبار لازم است");
    }
    for (const note of [...scheme.structural.validityNotes, ...scheme.mep.validityNotes]) {
      assert(note.includes("دامنه اعتبار"), `یادداشت دامنه اعتبار گویا نیست: ${note.slice(0, 60)}`);
    }
  }
  return "۵ طرح × ۵ تحلیل با ارجاع فرمول و دامنه اعتبار";
});

test("accuracy", "بازمحاسبه مستقل: تیر، سقف، پی، آب، ترانس، پارکینگ", () => {
  const scheme = FIXTURES.cleanScheme;
  const s = scheme.structural;
  const maxSpan = Math.max(s.spansX[0], s.spansY[0]);
  const minSpan = Math.min(s.spansX[0], s.spansY[0]);
  approx(s.beamDepthMm, Math.max(350, Math.ceil((maxSpan * 1000) / 12 / 50) * 50), 0.01, "beam L/12");
  approx(s.slabThicknessMm, Math.max(150, Math.ceil((minSpan * 1000) / 35 / 10) * 10), 0.01, "slab L/35");
  const tributary = scheme.footprintAreaM2 / s.columns;
  const service = tributary * scheme.floors * 8.5;
  approx(s.requiredFoundationWidthM ?? Number.NaN, Number(Math.sqrt((service * 1.1) / scheme.site.soilBearingKPa).toFixed(2)), 0.02, "footing");
  const tank = Math.ceil((scheme.mep.waterDailyLiters * 1.2) / 100) * 100;
  approx(scheme.mep.waterTankLiters, tank, 0, "tank 1.2 × daily");
  assert(scheme.mep.transformerKVA >= scheme.mep.electricalDemandKVA, "ترانس باید تقاضا را پوشش دهد");
  approx(scheme.mep.transformerKVA, Math.max(100, scheme.mep.electricalDemandKVA * 1.25) <= scheme.mep.transformerKVA ? scheme.mep.transformerKVA : -1, 0, "transformer sizing");
  const required = Math.ceil(scheme.unitsTotal * scheme.requirements.parkingPerDwelling + scheme.unitsTotal * scheme.requirements.visitorParkingRatio);
  approx(scheme.parking.requiredStalls, required, 0, "parking demand");
  return "۶ رابطه با بازمحاسبه مستقل هم‌خوان است";
});

test("accuracy", "اصلاح باگ مرکز هسته: فاصله حرکت از مرکز واقعی مستطیل", () => {
  const scheme = FIXTURES.cleanScheme;
  const level = scheme.levels[0];
  let expected = 0;
  for (const room of level.rooms) {
    if (!room.habitable) continue;
    const cx = room.polygon.reduce((t, p) => t + p.x, 0) / room.polygon.length;
    const cy = room.polygon.reduce((t, p) => t + p.y, 0) / room.polygon.length;
    for (const core of level.cores) {
      expected = Math.max(expected, Math.hypot(cx - (core.rect.x + core.rect.w / 2), cy - (core.rect.y + core.rect.h / 2)) * 1.2);
    }
  }
  approx(scheme.circulation.maxTravelDistanceM, Number(expected.toFixed(1)), 0.05, "travel distance from true core centre");
  for (const core of level.cores) {
    const oldCenter = Math.hypot(core.rect.x + 2.6 - (core.rect.x + core.rect.w / 2), core.rect.y + 2.6 - (core.rect.y + core.rect.h / 2));
    assert(oldCenter >= 0, "sanity");
  }
  return `فاصله ${scheme.circulation.maxTravelDistanceM} m از مرکز واقعی هسته (${level.cores.length} هسته)`;
});

test("accuracy", "دامنه اعتبار: خروج از بازه، هشدار قابل‌ردیابی می‌دهد", () => {
  assert(checkValidity("STRUCT-BEAM-DEPTH", "L_max", 6) === null, "دهانه ۶ m باید در بازه باشد");
  const issue = checkValidity("STRUCT-BEAM-DEPTH", "L_max", 14);
  assert(!!issue && issue.message.includes("دامنه اعتبار"), "دهانه ۱۴ m باید هشدار بدهد");
  const structural = computeStructural({
    footprintAreaM2: 4000,
    floors: 25,
    grossFloorAreaM2: 100000,
    site: FIXTURES.site,
    requirements: FIXTURES.requirements,
    footprintRects: [{ x: 0, y: 0, w: 120, h: 40 }],
  });
  assert(structural.validityNotes.length >= 2, `برای بلوک ۱۲۰×۴۰ و ۲۵ طبقه باید چند هشدار ثبت شود: ${structural.validityNotes.length}`);
  assert(structural.validityNotes.some((n) => n.includes("span") || n.includes("floors")), "هشدار باید به پارامتر مشخص اشاره کند");
  const normal = computeStructural({
    footprintAreaM2: FIXTURES.cleanScheme.footprintAreaM2,
    floors: FIXTURES.cleanScheme.floors,
    grossFloorAreaM2: FIXTURES.cleanScheme.grossFloorAreaM2,
    site: FIXTURES.site,
    requirements: FIXTURES.requirements,
    footprintRects: FIXTURES.cleanScheme.footprintRects,
  });
  assert(normal.validityNotes.length === 0, `طرح نمونه نباید هشدار دامنه داشته باشد: ${normal.validityNotes.join(" | ")}`);
  return "خروج از دامنه شناسایی شد؛ طرح نمونه پاک است";
});

test("accuracy", "ورودی‌های منحط نباید NaN یا مقدار منفی تولید کنند", () => {
  const site = { ...FIXTURES.site, soilBearingKPa: 0 };
  const structural = computeStructural({ footprintAreaM2: 0, floors: 0, grossFloorAreaM2: 0, site, requirements: FIXTURES.requirements });
  const mep = computeMep({ unitsTotal: 0, grossFloorAreaM2: 0, site, requirements: FIXTURES.requirements });
  const parking = computeParking({ unitsTotal: 0, requirements: FIXTURES.requirements, footprintAreaM2: 0, plotAreaM2: 0 });
  const circulation = computeCirculation({ levels: [], cores: [], corridorWidthM: 0 });
  const daylight = computeDaylight([]);
  const values = [
    structural.columnSizeMm, structural.beamDepthMm, structural.slabThicknessMm,
    structural.columnLoadKN,
    mep.occupancy, mep.waterDailyLiters, mep.waterTankLiters, mep.waterMainDiameterMm, mep.transformerKVA,
    parking.requiredStalls, parking.providedStalls,
    circulation.maxTravelDistanceM, daylight.averageWindowRatio, daylight.habitableRooms,
  ];
  const bad = values.filter((v) => v === null || !Number.isFinite(v) || v < 0);
  assert(structural.requiredFoundationWidthM === null && structural.foundationScreening?.status === "insufficient", "عرض پیِ بدون داده باید نامعلوم باشد نه عدد فرضی");
  assert(structural.seismicBaseShearKN === null && structural.seismicScreening?.status === "outside-domain", "طبقات صفر خارج از دامنهٔ محاسبهٔ لرزه‌ای است");
  assert(bad.length === 0, `مقادیر نامعتبر: ${bad.join(", ")}`);
  return `${values.length} مقدار متناهی و نامنفی برای ورودی صفر`;
});

test("accuracy", "امتیاز رتبه‌بندی هرگز انطباق یا ایمنی را ادعا نمی‌کند", () => {
  const report = FIXTURES.reports[FIXTURES.cleanScheme.id];
  const verification = buildVerification(report, false);
  assert(verification.claim === "not-established", "ادعای انطباق ممنوع است");
  assert(verification.advisory === true, "امتیاز باید مشورتی باشد");
  assert(verification.label.includes("مشورتی"), "برچسب باید مشورتی باشد");
  assert(verification.notes.some((n) => n.includes("تأییدنشده")), "نبود سند تأییدشده باید ذکر شود");
  const insufficientReport = {
    ...report,
    evaluations: report.evaluations.map((e, i) =>
      i < 3 ? { ...e, status: "insufficient" as const, required: null, observed: "ارزیابی نشد" } : e,
    ),
  };
  const insufficient = buildVerification(insufficientReport, false);
  assert(insufficient.insufficientRules === 3, `شمارش قواعد ارزیابی‌نشده باید ۳ باشد: ${insufficient.insufficientRules}`);
  assert(insufficient.confidencePenalty < 1, "نبود داده باید ضریب اطمینان را کاهش دهد");
  const blocked = buildVerification(report, true);
  assert(blocked.notes.some((n) => n.includes("بحرانی")), "نقص بحرانی باید ذکر شود");
  const ranking = FIXTURES.ranking;
  for (const item of ranking) {
    assert(item.score <= item.rawScore + 1e-9, `${item.schemeCode}: امتیاز پس از جریمه نباید از خام بیشتر باشد`);
    assert(item.verification.claim === "not-established", `${item.schemeCode}: ادعای انطباق`);
    const payload = JSON.stringify(item.verification);
    assert(!/compliant|"safe"|approved/i.test(payload), `${item.schemeCode}: واژه انطباق/ایمنی در متادیتا`);
  }
  const worst = ranking[ranking.length - 1];
  assert(worst.verification.advisory, "همه طرح‌ها مشورتی‌اند");
  return `۵ طرح مشورتی؛ جریمه‌ها ≤ ۱ (${ranking.map((r) => r.verification.confidencePenalty).join(", ")})`;
});

test("accuracy", "طرح دارای نقص/داده ناقص امتیاز پایین‌تری می‌گیرد (بدون پنهان‌سازی)", () => {
  const clean = FIXTURES.cleanScheme;
  const broken = clone(clean);
  broken.id = "accuracy-broken";
  broken.parking = { ...broken.parking, providedStalls: 0 };
  const reports: Record<string, ReturnType<typeof validateScheme>> = {
    [clean.id]: validateScheme(clean),
    [broken.id]: validateScheme(broken),
  };
  const ranking = rankSchemes([clean, broken], reports, DEFAULT_WEIGHTS);
  const cleanRow = ranking.find((r) => r.schemeId === clean.id)!;
  const brokenRow = ranking.find((r) => r.schemeId === broken.id)!;
  // NBR-21-PARKING is an internal threshold, so its failures must be reported
  // as internal-assumption deviations, NOT as legal violations.
  assert(
    brokenRow.verification.internalAssumptionFailures > 0,
    `نقص پارکینگ باید انحراف آستانه داخلی ثبت شود: ${JSON.stringify(brokenRow.verification)}`,
  );
  assert(brokenRow.verification.notes.some((n) => n.includes("آستانه داخلی")), "دلیل جریمه باید در یادداشت‌ها باشد");
  assert(brokenRow.score < cleanRow.score, `طرح دارای نقص باید امتیاز کمتری بگیرد: ${brokenRow.score} vs ${cleanRow.score}`);
  assert(ranking[0].schemeId === clean.id, "طرح بدون نقص باید اول باشد");
  return `امتیاز طرح سالم ${cleanRow.score} > طرح دارای نقص ${brokenRow.score}`;
});

test("accuracy", "IFC: تفکیک بررسی ساختاری از اعتبارسنجی اسکیمای رسمی", () => {
  const scheme = FIXTURES.cleanScheme;
  const report = FIXTURES.cleanReport;
  const artifact = exportScheme(scheme, report, "ifc");
  const result = validateExport("ifc", artifact.data, scheme, report, { filename: artifact.filename, mime: artifact.mime });
  assert(result.ok, `بررسی ساختاری IFC ناموفق: ${result.checks.filter((c) => !c.passed).map((c) => c.name).join(",")}`);
  assert(result.validationKind === "structural-syntax", "نوع اعتبارسنجی باید ساختاری باشد");
  assert(result.schemaValidation?.performed === false, "اعتبارسنجی اسکیمای رسمی انجام نشده است");
  assert((result.schemaValidation?.note ?? "").includes("ifcopenshell"), "دلیل نبود ابزار باید ذکر شود");
  assert(result.externalSpecRefs?.includes("IFC4-IFCPRODUCTDEFINITIONSHAPE") === true, "ارجاع رسمی بررسی‌شده باید ثبت شود");
  assert(result.advisoryNote.includes("نه انطباق قانونی"), "سلب ادعای انطباق لازم است");
  assert(EXTERNAL_SPEC_REFERENCES.every((r) => r.url.startsWith("https://standards.buildingsmart.org")), "ارجاع بیرونی باید رسمی باشد");
  assert(result.checks.some((c) => c.name === "ifc-product-placement-proposition"), "قاعده صوری IfcProduct باید بررسی شود");

  // Negative: a space with a representation but no placement must be caught.
  const lines = artifact.data.toString("utf8").split("\n");
  const spaceIndex = lines.findIndex((line) => line.includes("=IFCSPACE("));
  assert(spaceIndex >= 0, "خط IfcSpace باید وجود داشته باشد");
  const [prefix, rest] = lines[spaceIndex].split("IFCSPACE(");
  const args = rest.split(",");
  args[5] = "$"; // remove ObjectPlacement but keep the representation
  lines[spaceIndex] = `${prefix}IFCSPACE(${args.join(",")}`;
  const brokenResult = validateExport("ifc", Buffer.from(lines.join("\n"), "utf8"), scheme, report, { filename: "b.ifc", mime: "model/ifc" });
  const propositionCheck = brokenResult.checks.find((c) => c.name === "ifc-product-placement-proposition");
  assert(propositionCheck !== undefined, "بررسی قاعده صوری باید اجرا شود");
  assert(propositionCheck?.passed === false, "جایگاه غایب با وجود نمایش باید نقض تشخیص داده شود");
  return `${result.checks.length} بررسی ساختاری؛ اعتبارسنجی اسکیمای رسمی: انجام‌نشده (ابزار موجود نیست)`;
});

test("accuracy", "خروجی‌ها ادعای مشورتی، مبنای فرمول و منابع بیرونی را حفظ می‌کنند", () => {
  const scheme = FIXTURES.cleanScheme;
  const report = FIXTURES.cleanReport;
  const formats = ["pdf", "csv", "xlsx", "json", "svg", "dxf"] as const;
  for (const format of formats) {
    const artifact = exportScheme(scheme, report, format);
    const result = validateExport(format, artifact.data, scheme, report, { filename: artifact.filename, mime: artifact.mime });
    assert(result.ok, `${format}: ${result.checks.filter((c) => !c.passed).map((c) => c.name).join(",")}`);
    assert(result.advisoryNote.length > 20, `${format}: یادداشت مشورتی لازم است`);
  }
  const json = JSON.parse(exportScheme(scheme, report, "json").data.toString("utf8")) as {
    engineeringBasis: { formulas: { classification: string }[]; advisoryClaim: string; externalSpecReferences: unknown[] };
  };
  assert(json.engineeringBasis.formulas.length >= 10, "مبنای فرمول در JSON لازم است");
  assert(json.engineeringBasis.formulas.some((f) => f.classification === "unverified-code-derived"), "طبقه‌بندی لرزه‌ای باید حفظ شود");
  assert(json.engineeringBasis.advisoryClaim.includes("NOT established"), "ادعای مشورتی لازم است");
  assert(json.engineeringBasis.externalSpecReferences.length === 2, "منابع بیرونی بررسی‌شده لازم است");
  return `۶ قالب با یادداشت مشورتی و مبنای فرمول`;
});

test("accuracy", "مدل نمونه: مساحت‌ها و مقدارهای مستقل با موتور هم‌خوان هستند", () => {
  const analysis = analyzeSite(FIXTURES.site);
  approx(analysis.plotAreaM2, 868, 0.01, "plot area");
  assert(analysis.buildableAreaM2 > 0 && analysis.buildableAreaM2 < analysis.plotAreaM2, "ساخت‌پذیر باید بین صفر و زمین باشد");
  const expectation = STEPS_FOR_TEST;
  assert(expectation.setbackArea === 525.83, `مقدار مرجع سطح ساخت‌پذیر تغییر کرده: ${expectation.setbackArea}`);
  approx(analysis.buildableAreaM2, expectation.setbackArea, 0.15, "buildable area regression");
  return `زمین ${analysis.plotAreaM2} → ساخت‌پذیر ${analysis.buildableAreaM2.toFixed(2)} m²`;
});

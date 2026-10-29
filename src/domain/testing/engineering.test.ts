import { SEISMIC_PARAMS } from "../constants";
import { PIPE_DIAMETERS_MM, TRANSFORMER_SIZES_KVA, nextStandard } from "../units";
import { rectArea } from "../geometry";
import type { CanonicalScheme } from "../types";
import { FIXTURES } from "./fixtures";
import { approx, assert, test } from "./harness";

const schemeOf = (): CanonicalScheme => FIXTURES.cleanScheme;

function largestPlate(scheme: CanonicalScheme) {
  return [...scheme.footprintRects].sort((a, b) => rectArea(a) - rectArea(b))[scheme.footprintRects.length - 1];
}

test("engineering", "زیربنا، سطح اشغال و واحدها با محاسبه مستقیم هم‌خوان‌اند", () => {
  for (const scheme of FIXTURES.schemes) {
    approx(scheme.grossFloorAreaM2, scheme.footprintAreaM2 * scheme.floors, 0.5, `${scheme.code} GFA`);
    approx(scheme.grossFloorAreaM2 / scheme.plotAreaM2, scheme.metrics.find((m) => m.id === "far")!.value, 0.02, `${scheme.code} FAR`);
    approx(scheme.footprintAreaM2 / scheme.plotAreaM2, scheme.metrics.find((m) => m.id === "coverage")!.value / 100, 0.002, `${scheme.code} coverage`);
    assert(scheme.unitsTotal === scheme.unitsPerFloor * scheme.floors, `${scheme.code}: تعداد واحد ≠ واحد در طبقه × طبقات`);
    approx(
      Object.values(scheme.unitMix).reduce((s, n) => s + n, 0),
      scheme.unitsTotal,
      0.001,
      `${scheme.code} unit mix total`,
    );
    approx(scheme.levels[0].plateAreaM2, scheme.footprintAreaM2, 0.5, `${scheme.code} plate area`);
  }
  return `${FIXTURES.schemes.length} طرح با اعداد بازمحاسبه‌شده سازگارند`;
});

test("engineering", "شبکه سازه از ابعاد واقعی بلوک مشتق می‌شود (نه از مساحت)", () => {
  const scheme = schemeOf();
  const plate = largestPlate(scheme);
  const expectedGridX = Math.max(2, Math.round(plate.w / 6) + 1);
  const expectedGridY = Math.max(2, Math.round(plate.h / 6) + 1);
  approx(scheme.structural.gridX, expectedGridX, 0, "gridX from plate width");
  approx(scheme.structural.gridY, expectedGridY, 0, "gridY from plate depth");
  approx(scheme.structural.columns, expectedGridX * expectedGridY, 0, "columns = gridX × gridY");
  approx(scheme.structural.spansX.length, expectedGridX - 1, 0, "span count X");
  approx(scheme.structural.spansX[0], plate.w / (expectedGridX - 1), 0.02, "span length X");
  approx(scheme.structural.spansY[0], plate.h / (expectedGridY - 1), 0.02, "span length Y");
  assert(scheme.structural.spansX[0] < 15, `دهانه ${scheme.structural.spansX[0]} m نامعقول است`);
  return `بلوک ${plate.w.toFixed(1)}×${plate.h.toFixed(1)} → شبکه ${expectedGridX}×${expectedGridY}، دهانه ≈${(plate.w / (expectedGridX - 1)).toFixed(2)} m`;
});

test("engineering", "بار ستون، تیر، سقف و پی با فرمول‌های مستند بازمحاسبه می‌شوند", () => {
  const scheme = schemeOf();
  const s = scheme.structural;
  const tributary = scheme.footprintAreaM2 / s.columns;
  const factored = 1.25 * 6.5 + 1.5 * 2.0;
  approx(s.columnLoadKN, tributary * scheme.floors * factored, 0.5, "Pu = tributary × floors × 11.125 kPa");
  const side = Math.sqrt((s.columnLoadKN * 1000) / (0.35 * 25));
  approx(s.columnSizeMm, Math.max(300, Math.ceil(side / 50) * 50), 0.01, "column side from Ag = Pu/(0.35f'c)");
  const maxSpan = Math.max(s.spansX[0], s.spansY[0]);
  const minSpan = Math.min(s.spansX[0], s.spansY[0]);
  approx(s.beamDepthMm, Math.max(350, Math.ceil((maxSpan * 1000) / 12 / 50) * 50), 0.01, "beam depth L/12");
  approx(s.slabThicknessMm, Math.max(150, Math.ceil((minSpan * 1000) / 35 / 10) * 10), 0.01, "slab L/35");
  const service = tributary * scheme.floors * 8.5;
  approx(s.requiredFoundationWidthM, Number(Math.sqrt((service * 1.1) / scheme.site.soilBearingKPa).toFixed(2)), 0.02, "footing width");
  assert(s.stage === "preliminary-screening", "سازه باید صریحاً مقدماتی اعلام شود");
  return `Pu=${s.columnLoadKN} kN · ستون ${s.columnSizeMm} mm · تیر ${s.beamDepthMm} mm · پی ${s.requiredFoundationWidthM} m`;
});

test("engineering", "ضریب زلزله، وزن لرزه‌ای و برش پایه با ثابت‌های اعلام‌شده", () => {
  for (const scheme of FIXTURES.schemes) {
    const zone = SEISMIC_PARAMS[scheme.site.seismicZone];
    const expectedC = (zone.A * zone.B * zone.I) / zone.R;
    approx(scheme.structural.seismicCoefficient, Number(expectedC.toFixed(4)), 1e-4, `${scheme.code} C`);
    approx(scheme.structural.buildingWeightKN, scheme.grossFloorAreaM2 * (6.5 + 0.2 * 2), 1, `${scheme.code} W = GFA × 6.9 kPa`);
    approx(scheme.structural.seismicBaseShearKN, expectedC * scheme.structural.buildingWeightKN, 1, `${scheme.code} V = C·W`);
    assert(
      scheme.structural.assumptions.some((a) => a.id === "st-zone" && a.basis.includes("تطبیق")),
      "فرض پارامتر لرزه‌ای باید عدم تطبیق با نسخه معتبر را اعلام کند",
    );
  }
  return "C، W و V برای هر ۵ طرح بازمحاسبه شد";
});

test("engineering", "آب، فاضلاب و برق با سرانه‌ها و جداول استاندارد سازگارند", () => {
  const scheme = schemeOf();
  const mep = scheme.mep;
  const perUnit = scheme.requirements.dwellings.filter((d) => d.count > 0);
  const weighted =
    perUnit.reduce((sum, d) => sum + d.count * (d.type === "studio" ? 1.8 : 3.2), 0) /
    perUnit.reduce((sum, d) => sum + d.count, 0);
  const occupancy = Math.ceil(scheme.unitsTotal * weighted);
  approx(mep.occupancy, occupancy, 0, "occupancy");
  const perCapita = scheme.site.climate === "hotDry" ? 160 : scheme.site.climate === "hotHumid" ? 150 : 140;
  approx(mep.waterDailyLiters, occupancy * perCapita, 0, "daily demand");
  approx(mep.waterTankLiters, Math.ceil((mep.waterDailyLiters * 1.2) / 100) * 100, 0, "tank = 1.2 × daily");
  const peak = (mep.waterDailyLiters / 1000 / (8 * 3600)) * 2.5;
  const expectedDiameter = nextStandard(Math.sqrt((4 * peak) / (Math.PI * 1.5)) * 1000, PIPE_DIAMETERS_MM);
  approx(mep.waterMainDiameterMm, expectedDiameter, 0, "water main from Q and v=1.5 m/s");
  assert(PIPE_DIAMETERS_MM.includes(mep.waterMainDiameterMm), "قطر باید از جدول استاندارد باشد");
  assert(mep.sewageMainDiameterMm >= mep.waterMainDiameterMm, "فاضلاب نباید از آب کوچک‌تر باشد");
  assert(TRANSFORMER_SIZES_KVA.includes(mep.transformerKVA), "ظرفیت ترانس باید استاندارد باشد");
  assert(mep.transformerKVA >= mep.electricalDemandKVA, "ترانس باید تقاضا را پوشش دهد");
  assert(mep.stage === "preliminary-screening", "MEP باید مقدماتی اعلام شود");
  return `آب ${mep.waterDailyLiters} L/روز · مخزن ${mep.waterTankLiters} L · لوله ${mep.waterMainDiameterMm} mm · ترانس ${mep.transformerKVA} kVA`;
});

test("engineering", "پارکینگ: نیاز سقف‌گرد و تأمین برآوردی با روش اعلام‌شده", () => {
  for (const scheme of FIXTURES.schemes) {
    const expectedRequired = Math.ceil(
      scheme.unitsTotal * scheme.requirements.parkingPerDwelling + scheme.unitsTotal * scheme.requirements.visitorParkingRatio,
    );
    approx(scheme.parking.requiredStalls, expectedRequired, 0, `${scheme.code} required stalls`);
    assert(scheme.parking.providedStalls >= 0, "تأمین نمی‌تواند منفی باشد");
    assert(scheme.parking.effectiveAreaPerStallM2 > 0, "مساحت مؤثر هر جایگاه لازم است");
    assert(scheme.parking.stage === "preliminary-screening", "پارکینگ باید برآوردی اعلام شود");
    assert(scheme.parking.note.length > 10, "توضیح روش لازم است");
  }
  return `${FIXTURES.schemes.length} طرح؛ فرمول نیاز بازمحاسبه شد`;
});

test("engineering", "گردش و نور روز با محاسبه مستقیم هندسه", () => {
  const scheme = schemeOf();
  const level = scheme.levels[0];
  let expectedMax = 0;
  for (const room of level.rooms) {
    if (!room.habitable) continue;
    const cx = room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length;
    const cy = room.polygon.reduce((s, p) => s + p.y, 0) / room.polygon.length;
    for (const core of level.cores) {
      // Stage-4 fix: the engine now uses the true core rectangle centre; the
      // independent recomputation must mirror that, not the old constant.
      const coreCx = core.rect.x + core.rect.w / 2;
      const coreCy = core.rect.y + core.rect.h / 2;
      expectedMax = Math.max(expectedMax, Math.hypot(cx - coreCx, cy - coreCy) * 1.2);
    }
  }
  approx(scheme.circulation.maxTravelDistanceM, Number(expectedMax.toFixed(1)), 0.15, "travel distance");
  const habitable = scheme.levels.flatMap((l) => l.rooms).filter((r) => r.habitable);
  const mean = habitable.reduce((s, r) => s + r.daylightFactorProxy, 0) / Math.max(1, habitable.length);
  approx(scheme.daylight.averageWindowRatio, Number(mean.toFixed(3)), 0.002, "average glazing ratio");
  assert(habitable.every((r) => r.daylightFactorProxy >= 0 && r.daylightFactorProxy <= 0.6), "شاخص نور خارج از بازه [0,0.6]");
  assert(scheme.daylight.stage === "preliminary-screening", "نور روز باید غربالگری اعلام شود");
  return `فاصله ${scheme.circulation.maxTravelDistanceM} m · میانگین شیشه ${(scheme.daylight.averageWindowRatio * 100).toFixed(1)}٪`;
});

test("engineering", "تحلیل مقدماتی از طراحی نهایی جدا و محدودیت‌ها صریح است", () => {
  for (const scheme of FIXTURES.schemes) {
    assert(scheme.analysisStatus?.level === "preliminary-screening", `${scheme.code}: مرحله تحلیل اعلام نشده`);
    assert(scheme.analysisStatus?.notForConstruction === true, `${scheme.code}: پرچم notForConstruction لازم است`);
    assert(scheme.analysisStatus?.requiresEngineerReview === true, `${scheme.code}: بازبینی مهندس الزامی است`);
    assert((scheme.analysisStatus?.limitations.length ?? 0) >= 4, `${scheme.code}: فهرست محدودیت‌ها کوتاه است`);
    for (const summary of [scheme.structural, scheme.mep, scheme.parking, scheme.circulation, scheme.daylight]) {
      assert(summary.method.length > 20, "هر تحلیل باید روش قابل‌ردیابی داشته باشد");
      assert(summary.stage === "preliminary-screening", "هر تحلیل باید مرحله خود را اعلام کند");
    }
  }
  return "۵ تحلیل × ۵ طرح با مرحله و روش صریح";
});

test("engineering", "شاخص هزینه و معیارها بدون ادعای قیمت قطعی علامت‌گذاری شده‌اند", () => {
  const scheme = schemeOf();
  const cost = scheme.metrics.find((m) => m.id === "costIndex")!;
  assert(cost.unit.includes("شاخص"), "هزینه باید به‌صورت شاخص نسبی باشد، نه مبلغ قطعی");
  assert(scheme.metrics.length >= 20, "معیارها باید کامل باشند");
  assert(scheme.metrics.every((m) => Number.isFinite(m.value)), "همه معیارها باید متناهی باشند");
  assert(
    scheme.assumptions.some((a) => a.confidence === "engineering-judgement"),
    "فرضیات قضاوتی باید علامت‌گذاری شوند",
  );
  return `${scheme.metrics.length} معیار متناهی؛ هزینه به‌صورت شاخص نسبی`;
});

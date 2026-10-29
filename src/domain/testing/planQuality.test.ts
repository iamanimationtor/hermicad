import { analyzeSite, generateSchemes } from "../layout";
import { auditScheme } from "../audit/geometryAudit";
import { validateScheme } from "../codes";
import { polygonInsidePolygon, rectArea, rectToPoly } from "../geometry";
import { DEFAULT_REQUIREMENTS, DEFAULT_SITE, applyRequirementsPatch } from "../requirements";
import { UNIT_NET_FACTOR } from "../constants";
import type { CanonicalScheme, Requirements, SiteModel } from "../types";
import { approx, assert, test } from "./harness";

/**
 * Regression lock for the two parcels that exposed the layout-quality defects
 * (stage B.3): a narrow rectangular parcel and a concave L parcel.
 *
 * All numeric thresholds used here are INTERNAL HERMICAD assumptions
 * (minDimensionFor: 1.9 / 1.6 / 1.2 / 1.0 m, facade ≥ 1.2 m). They are not
 * verified statutory values and are labelled as such in the report.
 */

const programme = (): Requirements =>
  applyRequirementsPatch(DEFAULT_REQUIREMENTS, {
    dwellings: [
      { type: "twoBed", count: 4, targetAreaM2: 80, minAreaM2: 70 },
      { type: "threeBed", count: 2, targetAreaM2: 104, minAreaM2: 90 },
    ],
  });

const PARCEL_17x26: SiteModel = {
  ...DEFAULT_SITE,
  boundary: [
    { x: 0, y: 0 },
    { x: 17, y: 0 },
    { x: 17, y: 26 },
    { x: 0, y: 26 },
  ],
  spotLevels: [],
  setbacks: { north: 3, east: 3, south: 3, west: 3 },
};

const PARCEL_L: SiteModel = {
  ...DEFAULT_SITE,
  boundary: [
    { x: 0, y: 0 },
    { x: 26, y: 0 },
    { x: 26, y: 16 },
    { x: 15, y: 16 },
    { x: 15, y: 28 },
    { x: 0, y: 28 },
  ],
  spotLevels: [],
  setbacks: { north: 3, east: 3, south: 3, west: 3 },
};

const NARROW = (() => {
  const site = PARCEL_17x26;
  const schemes = generateSchemes(site, programme(), { seed: 20260601, variants: 2 });
  const analysis = analyzeSite(site);
  return { site, schemes, analysis };
})();

const CONCAVE = (() => {
  const site = PARCEL_L;
  const schemes = generateSchemes(site, programme(), { seed: 20260601, variants: 2 });
  const analysis = analyzeSite(site);
  return { site, schemes, analysis };
})();

const roomBox = (room: { polygon: { x: number; y: number }[] }) => {
  const xs = room.polygon.map((p) => p.x);
  const ys = room.polygon.map((p) => p.y);
  return {
    w: Number((Math.max(...xs) - Math.min(...xs)).toFixed(2)),
    h: Number((Math.max(...ys) - Math.min(...ys)).toFixed(2)),
  };
};

test("quality", "۱۷×۲۶: الگوی دو نما انتخاب می‌شود و اتاق‌ها ابعاد قابل استفاده دارند", () => {
  assert(NARROW.schemes.length > 0, "زمین ۱۷×۲۶ باید طرح تولید کند");
  const scheme = NARROW.schemes[0];
  const level = scheme.levels[0];
  const layouts = level.unitLayouts ?? [];
  assert(layouts.length > 0, "چیدمان ثبت نشده");
  const dual = layouts.find((layout) => layout.pattern === "dual-aspect");
  assert(!!dual, `الگوی دو نما باید انتخاب شود: ${layouts.map((l) => l.pattern).join(",")}`);
  assert(dual!.feasible, `الگوی دو نما باید قابل قبول باشد، نه ${JSON.stringify(dual!.narrowRooms)}`);

  const habitable = level.rooms.filter((room) => room.unitIndex >= 0 && room.habitable);
  assert(habitable.length >= 3, "حداقل سه فضای قابل سکونت لازم است");
  const rows = habitable.map((room) => {
    const box = roomBox(room);
    assert(
      Math.min(box.w, box.h) >= 1.9 - 1e-6,
      `${room.kind} فقط ${Math.min(box.w, box.h)} m در بعد کوچک دارد (حداقل داخلی ۱٫۹ m)`,
    );
    assert(room.areaM2 >= room.minAreaM2 - 0.6, `${room.kind} ${room.areaM2} m² کمتر از حداقل ${room.minAreaM2}`);
    assert(room.facadeM >= 1.2, `${room.kind} نمای ${room.facadeM} m دارد (حداقل داخلی ۱٫۲ m)`);
    return `${room.kind}=${box.w}×${box.h}/${room.areaM2}m²/f${room.facadeM}`;
  });
  const proportions = (level.planChecks ?? []).find((check) => check.id === "PLAN-ROOM-PROPORTIONS")!;
  assert(proportions.status === "pass", `کنترل تناسب باید pass باشد: ${proportions.value} — ${proportions.reason ?? ""}`);
  return rows.join(" · ");
});

test("quality", "۱۷×۲۶: پنجره معتبر، بدون هم‌پوشانی و با پوشش کامل واحد", () => {
  const scheme = NARROW.schemes[0];
  const audit = auditScheme(scheme);
  const levelAudit = audit.levels[0];
  assert(audit.failed === 0, `بازبینی مستقل نقص دارد: ${levelAudit.findings.filter((f) => f.status === "fail").map((f) => f.id).join(",")}`);
  assert(
    levelAudit.daylight.withValidWindow === levelAudit.daylight.habitable,
    `نورگیری ناقص: ${levelAudit.daylight.withValidWindow}/${levelAudit.daylight.habitable} — ${levelAudit.daylight.rejected.map((r) => r.reason).join(" | ")}`,
  );
  assert(levelAudit.topology.roomOverlapM2 <= 0.05, `هم‌پوشانی ${levelAudit.topology.roomOverlapM2} m²`);
  for (const row of levelAudit.topology.unitCoverage) {
    assert(row.gapM2 <= 0.5, `شکاف واحد ${row.unitIndex}: ${row.gapM2} m²`);
  }
  const integrity = validateScheme(scheme).evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
  assert(integrity.status === "pass", `یکپارچگی ${integrity.status}`);
  const capacity = (scheme.levels[0].planChecks ?? []).find((check) => check.id === "PLAN-GEOMETRY-CAPACITY")!;
  assert(capacity.status !== "fail", `کفایت سطح نباید نامناسب باشد: ${capacity.value}`);
  return `پنجره ${levelAudit.daylight.withValidWindow}/${levelAudit.daylight.habitable} · هم‌پوشانی ${levelAudit.topology.roomOverlapM2} m² · کفایت ${capacity.value}`;
});

test("quality", "L شکل: ناتوانی هندسی با عدد اعلام می‌شود (نه پلان موفق کاذب)", () => {
  assert(CONCAVE.schemes.length > 0, "برای زمین L باید طرح تولید شود تا محدودیت گزارش گردد");
  const scheme = CONCAVE.schemes[0];
  const level = scheme.levels[0];
  const unit = scheme.units[0];
  const program = programme().dwellings.find((d) => d.type === unit.type)!;
  const requiredGross = program.minAreaM2 / UNIT_NET_FACTOR;
  const availableGross = rectArea(unit.rect);

  // The impossibility is arithmetic, not a layout preference.
  assert(
    availableGross < requiredGross,
    `برای L باید کمبود سطح اثبات شود: موجود ${availableGross} در برابر لازم ${requiredGross}`,
  );

  const capacity = (level.planChecks ?? []).find((check) => check.id === "PLAN-GEOMETRY-CAPACITY")!;
  assert(!!capacity, "کنترل کفایت سطح باید وجود داشته باشد");
  assert(capacity.status === "fail", `کفایت سطح باید fail باشد: ${capacity.status}`);
  assert(
    capacity.reason!.includes(requiredGross.toFixed(1)),
    `دلیل باید عدد لازم (${requiredGross.toFixed(1)} m²) را داشته باشد: ${capacity.reason}`,
  );
  assert(capacity.reason!.includes("مقعر"), "دلیل باید محدودیت روش محافظه‌کارانه زمین مقعر را ذکر کند");

  const unitFit = (level.planChecks ?? []).find((check) => check.id === "PLAN-UNIT-FIT")!;
  assert(unitFit.status !== "pass", "هیچ واحدی نباید «قابل قبول» اعلام شود");
  const layouts = level.unitLayouts ?? [];
  assert(layouts.every((layout) => !layout.feasible), "همه الگوها باید غیرقابل قبول باشند");
  assert(layouts.every((layout) => layout.notes.length > 0), "هر الگو باید دلیل داشته باشد");

  // The existing rule engine must also report the statutory-minimum shortfall
  // relative to the *project* minimum (not a claimed code value).
  const report = validateScheme(scheme);
  const minDwelling = report.evaluations.find((e) => e.ruleId === "CODE-04-MIN-DWELLING")!;
  assert(minDwelling.status === "fail", `قاعده حداقل زیربنا باید نقض شود: ${minDwelling.status}`);
  return `موجود ${availableGross.toFixed(1)} m² < لازم ${requiredGross.toFixed(1)} m² · کفایت=${capacity.status} · قاعده حداقل=${minDwelling.status}`;
});

test("quality", "L شکل: محدودیت روش محافظه‌کارانه و سطح واقعی زمین گزارش می‌شود", () => {
  const analysis = CONCAVE.analysis;
  approx(analysis.plotAreaM2, 596, 1, "L parcel area");
  approx(analysis.buildableAreaM2, 85.3, 0.5, "conservative buildable kernel");
  assert(!analysis.convexParcel, "زمین L باید مقعر تشخیص داده شود");
  assert(!analysis.approximation.exact, "روش باید غیردقیق اعلام شود");
  const ratio = analysis.buildableAreaM2 / analysis.plotAreaM2;
  assert(ratio < 0.2, `نسبت ساخت‌پذیر باید کوچک باشد: ${(ratio * 100).toFixed(1)}%`);
  for (const level of CONCAVE.schemes[0].levels) {
    for (const plate of level.plateRects) {
      assert(
        polygonInsidePolygon(rectToPoly(plate), analysis.buildablePolygon, 0.02),
        "بلوک باید داخل همین محدوده محافظه‌کارانه بماند",
      );
    }
  }
  return `زمین ${analysis.plotAreaM2.toFixed(0)} m² → ساخت‌پذیر محافظه‌کارانه ${analysis.buildableAreaM2.toFixed(1)} m² (${(ratio * 100).toFixed(1)}٪)`;
});

test("quality", "همه الگوهای هر دو زمین از نظر ابعاد و نما حسابرسی می‌شوند", () => {
  const rows: string[] = [];
  for (const [name, data] of [["17x26", NARROW], ["L", CONCAVE]] as const) {
    for (const scheme of data.schemes.slice(0, 1)) {
      const level = scheme.levels[0];
      for (const layout of level.unitLayouts ?? []) {
        assert(layout.alternatives.length >= 2, `${name}: جایگزین‌ها ثبت نشده‌اند`);
        for (const alt of layout.alternatives) {
          if (!alt.feasible) assert(alt.reason.length > 3, `${name}/${alt.patternId}: دلیل رد خالی است`);
          rows.push(`${name}:${alt.patternId}(${alt.feasible ? "ok" : "rejected"})`);
        }
      }
    }
  }
  assert(rows.length >= 6, `تعداد الگوهای حسابرسی‌شده کم است: ${rows.length}`);
  return rows.join(" · ");
});

test("quality", "آستانه‌های کیفیت به‌عنوان معیار داخلی برچسب خورده‌اند", () => {
  const checks = NARROW.schemes[0].levels[0].planChecks ?? [];
  const proportions = checks.find((c) => c.id === "PLAN-ROOM-PROPORTIONS")!;
  const capacity = checks.find((c) => c.id === "PLAN-GEOMETRY-CAPACITY")!;
  assert(proportions.requirement.includes("معیار داخلی"), "کنترل تناسب باید معیار داخلی را ذکر کند");
  assert(capacity.requirement.includes("معیار داخلی"), "کنترل کفایت باید معیار داخلی را ذکر کند");
  assert(!/مبحث|ضابطه رسمی تأییدشده|کد ملی/.test(proportions.requirement), "نباید ادعای ضابطه رسمی شود");
  return "برچسب «معیار داخلی» روی هر دو کنترل کیفیت";
});

void (null as unknown as CanonicalScheme);

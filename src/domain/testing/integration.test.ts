import { analyzeSite, DomainError, generateSchemes } from "../layout";
import { validateScheme } from "../codes";
import { repairScheme } from "../repair";
import { polygonInsidePolygon, rectArea, rectToPoly, polygonArea } from "../geometry";
import { validateRequirements, applyRequirementsPatch, DEFAULT_REQUIREMENTS } from "../requirements";
import type { CanonicalScheme } from "../types";
import { BOWTIE_SITE, CONCAVE_SITE, FIXTURES, NARROW_SITE } from "./fixtures";
import { approx, assert, test } from "./harness";

const clone = (scheme: CanonicalScheme): CanonicalScheme => JSON.parse(JSON.stringify(scheme)) as CanonicalScheme;

test("integration", "تولید قطعی است و راهبردها هندسه متفاوت می‌سازند", () => {
  const again = generateSchemes(FIXTURES.site, FIXTURES.requirements, {
    seed: FIXTURES.seed,
    variants: 5,
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  const fingerprint = (list: CanonicalScheme[]) =>
    list
      .map((s) => `${s.strategy}:${s.floors}:${s.unitsTotal}:${s.footprintAreaM2.toFixed(1)}:${s.grossFloorAreaM2.toFixed(1)}`)
      .join("|");
  assert(fingerprint(again) === fingerprint(FIXTURES.schemes), "همان seed باید همان طرح‌ها را بدهد");
  const differentSeedFull = generateSchemes(FIXTURES.site, FIXTURES.requirements, { seed: FIXTURES.seed + 1, variants: 5 });
  // With all five strategies the selected set is identical; only order/labels
  // may rotate. The seed's documented effect is on selection, tested below.
  const subsetA = generateSchemes(FIXTURES.site, FIXTURES.requirements, { seed: 20260101, variants: 3 }).map((s) => s.strategy);
  const subsetB = generateSchemes(FIXTURES.site, FIXTURES.requirements, { seed: 20260102, variants: 3 }).map((s) => s.strategy);
  assert(subsetA.join("|") !== subsetB.join("|"), `seed باید انتخاب راهبرد را تغییر دهد: ${subsetA.join(",")} vs ${subsetB.join(",")}`);
  assert(
    generateSchemes(FIXTURES.site, FIXTURES.requirements, { seed: 20260101, variants: 3 }).map((s) => s.code).join("|") ===
      FIXTURES.schemes.slice(0, 3).map((s) => s.code).join("|"),
    "همان seed و همان تعداد باید همان کدها را بدهد",
  );
  assert(differentSeedFull.length === 5, "پنج راهبرد باید تولید شود");
  const geometries = new Set(FIXTURES.schemes.map((s) => s.footprintRects.map((r) => `${r.w.toFixed(2)}x${r.h.toFixed(2)}`).join("|")));
  assert(geometries.size >= 2, "راهبردها باید هندسه‌های متفاوت تولید کنند");
  return `${FIXTURES.schemes.length} طرح، ${geometries.size} هندسه، seed انتخاب راهبرد را می‌چرخاند`;
});

test("integration", "زنجیره استقرار: اتاق ⊆ واحد ⊆ بلوک ⊆ محدوده ساخت‌پذیر", () => {
  for (const scheme of FIXTURES.schemes) {
    assert(scheme.buildablePolygon.length >= 3, `${scheme.code}: محدوده ساخت‌پذیر نامعتبر`);
    for (const rect of scheme.footprintRects) {
      assert(
        polygonInsidePolygon(rectToPoly(rect), scheme.buildablePolygon, 0.02),
        `${scheme.code}: بلوک بیرون از محدوده ساخت‌پذیر`,
      );
      assert(polygonInsidePolygon(rectToPoly(rect), scheme.site.boundary, 0.02), `${scheme.code}: بلوک بیرون از زمین`);
    }
    for (const unit of scheme.units) {
      assert(
        scheme.footprintRects.some((rect) => polygonInsidePolygon(rectToPoly(unit.rect), rectToPoly(rect), 0.02)),
        `${scheme.code}: واحد ${unit.label} بیرون از بلوک`,
      );
    }
    for (const level of scheme.levels) {
      for (const room of level.rooms) {
        const insidePlate = level.plateRects.some((rect) => polygonInsidePolygon(room.polygon, rectToPoly(rect), 0.02));
        assert(insidePlate, `${scheme.code}: فضای ${room.id} بیرون از سطح طبقه`);
        assert(room.areaM2 > 0, `${scheme.code}: فضای ${room.id} مساحت نامعتبر`);
        approx(polygonArea(room.polygon), room.areaM2, 0.06, `${scheme.code}:${room.id} area`);
      }
    }
  }
  return "همه طرح‌ها از نظر استقرار هندسی سازگارند";
});

test("integration", "فضاهای هر واحد کل مستطیل واحد را بدون همپوشانی پر می‌کنند", () => {
  for (const scheme of FIXTURES.schemes) {
    for (const unit of FIXTURES.schemes.length ? scheme.units.slice(0, 4) : []) {
      const rooms = scheme.levels[0].rooms.filter((r) => r.unitIndex === unit.index);
      const sum = rooms.reduce((s, r) => s + r.areaM2, 0);
      approx(sum, rectArea(unit.rect), Math.max(0.6, rectArea(unit.rect) * 0.02), `${scheme.code} ${unit.label} area tiling`);
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const a = bounds(rooms[i].polygon);
          const b = bounds(rooms[j].polygon);
          const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          const overlap = w > 0 && h > 0 ? w * h : 0;
          assert(overlap < 0.02, `${scheme.code}: همپوشانی ${overlap.toFixed(3)} m² بین ${rooms[i].id} و ${rooms[j].id}`);
        }
      }
    }
  }
  return "تایل‌بندی فضاها بدون همپوشانی و کامل";
});

test("integration", "تعداد طبقات، واحدها و مساحت خالص با هم هم‌خوان‌اند", () => {
  for (const scheme of FIXTURES.schemes) {
    approx(scheme.levels.length, scheme.floors, 0, `${scheme.code}: levels = floors`);
    for (const level of scheme.levels) {
      const roomSum = level.rooms.filter((r) => r.unitIndex >= 0).reduce((s, r) => s + r.areaM2, 0);
      approx(level.netAreaM2, roomSum, 0.6, `${scheme.code}: ${level.name} net area`);
      assert(level.netAreaM2 < level.plateAreaM2, `${scheme.code}: خالص باید کمتر از سطح طبقه باشد`);
    }
    const netTotal = scheme.levels.reduce((s, l) => s + l.netAreaM2, 0);
    approx(scheme.netAreaM2, netTotal * 0.88, Math.max(1, netTotal * 0.01), `${scheme.code}: total net`);
    assert(scheme.units.length === scheme.unitsPerFloor, `${scheme.code}: واحدهای طبقه نمونه ناقص است`);
  }
  return "۵ طرح؛ مساحت‌ها و شمارش‌ها سازگار";
});

test("integration", "زمین باریک به‌جای تولید پلان بی‌معنا صریحاً رد می‌شود", () => {
  const analysis = analyzeSite(NARROW_SITE);
  // 8 m parcel − 2×(3 m requested + 0.125 m half wall) = 1.75 m centreline strip
  approx(analysis.buildableAreaM2, (8 - 2 * 3.125) * (40 - 2 * 3.125), 0.5, "narrow centreline strip");
  assert(!analysis.viable, "زمین ۲ متری باید غیرقابل ساخت اعلام شود");
  assert(analysis.viabilityErrors.length > 0, "دلیل رد باید ثبت شود");
  let thrown: DomainError | null = null;
  try {
    generateSchemes(NARROW_SITE, FIXTURES.requirements, { seed: 1, variants: 1 });
  } catch (error) {
    thrown = error as DomainError;
  }
  assert(!!thrown && thrown instanceof DomainError, "تولید باید DomainError بدهد");
  assert(thrown!.detail.some((d) => d.includes("عرض")), `پیام باید به عرض اشاره کند: ${thrown!.detail.join(" | ")}`);
  return thrown!.detail[0] ?? "رد شد";
});

test("integration", "ورودی‌های نامعتبر (خودمتقاطع، کوچک، نیازمندی غلط) رد می‌شوند", () => {
  const bowtie = analyzeSite(BOWTIE_SITE);
  assert(!bowtie.boundarySimple, "مرز خودمتقاطع باید تشخیص داده شود");
  assert(bowtie.buildableAreaM2 === 0, "برای مرز نامعتبر نباید سطح ساخت‌پذیر محاسبه شود");
  const tiny = analyzeSite({
    ...NARROW_SITE,
    boundary: [
      { x: 0, y: 0 },
      { x: 1.5, y: 0 },
      { x: 0, y: 1.5 },
    ],
  });
  assert(tiny.boundarySimple, "مثلث کوچک از نظر هندسی ساده است");
  assert(!tiny.viable, "مثلث ۱.۱ m² نباید قابل ساخت باشد");
  const badRequirements = applyRequirementsPatch(DEFAULT_REQUIREMENTS, { floorsMax: 0, farMax: -2 });
  assert(!validateRequirements(badRequirements).ok, "نیازمندی نامعتبر باید رد شود");
  let threw = false;
  try {
    generateSchemes(BOWTIE_SITE, FIXTURES.requirements, { seed: 2, variants: 1 });
  } catch {
    threw = true;
  }
  assert(threw, "تولید روی مرز خودمتقاطع باید متوقف شود");
  return "سه سناریوی خطا به‌درستی رد شدند";
});

test("integration", "اصلاح خودکار فقط اقدامات مجاز و قابل‌ردیابی انجام می‌دهد", () => {
  const allowedRules = new Set([
    "CODE-04-FAR",
    "CODE-04-ROOM-MIN",
    "NBR-21-PARKING",
    "CODE-04-UNIT-SUPPLY",
    "STRUCT-02-FOUNDATION",
    "FIRE-03-EXITS",
    "NBR-15-DAYLIGHT",
    // Geometry containment can never be repaired by a parameter tweak; the
    // entry exists so the limitation is recorded instead of silently dropped.
    "SITE-GEOM-01",
  ]);
  const original = clone(FIXTURES.stressScheme);
  const outcome = FIXTURES.stressRepair;
  assert(outcome.actions.length > 0, "فهرست اقدامات باید پر شود");
  for (const action of outcome.actions) {
    assert(allowedRules.has(action.ruleId), `اقدام خارج از فهرست مجاز: ${action.ruleId}`);
    assert(action.detail.length > 10, "هر اقدام باید جزئیات ردیابی داشته باشد");
    assert(typeof action.applied === "boolean", "وضعیت اعمال باید صریح باشد");
  }
  assert(outcome.actions.some((a) => a.applied), "حداقل یک اقدام باید اعمال شود");
  // Actions that cannot be executed must never be hidden. When unresolved
  // issues remain after the loop, at least one non-applied action has to be
  // recorded with its reason; if everything was fixable, an empty "not applied"
  // list is the honest outcome (asserting the opposite would be a false claim).
  const remaining = outcome.after.evaluations.filter((e) => e.status === "fail");
  if (remaining.length > 0) {
    assert(
      outcome.actions.some((a) => !a.applied),
      `با وجود ${remaining.length} نقض باقیمانده، اقدام غیرقابل‌اجرا باید ثبت شود`,
    );
  }
  for (const action of outcome.actions.filter((a) => !a.applied)) {
    assert(action.detail.length > 20, "اقدام اعمال‌نشده باید دلیل صریح داشته باشد");
  }
  assert(outcome.after.failed <= outcome.before.failed, "اصلاح نباید نقض‌ها را افزایش دهد");
  assert(outcome.after.evaluations.length === outcome.before.evaluations.length, "گزارش پس از اصلاح باید کامل بازتولید شود");
  approx(FIXTURES.stressScheme.unitsTotal, original.unitsTotal, 0, "طرح اصلی نباید mutate شود");
  return `${outcome.actions.filter((a) => a.applied).length} اعمال‌شده / ${outcome.actions.filter((a) => !a.applied).length} غیرقابل‌اجرا؛ نقض ${outcome.before.failed} → ${outcome.after.failed}`;
});

test("integration", "طرح اصلاح‌شده دوباره اعتبارسنجی و یکپارچگی آن حفظ می‌شود", () => {
  const repaired = FIXTURES.stressRepair.scheme;
  const report = validateScheme(repaired);
  const integrity = report.evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
  assert(integrity.status === "pass", `یکپارچگی پس از اصلاح نقض شد: ${integrity.trace.join(" | ")}`);
  assert(repaired.analysisStatus?.level === "preliminary-screening", "وضعیت تحلیل باید حفظ شود");
  assert(repaired.assumptions.length > 5, "فرضیات باید حفظ شوند");
  assert(repaired.trace.length >= 8, "ردیابی تصمیم‌ها باید حفظ شود");
  for (const rect of repaired.footprintRects) {
    assert(
      polygonInsidePolygon(rectToPoly(rect), repaired.buildablePolygon, 0.02),
      "اصلاح نباید بلوک را از محدوده مجاز خارج کند",
    );
  }
  return `اصلاح ${FIXTURES.stressRepair.iterations} تکرار؛ یکپارچگی و استقرار حفظ شد`;
});

test("integration", "تحلیل زمین داده ورودی را تغییر نمی‌دهد و محدودیت‌ها را اعلام می‌کند", () => {
  const before = JSON.stringify(FIXTURES.site);
  const analysis = analyzeSite(FIXTURES.site);
  assert(JSON.stringify(FIXTURES.site) === before, "analyzeSite نباید ورودی را mutate کند");
  const concave = analyzeSite(CONCAVE_SITE);
  assert(!concave.approximation.exact, "زمین مقعر باید غیردقیق اعلام شود");
  assert(concave.warnings.some((w) => w.includes("محافظه‌کارانه")), "پیام محدودیت باید در هشدارها باشد");
  assert(analysis.effectiveSetbacks.length === analysis.boundary.length, "گزارش عقب‌نشینی هر ضلع لازم است");
  return `مقعر: ${concave.buildableAreaM2.toFixed(1)} m² (محافظه‌کارانه) · محدب: دقیق`;
});

test("integration", "هندسه مدل در اجرای مجدد پایدار است (بدون تغییر پنهان)", () => {
  const a = analyzeSite(FIXTURES.site);
  const b = analyzeSite(FIXTURES.site);
  assert(JSON.stringify(a) === JSON.stringify(b), "تحلیل زمین باید قطعی باشد");
  const scheme = FIXTURES.schemes[0];
  const reportA = validateScheme(scheme);
  const reportB = validateScheme(clone(scheme));
  const statuses = (r: typeof reportA) => r.evaluations.map((e) => `${e.ruleId}:${e.status}`).join("|");
  assert(statuses(reportA) === statuses(reportB), "اعتبارسنجی باید قطعی باشد");
  return "تحلیل و اعتبارسنجی تکرارپذیرند";
});

function bounds(poly: { x: number; y: number }[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

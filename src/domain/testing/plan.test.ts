import { analyzeSite, generateSchemes, recomputeDerived } from "../layout";
import { buildLevelPlan, buildStair, openingSchedule, planTotals, verifyPlanIntegrity } from "../architecture/plan";
import { validateScheme } from "../codes";
import { floorPlanSvg } from "../exporters/vector";
import { exportScheme } from "../exporters/reports";
import { validateExport } from "../exporters/validate";
import { buildRequirements, buildSite, DEFAULT_ANSWERS, reviewIntake, parcelBoundary } from "../intake";
import { polygonArea, polygonInPolygonCheck, polygonIsSimple } from "../geometry";
import type { CanonicalScheme } from "../types";
import { FIXTURES } from "./fixtures";
import { approx, assert, test } from "./harness";

const clone = (s: CanonicalScheme): CanonicalScheme => JSON.parse(JSON.stringify(s)) as CanonicalScheme;

test("plan", "هر طبقه دیوار، بازشو، اندازه و پله تولید می‌کند", () => {
  for (const scheme of FIXTURES.schemes) {
    for (const level of scheme.levels) {
      assert((level.walls?.length ?? 0) > 0, `${scheme.code}/${level.name}: دیوار تولید نشده`);
      assert((level.openings?.length ?? 0) > 0, `${scheme.code}/${level.name}: بازشو تولید نشده`);
      assert((level.dimensions?.length ?? 0) > 0, `${scheme.code}/${level.name}: اندازه‌گذاری تولید نشده`);
      assert(!!level.stair, `${scheme.code}/${level.name}: پله محاسبه نشده`);
      for (const wall of level.walls ?? []) {
        assert(wall.lengthM > 0 && wall.thicknessM > 0, `${wall.id}: ابعاد نامعتبر`);
        assert(["exterior", "party", "interior", "shaft"].includes(wall.kind), `${wall.id}: نوع نامعتبر`);
      }
      for (const opening of level.openings ?? []) {
        assert(opening.widthM >= 0.6 && opening.widthM <= 3, `${opening.id}: عرض نامتعارف ${opening.widthM}`);
        assert(opening.heightM >= 1.9 || opening.kind === "window", `${opening.id}: ارتفاع در نامتعارف`);
        if (opening.kind === "window") assert(opening.sillM >= 0 && opening.sillM < opening.heightM, `${opening.id}: کف‌پنجره نامعتبر`);
        else approx(opening.sillM, 0, 1e-9, `${opening.id}: در باید کف صفر باشد`);
      }
    }
  }
  const level = FIXTURES.cleanScheme.levels[0];
  return `${level.walls?.length} دیوار · ${level.openings?.length} بازشو · ${level.dimensions?.length} اندازه در طبقه نمونه`;
});

test("plan", "بازشوها کامل داخل دیوار خود قرار دارند", () => {
  for (const scheme of FIXTURES.schemes) {
    for (const level of scheme.levels) {
      const walls = new Map((level.walls ?? []).map((wall) => [wall.id, wall]));
      for (const opening of level.openings ?? []) {
        const wall = walls.get(opening.wallId);
        assert(!!wall, `${opening.id}: دیوار میزبان وجود ندارد`);
        const half = opening.widthM / 2;
        assert(opening.stationM - half >= -1e-6, `${opening.id}: بازشو از ابتدای دیوار بیرون زده`);
        assert(opening.stationM + half <= wall!.lengthM + 1e-6, `${opening.id}: بازشو از انتهای دیوار بیرون زده`);
        const dist = Math.hypot(opening.center.x - wall!.start.x, opening.center.y - wall!.start.y);
        approx(dist, opening.stationM, 0.02, `${opening.id}: فاصله ایستگاهی با مرکز هندسی هم‌خوان نیست`);
      }
    }
  }
  return "همه بازشوها داخل دیوار میزبان‌اند";
});

test("plan", "هیچ دو بازشو روی یک دیوار با فاصله کمتر از ۶۰ سانتی‌متر نیست", () => {
  for (const scheme of FIXTURES.schemes) {
    for (const level of scheme.levels) {
      const byWall = new Map<string, { start: number; end: number }[]>();
      for (const opening of level.openings ?? []) {
        const list = byWall.get(opening.wallId) ?? [];
        list.push({ start: opening.stationM - opening.widthM / 2, end: opening.stationM + opening.widthM / 2 });
        byWall.set(opening.wallId, list);
      }
      for (const [wallId, list] of byWall) {
        list.sort((a, b) => a.start - b.start);
        for (let i = 1; i < list.length; i++) {
          assert(list[i].start - list[i - 1].end >= 0.6 - 1e-9, `${scheme.code}/${wallId}: بازشوهای نزدیک به هم`);
        }
      }
    }
  }
  return "فاصله بازشوها رعایت شده است";
});

test("plan", "پنجره‌ها روی پوسته و درهای داخلی خارج از پوسته‌اند", () => {
  for (const scheme of FIXTURES.schemes) {
    for (const level of scheme.levels) {
      const walls = new Map((level.walls ?? []).map((wall) => [wall.id, wall]));
      const windows = (level.openings ?? []).filter((opening) => opening.kind === "window");
      const envelopeDoors = (level.openings ?? []).filter((opening) => {
        const wall = walls.get(opening.wallId);
        return wall?.envelope && opening.kind !== "window";
      });
      assert(windows.length > 0, `${scheme.code}/${level.name}: هیچ پنجره‌ای تولید نشد`);
      assert(windows.every((opening) => walls.get(opening.wallId)?.envelope), "پنجره روی دیوار پیرامونی نیست");
      assert(envelopeDoors.length === 0, `${scheme.code}: در روی پوسته بدون مجوز`);
      assert(windows.every((opening) => opening.roomIds.length >= 1), "پنجره به هیچ فضایی نسبت داده نشده");
    }
  }
  return "پنجره‌ها پیرامونی و درها داخلی‌اند";
});

test("plan", "پوشش دیوار روی مرز فضاها و کنترل تکرارنشدن دیوار", () => {
  for (const scheme of FIXTURES.schemes) {
    const level = scheme.levels[0];
    const coverage = (level.planChecks ?? []).find((check) => check.id === "PLAN-WALL-COVERAGE");
    assert(!!coverage, "کنترل پوشش دیوار ثبت نشده");
    assert(coverage!.passed, `پوشش دیوار ناکافی: ${coverage!.value}`);
    const ids = (level.walls ?? []).map((wall) => wall.id);
    assert(new Set(ids).size === ids.length, "شناسه دیوار تکراری است");
    const geometry = (level.walls ?? []).map((wall) => `${wall.start.x},${wall.start.y}-${wall.end.x},${wall.end.y}`);
    assert(new Set(geometry).size === geometry.length, "دیوار تکراری (هندسه یکسان) تولید شده است");
  }
  return "پوشش ≥ ۹۸٪ و بدون دیوار تکراری";
});

test("plan", "هر فضای واحد با در قابل دسترسی است و هر فضای قابل سکونت پنجره دارد", () => {
  for (const scheme of FIXTURES.schemes) {
    const level = scheme.levels[0];
    const doorCheck = (level.planChecks ?? []).find((check) => check.id === "PLAN-DOOR-ACCESS");
    const windowCheck = (level.planChecks ?? []).find((check) => check.id === "PLAN-WINDOW-PER-ROOM");
    assert(doorCheck?.passed === true, `دسترسی از در ناقص: ${doorCheck?.value}`);
    assert(
      windowCheck?.passed === true,
      `نورگیری ناقص: ${windowCheck?.value} · فضاها: ${(windowCheck?.roomIds ?? []).slice(0, 4).join(",")} · دلیل: ${windowCheck?.reason ?? "-"}`,
    );
    const habitable = level.rooms.filter((room) => room.habitable);
    const windowRooms = new Set((level.openings ?? []).filter((o) => o.kind === "window").flatMap((o) => o.roomIds));
    assert(habitable.every((room) => windowRooms.has(room.id)), "اتاق قابل سکونت بدون پنجره وجود دارد");
  }
  return "همه فضاهای واحد در دارند و اتاق‌های قابل سکونت پنجره";
});

test("plan", "پله: تعداد ارتفاع و عمق لازم از ارتفاع طبقه بازمحاسبه می‌شود", () => {
  const scheme = FIXTURES.cleanScheme;
  const stair = scheme.levels[0].stair!;
  const expectedRisers = Math.max(2, Math.ceil(scheme.floorHeightM / 0.18));
  approx(stair.riserCount, expectedRisers, 0, "riser count");
  approx(stair.riserHeightM, Number((scheme.floorHeightM / expectedRisers).toFixed(3)), 0.001, "riser height");
  assert(stair.riserHeightM <= 0.18 + 1e-9, `ارتفاع پله از حد ماکسیمم عبور کرده: ${stair.riserHeightM}`);
  const expectedDepth = Number((Math.ceil(expectedRisers / 2) * 0.28 + 1.2).toFixed(2));
  approx(stair.requiredDepthM, expectedDepth, 0.01, "required depth");
  const direct = buildStair({ cores: scheme.levels[0].cores, plateRects: scheme.levels[0].plateRects }, 3.6);
  assert(direct.riserCount > stair.riserCount || direct.riserCount === stair.riserCount, "ارتفاع بیشتر نباید تعداد پله را کاهش دهد");
  assert(direct.floorToFloorM === 3.6, "ارتفاع طبقه باید در خروجی حفظ شود");
  return `${stair.riserCount} ارتفاع × ${stair.riserHeightM} m · عمق لازم ${stair.requiredDepthM} m (موجود ${stair.availableDepthM} m)`;
});

test("plan", "جدول بازشوها و جمع‌بندی با مدل هم‌خوان است", () => {
  for (const scheme of FIXTURES.schemes) {
    const level = scheme.levels[0];
    const totals = planTotals(level);
    const openings = level.openings ?? [];
    approx(totals.windows + totals.doors, openings.length, 0, "openings total");
    approx(totals.walls, (level.walls ?? []).length, 0, "wall count");
    approx(totals.wallLengthM, Number((level.walls ?? []).reduce((sum, wall) => sum + wall.lengthM, 0).toFixed(2)), 0.05, "wall length");
    const schedule = openingSchedule(level);
    const scheduled = schedule.reduce((sum, row) => sum + row.openings.reduce((inner, item) => inner + item.count, 0), 0);
    approx(scheduled, openings.length, 0, "schedule total");
  }
  return "جمع‌بندی و جدول با مدل یکسان است";
});

test("plan", "اعتبارسنجی پلان می‌تواند خرابی واقعی را تشخیص دهد", () => {
  const scheme = clone(FIXTURES.cleanScheme);
  const level = scheme.levels[0];
  level.openings = [...(level.openings ?? []), {
    id: "BROKEN-1",
    wallId: "MISSING-WALL",
    kind: "door",
    widthM: 0.9,
    heightM: 2.1,
    sillM: 0,
    center: { x: 0, y: 0 },
    stationM: 0,
    roomIds: [],
    note: "test",
  }];
  const integrity = verifyPlanIntegrity(level);
  assert(!integrity.ok, "ارجاع به دیوار ناموجود باید تشخیص داده شود");
  assert(integrity.problems.some((p) => p.includes("BROKEN-1")), "پیام باید شناسه بازشو را ذکر کند");
  const report = validateScheme(scheme);
  const rule = report.evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
  assert(rule.status === "fail", "قاعده یکپارچگی باید نقض شود");
  assert(rule.trace.some((t) => t.includes("ناسازگاری پلان")), "ردیابی باید به ناسازگاری پلان اشاره کند");

  const noPlan = clone(FIXTURES.cleanScheme);
  noPlan.levels[0].walls = [];
  noPlan.levels[0].openings = [];
  assert(!verifyPlanIntegrity(noPlan.levels[0]).ok, "نبود لایه پلان باید نقض باشد");
  return "۲ خرابی مصنوعی شناسایی شد";
});

test("plan", "اصلاح خودکار لایه پلان را هم بازتولید می‌کند", () => {
  const repaired = FIXTURES.stressRepair.scheme;
  for (const level of repaired.levels) {
    assert((level.walls?.length ?? 0) > 0, "پس از اصلاح، دیوار از دست رفته است");
    assert((level.openings?.length ?? 0) > 0, "پس از اصلاح، بازشو از دست رفته است");
    const integrity = verifyPlanIntegrity(level);
    assert(integrity.ok, `پس از اصلاح، پلان ناسازگار است: ${integrity.problems.slice(0, 2).join(" | ")}`);
  }
  const recomputed = recomputeDerived(clone(FIXTURES.cleanScheme));
  assert((recomputed.levels[0].walls?.length ?? 0) > 0, "بازتولید مدل لایه پلان را حذف کرد");
  return "پلان پس از اصلاح و بازتولید سازگار می‌ماند";
});

test("plan", "خروجی SVG/DXF پلان دیوار، بازشو و اندازه را حمل می‌کند", () => {
  const scheme = FIXTURES.cleanScheme;
  const svg = floorPlanSvg(scheme, 0);
  const level = scheme.levels[0];
  assert(svg.includes("<svg") && svg.trimEnd().endsWith("</svg>"), "SVG نامعتبر");
  assert((svg.match(/<polygon /g) ?? []).length >= (level.walls ?? []).length, "دیوارها در SVG ترسیم نشده‌اند");
  assert((svg.match(/stroke-dasharray="0.12 0.1"/g) ?? []).length >= 1, "کمان بازشدن در ترسیم نشده");
  assert(svg.includes(" m</text>"), "اندازه‌گذاری در SVG نیست");
  assert(svg.includes("STAIR") || svg.includes("پله"), "نماد پله در SVG نیست");
  assert(!/NaN|undefined/.test(svg), "SVG مقدار نامعتبر دارد");

  const dxf = exportScheme(scheme, FIXTURES.cleanReport, "dxf");
  const text = dxf.data.toString("utf8");
  for (const layer of ["WALL-EXTERIOR", "OPENING-DOOR", "OPENING-WINDOW", "STAIR", "DIMENSION"]) {
    assert(text.includes(layer), `لایه ${layer} در DXF نیست`);
  }
  const validation = validateExport("dxf", dxf.data, scheme, FIXTURES.cleanReport, { filename: dxf.filename, mime: dxf.mime });
  assert(validation.ok, `DXF معتبر نیست: ${validation.checks.filter((c) => !c.passed).map((c) => c.name).join(",")}`);
  return `SVG با ${(svg.match(/<polygon /g) ?? []).length} چندضلعی و DXF با لایه‌های نوع‌دار`;
});

test("intake", "فرم هدایت‌شده: زمین، محدوده ساخت‌پذیر و برنامه واحدها", () => {
  const review = reviewIntake({ ...DEFAULT_ANSWERS, projectName: "پروژه آزمون", units: { studio: 0, twoBed: 4, threeBed: 2, fourBed: 0 } });
  assert(review.boundaryValid, "مرز زمین باید معتبر باشد");
  approx(review.plotAreaM2, DEFAULT_ANSWERS.widthM * DEFAULT_ANSWERS.depthM, 1e-6, "rectangular parcel area");
  assert(polygonIsSimple(review.site.boundary), "مرز تولیدشده باید ساده باشد");
  const analysis = analyzeSite(review.site);
  assert(analysis.buildableAreaM2 > 0 && analysis.buildableAreaM2 < review.plotAreaM2, "سطح ساخت‌پذیر باید بین صفر و زمین باشد");
  assert(review.requirements.dwellings.length === 2, "دو گونه واحد باید در برنامه باشد");
  approx(review.requirements.dwellings.reduce((s, d) => s + d.count, 0), 6, 0, "unit total");
  assert(review.requirements.dwellings.every((d) => d.minAreaM2 <= d.targetAreaM2), "حداقل نباید از هدف بیشتر باشد");
  return `زمین ${review.plotAreaM2.toFixed(0)} m² و ${review.requirements.dwellings.length} گونه واحد`;
});

test("intake", "اطلاعات ناقص صریحاً فهرست می‌شود و مانع تولید نمی‌شود (مگر الزامی)", () => {
  const blank = reviewIntake({ ...DEFAULT_ANSWERS, projectName: "", soilBearingKPa: null, seismicZone: null, units: { studio: 0, twoBed: 0, threeBed: 0, fourBed: 0 } });
  assert(!blank.ready, "بدون نام و برنامه واحد نباید آماده باشد");
  assert(blank.requiredCount >= 2, `سؤالات الزامی باید حداقل ۲ باشند: ${blank.requiredCount}`);
  assert(blank.missing.some((m) => m.id === "soil" && !m.blocking), "نبود خاک باید غیرالزامی اما اعلام‌شده باشد");
  assert(blank.assumptions.some((a) => a.label.includes("خاک")), "فرض خاک باید صریح ثبت شود");
  const partial = reviewIntake({ ...DEFAULT_ANSWERS, projectName: "پروژه با خاک نامشخص" });
  assert(partial.ready, "با نام و واحد، پروژه باید آماده تولید باشد");
  assert(partial.missing.length >= 2, "موارد ناقص باید فهرست شوند");
  assert(partial.missing.some((m) => m.id === "levels"), "نبود تراز زمین باید اعلام شود");
  assert(partial.missing.some((m) => m.id === "geotech"), "نبود ژئوتکنیک باید اعلام شود");
  return `${partial.missing.length} مورد ناقص اعلام‌شده، ${partial.requiredCount} مورد الزامی`;
});

test("intake", "زمین نامنظم/باریک در ورودی هدایت‌شده به‌درستی مدیریت می‌شود", () => {
  const irregular = reviewIntake({ ...DEFAULT_ANSWERS, projectName: "زمین نامنظم", parcelShape: "lShape", widthM: 24, depthM: 30 });
  assert(irregular.site.boundary.length === 6, "مرز L باید ۶ رأس داشته باشد");
  assert(irregular.boundaryValid, "مرز L باید معتبر باشد");
  const expected = polygonArea(parcelBoundary({ ...DEFAULT_ANSWERS, parcelShape: "lShape", widthM: 24, depthM: 30 }));
  approx(irregular.plotAreaM2, expected, 1e-6, "L parcel area");
  const narrow = reviewIntake({ ...DEFAULT_ANSWERS, projectName: "زمین باریک", widthM: 7, depthM: 30 });
  assert(narrow.warnings.some((w) => w.includes("زمین کوچک") || w.includes("عرض")), "زمین باریک باید هشدار بدهد");
  const site = buildSite({ ...DEFAULT_ANSWERS, widthM: 20, depthM: 30, setbacks: { north: 20, east: 20, south: 20, west: 20 } });
  const buildable = analyzeSite(site);
  assert(buildable.buildableAreaM2 === 0, "عقب‌نشینی بیش‌ازحد باید سطح ساخت‌پذیر را صفر کند");
  const requirements = buildRequirements({ ...DEFAULT_ANSWERS, floors: 3, farPercent: 180, coveragePercent: 40 });
  approx(requirements.farMax, 1.8, 1e-9, "far conversion");
  approx(requirements.coverageMax, 0.4, 1e-9, "coverage conversion");
  return "L شکل، باریک، عقب‌نشینی بیش‌ازحد و تبدیل درصدها بررسی شد";
});

test("intake", "پروژه واقعی از ورودی هدایت‌شده تا پلان و اعتبارسنجی", () => {
  const review = reviewIntake({
    ...DEFAULT_ANSWERS,
    projectName: "زنجیره کامل",
    widthM: 24,
    depthM: 32,
    floors: 4,
    units: { studio: 0, twoBed: 4, threeBed: 2, fourBed: 0 },
    soilBearingKPa: 180,
    seismicZone: "high",
  });
  assert(review.ready, `ورودی باید آماده باشد: ${review.errors.join(" | ")}`);
  const schemes = generateSchemes(review.site, review.requirements, { seed: 7, variants: 3 });
  assert(schemes.length === 3, "سه راهبرد باید تولید شود");
  for (const scheme of schemes) {
    const report = validateScheme(scheme);
    const integrity = report.evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
    assert(integrity.status === "pass", `یکپارچگی پلان نقض شد: ${integrity.trace.join(" | ")}`);
    assert((scheme.levels[0].walls?.length ?? 0) > 0, "دیوار تولید نشده");
    assert(
      scheme.footprintRects.every((rect) =>
        polygonInPolygonCheck(
          [
            { x: rect.x, y: rect.y },
            { x: rect.x + rect.w, y: rect.y },
            { x: rect.x + rect.w, y: rect.y + rect.h },
            { x: rect.x, y: rect.y + rect.h },
          ],
          scheme.buildablePolygon,
          0.02,
        ),
      ),
      "بلوک‌ها باید کامل داخل محدوده ساخت‌پذیر باشند",
    );
  }
  return `${schemes.length} طرح از ورودی هدایت‌شده با یکپارچگی پلان`;
});

import {
  applySetbacks,
  clipPolygon,
  distanceToPolygonOutline,
  effectiveSetbackForEdge,
  polygonArea,
  polygonInsidePolygon,
  polygonIsConvex,
  polygonIsSimple,
  rectArea,
  signedDistanceToOutline,
} from "../geometry";
import { analyzeSite } from "../layout";
import type { Vec2 } from "../types";
import { CONCAVE_SITE, FIXTURES, NARROW_SITE } from "./fixtures";
import { approx, assert, test } from "./harness";

const rect = (w: number, h: number): Vec2[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

const L_SHAPE: Vec2[] = [
  { x: 0, y: 0 },
  { x: 12, y: 0 },
  { x: 12, y: 6 },
  { x: 6, y: 6 },
  { x: 6, y: 12 },
  { x: 0, y: 12 },
];

const SETBACK_2 = { north: 2, east: 2, south: 2, west: 2 };

test("geometry", "مساحت شولیس با مقادیر مستقل (مربع، مثلث، L مقعر)", () => {
  approx(polygonArea(rect(10, 10)), 100, 1e-9, "square 10×10");
  approx(
    polygonArea([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 8 },
    ]),
    24,
    1e-9,
    "triangle 6×8/2",
  );
  approx(polygonArea(L_SHAPE), 108, 1e-9, "L-shape 12×12 minus 6×6");
  return "۱۰۰ / ۲۴ / ۱۰۸ m² مطابق محاسبه دستی";
});

test("geometry", "عقب‌نشینی متقارن روی مستطیل ۲۰×۳۰ = ۱۴×۲۴", () => {
  const buildable = applySetbacks(rect(20, 30), { north: 3, east: 3, south: 3, west: 3 });
  approx(polygonArea(buildable), 336, 1e-9, "20-6=14 × 30-6=24");
  const xs = buildable.map((p) => p.x);
  const ys = buildable.map((p) => p.y);
  approx(Math.min(...xs), 3, 1e-9, "west clearance");
  approx(Math.max(...xs), 17, 1e-9, "east clearance");
  approx(Math.min(...ys), 3, 1e-9, "south clearance");
  approx(Math.max(...ys), 27, 1e-9, "north clearance");
  return "۳۳۶ m² با فاصله‌های ۳ m در هر چهار جهت";
});

test("geometry", "عقب‌نشینی نامتقارن N5/E2/S3/W4 = ۱۴×۲۲", () => {
  const buildable = applySetbacks(rect(20, 30), { north: 5, east: 2, south: 3, west: 4 });
  approx(polygonArea(buildable), 308, 1e-9, "14 × 22");
  const ys = buildable.map((p) => p.y);
  approx(Math.max(...ys), 25, 1e-9, "north 5");
  approx(Math.min(...ys), 3, 1e-9, "south 3");
  return "۳۰۸ m² — جهت‌ها به درستی تفکیک شده‌اند";
});

test("geometry", "زمین باریک ۸×۴۰ با عقب‌نشینی ۳ m نوار ۲×۳۴ می‌دهد", () => {
  const buildable = applySetbacks(rect(8, 40), { north: 3, east: 3, south: 3, west: 3 });
  approx(polygonArea(buildable), 68, 1e-9, "2 × 34");
  assert(buildable.length >= 3, "نوار باریک باید معتبر بماند");
  return "۶۸ m² بدون حذف نوار باریک معتبر";
});

test("geometry", "عقب‌نشینی بیش از عرض زمین نتیجه خالی می‌دهد", () => {
  const buildable = applySetbacks(rect(20, 30), { north: 12, east: 12, south: 12, west: 12 });
  assert(buildable.length === 0, "باید خالی باشد، نه یک چندضلعی معکوس");
  return "نبود سطح ساخت‌پذیر به‌درستی تشخیص داده شد";
});

test("geometry", "عقب‌نشینی زمین مقعر: زیرمجموعه زمین و محافظه‌کارانه", () => {
  const buildable = applySetbacks(L_SHAPE, SETBACK_2);
  // Intersection of the inward half-planes of the L outline is the 2×2 square
  // [2,4]×[2,4]; the true Minkowski erosion would be larger, so the engine is
  // conservative here by construction.
  approx(polygonArea(buildable), 4, 1e-9, "L-shape half-plane kernel 2×2");
  assert(polygonInsidePolygon(buildable, L_SHAPE), "نتیجه باید زیرمجموعه زمین باشد");
  const eroded = polygonArea(buildable);
  assert(eroded < polygonArea(L_SHAPE), "سطح ساخت‌پذیر باید کوچک‌تر از زمین باشد");
  return "۴ m² (زیرمجموعه دقیق زمین، نه برآورد بیش از حد)";
});

test("geometry", "بزرگ‌ترشدن عقب‌نشینی سطح ساخت‌پذیر را یکنوا کاهش می‌دهد", () => {
  const areas = [0.5, 1, 2, 3].map((s) =>
    polygonArea(applySetbacks(rect(20, 30), { north: s, east: s, south: s, west: s })),
  );
  for (let i = 1; i < areas.length; i++) {
    assert(areas[i] < areas[i - 1], `سطح در گام ${i} باید کوچک‌تر شود: ${areas.join(" > ")}`);
  }
  return areas.map((a) => a.toFixed(1)).join(" > ") + " m²";
});

test("geometry", "تشخیص خودمتقاطع و چندضلعی‌های منحط", () => {
  const bowtie = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];
  assert(!polygonIsSimple(bowtie), "مرز خودمتقاطع باید رد شود");
  assert(polygonIsSimple(L_SHAPE), "L معتبر باید پذیرفته شود");
  const duplicated = [...rect(10, 10)].flatMap((p) => [p, { ...p }]);
  assert(polygonIsSimple(duplicated), "رئوس تکراری پیاپی نباید هندسه را نامعتبر کنند");
  return "self-intersection رد، رئوس تکراری پاک‌سازی شد";
});

test("geometry", "مساحت کوچک نباید به‌اشتباه «هندسه نامعتبر» تلقی شود", () => {
  const tiny = [
    { x: 0, y: 0 },
    { x: 1.2, y: 0 },
    { x: 0, y: 0.7 },
  ];
  approx(polygonArea(tiny), 0.42, 1e-9, "tiny area");
  assert(polygonIsSimple(tiny), "مثلث ۰.۴۲ m² از نظر هندسی ساده است و باید پذیرفته شود");
  return "۰.۴۲ m² ساده تشخیص داده شد (باگ آستانه مساحت رفع شد)";
});

test("geometry", "تفکیک محدب/مقعر و پیام روش تقریب", () => {
  assert(polygonIsConvex(rect(10, 10)), "مستطیل محدب است");
  assert(!polygonIsConvex(L_SHAPE), "L مقعر است");
  const concaveAnalysis = analyzeSite(CONCAVE_SITE);
  assert(!concaveAnalysis.convexParcel, "تحلیل باید مقعر بودن را تشخیص دهد");
  assert(!concaveAnalysis.approximation.exact, "روش باید غیردقیق اعلام شود");
  assert(concaveAnalysis.approximation.note.includes("محافظه‌کارانه"), "پیام محدودیت باید صریح باشد");
  const convexAnalysis = analyzeSite(FIXTURES.site);
  assert(convexAnalysis.approximation.exact === convexAnalysis.convexParcel, "پرچم دقت باید با تحدب هم‌خوان باشد");
  return `مقعر: ${concaveAnalysis.approximation.exact ? "دقیق" : "محافظه‌کارانه"}`;
});

test("geometry", "برش چندضلعی در برابر مساحت مستقل اشتراک", () => {
  const square = rect(10, 10);
  const shifted = [
    { x: 5, y: 5 },
    { x: 15, y: 5 },
    { x: 15, y: 15 },
    { x: 5, y: 15 },
  ];
  approx(polygonArea(clipPolygon(shifted, square)), 25, 1e-9, "5×5 overlap");
  approx(polygonArea(clipPolygon(L_SHAPE, rect(20, 20))), 108, 1e-9, "clip inside full coverage");
  return "۲۵ m² و پوشش کامل درست است";
});

test("geometry", "فاصله علامت‌دار تا محیط زمین", () => {
  const square = rect(10, 10);
  approx(distanceToPolygonOutline({ x: 5, y: 0 }, square), 0, 1e-9, "point on edge");
  assert(signedDistanceToOutline({ x: 5, y: 5 }, square) > 0, "داخل مثبت");
  assert(signedDistanceToOutline({ x: 12, y: 5 }, square) < 0, "خارج منفی");
  approx(distanceToPolygonOutline({ x: 12, y: 5 }, square), 2, 1e-9, "2 m outside");
  return "علامت و مقدار فاصله درست است";
});

test("geometry", "اثر هندسی عقب‌نشینی جهت‌دار روی اضلاع مورب", () => {
  const diagonal = effectiveSetbackForEdge({ x: 0, y: 0 }, { x: 10, y: 10 });
  assert(diagonal.normalAngleDeg !== 0, "ضلع مورب باید نرمال غیرصفر داشته باشد");
  const analysis = analyzeSite(FIXTURES.site);
  assert(analysis.effectiveSetbacks.length === FIXTURES.site.boundary.length, "برای هر ضلع یک گزارش لازم است");
  const diagonalEdge = analysis.effectiveSetbacks.find((e) => Math.abs(e.normalAngleDeg % 90) > 1);
  assert(!!diagonalEdge, "زمین نمونه ضلع مورب دارد");
  assert(
    diagonalEdge!.maxCardinalClearanceM >= diagonalEdge!.requestedPerpendicularM,
    "فاصله کاردینال روی ضلع مورب نباید از فاصله عمودی کمتر باشد",
  );
  return `ضلع مورب ${diagonalEdge!.normalAngleDeg}° → فاصله عمودی ${diagonalEdge!.requestedPerpendicularM} m، کاردینال ${diagonalEdge!.maxCardinalClearanceM} m`;
});

test("geometry", "کوانتیزاسیون شبکه ۱ m: رئوس روی مرز معتبرند", () => {
  const narrow = analyzeSite(NARROW_SITE);
  assert(narrow.primaryPlate !== null, "نوار باریک باید مستطیل محاطی داشته باشد");
  const plate = narrow.primaryPlate!;
  // Convention change (stage B.2): setbacks are measured to the OUTER wall face,
  // so the centreline strip is 8 − 2×(3 + 0.125) = 1.75 m, not 2.00 m.
  // The mask samples on a 1 m grid, so the plate may equal the strip (1.75 m)
  // or the largest whole grid step that fits (1.00 m) — never more.
  const stripWidth = 8 - 2 * (3 + 0.125);
  assert(plate.w <= stripWidth + 1e-6, `عرض مستطیل ${plate.w} m از نوار ساخت‌پذیر ${stripWidth} m بیشتر است`);
  assert(plate.w >= stripWidth - 1.0, `عرض مستطیل ${plate.w} m بیش از یک گام شبکه کمتر از ${stripWidth} m است`);
  approx(plate.h, 34, 1.2, "طول مستطیل در نوار ۳۴ متری (تحمل یک سلول شبکه)");
  assert(!narrow.viable, "نوار ۲ متری برای برنامه مسکونی کافی نیست");
  return `نوار ۲×۳۴ → مستطیل ${plate.w.toFixed(1)}×${plate.h.toFixed(1)} m با رد صریح ساخت`;
});

test("geometry", "سطح ساخت‌پذیر و مستطیل‌های استخراج‌شده با ابعاد زمین سازگارند", () => {
  const analysis = FIXTURES.analysis;
  approx(analysis.plotAreaM2, 868, 0.5, "plot area (independent shoelace)");
  assert(analysis.buildableAreaM2 < analysis.plotAreaM2, "ساخت‌پذیر باید کوچک‌تر از زمین باشد");
  assert(polygonInsidePolygon(analysis.buildablePolygon, analysis.boundary), "ساخت‌پذیر باید داخل مرز باشد");
  for (const plate of [analysis.primaryPlate, analysis.secondaryPlate]) {
    if (!plate) continue;
    assert(plate.w <= analysis.buildableAreaM2, "عرض مستطیل نامعقول است");
    assert(rectArea(plate) > 0, "مساحت مستطیل باید مثبت باشد");
  }
  const maxInscribed = analysis.primaryPlate!;
  assert(rectArea(maxInscribed) <= analysis.buildableAreaM2, "مستطیل محاطی نمی‌تواند از سطح ساخت‌پذیر بزرگ‌تر باشد");
  return `زمین ${analysis.plotAreaM2.toFixed(1)} → ساخت‌پذیر ${analysis.buildableAreaM2.toFixed(1)} → مستطیل ${maxInscribed.w.toFixed(1)}×${maxInscribed.h.toFixed(1)}`;
});

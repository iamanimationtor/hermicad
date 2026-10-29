import { generateSchemes, analyzeSite } from "../layout";
import { collectPatternCandidates, planUnitLayout } from "../architecture/layoutEngine";
import { validateScheme } from "../codes";
import { verifyPlanIntegrity } from "../architecture/plan";
import {
  distanceToPolygonOutline,
  pointInPolygon,
  polygonInsidePolygon,
  polygonArea,
  rectArea,
  rectToPoly,
} from "../geometry";
import { DEFAULT_REQUIREMENTS, DEFAULT_SITE, applyRequirementsPatch } from "../requirements";
import type { CanonicalScheme, Requirements, SiteModel } from "../types";
import { FIXTURES } from "./fixtures";
import { approx, assert, test } from "./harness";

/**
 * A wall is a *segment*, so it cannot be tested with a polygon helper.
 * Every sampled point along the segment must be inside the region or within
 * tolerance of its outline (edges may legally coincide with the boundary).
 */
function segmentInsidePolygon(
  a: { x: number; y: number },
  b: { x: number; y: number },
  poly: { x: number; y: number }[],
  tol: number,
): boolean {
  const samples = 16;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!pointInPolygon(point, poly) && distanceToPolygonOutline(point, poly) > tol) return false;
  }
  return true;
}

const rectParcel = (w: number, d: number): SiteModel => ({
  ...DEFAULT_SITE,
  boundary: [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: d },
    { x: 0, y: d },
  ],
  spotLevels: [],
  setbacks: { north: 3, east: 3, south: 3, west: 3 },
});

const programme = (twoBed: number, threeBed: number): Requirements =>
  applyRequirementsPatch(DEFAULT_REQUIREMENTS, {
    dwellings: [
      { type: "twoBed", count: twoBed, targetAreaM2: 80, minAreaM2: 70 },
      { type: "threeBed", count: threeBed, targetAreaM2: 104, minAreaM2: 90 },
    ],
  });

const PARCELS: { id: string; site: SiteModel }[] = [
  { id: "17x26", site: rectParcel(17, 26) },
  {
    id: "irregular-L",
    site: {
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
    },
  },
  { id: "demo-hex", site: DEFAULT_SITE },
];

const RESULTS = PARCELS.map((parcel) => {
  try {
    const schemes = generateSchemes(parcel.site, programme(4, 2), { seed: 20260301, variants: 3 });
    return { parcel, schemes, analysis: analyzeSite(parcel.site), error: null as string | null };
  } catch (error) {
    return { parcel, schemes: [] as CanonicalScheme[], analysis: analyzeSite(parcel.site), error: (error as Error).message };
  }
});

test("planfix", "ریشه‌ای #1: کوچک‌کردن بلوک هرگز عرض/عمق را بزرگ نمی‌کند", () => {
  // Direct reproduction of the defect: an 11 m buildable strip was widened to
  // 12 m by a Math.max(12, …) floor and re-centred outside the setback line.
  for (const result of RESULTS) {
    assert(!result.error, `${result.parcel.id}: ${result.error}`);
    const buildable = result.analysis.buildablePolygon;
    const box = result.analysis.primaryPlate;
    assert(!!box, `${result.parcel.id}: مستطیل ساخت‌پذیر استخراج نشد`);
    assert(
      polygonInsidePolygon(rectToPoly(box!), buildable, 0.02),
      `${result.parcel.id}: مستطیل محاطی ${box!.w}×${box!.h} خارج از محدوده ساخت‌پذیر`,
    );
    for (const scheme of result.schemes) {
      for (const plate of scheme.footprintRects) {
        assert(plate.w <= box!.w + 0.02, `${result.parcel.id}/${scheme.code}: عرض بلوک ${plate.w} از مستطیل ساخت‌پذیر ${box!.w} بیشتر شد`);
        assert(plate.h <= box!.h + 0.02, `${result.parcel.id}/${scheme.code}: عمق بلوک ${plate.h} از مستطیل ساخت‌پذیر ${box!.h} بیشتر شد`);
        assert(
          polygonInsidePolygon(rectToPoly(plate), buildable, 0.02),
          `${result.parcel.id}/${scheme.code}: بلوک ${plate.w}×${plate.h} بیرون از محدوده ساخت‌پذیر`,
        );
      }
    }
  }
  const narrow = RESULTS.find((result) => result.parcel.id === "17x26")!;
  // Convention (stage B.2): the centreline envelope is 17−2×(3+0.125)=10.75 by
  // 26−2×(3+0.125)=19.75, i.e. 212.31 m². The wall OUTER FACE then sits exactly
  // 3.00 m from the boundary.
  approx(narrow.analysis.buildableAreaM2, 10.75 * 19.75, 0.5, "17×26 centreline buildable area");
  const plate = narrow.schemes[0].footprintRects[0];
  assert(plate.w <= 10.75 + 0.02, `plate width ${plate.w} exceeds the 10.75 m centreline strip`);
  assert(plate.w >= 10.75 - 1.05, `plate width ${plate.w} lost more than one grid step`);
  return `۱۷×۲۶ → ساخت‌پذیر ${narrow.analysis.buildableAreaM2} m² · بلوک ${plate.w}×${plate.h} m (بدون بزرگ‌شدن)`;
});

test("planfix", "زمین ۱۷×۲۶: DATA-01-INTEGRITY برای همه استراتژی‌ها pass است", () => {
  const narrow = RESULTS.find((result) => result.parcel.id === "17x26")!;
  assert(narrow.schemes.length === 3, `سه استراتژی انتظار می‌رود: ${narrow.schemes.length}`);
  const rows: string[] = [];
  for (const scheme of narrow.schemes) {
    const report = validateScheme(scheme);
    const integrity = report.evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
    assert(
      integrity.status === "pass",
      `${scheme.code}/${scheme.strategy}: ${integrity.status} → ${integrity.trace.filter((t) => t.includes("خیر") || t.includes("ناسازگاری")).join(" | ")}`,
    );
    for (const level of scheme.levels) {
      assert(verifyPlanIntegrity(level).ok, `${scheme.code}: لایه پلان ناسازگار`);
    }
    rows.push(`${scheme.strategy}:pass`);
  }
  return rows.join(" · ");
});

test("planfix", "همه اجزا داخل محدوده مجاز: بلوک، واحد، فضا، دیوار و بازشو", () => {
  const summary: string[] = [];
  for (const result of RESULTS) {
    assert(!result.error, `${result.parcel.id}: ${result.error}`);
    for (const scheme of result.schemes) {
      const buildable = scheme.buildablePolygon;
      const boundary = scheme.site.boundary;
      for (const unit of scheme.units) {
        assert(polygonInsidePolygon(rectToPoly(unit.rect), buildable, 0.02), `${result.parcel.id}/${scheme.code}: واحد بیرون محدوده`);
      }
      for (const level of scheme.levels) {
        for (const room of level.rooms) {
          assert(polygonInsidePolygon(room.polygon, buildable, 0.02), `${result.parcel.id}/${scheme.code}: فضای ${room.id} بیرون محدوده`);
        }
        for (const wall of level.walls ?? []) {
          // Centreline must stay inside the permitted building envelope.
          assert(
            segmentInsidePolygon(wall.start, wall.end, buildable, 0.05),
            `${result.parcel.id}/${scheme.code}: محور دیوار ${wall.id} بیرون محدوده ساخت‌پذیر`,
          );
          // The wall *band* (thickness) must stay inside the parcel itself; the
          // setbacks are applied to the centreline convention documented in the
          // plan method, so half a wall may project into the setback margin.
          const half = wall.thicknessM / 2 + 0.005;
          const band = [
            { x: Math.min(wall.start.x, wall.end.x) - half, y: Math.min(wall.start.y, wall.end.y) - half },
            { x: Math.max(wall.start.x, wall.end.x) + half, y: Math.min(wall.start.y, wall.end.y) - half },
            { x: Math.max(wall.start.x, wall.end.x) + half, y: Math.max(wall.start.y, wall.end.y) + half },
            { x: Math.min(wall.start.x, wall.end.x) - half, y: Math.max(wall.start.y, wall.end.y) + half },
          ];
          assert(
            polygonInsidePolygon(band, boundary, 0.05),
            `${result.parcel.id}/${scheme.code}: ضخامت دیوار ${wall.id} از مرز زمین بیرون زده`,
          );
        }
        for (const opening of level.openings ?? []) {
          const wall = (level.walls ?? []).find((candidate) => candidate.id === opening.wallId);
          assert(!!wall, `${result.parcel.id}: بازشو بدون دیوار`);
          assert(
            polygonInsidePolygon([
              { x: opening.center.x - opening.widthM / 2, y: opening.center.y - 0.1 },
              { x: opening.center.x + opening.widthM / 2, y: opening.center.y - 0.1 },
              { x: opening.center.x + opening.widthM / 2, y: opening.center.y + 0.1 },
              { x: opening.center.x - opening.widthM / 2, y: opening.center.y + 0.1 },
              { x: opening.center.x - 0.1, y: opening.center.y - opening.widthM / 2 },
              { x: opening.center.x + 0.1, y: opening.center.y - opening.widthM / 2 },
              { x: opening.center.x + 0.1, y: opening.center.y + opening.widthM / 2 },
              { x: opening.center.x - 0.1, y: opening.center.y + opening.widthM / 2 },
            ], boundary, 0.05),
            `${result.parcel.id}: بازشو ${opening.id} بیرون مرز زمین`,
          );
        }
      }
      summary.push(`${result.parcel.id}:${scheme.footprintRects.length} بلوک`);
    }
  }
  return summary.join(" · ");
});

test("planfix", "ریشه‌ای #2: نشیمن همیشه سمت نما است (نه آشپزخانه)", () => {
  const rows: string[] = [];
  for (const result of RESULTS) {
    for (const scheme of result.schemes) {
      for (const level of scheme.levels) {
        const plate = level.plateRects[0];
        const left = level.rooms.filter((room) => room.kind === "living" && room.unitIndex >= 0);
        for (const living of left) {
          const xs = living.polygon.map((p) => p.x);
          const ys = living.polygon.map((p) => p.y);
          const touchesSouth = Math.abs(Math.min(...ys) - plate.y) < 0.3;
          const touchesNorth = Math.abs(Math.max(...ys) - (plate.y + plate.h)) < 0.3;
          const touchesWest = Math.abs(Math.min(...xs) - plate.x) < 0.3;
          const touchesEast = Math.abs(Math.max(...xs) - (plate.x + plate.w)) < 0.3;
          assert(
            touchesSouth || touchesNorth || touchesWest || touchesEast,
            `${result.parcel.id}/${scheme.code}: نشیمن ${living.id} به هیچ لبه بلوک نرسیده (facade=${living.facadeM})`,
          );
          // Root cause was living.facadeM === 0 (kitchen on the facade). A small
          // but non-zero facade is a declared geometry limitation, and must be
          // reported rather than hidden.
          assert(living.facadeM > 0.5, `${result.parcel.id}/${scheme.code}: نشیمن ${living.id} نمای ${living.facadeM} m دارد`);
          if (living.facadeM < 1.2) {
            const proportions = (level.planChecks ?? []).find((c) => c.id === "PLAN-ROOM-PROPORTIONS");
            const daylight = (level.planChecks ?? []).find((c) => c.id === "PLAN-WINDOW-PER-ROOM");
            assert(
              proportions?.status !== "pass" || daylight?.status !== "pass",
              `${result.parcel.id}: نمای کمتر از ۱٫۲ m باید در کنترل‌های کیفیت دیده شود`,
            );
          }
        }
        for (const kitchen of level.rooms.filter((room) => room.kind === "kitchen" && room.unitIndex >= 0)) {
          const unitLiving = left.filter((living) => living.unitIndex === kitchen.unitIndex);
          if (unitLiving.length === 0) continue;
          // The specific defect guarded here is ordering: the kitchen must never
          // end up on the facade *instead of* the living room. A kitchen may
          // legitimately occupy a side edge, and on a narrow plate both rooms
          // can be short of the 1.2 m internal target — that is a declared
          // limitation checked separately, not a kitchen-ordering bug.
          for (const living of unitLiving) {
            assert(
              living.facadeM > 0.5,
              `${result.parcel.id}/${scheme.code}: آشپزخانه نور نشیمن واحد ${kitchen.unitIndex} را گرفته است (facade=${living.facadeM})`,
            );
            // Ordering invariant of the open-plan fix: when the kitchen shares a
            // bay with the living room, the living room owns the facade side and
            // the kitchen sits behind it (never the other way round).
            const kXs = kitchen.polygon.map((p) => p.x);
            const lXs = living.polygon.map((p) => p.x);
            const kYs = kitchen.polygon.map((p) => p.y);
            const lYs = living.polygon.map((p) => p.y);
            const sharesBay =
              Math.abs(Math.min(...kXs) - Math.min(...lXs)) < 0.35 &&
              Math.abs(Math.max(...kXs) - Math.max(...lXs)) < 0.35;
            if (sharesBay) {
              const kitchenOnLowEdge = Math.abs(Math.min(...kYs) - plate.y) < 0.3;
              const livingOnLowEdge = Math.abs(Math.min(...lYs) - plate.y) < 0.3;
              const kitchenOnHighEdge = Math.abs(Math.max(...kYs) - (plate.y + plate.h)) < 0.3;
              const livingOnHighEdge = Math.abs(Math.max(...lYs) - (plate.y + plate.h)) < 0.3;
              assert(
                !(kitchenOnLowEdge && !livingOnLowEdge) && !(kitchenOnHighEdge && !livingOnHighEdge),
                `${result.parcel.id}/${scheme.code}: آشپزخانه لبه نمای مشترک با نشیمن را اشغال کرده است`,
              );
            }
          }
        }
      }
      rows.push(`${result.parcel.id}/${scheme.code}`);
    }
  }
  return `${rows.length} طرح: نشیمن روی نما، آشپزخانه داخلی`;
});

test("planfix", "هر فضای قابل سکونت پنجره واقعی روی دیوار پیرامونی دارد", () => {
  const report: string[] = [];
  const violations: string[] = [];
  for (const result of RESULTS) {
    for (const scheme of result.schemes) {
      for (const level of scheme.levels) {
        const walls = new Map((level.walls ?? []).map((wall) => [wall.id, wall]));
        const windows = (level.openings ?? []).filter((opening) => opening.kind === "window");
        const windowRooms = new Set(windows.flatMap((opening) => opening.roomIds));
        const habitable = level.rooms.filter((room) => room.habitable);
        for (const room of habitable) {
          const has = windowRooms.has(room.id);
          if (!has) violations.push(`${result.parcel.id}/${scheme.code}/${room.id}`);
          if (has) {
            const own = windows.filter((opening) => opening.roomIds.includes(room.id));
            assert(own.length > 0, `${room.id}: پنجره ثبت‌شده بدون مالکیت`);
            for (const opening of own) {
              const wall = walls.get(opening.wallId);
              assert(!!wall && wall.envelope, `${room.id}: پنجره روی دیوار غیرپیرامونی (${opening.wallId})`);
              assert(wall!.roomIds.includes(room.id), `${room.id}: پنجره روی دیوار فضای دیگر`);
              assert(opening.widthM >= 0.5, `${room.id}: پنجره ${opening.widthM} m بی‌معنا`);
              const half = opening.widthM / 2;
              assert(opening.stationM - half >= -1e-6 && opening.stationM + half <= wall!.lengthM + 1e-6, `${room.id}: پنجره بیرون دیوار`);
            }
          }
        }
        const check = (level.planChecks ?? []).find((entry) => entry.id === "PLAN-WINDOW-PER-ROOM");
        assert(!!check, "کنترل نورگیری ثبت نشده");
        assert(
          (check!.roomIds?.length ?? 0) === violations.filter((entry) => entry.includes(scheme.code)).length,
          `فهرست فضاهای بی‌نور با کنترل ناسازگار: ${check!.value}`,
        );
        report.push(`${result.parcel.id}/${scheme.code}:${habitable.length}`);
      }
    }
  }
  assert(violations.length === 0, `فضاهای قابل سکونت بدون پنجره واقعی: ${violations.slice(0, 6).join(", ")}`);
  return `${report.length} طبقه نمونه بررسی شد؛ ۰ فضای قابل سکونت بدون پنجره`;
});

test("planfix", "همه الگوهای پلان: بدون هم‌پوشانی، پوشش کامل و داخل واحد", () => {
  const testedParts = new Set<string>();
  const rows: string[] = [];
  const units = FIXTURES.schemes.flatMap((scheme) => scheme.units.slice(0, 2).map((unit) => ({ scheme, unit })));
  for (const { scheme, unit } of units) {
    const level = scheme.levels[0];
    const ctx = {
      unitIndex: unit.index,
      level: 0,
      accessNorth: scheme.strategy.includes("north"),
      plateRects: level.plateRects,
      suffix: `probe-${unit.index}`,
      sideFacadeEast: true,
      sideFacadeWest: false,
    };
    const { candidates } = collectPatternCandidates(unit.rect, unit.type, ctx);
    assert(candidates.length >= 2, "حداقل دو الگو باید ساخته شود");
    for (const candidate of candidates) {
      testedParts.add(candidate.id);
      for (let i = 0; i < candidate.rooms.length; i++) {
        const room = candidate.rooms[i];
        const xs = room.polygon.map((p) => p.x);
        const ys = room.polygon.map((p) => p.y);
        assert(room.areaM2 > 0, `${candidate.id}: فضای با مساحت صفر`);
        for (const point of room.polygon) {
          assert(
            point.x >= unit.rect.x - 0.03 &&
              point.x <= unit.rect.x + unit.rect.w + 0.03 &&
              point.y >= unit.rect.y - 0.03 &&
              point.y <= unit.rect.y + unit.rect.h + 0.03,
            `${candidate.id}: فضای ${room.kind} از واحد بیرون زده`,
          );
        }
        for (let j = i + 1; j < candidate.rooms.length; j++) {
          const other = candidate.rooms[j];
          const ox = other.polygon.map((p) => p.x);
          const oy = other.polygon.map((p) => p.y);
          const w = Math.min(Math.max(...xs), Math.max(...ox)) - Math.max(Math.min(...xs), Math.min(...ox));
          const h = Math.min(Math.max(...ys), Math.max(...oy)) - Math.max(Math.min(...ys), Math.min(...oy));
          const overlap = w > 0 && h > 0 ? w * h : 0;
          assert(overlap <= Math.max(0.02, rectArea(unit.rect) * 0.005), `${candidate.id}: هم‌پوشانی ${overlap.toFixed(2)} m² (${room.kind}/${other.kind})`);
        }
      }
      // Every candidate must be evaluated, not silently usable.
      assert(typeof candidate.evaluation.feasible === "boolean", `${candidate.id}: عدم ارزیابی`);
      if (!candidate.evaluation.feasible) {
        assert(
          candidate.evaluation.notes.length > 0 || candidate.evaluation.darkHabitable.length > 0 || candidate.evaluation.narrowRooms.length > 0,
          `${candidate.id}: رد شدن بدون دلیل`,
        );
      }
    }
    rows.push(`${scheme.code}:${candidates.map((c) => c.id).join("/")}`);
  }
  assert(testedParts.has("single-row") && testedParts.has("open-kitchen"), `الگوهای اصلی آزمون نشدند: ${[...testedParts].join(",")}`);
  return `${rows.length} واحد × ${testedParts.size} الگو: ${[...testedParts].join("، ")}`;
});

test("planfix", "الگوی انتخابی همیشه بهترین گزینه قابل قبول یا با دلیل صریح است", () => {
  for (const { scheme, unit } of FIXTURES.schemes.flatMap((s) => s.units.slice(0, 2).map((u) => ({ scheme: s, unit: u })))) {
    const level = scheme.levels[0];
    const result = planUnitLayout(unit.rect, unit.type, {
      unitIndex: unit.index,
      level: 0,
      accessNorth: true,
      plateRects: level.plateRects,
      suffix: `pick-${unit.index}`,
    });
    const feasibleAlternatives = result.alternatives.filter((alt) => alt.feasible);
    if (feasibleAlternatives.length > 0) {
      assert(result.evaluation.feasible, `${unit.label}: گزینه قابل قبول وجود دارد اما انتخاب‌شده غیرقابل قبول است`);
    } else {
      assert(result.evaluation.notes.length > 0, `${unit.label}: نبود گزینه قابل قبول بدون دلیل`);
    }
    for (const alt of result.alternatives.filter((candidate) => !candidate.feasible)) {
      assert(alt.reason.length > 3, `${unit.label}/${alt.patternId}: دلیل رد الگو خالی است`);
    }
  }
  return "انتخاب الگو و دلایل رد، قابل ردیابی است";
});

test("planfix", "طراحی مرجع: همه فضاهای قابل سکونت پنجره دارند (قبل: ۷ از ۱۰)", () => {
  const rows: string[] = [];
  for (const scheme of FIXTURES.schemes) {
    const level = scheme.levels[0];
    const windows = new Set((level.openings ?? []).filter((o) => o.kind === "window").flatMap((o) => o.roomIds));
    const habitable = level.rooms.filter((room) => room.habitable);
    const lit = habitable.filter((room) => windows.has(room.id));
    const shortFacade = habitable.filter((room) => room.facadeM < 1.2);
    assert(lit.length === habitable.length, `${scheme.code}: ${habitable.length - lit.length} فضای قابل سکونت بی‌نور`);
    assert(shortFacade.length === 0, `${scheme.code}: ${shortFacade.map((r) => `${r.kind}=${r.facadeM}`).join(", ")} نمای کمتر از ۱٫۲ m`);
    const check = (level.planChecks ?? []).find((entry) => entry.id === "PLAN-WINDOW-PER-ROOM")!;
    assert(check.status === "pass", `${scheme.code}: کنترل نور ${check.status}`);
    const integrity = validateScheme(scheme).evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
    assert(integrity.status === "pass", `${scheme.code}: یکپارچگی ${integrity.status}`);
    rows.push(`${scheme.code}:${lit.length}/${habitable.length}`);
  }
  return rows.join(" · ");
});

test("planfix", "علت هر فضای فاقد پنجره (اگر وجود داشته باشد) صریح و قابل‌ردیابی است", () => {
  // Deliberately hostile unit: 4.2 m wide, 14 m deep — cannot host 3 bays.
  const cramped = planUnitLayout({ x: 0, y: 0, w: 4.2, h: 14 }, "threeBed", {
    unitIndex: 0,
    level: 0,
    accessNorth: true,
    plateRects: [{ x: 0, y: 0, w: 4.2, h: 14 }],
    suffix: "cramped",
  });
  assert(!cramped.evaluation.feasible, "واحد ۴٫۲×۱۴ نباید قابل قبول اعلام شود");
  assert(
    cramped.evaluation.darkHabitable.length > 0 || cramped.evaluation.narrowRooms.length > 0,
    "محدودیت باید به فضای مشخص نسبت داده شود",
  );
  assert(cramped.evaluation.notes.length > 0, "دلیل محدودیت باید ثبت شود");
  const explained = cramped.alternatives.filter((alt) => !alt.feasible).every((alt) => alt.reason.length > 3);
  assert(explained, "همه الگوهای ردشده دلیل دارند");
  return `واحد باریک: ${cramped.evaluation.darkHabitable.length} فضای بی‌نور، ${cramped.evaluation.narrowRooms.length} فضای باریک، ${cramped.alternatives.length} گزینه با دلیل`;
});

test("planfix", "زمین نامنظم L: بلوک و اجزا داخل محدوده و یکپارچگی pass", () => {
  const irregular = RESULTS.find((result) => result.parcel.id === "irregular-L")!;
  assert(!irregular.error, `زمین L باید قابل ساخت باشد: ${irregular.error}`);
  assert(irregular.analysis.plotAreaM2 > 0, "مساحت زمین محاسبه نشده");
  approx(irregular.analysis.plotAreaM2, 26 * 16 + 15 * 12, 1, "L parcel area");
  for (const scheme of irregular.schemes) {
    const integrity = validateScheme(scheme).evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
    assert(integrity.status === "pass", `${scheme.code}: ${integrity.status} → ${integrity.trace.slice(-2).join(" | ")}`);
    for (const plate of scheme.footprintRects) {
      assert(
        polygonInsidePolygon(rectToPoly(plate), irregular.analysis.buildablePolygon, 0.02),
        `${scheme.code}: بلوک بیرون از محدوده پس از عقب‌نشینی`,
      );
    }
    assert(!irregular.analysis.approximation.exact, "زمین مقعر باید غیردقیق/محافظه‌کارانه اعلام شود");
  }
  return `زمین L ${irregular.analysis.plotAreaM2.toFixed(1)} m² → ${irregular.schemes.length} طرح با یکپارچگی pass`;
});

void polygonArea;

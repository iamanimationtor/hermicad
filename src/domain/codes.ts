import { clamp, distanceToPolygonOutline, polygonArea, polygonInsidePolygon, rectToPoly } from "./geometry";
import { ruleDoc } from "./rules/docs";
import { verifyPlanIntegrity } from "./architecture/plan";
import { auditScheme } from "./audit/geometryAudit";
import { SEISMIC_PARAMS } from "./constants";
import {
  CODE_SET,
  DISCLAIMER,
  ENGINE_VERSION,
  GLAZING_RATIO_MIN,
  MAX_CROSS_VENTILATION_DEPTH_M,
  TRAVEL_DISTANCE_LIMIT_M,
  UNIT_NET_FACTOR,
} from "./constants";
import { DWELLING_LABEL, totalDwellingCount } from "./requirements";
import type {
  CanonicalScheme,
  Issue,
  RuleEvaluation,
  Severity,
  ValidationReport,
} from "./types";

export interface RuleOutcome {
  status: RuleEvaluation["status"];
  observed: number | string;
  required: number | string | null;
  message: string;
  unit?: string;
  trace: string[];
  location?: RuleEvaluation["location"];
}

export interface RuleDefinition {
  id: string;
  title: string;
  category: string;
  source: string;
  edition: string;
  severity: Severity;
  remediation: string;
  /**
   * Returns the list of missing/invalid inputs. A non-empty list makes the rule
   * `insufficient` — never `pass` — so absence of data can never be read as
   * compliance.
   */
  guard?: (scheme: CanonicalScheme) => string[];
  evaluate: (scheme: CanonicalScheme) => RuleOutcome;
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number.NaN);
const positive = (value: unknown): boolean => num(value) > 0;
const programRules = (scheme: CanonicalScheme) =>
  scheme.requirements?.dwellings?.filter((d) => d.count > 0) ?? [];

const metric = (scheme: CanonicalScheme, id: string): number =>
  scheme.metrics.find((m) => m.id === id)?.value ?? 0;

const ok = (observed: number | string, required: number | string | null, message: string, trace: string[], unit = "", extra: Partial<RuleOutcome> = {}): RuleOutcome => ({
  status: "pass",
  observed,
  required,
  message,
  trace,
  unit,
  ...extra,
});

export const RULES: RuleDefinition[] = [
  {
    id: "SITE-GEOM-01",
    title: "اعتبار هندسه زمین و سطح ساخت‌پذیر",
    category: "site",
    source: "دستور کار HERMICAD — کنترل یکپارچگی هندسی",
    edition: ENGINE_VERSION,
    severity: "critical",
    remediation: "مختصات مرز را اصلاح کنید؛ مرز نباید خودمتقاطع یا دارای مساحت صفر باشد.",
    evaluate: (s) => {
      const area = polygonArea(s.site.boundary);
      const inside = s.footprintRects.every((r) =>
        s.buildablePolygon.length >= 3 &&
        [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ].every((p) => pointInBuildable(p, s.buildablePolygon)),
      );
      return {
        status: area > 0 && s.buildableAreaM2 > 0 && inside ? "pass" : "fail",
        observed: `${s.footprintRects.length} بلوک در ${Math.round(area)} m²`,
        required: "مرز معتبر و بلوک‌ها داخل محدوده ساخت‌پذیر",
        message:
          area > 0 && inside
            ? "هندسه زمین و استقرار بلوک‌ها معتبر است."
            : "بلوک سازه‌ای خارج از محدوده ساخت‌پذیر یا هندسه زمین نامعتبر است.",
        unit: "-",
        trace: [
          `مساحت زمین ${Math.round(area)} m²`,
          `سطح ساخت‌پذیر ${Math.round(s.buildableAreaM2)} m² پس از عقب‌نشینی`,
          `بررسی گوشه بلوک‌ها: ${inside ? "داخل" : "خارج"}`,
        ],
      };
    },
  },
  {
    id: "CODE-04-FAR",
    title: "کنترل تراکم ساختمانی (FAR)",
    category: "massing",
    source: "مبحث ۴ مقررات ملی / طرح تفصیلی",
    edition: CODE_SET.edition,
    severity: "major",
    remediation: "تعداد طبقات یا سطح اشغال را کاهش دهید تا تراکم مجاز رعایت شود.",
    guard: (s) => [
      ...(positive(s.plotAreaM2) ? [] : ["مساحت زمین (plotAreaM2) بزرگ‌تر از صفر نیست."]),
      ...(positive(s.requirements?.farMax) ? [] : ["سقف تراکم (requirements.farMax) تعیین نشده است."]),
      ...(positive(s.grossFloorAreaM2) ? [] : ["زیربنای کل (grossFloorAreaM2) محاسبه نشده است."]),
    ],
    evaluate: (s) => {
      const far = s.grossFloorAreaM2 / Math.max(1, s.plotAreaM2);
      const max = s.requirements.farMax;
      return {
        status: far <= max + 1e-6 ? "pass" : "fail",
        observed: Number(far.toFixed(3)),
        required: max,
        unit: "-",
        message: far <= max ? "تراکم مجاز رعایت شده است." : `تراکم ${far.toFixed(2)} از سقف ${max} بیشتر است.`,
        trace: [`زیربنای کل ${s.grossFloorAreaM2} m²`, `مساحت زمین ${s.plotAreaM2} m²`, `سقف تراکم ${max}`],
      };
    },
  },
  {
    id: "CODE-04-COVERAGE",
    title: "کنترل سطح اشغال",
    category: "massing",
    source: "مبحث ۴ مقررات ملی / طرح تفصیلی",
    edition: CODE_SET.edition,
    severity: "major",
    remediation: "پلان اشغال را کوچک‌تر کنید یا ارتفاع را افزایش دهید.",
    guard: (s) => [
      ...(positive(s.plotAreaM2) ? [] : ["مساحت زمین بزرگ‌تر از صفر نیست."]),
      ...(positive(s.requirements?.coverageMax) ? [] : ["سقف سطح اشغال (requirements.coverageMax) تعیین نشده است."]),
      ...(positive(s.footprintAreaM2) ? [] : ["سطح اشغال (footprintAreaM2) محاسبه نشده است."]),
    ],
    evaluate: (s) => {
      const cov = s.footprintAreaM2 / Math.max(1, s.plotAreaM2);
      const max = s.requirements.coverageMax;
      return {
        status: cov <= max + 1e-6 ? "pass" : "fail",
        observed: Number((cov * 100).toFixed(1)),
        required: Number((max * 100).toFixed(1)),
        unit: "%",
        message: cov <= max ? "سطح اشغال مجاز رعایت شده است." : "سطح اشغال از حد مجاز بیشتر است.",
        trace: [`سطح اشغال ${s.footprintAreaM2} m²`, `نسبت ${(cov * 100).toFixed(1)}٪`],
      };
    },
  },
  {
    id: "CODE-04-HEIGHT",
    title: "کنترل تعداد طبقات",
    category: "massing",
    source: "مبحث ۴ مقررات ملی / ضوابط شهرداری",
    edition: CODE_SET.edition,
    severity: "major",
    remediation: "تعداد طبقات را به سقف مجاز کاهش دهید.",
    guard: (s) => [
      ...(positive(s.requirements?.floorsMax) ? [] : ["سقف تعداد طبقات تعیین نشده است."]),
      ...(positive(s.floors) ? [] : ["تعداد طبقات مدل صفر است."]),
    ],
    evaluate: (s) => {
      const height = s.floors * s.floorHeightM;
      return {
        status: s.floors <= s.requirements.floorsMax ? "pass" : "fail",
        observed: s.floors,
        required: s.requirements.floorsMax,
        unit: "طبقه",
        message:
          s.floors <= s.requirements.floorsMax
            ? `تعداد طبقات مجاز است (ارتفاع کل ${height.toFixed(1)} m).`
            : "تعداد طبقات از حد مجاز بیشتر است.",
        trace: [`ارتفاع طبقه ${s.floorHeightM} m`, `ارتفاع کل ${height.toFixed(1)} m`],
      };
    },
  },
  {
    id: "CODE-04-UNIT-SUPPLY",
    title: "تأمین برنامه واحدها",
    category: "program",
    source: "نیازمندی پروژه (تأیید مهندس)",
    edition: CODE_SET.edition,
    severity: "major",
    remediation: "ظرفیت طبقه یا تعداد طبقات را افزایش دهید تا تمام واحدهای درخواستی تأمین شود.",
    guard: (s) => [
      ...(programRules(s).length > 0 ? [] : ["برنامه واحدها (requirements.dwellings) خالی است."]),
      ...(positive(s.unitsTotal) ? [] : ["تعداد واحد تأمین‌شده در مدل صفر است."]),
    ],
    evaluate: (s) => {
      const demanded = totalDwellingCount(s.requirements);
      const delivered = s.unitsTotal;
      return {
        status: delivered >= demanded ? "pass" : "fail",
        observed: delivered,
        required: demanded,
        unit: "واحد",
        message:
          delivered >= demanded
            ? `${delivered} واحد تأمین شد (${delivered - demanded} واحد مازاد بر برنامه).`
            : `${demanded - delivered} واحد از برنامه تأمین نشده است.`,
        trace: [
          `برنامه: ${s.requirements.dwellings.map((d) => `${DWELLING_LABEL[d.type]}=${d.count}`).join(" / ")}`,
          `تأمین‌شده در طبقه نمونه: ${Object.entries(s.unitMix).map(([type, count]) => `${DWELLING_LABEL[type as keyof typeof DWELLING_LABEL] ?? type}=${count}`).join(" / ")}`,
          `ظرفیت طبقه ${s.unitsPerFloor} واحد × ${s.floors} طبقه`,
          "کنترل تطابق گونه‌ها در گزارش می‌آید؛ توزیع گونه‌ها بر مبنای بزرگ‌ترین باقیمانده برنامه انجام می‌شود.",
        ],
      };
    },
  },
  {
    id: "CODE-04-UNIT-MIX",
    title: "تطابق آمیزه واحدها با برنامه درخواستی",
    category: "program",
    source: "نیازمندی پروژه (برنامه واحدها)",
    edition: CODE_SET.edition,
    severity: "minor",
    remediation: "با تغییر تعداد طبقات یا تخصیص گونه‌ها در طبقه، آمیزه واحدها را به برنامه نزدیک کنید.",
    guard: (s) => [
      ...(programRules(s).length > 0 ? [] : ["برنامه واحدها خالی است."]),
      ...(s.unitMix && Object.keys(s.unitMix).length > 0 ? [] : ["آمیزه واحدها (unitMix) در مدل وجود ندارد."]),
    ],
    evaluate: (s) => {
      const requested = s.requirements.dwellings.filter((d) => d.count > 0);
      const deficits = requested
        .map((d) => ({ type: d.type, requested: d.count, delivered: s.unitMix[d.type] ?? 0 }))
        .filter((d) => d.delivered < d.requested);
      const missing = deficits.filter((d) => d.delivered === 0);
      const status = missing.length > 0 ? "fail" : deficits.length > 0 ? "warn" : "pass";
      return {
        status,
        observed: `${Object.entries(s.unitMix).map(([type, count]) => `${DWELLING_LABEL[type as keyof typeof DWELLING_LABEL] ?? type}=${count}`).join(" / ")}`,
        required: requested.map((d) => `${DWELLING_LABEL[d.type]}=${d.count}`).join(" / "),
        unit: "واحد",
        message:
          status === "pass"
            ? "آمیزه واحدهای تأمین‌شده با برنامه مطابق است."
            : missing.length > 0
              ? "یک یا چند گونه واحد در برنامه به‌کلی تأمین نشده است."
              : "کمبود جزئی در برخی گونه‌های واحد نسبت به برنامه وجود دارد (مازاد گونه‌های دیگر).",
        trace: requested.map(
          (d) => `${DWELLING_LABEL[d.type]}: درخواست ${d.count} / تأمین ${s.unitMix[d.type] ?? 0}`,
        ),
      };
    },
  },
  {
    id: "CODE-04-MIN-DWELLING",
    title: "حداقل زیربنای واحدها",
    category: "architecture",
    source: "مبحث ۴ مقررات ملی (حداقل سطح واحد مسکونی)",
    edition: CODE_SET.edition,
    severity: "major",
    remediation: "چیدمان را با تعداد واحد کمتر در طبقه بازتولید کنید یا مساحت اشغال را افزایش دهید.",
    guard: (s) => [
      ...(s.units?.length ? [] : ["هیچ واحدی در مدل وجود ندارد."]),
      ...(programRules(s).some((d) => positive(d.minAreaM2)) ? [] : ["حداقل زیربنای برنامه تعیین نشده است."]),
    ],
    evaluate: (s) => {
      const real = s.units.map((u) => {
        const req = s.requirements.dwellings.find((d) => d.type === u.type);
        return { unit: u, net: u.areaM2 * UNIT_NET_FACTOR, min: req?.minAreaM2 ?? 0 };
      });
      const bad = real.filter((r) => r.net + 0.05 < r.min);
      return {
        status: bad.length === 0 ? "pass" : "fail",
        observed: bad.length ? Number(bad[0].net.toFixed(1)) : Number(Math.min(...real.map((r) => r.net)).toFixed(1)),
        required: bad.length ? bad[0].min : Math.max(...real.map((r) => r.min)),
        unit: "m²",
        message:
          bad.length === 0
            ? "تمام واحدها حداقل زیربنا را رعایت می‌کنند."
            : `${bad.length} واحد کوچک‌تر از حداقل زیربنا هستند.`,
        trace: [`ضریب خالص ${UNIT_NET_FACTOR}`, `حداکثر افت مجاز ۶٪`, `واحدهای ناقض: ${bad.map((b) => b.unit.label).join("، ") || "—"}`],
        location: bad[0] ? { level: 0, rect: bad[0].unit.rect } : undefined,
      };
    },
  },
  {
    id: "CODE-04-ROOM-MIN",
    title: "حداقل مساحت فضاهای اصلی",
    category: "architecture",
    source: "مبحث ۴ + رویه طراحی مسکن",
    edition: CODE_SET.edition,
    severity: "minor",
    remediation: "فضای کوچک را با فضای مجاور ادغام کنید یا برنامه واحد را بازتوزیع کنید.",
    guard: (s) => [
      ...((s.levels?.[0]?.rooms?.length ?? 0) > 0 ? [] : ["فضای مدل‌شده‌ای وجود ندارد."]),
    ],
    evaluate: (s) => {
      const rooms = (s.levels[0]?.rooms ?? []).filter((r) => r.unitIndex >= 0 && r.minAreaM2 > 0);
      const bad = rooms.filter((r) => r.areaM2 * UNIT_NET_FACTOR + 0.05 < r.minAreaM2);
      return {
        status: bad.length === 0 ? "pass" : "warn",
        observed: bad.length,
        required: 0,
        unit: "فضای ناقض",
        message:
          bad.length === 0
            ? "تمام فضاهای اصلی حداقل مساحت را دارند."
            : `${bad.length} فضا کوچک‌تر از حداقل مساحت است (نیازمند بازطراحی چیدمان).`,
        trace: bad.slice(0, 6).map((r) => `${r.label}: ${r.areaM2} m² خالص ${(r.areaM2 * UNIT_NET_FACTOR).toFixed(1)} / حداقل ${r.minAreaM2}`),
        location: bad[0] ? { level: 0, roomId: bad[0].id, polygon: bad[0].polygon } : undefined,
      };
    },
  },
  {
    id: "FIRE-03-CORRIDOR",
    title: "حداقل عرض راهروی مشترک",
    category: "fire",
    source: "مبحث ۳ مقررات ملی (راه فرار)",
    edition: CODE_SET.edition,
    severity: "major",
    remediation: "عرض راهرو را حداقل به ۱.۵ متر افزایش دهید.",
    evaluate: (s) => {
      const level = s.levels[0];
      const width = level?.corridorWidthM ?? 0;
      return {
        status: width >= 1.5 ? "pass" : "fail",
        observed: width,
        required: 1.5,
        unit: "m",
        message: width >= 1.5 ? "عرض راهروی مشترک مجاز است." : "عرض راهروی مشترک کمتر از حد مجاز است.",
        trace: [`راهروهای مدل‌شده: ${level?.corridors.length ?? 0}`, `عرض ${width} m`],
      };
    },
  },
  {
    id: "FIRE-03-EXITS",
    title: "تعداد خروج‌های امن (هسته‌های فرار)",
    category: "fire",
    source: "مبحث ۳ مقررات ملی (تعداد راه‌های خروج)",
    edition: CODE_SET.edition,
    severity: "critical",
    remediation: "برای هر طبقه حداقل دو هسته مستقل فرار پیش‌بینی کنید.",
    guard: (s) => [
      ...((s.levels?.[0]?.cores?.length ?? 0) > 0 || positive(s.unitsPerFloor) ? [] : ["داده هسته/واحد در طبقه وجود ندارد."]),
    ],
    evaluate: (s) => {
      const height = s.floors * s.floorHeightM;
      const required = s.unitsPerFloor > 5 || height > 21 ? 2 : 1;
      const cores = s.levels[0]?.cores.length ?? 0;
      return {
        status: cores >= required ? "pass" : "fail",
        observed: cores,
        required,
        unit: "هسته",
        message:
          cores >= required
            ? `تعداد هسته فرار مطابق نیاز است (${cores}).`
            : `نیاز به ${required} هسته فرار مستقل؛ ${cores} هسته مدل شده است.`,
        trace: [`واحد در طبقه ${s.unitsPerFloor}`, `ارتفاع کل ${height.toFixed(1)} m`, `معیار: واحد>۵ یا ارتفاع>۲۱ m ⇒ ۲ خروج`],
      };
    },
  },
  {
    id: "FIRE-03-TRAVEL",
    title: "حداکثر فاصله حرکت تا خروج",
    category: "fire",
    source: "مبحث ۳ مقررات ملی",
    edition: CODE_SET.edition,
    severity: "major",
    remediation: "هسته فرار دوم یا خروج اضطراری اضافه کنید تا فاصله حرکت کاهش یابد.",
    guard: (s) => [
      ...((s.levels?.[0]?.cores?.length ?? 0) > 0 ? [] : ["هیچ هسته‌ای در طبقه مدل نشده؛ فاصله تا خروج قابل محاسبه نیست."]),
      ...((s.levels?.[0]?.rooms?.filter((r) => r.habitable).length ?? 0) > 0 ? [] : ["فضای قابل سکونتی برای سنجش فاصله وجود ندارد."]),
    ],
    evaluate: (s) => {
      const d = s.circulation.maxTravelDistanceM;
      return {
        status: d <= TRAVEL_DISTANCE_LIMIT_M ? "pass" : "fail",
        observed: d,
        required: TRAVEL_DISTANCE_LIMIT_M,
        unit: "m",
        message:
          d <= TRAVEL_DISTANCE_LIMIT_M
            ? "حداکثر فاصله حرکت تا خروج مجاز است."
            : "فاصله حرکت تا نزدیک‌ترین خروج از حد مجاز بیشتر است.",
        trace: [s.circulation.routeMethod, `حد ${TRAVEL_DISTANCE_LIMIT_M} m`],
      };
    },
  },
  {
    id: "NBR-21-PARKING",
    title: "تأمین پارکینگ",
    category: "parking",
    source: "مبحث ۲۱ مقررات ملی (پارکینگ)",
    edition: CODE_SET.edition,
    severity: "major",
    remediation: "پارکینگ زیرزمینی/سطحی بیشتری تخصیص دهید یا تعداد واحد را کاهش دهید.",
    guard: (s) => [
      ...(s.parking ? [] : ["داده پارکینگ محاسبه نشده است."]),
      ...(positive(s.unitsTotal) ? [] : ["تعداد واحد برای محاسبه نیاز پارکینگ صفر است."]),
      ...(Number.isFinite(num(s.requirements?.parkingPerDwelling)) ? [] : ["نسبت پارکینگ هر واحد تعیین نشده است."]),
    ],
    evaluate: (s) => ({
      status: s.parking.providedStalls >= s.parking.requiredStalls ? "pass" : "fail",
      observed: s.parking.providedStalls,
      required: s.parking.requiredStalls,
      unit: "جایگاه",
      message: s.parking.note,
      trace: [
        `نسبت ${s.requirements.parkingPerDwelling} جایگاه/واحد + ${s.requirements.visitorParkingRatio * 100}٪ مهمان`,
        `زیرزمین ${s.parking.basementLevels} طبقه، مساحت مؤثر هر جایگاه ${s.parking.effectiveAreaPerStallM2} m²`,
      ],
    }),
  },
  {
    id: "NBR-15-DAYLIGHT",
    title: "نور روز فضاهای قابل سکونت",
    category: "daylight",
    source: "مبحث ۱۵ / مبحث ۴ (نورگیر فضاهای اصلی)",
    edition: CODE_SET.edition,
    severity: "major",
    remediation: "چیدمان را تغییر دهید تا هر فضای قابل سکونت به نمای خارجی دسترسی داشته باشد.",
    guard: (s) => [
      ...((s.daylight?.habitableRooms ?? 0) > 0 ? [] : ["هیچ فضای قابل سکونتی شناسایی نشده؛ نور روز قابل ارزیابی نیست."]),
    ],
    evaluate: (s) => {
      const d = s.daylight;
      return {
        status: d.compliantRooms >= d.habitableRooms ? "pass" : "fail",
        observed: d.compliantRooms,
        required: d.habitableRooms,
        unit: "اتاق منطبق",
        message:
          d.compliantRooms >= d.habitableRooms
            ? "تمام فضاهای قابل سکونت نورگیر مستقیم دارند."
            : `${d.habitableRooms - d.compliantRooms} فضای قابل سکونت نورگیر مستقیم ندارد.`,
        trace: [
          `نسبت شیشه به سطح: ${(d.averageWindowRatio * 100).toFixed(1)}٪ (حد ${GLAZING_RATIO_MIN * 100}٪)`,
          `نسبت شیشه از سطح پنجره و ارتفاع ۱.۵ m با ضریب عبور ۰.۹ برآورد شده است`,
        ],
      };
    },
  },
  {
    id: "NBR-15-CROSSVENT",
    title: "تهویه دوطرفه واحدها",
    category: "daylight",
    source: "مبحث ۱۵ (تهویه طبیعی) / رویه مسکن",
    edition: CODE_SET.edition,
    severity: "minor",
    remediation: "عمق واحد را کاهش دهید یا چاه نور میانی اضافه کنید.",
    guard: (s) => [
      ...(s.units?.length ? [] : ["هیچ واحدی برای سنجش عمق وجود ندارد."]),
    ],
    evaluate: (s) => {
      const depth = Math.max(...s.units.map((u) => u.rect.h), 0);
      return {
        status: depth <= MAX_CROSS_VENTILATION_DEPTH_M ? "pass" : "warn",
        observed: Number(depth.toFixed(1)),
        required: MAX_CROSS_VENTILATION_DEPTH_M,
        unit: "m",
        message:
          depth <= MAX_CROSS_VENTILATION_DEPTH_M
            ? "عمق واحد برای تهویه دوطرفه مناسب است."
            : "عمق واحد از حد تهویه دوطرفه بیشتر است (حد پایین برآورد).",
        trace: [`عمق واحد ${depth.toFixed(1)} m`, "بررسی وجود حداقل دو نمای نورگیر در هر واحد"],
      };
    },
  },
  {
    id: "STRUCT-02-COLUMN",
    title: "کنترل مقدماتی ابعاد ستون",
    category: "structure",
    source: "مبحث ۹ / استاندارد ۲۸۰۰ (طرح مقدماتی)",
    edition: CODE_SET.edition,
    severity: "minor",
    remediation: "ابعاد ستون یا تعداد دهانه‌ها را بازتنظیم کنید؛ طرح نهایی نیازمند تحلیل سازه است.",
    guard: (s) => [
      ...(positive(s.structural?.columnSizeMm) ? [] : ["مقطع ستون محاسبه نشده است."]),
      ...(positive(s.footprintAreaM2) ? [] : ["سطح اشغال برای محاسبه بار ستون لازم است."]),
    ],
    evaluate: (s) => {
      const size = s.structural.columnSizeMm;
      return {
        status: size <= 700 ? "pass" : "warn",
        observed: size,
        required: 700,
        unit: "mm",
        message: size <= 700 ? "ابعاد مقدماتی ستون در بازه متعارف است." : "ابعاد ستون بزرگ است؛ تحلیل دقیق سازه لازم است.",
        trace: [
          `بار محوری طراحی ${s.structural.columnLoadKN} kN`,
          `سطح بارگیر هر ستون ${(s.footprintAreaM2 / s.structural.columns).toFixed(1)} m²`,
          "فرمول: Ag = Pu / (0.35 f'c) — طرح مقدماتی",
        ],
      };
    },
  },
  {
    id: "STRUCT-02-FOUNDATION",
    title: "کنترل تنش مجاز خاک پی",
    category: "structure",
    source: "مبحث ۷ مقررات ملی (پی‌سازی)",
    edition: CODE_SET.edition,
    severity: "major",
    remediation: "ابعاد پی را افزایش دهید یا رادیه/شمع پیش‌بینی کنید.",
    guard: (s) => [
      ...(positive(s.site?.soilBearingKPa) ? [] : ["ظرفیت باربری خاک (soilBearingKPa) ثبت نشده است؛ ارزیابی پی ممکن نیست."]),
      ...(positive(s.structural?.requiredFoundationWidthM) ? [] : ["عرض پی محاسبه نشده است."]),
    ],
    evaluate: (s) => {
      const width = s.structural.requiredFoundationWidthM;
      return {
        status: width <= 3.0 ? "pass" : "fail",
        observed: width,
        required: 3.0,
        unit: "m",
        message: width <= 3.0 ? "عرض پی منفرد در بازه متعارف است." : "عرض پی منفرد بزرگ‌تر از ۳ متر؛ رادیه یا شمع بررسی شود.",
        trace: [`تنش مجاز خاک ${s.site.soilBearingKPa} kPa`, `بار خدمت ستون ≈ ${s.structural.columnLoadKN} kN`],
      };
    },
  },
  {
    id: "STRUCT-02-SEISMIC",
    title: "کنترل مقدماتی ضریب زلزله",
    category: "structure",
    source: "استاندارد ۲۸۰۰ ویرایش ۴",
    edition: "2800.4",
    severity: "minor",
    remediation: "سیستم سازه‌ای با شکل‌پذیری بالاتر یا تحلیل دینامیکی لازم است.",
    guard: (s) => [
      ...(positive(s.structural?.seismicCoefficient) ? [] : ["ضریب زلزله محاسبه نشده است."]),
      ...(s.site?.seismicZone && SEISMIC_PARAMS[s.site.seismicZone] ? [] : ["پهنه لرزه‌ای معتبر تعیین نشده است."]),
    ],
    evaluate: (s) => {
      const c = s.structural.seismicCoefficient;
      return {
        status: c <= 0.15 ? "pass" : "warn",
        observed: c,
        required: 0.15,
        unit: "-",
        message: c <= 0.15 ? "ضریب زلزله در بازه متعارف است." : "ضریب زلزله بالا؛ کنترل دقیق تغییرمکان لازم است.",
        trace: [`C = A×B×I/R`, `برش پایه ${s.structural.seismicBaseShearKN} kN`, `وزن لرزه‌ای ${s.structural.buildingWeightKN} kN`],
      };
    },
  },
  {
    id: "MEP-16-WATER",
    title: "ظرفیت ذخیره آب",
    category: "mep",
    source: "مبحث ۱۶ مقررات ملی",
    edition: CODE_SET.edition,
    severity: "minor",
    remediation: "حجم مخزن ذخیره را افزایش دهید.",
    guard: (s) => [
      ...(positive(s.mep?.occupancy) ? [] : ["جمعیت معادل برای محاسبه آب صفر/نامشخص است."]),
      ...(positive(s.mep?.waterDailyLiters) ? [] : ["مصرف روزانه آب محاسبه نشده است."]),
    ],
    evaluate: (s) => {
      const tank = s.mep.waterTankLiters;
      const need = s.mep.waterDailyLiters;
      return {
        status: tank >= need * 0.9 ? "pass" : "warn",
        observed: tank,
        required: Math.round(need),
        unit: "L",
        message: tank >= need * 0.9 ? "ظرفیت مخزن آب کافی است." : "ظرفیت مخزن کمتر از مصرف روزانه است.",
        trace: [`جمعیت معادل ${s.mep.occupancy} نفر`, `مصرف روزانه ${need} L`],
      };
    },
  },
  {
    id: "MEP-13-ELECTRICAL",
    title: "ظرفیت ترانسفورماتور",
    category: "mep",
    source: "مبحث ۱۳ مقررات ملی",
    edition: CODE_SET.edition,
    severity: "minor",
    remediation: "ظرفیت ترانس را یک پله استاندارد افزایش دهید.",
    guard: (s) => [
      ...(positive(s.mep?.electricalDemandKVA) ? [] : ["تقاضای الکتریکی محاسبه نشده است."]),
      ...(positive(s.mep?.transformerKVA) ? [] : ["ظرفیت ترانس تعیین نشده است."]),
    ],
    evaluate: (s) => ({
      status: s.mep.transformerKVA >= s.mep.electricalDemandKVA ? "pass" : "fail",
      observed: s.mep.transformerKVA,
      required: Number(s.mep.electricalDemandKVA.toFixed(1)),
      unit: "kVA",
      message: "ظرفیت ترانس بر مبنای تقاضای همزمان ۶۰٪ و ذخیره ۲۵٪ انتخاب شده است.",
      trace: [`توان نصب‌شده ${s.mep.electricalConnectedKVA} kVA`, `تقاضا ${s.mep.electricalDemandKVA} kVA`],
    }),
  },
  {
    id: "DATA-01-INTEGRITY",
    title: "یکپارچگی مدل مهندسی",
    category: "data",
    source: "HERMICAD — کنترل مرجع واحد داده",
    edition: ENGINE_VERSION,
    severity: "critical",
    remediation: "مدل را بازتولید کنید؛ اختلاف بین هندسه و مقادیر ثبت‌شده نشانه نقص داده است.",
    guard: (s) => [
      ...((s.levels?.flatMap((l) => l.rooms).length ?? 0) > 0 ? [] : ["مدل هیچ فضایی ندارد؛ یکپارچگی قابل بررسی نیست."]),
    ],
    evaluate: (s) => {
      const rooms = s.levels.flatMap((l) => l.rooms);
      const ids = new Set(rooms.map((r) => r.id));
      const mismatch = rooms.filter((r) => Math.abs(polygonArea(r.polygon) - r.areaM2) > 0.05);
      const structuralSum = s.levels.reduce((sum, l) => sum + l.plateAreaM2, 0);
      const gfaMismatch = Math.abs(structuralSum - s.grossFloorAreaM2) > 1;
      const uniqueOk = ids.size === rooms.length;
      const insideBuildable = s.buildablePolygon.length >= 3
        ? s.footprintRects.every((rect) => polygonInsidePolygon(rectToPoly(rect), s.buildablePolygon, 0.02))
        : false;
      const roomsInsidePlate = s.levels.every((level) =>
        level.rooms.every((room) => level.plateRects.some((rect) => polygonInsidePolygon(room.polygon, rectToPoly(rect), 0.02))),
      );
      const unitsInsidePlate = s.units.every((unit) =>
        s.footprintRects.some((rect) => polygonInsidePolygon(rectToPoly(unit.rect), rectToPoly(rect), 0.02)),
      );
      // The independent audit is deliberately computed here as well: the rule
      // must not rely solely on the builder's own bookkeeping.
      const audit = auditScheme(s);
      const auditFailures = audit.levels.flatMap((level) =>
        level.findings.filter((finding) => finding.status === "fail"),
      );
      const planResults = s.levels.map((level) => verifyPlanIntegrity(level));
      const planIssues = planResults.flatMap((result) => (result.layerMissing ? [] : result.problems));
      const planMissing = planResults.some((result) => result.layerMissing);
      const planOk = planIssues.length === 0;
      const value =
        mismatch.length +
        (gfaMismatch ? 1 : 0) +
        (uniqueOk ? 0 : 1) +
        (insideBuildable ? 0 : 1) +
        (roomsInsidePlate ? 0 : 1) +
        (unitsInsidePlate ? 0 : 1) +
        (planOk ? 0 : 1) +
        // Failures reported by the independent audit are part of the invariant,
        // so a builder bug cannot be masked by its own bookkeeping.
        auditFailures.length;
      const planStatus = value > 0 ? "fail" : planMissing ? "insufficient" : "pass";
      return {
        status: planStatus,
        observed: planStatus === "insufficient" ? "ارزیابی نشد" : value,
        required: planStatus === "insufficient" ? null : 0,
        unit: "ناسازگاری",
        message:
          planStatus === "insufficient"
            ? "مدل ذخیره‌شده پیش از افزودن لایه پلان ساخته شده است؛ کنترل دیوار/بازشو انجام نشد. این وضعیت به معنی انطباق نیست."
            : value === 0
            ? "هندسه، مساحت‌ها، شناسه‌ها، زنجیره اتاق⊆بلوک⊆محدوده ساخت‌پذیر و لایه دیوار/بازشو با مدل مرکزی سازگارند."
            : "ناسازگاری بین هندسه، مساحت‌ها یا استقرار فضاها در مدل مرکزی وجود دارد.",
        trace: [
          `${rooms.length} فضا، ${s.levels.length} طبقه`,
          `مجموع سطح طبقات ${structuralSum.toFixed(1)} m² در برابر GFA ${s.grossFloorAreaM2} m²`,
          `اختلاف مساحت چندضلعی: ${mismatch.length}`,
          `بلوک‌ها داخل محدوده ساخت‌پذیر: ${insideBuildable ? "بله" : "خیر"}`,
          `فضاها داخل بلوک‌ها: ${roomsInsidePlate ? "بله" : "خیر"} · واحدها داخل بلوک‌ها: ${unitsInsidePlate ? "بله" : "خیر"}`,
          `شناسه‌های یکتا: ${uniqueOk ? "بله" : "خیر"}`,
          `لایه پلان (دیوار/بازشو/پله): ${planMissing ? "برای برخی طبقات تولید نشده (مدل قدیمی)" : planOk ? "سازگار" : `${planIssues.length} ناسازگاری`}`,
          ...planIssues.slice(0, 5).map((problem) => `ناسازگاری پلان: ${problem}`),
          `بازبینی مستقل: ${audit.passed} pass · ${audit.warnings} warning · ${audit.failed} fail · ${audit.insufficient} insufficient`,
          ...auditFailures.slice(0, 4).map((finding) => `بازبینی مستقل / ${finding.id}: ${finding.value} — ${finding.detail.slice(0, 120)}`),
          ...audit.levels.flatMap((level) =>
            level.daylight.rejected.length > 0
              ? [`نورگیری مستقل (${level.name}): ${level.daylight.withValidWindow} از ${level.daylight.habitable} فضای قابل سکونت پنجره معتبر دارد`]
              : [],
          ),
        ],
      };
    },
  },
  {
    id: "ARCH-04-EFFICIENCY",
    title: "بهره‌وری خالص به ناخالص",
    category: "architecture",
    source: "HERMICAD — معیار کیفیت طراحی",
    edition: ENGINE_VERSION,
    severity: "minor",
    remediation: "سطح مشاعات/هسته را کاهش دهید یا چیدمان واحدها را فشرده‌تر کنید.",
    guard: (s) => [
      ...(positive(s.grossFloorAreaM2) ? [] : ["زیربنای کل صفر است؛ بهره‌وری قابل محاسبه نیست."]),
    ],
    evaluate: (s) => {
      const eff = metric(s, "efficiency");
      const value = clamp(eff, 0, 100);
      return {
        status: value >= 60 ? "pass" : "warn",
        observed: value,
        required: 60,
        unit: "%",
        message: value >= 60 ? "بهره‌وری سطوح قابل قبول است." : "سهم مشاعات بالاست؛ بهره‌وری سطوح پایین است.",
        trace: [`زیربنای خالص ${s.netAreaM2} m² از ${s.grossFloorAreaM2} m²`],
      };
    },
  },
];

function pointInBuildable(p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersect = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function runRule(rule: RuleDefinition, scheme: CanonicalScheme): RuleEvaluation {
  let outcome: RuleOutcome;
  const missing = rule.guard ? rule.guard(scheme) : [];
  const doc = ruleDoc(rule.id);
  try {
    if (missing.length > 0) {
      // Missing data is *not* compliance: the rule is explicitly unevaluated.
      outcome = {
        status: "insufficient",
        observed: "ارزیابی نشد",
        required: null,
        unit: "",
        message: `اطلاعات کافی برای ارزیابی این قاعده وجود ندارد: ${missing.join(" ")}`,
        trace: [
          ...missing.map((m) => `ورودی ناقص: ${m}`),
          "این نتیجه به معنی انطباق طرح نیست.",
        ],
      };
    } else {
      outcome = rule.evaluate(scheme);
    }
  } catch (error) {
    outcome = {
      status: "fail",
      observed: "خطا",
      required: null,
      message: `اجرای قاعده با خطا متوقف شد: ${(error as Error).message}`,
      trace: ["خطای اجرایی قاعده؛ نتیجه قابل اتکا نیست."],
    };
  }
  return {
    ruleId: rule.id,
    title: rule.title,
    category: rule.category,
    source: doc.citation,
    edition: rule.edition,
    sourceStatus: doc.sourceStatus,
    verification: doc.verification,
    evidence: doc.evidence,
    method: doc.method,
    formula: doc.formula,
    inputs: doc.inputs,
    inputsDetailed: doc.inputsDetailed,
    limitations: doc.limitations,
    document: doc.document,
    tests: doc.tests,
    severity: rule.severity,
    status: outcome.status,
    observed: outcome.observed,
    required: outcome.required,
    unit: outcome.unit ?? "",
    message: outcome.message,
    remediation: rule.remediation,
    trace: outcome.trace,
    location: outcome.location,
  };
}

export function validateScheme(scheme: CanonicalScheme, iteration = 0): ValidationReport {
  const evaluations = RULES.map((rule) => runRule(rule, scheme));
  const issues: Issue[] = evaluations
    .filter((e) => e.status === "fail" || e.status === "warn" || e.status === "insufficient")
    .map((e, i) => ({
      id: `${e.ruleId}-${i}`,
      ruleId: e.ruleId,
      title: e.title,
      severity:
        e.status === "insufficient" ? "info" : e.status === "warn" ? (e.severity === "critical" ? "major" : "minor") : e.severity,
      category: e.category,
      observed: e.observed,
      required: e.required,
      unit: e.unit,
      message: e.message,
      source: e.source,
      remediation: e.remediation,
      location: e.location,
      trace: e.trace,
    }));
  const categorySummary: ValidationReport["categorySummary"] = {};
  for (const e of evaluations) {
    categorySummary[e.category] ??= { pass: 0, fail: 0, warn: 0, na: 0, insufficient: 0 };
    if (e.status === "pass") categorySummary[e.category].pass += 1;
    else if (e.status === "fail") categorySummary[e.category].fail += 1;
    else if (e.status === "warn") categorySummary[e.category].warn += 1;
    else if (e.status === "insufficient") categorySummary[e.category].insufficient = (categorySummary[e.category].insufficient ?? 0) + 1;
    else categorySummary[e.category].na += 1;
  }
  const evidenceSummary: Record<string, number> = {};
  for (const e of evaluations) evidenceSummary[e.evidence] = (evidenceSummary[e.evidence] ?? 0) + 1;
  const dataCompleteness = [
    {
      item: "تراز نقاط زمین (spotLevels ≥ ۳)",
      present: (scheme.site?.spotLevels?.length ?? 0) >= 3,
      impact: "بدون آن شیب زمین تحلیل نمی‌شود؛ هیچ قاعده‌ای آن را جبران نمی‌کند.",
    },
    {
      item: "ظرفیت باربری خاک (soilBearingKPa)",
      present: positive(scheme.site?.soilBearingKPa),
      impact: "بدون آن کنترل پی ارزیابی نمی‌شود (insufficient).",
    },
    {
      item: "منبع ژئوتکنیک/آزمون خاک",
      present: false,
      impact: "هیچ داده آزمایشگاهی در سیستم ثبت نمی‌شود؛ مقدار خاک ورودی کاربر است.",
    },
    {
      item: "سند ضوابط رسمی/تأییدشده",
      present: String(CODE_SET.verification) === "externally-verified",
      impact: "همه آستانه‌ها داخلی‌اند؛ انطباق قانونی اثبات نشده است.",
    },
  ];
  const blocked = evaluations.some((e) => e.status === "fail" && e.severity === "critical");
  const insufficient = evaluations.filter((e) => e.status === "insufficient").length;
  return {
    reportId: `${scheme.id}-${iteration}`,
    schemeId: scheme.id,
    schemeCode: scheme.code,
    codeSetCode: CODE_SET.code,
    codeSetEdition: CODE_SET.edition,
    engineVersion: ENGINE_VERSION,
    evaluatedAt: new Date().toISOString(),
    iteration,
    evaluations,
    issues: issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    passed: evaluations.filter((e) => e.status === "pass").length,
    failed: evaluations.filter((e) => e.status === "fail").length,
    warnings: evaluations.filter((e) => e.status === "warn").length,
    insufficient,
    evidenceSummary,
    dataCompleteness,
    blocked,
    categorySummary,
    disclaimer: `${DISCLAIMER} قاعده‌های با وضعیت «اطلاعات ناکافی» به معنی انطباق نیستند.`,
    codeSetStatus: CODE_SET.status,
    codeSetVerification: CODE_SET.verification,
    codeSetNote: CODE_SET.note,
  };
}

export function severityRank(severity: Severity): number {
  return { critical: 4, major: 3, minor: 2, info: 1 }[severity];
}

export const RULE_CATALOG = RULES.map((r) => {
  const doc = ruleDoc(r.id);
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    source: doc.citation,
    edition: r.edition,
    severity: r.severity,
    sourceStatus: doc.sourceStatus,
    verification: doc.verification,
    method: doc.method,
    formula: doc.formula,
    inputs: doc.inputs,
    inputsDetailed: doc.inputsDetailed,
    threshold: doc.threshold,
    thresholdBasis: doc.thresholdBasis,
    limitations: doc.limitations,
    remediation: r.remediation,
    evidence: doc.evidence,
    document: doc.document,
    tests: doc.tests,
    verifiedAgainstOfficialText: doc.verifiedAgainstOfficialText,
    hasInputGuard: !!r.guard,
  };
});

export const RULE_COUNT = RULES.length;

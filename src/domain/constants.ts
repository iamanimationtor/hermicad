import type { SeismicZone } from "./types";

/** Code/parameter tables kept in one auditable place. */
export const SEISMIC_PARAMS: Record<SeismicZone, { A: number; B: number; I: number; R: number; label: string }> = {
  low: { A: 0.20, B: 2.5, I: 1.0, R: 7.5, label: "کمخطر" },
  moderate: { A: 0.25, B: 2.5, I: 1.0, R: 7.5, label: "متوسط" },
  high: { A: 0.30, B: 2.5, I: 1.0, R: 7.5, label: "زیاد" },
  veryHigh: { A: 0.35, B: 2.5, I: 1.0, R: 7.5, label: "بسیار زیاد" },
};

export const DISTANCE_FACTORS = {
  pathToCore: 1.2,
};

export const ENGINE_VERSION = "hermicad-engine/1.1.0";
/**
 * Code-set identity and, importantly, its *verification status*.
 * HERMICAD does not have a licensed, clause-by-clause copy of the national
 * building code. The thresholds below are internal engineering screening
 * values that merely reference familiar code topics. They are NOT a
 * reproduction of the official text and must be replaced by the project's
 * approved code set before any statutory claim is made.
 */
export const CODE_SET = {
  code: "HMC-INT-RES",
  edition: "2026.02-internal",
  title: "مجموعه آستانه‌های داخلی HERMICAD برای کنترل مقدماتی مسکن (غیررسمی، تأییدنشده)",
  jurisdiction: "IR-Tehran",
  status: "internal-thresholds-unverified" as const,
  verification: "unverified" as const,
  note:
    "این مجموعه ضوابط رسمی نیست. مقادیر آستانه، پیش‌فرض مهندسی داخلی برای غربالگری طرح است؛ پیش از هر ادعای انطباق قانونی باید با نسخه معتبر ضوابط حوزه پروژه و تأیید مهندس دارای صلاحیت جایگزین شود.",
  officialSourceAvailable: false,
};

export const WALL_AND_SHAFT_LOSS = 0.12; // net/gross deduction inside a dwelling
export const UNIT_NET_FACTOR = 1 - WALL_AND_SHAFT_LOSS;

/**
 * GEOMETRY CONVENTIONS (single source of truth).
 *
 * - The buildable polygon and the block plate are the **wall-centreline
 *   envelope**: rooms tile the plate, and walls are centred on room/plate edges,
 *   so half a wall thickness projects beyond the plate edge.
 * - Setbacks from the project input are measured to the **outer face of the
 *   exterior wall** (the convention a user expects when they type "3 m from the
 *   boundary"). The engine therefore erodes the parcel by
 *   `setback + EXTERIOR_WALL_THICKNESS_M / 2`, and the reported clearance is the
 *   distance from the wall outer face to the parcel boundary.
 * - These are internal modelling conventions, not a verified code provision.
 */
export const EXTERIOR_WALL_THICKNESS_M = 0.25;
export const SETBACK_REFERENCE = "outer-wall-face" as const;
export const SETBACK_REFERENCE_NOTE =
  "عقب‌نشینی ورودی نسبت به «سطح خارجی دیوار پیرامونی» سنجیده می‌شود؛ محدوده ساخت‌پذیر و بلوک بر مبنای «محور دیوار» تعریف می‌شوند و نیم‌ضخامت دیوار از محدوده کسر می‌شود.";

export const PUBLIC_CORRIDOR_WIDTH_M = 2.0;
export const CORE_WIDTH_M = 5.4;
export const CORE_STAIR_DEPTH_M = 5.6;
export const MIN_UNIT_WIDTH_M = 4.4;
export const MAX_CROSS_VENTILATION_DEPTH_M = 14;
export const TRAVEL_DISTANCE_LIMIT_M = 30;
export const GLAZING_RATIO_MIN = 0.08;

export const DISCLAIMER =
  "خروجی‌های HERMICAD محصول تحلیل الگوریتمی بر پایه مدل مهندسی و مجموعه آستانه‌های داخلی (غیررسمی) است. این خروجی جایگزین تأیید مهندس ناظر/طراح دارای صلاحیت نیست؛ فرضیات، محدودیت‌ها، وضعیت اعتبار منابع و نسخه موتور در هر خروجی ثبت می‌شود.";

/** Structural/MEP outputs are explicitly screening-stage, not design-stage. */
export const ANALYSIS_STATUS = {
  level: "preliminary-screening" as const,
  requiresEngineerReview: true,
  notForConstruction: true,
  limitations: [
    "تحلیل سازه بر پایه بارهای سرانگشتی و بدون تحلیل ماتریسی، ترکیب بار، باد و اثر لنگر/لاغری ستون است.",
    "ظرفیت باربری خاک ورودی کاربر است و هیچ آزمون ژئوتکنیکی در سیستم ثبت نشده است.",
    "بارهای MEP با روش‌های سرانگشتی و ضرایب پیش‌فرض محاسبه می‌شوند؛ افت فشار، سایزینگ نهایی و بالانس حرارتی انجام نمی‌شود.",
    "پارکینگ با مساحت مؤثر هر جایگاه برآورد می‌شود؛ چیدمان و رمپ پارکینگ طراحی نشده است.",
  ],
};

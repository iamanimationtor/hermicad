import type { DwellingProgram, DwellingType, Requirements, SiteModel } from "./types";

/** Persian/Arabic-Indic digits → Latin, ZWNJ normalisation. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\u200c/g, " ")
    .replace(/[،؛]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

export const DWELLING_LABEL: Record<DwellingType, string> = {
  studio: "استودیو",
  twoBed: "۲ خوابه",
  threeBed: "۳ خوابه",
  fourBed: "۴ خوابه",
};

export const DEFAULT_SITE: SiteModel = {
  boundary: [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 34, y: 10 },
    { x: 30, y: 26 },
    { x: 12, y: 30 },
    { x: 0, y: 22 },
  ],
  northAngleDeg: 0,
  geoAnchor: { lat: 35.7448, lng: 51.3753 },
  spotLevels: [
    { x: 0, y: 0, z: 142.4 },
    { x: 30, y: 0, z: 143.1 },
    { x: 34, y: 10, z: 143.9 },
    { x: 30, y: 26, z: 144.6 },
    { x: 12, y: 30, z: 145.2 },
    { x: 0, y: 22, z: 144.1 },
  ],
  setbacks: { north: 4, east: 3, south: 3, west: 3 },
  noBuildZones: [],
  soilBearingKPa: 180,
  seismicZone: "veryHigh",
  climate: "hotDry",
  notes: [
    "زمین نامنظم ششضلعی با شیب حدود ۲.۸ متر در جهت جنوب به شمال.",
    "جهتگیری فرضی: ضلع جنوبی رو به خیابان دسترسی ۱۲ متری.",
  ],
};

/** هندسهٔ نمونه برای پروژهٔ جدید است، نه ادعای اطلاعات خاک و لرزه‌ای پروژه. */
export const DEFAULT_PROJECT_SITE: SiteModel = {
  ...DEFAULT_SITE,
  soilBearingKPa: 0,
  seismicZone: null,
  notes: [...DEFAULT_SITE.notes, "هندسه و ترازها نمونه‌اند؛ داده‌های خاک و لرزه‌ای باید برای پروژه وارد و بررسی شوند."],
};

export const DEFAULT_REQUIREMENTS: Requirements = {
  buildingType: "residential",
  dwellings: [
    { type: "twoBed", count: 8, targetAreaM2: 78, minAreaM2: 68 },
    { type: "threeBed", count: 6, targetAreaM2: 102, minAreaM2: 88 },
  ],
  floorsMax: 6,
  floorHeightM: 3.2,
  farMax: 2.4,
  coverageMax: 0.55,
  parkingPerDwelling: 1,
  visitorParkingRatio: 0.1,
  includeBasementParking: true,
  budget: "standard",
  orientationPreference: "south",
  specialNotes: ["تفکیک واحدها با حداقل دو نمای نورگیر", "پارکینگ ساکنین در زیرزمین"],
  rawText:
    "۸ واحد ۲ خوابه و ۶ واحد ۳ خوابه، حداکثر ۶ طبقه، تراکم ۲۴۰ درصد، سطح اشغال ۵۵ درصد، یک پارکینگ برای هر واحد، زمین شیبدار نامنظم.",
  parse: { confidence: 0, warnings: [], trace: [], matched: [] },
};

export interface RequirementsPatch {
  dwellings?: DwellingProgram[];
  floorsMax?: number;
  floorHeightM?: number;
  farMax?: number;
  coverageMax?: number;
  parkingPerDwelling?: number;
  includeBasementParking?: boolean;
  budget?: Requirements["budget"];
  specialNotes?: string[];
}

/**
 * Deterministic requirement normalizer. Extracts engineering parameters from
 * free text (Persian or English) and returns a *patch* plus full traceability.
 * No model inference is used: every extracted value is matched by an explicit
 * rule, and unmatched text is surfaced as a warning rather than guessed.
 */
export function parseRequirementsText(
  rawText: string,
  base: Requirements,
): { patch: RequirementsPatch; parse: Requirements["parse"] } {
  const text = normalizeDigits(rawText);
  const patch: RequirementsPatch = {};
  const trace: string[] = [];
  const warnings: string[] = [];
  const matched: { key: string; value: string; source: string }[] = [];

  const dwellingCounts: Partial<Record<DwellingType, number>> = {};
  const typePatterns: { type: DwellingType; re: RegExp }[] = [
    { type: "studio", re: /(استودیو|سوئیت|بدون\s*اتاق|studio)/i },
    { type: "twoBed", re: /(2|دو)\s*(خواب|اتاق\s*خواب|bed)/i },
    { type: "threeBed", re: /(3|سه)\s*(خواب|اتاق\s*خواب|bed)/i },
    { type: "fourBed", re: /(4|چهار)\s*(خواب|اتاق\s*خواب|bed)/i },
  ];
  for (const { type, re } of typePatterns) {
    const countRe = new RegExp(`(\\d+)\\s*(?:واحد|آپارتمان|دستگاه)[^\\d]{0,12}?${re.source}`, "i");
    const m = text.match(countRe) ?? text.match(new RegExp(`${re.source}[^\\d]{0,12}?(\\d+)\\s*(?:واحد|آپارتمان)`, "i"));
    if (!m) continue;
    const number = Number.parseInt(m[1] ?? m[2] ?? "0", 10);
    if (Number.isFinite(number) && number > 0) {
      dwellingCounts[type] = number;
      trace.push(`تعداد واحد ${DWELLING_LABEL[type]} از متن: ${number} (الگوی «تعداد + واحد + نوع»)`);
      matched.push({ key: `dwellings.${type}.count`, value: String(number), source: m[0] });
    }
  }
  if (Object.keys(dwellingCounts).length > 0) {
    patch.dwellings = base.dwellings.map((d) => {
      const explicit = dwellingCounts[d.type];
      if (explicit !== undefined) return { ...d, count: explicit };
      return d.type in dwellingCounts ? d : { ...d, count: 0 };
    });
    const missing = patch.dwellings.filter((d) => d.count === 0).map((d) => DWELLING_LABEL[d.type]);
    if (missing.length) {
      warnings.push(
        `برای انواع ${missing.join("، ")} تعداد صریحی در متن یافت نشد؛ مقدار صفر قرار گرفت و باید تأیید شود.`,
      );
    }
  }

  const floors = text.match(/(\d+)\s*(?:طبقه|floor|storey)/i);
  if (floors) {
    patch.floorsMax = Number.parseInt(floors[1], 10);
    trace.push(`حداکثر طبقات: ${patch.floorsMax} (الگوی «تعداد + طبقه»)`);
    matched.push({ key: "floorsMax", value: floors[1], source: floors[0] });
  }

  const floorHeight = text.match(/(?:ارتفاع\s*(?:طبقه|کف\s*تا\s*کف))\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (floorHeight) {
    patch.floorHeightM = Number.parseFloat(floorHeight[1]);
    trace.push(`ارتفاع طبقه: ${patch.floorHeightM} m از متن استخراج شد.`);
    matched.push({ key: "floorHeightM", value: floorHeight[1], source: floorHeight[0] });
  }

  const far = text.match(/(?:تراکم|far)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(درصد|%|)/i);
  if (far) {
    const value = Number.parseFloat(far[1]);
    patch.farMax = far[2] ? value / 100 : value > 10 ? value / 100 : value;
    trace.push(`حداکثر تراکم: ${patch.farMax} (ورودی ${far[1]}${far[2] ?? ""} نرمال شد).`);
    matched.push({ key: "farMax", value: String(patch.farMax), source: far[0] });
  }

  const coverage = text.match(/(?:سطح\s*اشغال|پوشش|coverage)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(درصد|%|)/i);
  if (coverage) {
    const value = Number.parseFloat(coverage[1]);
    patch.coverageMax = coverage[2] ? value / 100 : value > 1 ? value / 100 : value;
    trace.push(`حداکثر سطح اشغال: ${(patch.coverageMax * 100).toFixed(1)}٪`);
    matched.push({ key: "coverageMax", value: String(patch.coverageMax), source: coverage[0] });
  }

  if (/(زیرزمین|پارکینگ\s*زیرزمین|basement)/i.test(text)) {
    patch.includeBasementParking = true;
    trace.push("وجود پارکینگ زیرزمینی از متن تشخیص داده شد.");
  }

  const parking = text.match(/(\d+|یک|دو)\s*پارکینگ(?:\s*برای\s*هر\s*واحد|\s*به\s*ازای\s*هر\s*واحد)?/i);
  if (parking) {
    const map: Record<string, number> = { یک: 1, دو: 2 };
    const value = Number.parseInt(parking[1], 10);
    patch.parkingPerDwelling = Number.isFinite(value) ? value : map[parking[1]] ?? 1;
    trace.push(`نسبت پارکینگ: ${patch.parkingPerDwelling} جایگاه برای هر واحد.`);
    matched.push({ key: "parkingPerDwelling", value: String(patch.parkingPerDwelling), source: parking[0] });
  }

  if (/(لوکس|پریمیوم|premium)/i.test(text)) patch.budget = "premium";
  if (/(اقتصادی|ارزان|economy)/i.test(text)) patch.budget = "economy";

  const recognizedSignals = trace.length;
  const confidence = Math.min(0.95, 0.25 + recognizedSignals * 0.14);
  if (recognizedSignals === 0) {
    warnings.push("هیچ پارامتر مهندسی قابل استنادی در متن یافت نشد؛ مقادیر فرم مبنا قرار می‌گیرد.");
  }
  warnings.push(
    "مقادیر استخراج‌شده از متن، «پیش‌نویس نیازمندی» هستند و تا تأیید مهندس مجاز نیستند در محاسبات نهایی قطعی تلقی شوند.",
  );
  trace.push("اعتبارسنجی دامنه: تعداد طبقات، تراکم و سطح اشغال با محدوده‌های مجاز سند ضوابط کنترل می‌شود.");

  return {
    patch,
    parse: { confidence, warnings, trace, matched },
  };
}

export function applyRequirementsPatch(base: Requirements, patch: RequirementsPatch): Requirements {
  return {
    ...base,
    ...patch,
    dwellings: (patch.dwellings ?? base.dwellings).filter((d) => d.count >= 0),
  };
}

export function totalDwellingCount(requirements: Requirements): number {
  return requirements.dwellings.reduce((s, d) => s + d.count, 0);
}

export function weightedTargetArea(requirements: Requirements): number {
  const total = totalDwellingCount(requirements);
  if (total === 0) return 85;
  return requirements.dwellings.reduce((s, d) => s + d.count * d.targetAreaM2, 0) / total;
}

export interface ValidationOutcome {
  ok: boolean;
  errors: string[];
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

export function validateRequirements(requirements: Requirements): ValidationOutcome {
  const errors: string[] = [];
  if (!requirements || typeof requirements !== "object" || Array.isArray(requirements))
    return { ok: false, errors: ["مدل نیازمندی‌ها باید یک شیء باشد."] };
  if (requirements.buildingType !== "residential") errors.push("فقط برنامهٔ مسکونی در این مسیر پشتیبانی می‌شود.");
  const dwellings = Array.isArray(requirements.dwellings) ? requirements.dwellings : [];
  if (dwellings.length < 1 || dwellings.length > 4) errors.push("برنامه باید یک تا چهار نوع واحد داشته باشد.");
  const types = new Set<string>();
  let total = 0;
  for (const dwelling of dwellings) {
    if (!dwelling || typeof dwelling !== "object" || typeof dwelling.type !== "string" || !Object.prototype.hasOwnProperty.call(DWELLING_LABEL, dwelling.type) || types.has(dwelling.type)) {
      errors.push("نوع واحد نامعتبر یا تکراری است.");
      continue;
    }
    types.add(dwelling.type);
    if (!Number.isSafeInteger(dwelling.count) || dwelling.count < 0 || dwelling.count > 10000)
      errors.push(`تعداد ${DWELLING_LABEL[dwelling.type]} باید عدد صحیح بین ۰ و ۱۰۰۰۰ باشد.`);
    else total += dwelling.count;
    if (!finite(dwelling.targetAreaM2) || dwelling.targetAreaM2 <= 0 || dwelling.targetAreaM2 > 1000000 ||
        !finite(dwelling.minAreaM2) || dwelling.minAreaM2 <= 0 || dwelling.minAreaM2 > 1000000)
      errors.push(`مساحت‌های ${DWELLING_LABEL[dwelling.type]} باید اعداد متناهی مثبت باشند.`);
    else if (dwelling.count > 0 && dwelling.minAreaM2 > dwelling.targetAreaM2)
      errors.push(`حداقل زیربنا برای ${DWELLING_LABEL[dwelling.type]} بزرگ‌تر از زیربنای هدف است.`);
  }
  if (total <= 0 || total > 10000) errors.push("مجموع واحدها باید عددی بین ۱ و ۱۰۰۰۰ باشد (سقف فنی ورودی).");
  if (!Number.isInteger(requirements.floorsMax) || requirements.floorsMax < 1 || requirements.floorsMax > 30) errors.push("تعداد طبقات باید عدد صحیح بین ۱ و ۳۰ باشد.");
  if (!finite(requirements.floorHeightM) || requirements.floorHeightM < 2.6 || requirements.floorHeightM > 6) errors.push("ارتفاع طبقه باید بین ۲.۶ و ۶ متر باشد.");
  if (!finite(requirements.farMax) || requirements.farMax <= 0 || requirements.farMax > 12) errors.push("تراکم باید در بازه ۰ تا ۱۲۰۰٪ باشد.");
  if (!finite(requirements.coverageMax) || requirements.coverageMax <= 0 || requirements.coverageMax > 1) errors.push("سطح اشغال باید بین ۰ و ۱۰۰٪ باشد.");
  if (!finite(requirements.parkingPerDwelling) || requirements.parkingPerDwelling < 0 || requirements.parkingPerDwelling > 3) errors.push("نسبت پارکینگ باید بین ۰ و ۳ باشد.");
  if (!finite(requirements.visitorParkingRatio) || requirements.visitorParkingRatio < 0 || requirements.visitorParkingRatio > 1) errors.push("نسبت پارکینگ مهمان باید بین ۰ و ۱ باشد (بازهٔ داخلی).");
  if (typeof requirements.includeBasementParking !== "boolean" || !["economy", "standard", "premium"].includes(requirements.budget) ||
      !["south", "east", "west", "north", "balanced"].includes(requirements.orientationPreference)) errors.push("گزینه‌های برنامه نامعتبرند.");
  if (!stringList(requirements.specialNotes) || typeof requirements.rawText !== "string" || requirements.rawText.length > 100000)
    errors.push("یادداشت‌ها یا متن نیازمندی نامعتبر است (سقف متن ۱۰۰۰۰۰ نویسه).");
  const parse = requirements.parse;
  if (!parse || typeof parse !== "object" || !finite(parse.confidence) || parse.confidence < 0 || parse.confidence > 1 ||
      !stringList(parse.warnings) || !stringList(parse.trace) || !Array.isArray(parse.matched) ||
      !parse.matched.every((item) => item && typeof item.key === "string" && typeof item.value === "string" && typeof item.source === "string"))
    errors.push("ردیابی استخراج نیازمندی ناقص یا نامعتبر است.");
  return { ok: errors.length === 0, errors };
}

export interface SiteValidationOutcome {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSite(site: SiteModel): SiteValidationOutcome {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!site || typeof site !== "object" || Array.isArray(site))
    return { ok: false, errors: ["مدل زمین باید یک شیء باشد."], warnings };
  const point = (value: { x: number; y: number } | null | undefined) => !!value && typeof value === "object" &&
    finite(value.x) && finite(value.y) && Math.abs(value.x) <= 1000000 && Math.abs(value.y) <= 1000000;
  const boundary = Array.isArray(site.boundary) ? site.boundary : [];
  if (boundary.length < 3) errors.push("مرز زمین باید حداقل سه رأس داشته باشد.");
  if (boundary.length > 200) errors.push("تعداد رئوس مرز بیش از حد مجاز موتور هندسی (۲۰۰) است.");
  if (!boundary.every(point)) errors.push("مختصات مرز نامعتبر یا خارج از سقف فنی مختصات است.");
  if (!finite(site.northAngleDeg)) errors.push("زاویهٔ شمال باید عدد متناهی باشد.");
  else if (Math.abs(site.northAngleDeg) > 180) warnings.push("زاویهٔ شمال خارج از بازهٔ ‎-۱۸۰‎ تا ‎۱۸۰‎ است؛ بررسی شود.");
  if (!site.setbacks || typeof site.setbacks !== "object") errors.push("عقب‌نشینی‌ها ناقص‌اند.");
  else for (const key of ["north", "east", "south", "west"] as const) {
    const value = site.setbacks[key];
    if (!finite(value) || value < 0 || value > 1000000) errors.push(`عقب‌نشینی ${key} نامعتبر است.`);
    else if (value > 15) warnings.push(`عقب‌نشینی ${key} بزرگ‌تر از ۱۵ متر است؛ ساخت‌پذیری محدود می‌شود.`);
  }
  if (!Array.isArray(site.spotLevels) || site.spotLevels.length > 1000 ||
      !site.spotLevels.every((item) => point(item) && finite(item.z) && Math.abs(item.z) <= 1000000)) {
    errors.push("ترازهای نقطه‌ای نامعتبرند یا از سقف فنی ۱۰۰۰ نقطه فراتر رفته‌اند.");
  } else if (site.spotLevels.length >= 3) {
    const zs = site.spotLevels.map((item) => item.z);
    if (Math.max(...zs) - Math.min(...zs) > 12) warnings.push("اختلاف ارتفاع ترازهای زمین بیش از ۱۲ متر است؛ تحلیل توپوگرافی دقیق‌تر لازم است.");
  } else warnings.push("کمتر از سه تراز نقطه‌ای ثبت شده است؛ شیب زمین تحلیل نمی‌شود.");
  if (!Array.isArray(site.noBuildZones) || site.noBuildZones.length > 100 ||
      !site.noBuildZones.every((zone) => Array.isArray(zone) && zone.length >= 3 && zone.length <= 200 && zone.every(point)))
    errors.push("مناطق بدون ساخت نامعتبرند یا از سقف فنی فراتر رفته‌اند.");
  if (site.geoAnchor !== null && (!site.geoAnchor || typeof site.geoAnchor !== "object" || !finite(site.geoAnchor.lat) ||
      !finite(site.geoAnchor.lng) || Math.abs(site.geoAnchor.lat) > 90 || Math.abs(site.geoAnchor.lng) > 180)) errors.push("مختصات جغرافیایی نامعتبر است.");
  if (!finite(site.soilBearingKPa) || site.soilBearingKPa < 0 || site.soilBearingKPa > 1000000) errors.push("ظرفیت باربری خاک باید عدد متناهی نامنفی باشد.");
  if ((site.seismicZone !== null && !["low", "moderate", "high", "veryHigh"].includes(site.seismicZone)) || !["hotDry", "hotHumid", "cold", "moderate"].includes(site.climate)) errors.push("پهنهٔ لرزه‌ای یا اقلیم نامعتبر است.");
  if (site.seismicZone === null) warnings.push("پهنهٔ لرزه‌ای مشخص نیست؛ ضریب و برش پایه محاسبه نمی‌شوند.");
  if (!stringList(site.notes)) errors.push("یادداشت‌های زمین نامعتبرند.");
  return { ok: errors.length === 0, errors, warnings };
}

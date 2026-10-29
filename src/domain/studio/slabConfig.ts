/** فرض‌های ترسیم/برآورد؛ این مقادیر توصیه یا کنترل آیین‌نامه‌ای نیستند. */
export interface SlabRebarConfig {
  diameterMm: number;
  spacingM: number;
  topStripRatio: number;
  anchorageFactor: number;
  topMode: "perimeter" | "all";
  openingTrimDiameterMm: number;
  openingTrimLengthM: number;
}
export const SLAB_REBAR_DEFAULTS: Readonly<SlabRebarConfig> = Object.freeze({
  diameterMm: 12,
  spacingM: 0.2,
  topStripRatio: 0.25,
  anchorageFactor: 20,
  topMode: "all",
  openingTrimDiameterMm: 16,
  openingTrimLengthM: 1,
});
export const SLAB_PARAM_RANGES = {
  diameterMm: [8, 32, "قطر شبکه (میلی‌متر)"],
  spacingM: [0.08, 0.4, "فاصلهٔ شبکه (متر)"],
  topStripRatio: [0.15, 0.5, "نسبت عرض نوار بالا"],
  anchorageFactor: [10, 40, "ضریب گیرش فرضی"],
  openingTrimDiameterMm: [10, 25, "قطر تقویتی بازشو (میلی‌متر)"],
  openingTrimLengthM: [0.3, 2, "امتداد تقویتی بازشو (متر)"],
} as const;
export class SlabInputError extends Error {}

/** اعتبارسنجی مشترک رابط، API و موتور؛ NaN و صفر هرگز وارد حلقهٔ تولید نمی‌شوند. */
export function slabConfig(input: unknown = {}): SlabRebarConfig {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new SlabInputError("تنظیمات سقف باید یک شیء معتبر باشد.");
  const config = { ...SLAB_REBAR_DEFAULTS };
  for (const [key, raw] of Object.entries(input)) {
    if (key === "topMode") {
      if (raw !== "all" && raw !== "perimeter") throw new SlabInputError("حالت نوار بالا باید all یا perimeter باشد.");
      config.topMode = raw;
      continue;
    }
    if (!Object.hasOwn(SLAB_PARAM_RANGES, key)) throw new SlabInputError(`پارامتر سقف ناشناخته است: ${key}`);
    const name = key as keyof typeof SLAB_PARAM_RANGES;
    const [min, max, label] = SLAB_PARAM_RANGES[name];
    // ارقام فارسی و عربی در ورودی نوشتاری مجازند؛ رشتهٔ خالی و بولین مجاز نیستند.
    const normalized =
      typeof raw === "string"
        ? raw
            .trim()
            .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
            .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
            .replace(/٫/g, ".")
        : raw;
    const value =
      typeof normalized === "number"
        ? normalized
        : typeof normalized === "string" && normalized !== ""
          ? Number(normalized)
          : NaN;
    if (!Number.isFinite(value) || value < min || value > max)
      throw new SlabInputError(`${label} باید بین ${min} و ${max} باشد.`);
    if ((name === "diameterMm" || name === "openingTrimDiameterMm") && !Number.isInteger(value))
      throw new SlabInputError("قطر میلگرد باید عدد صحیح میلی‌متر باشد.");
    config[name] = value;
  }
  return config;
}

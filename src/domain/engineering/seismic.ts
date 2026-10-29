import type { Assumption, CanonicalScheme, SeismicZone, SiteModel } from "../types";
import { checkValidity } from "./registry";

/** یادداشت دقیق نسخهٔ قدیمی: مقدار high در این حالت انتخاب آگاهانهٔ کاربر نبود. */
export const LEGACY_ASSUMED_SEISMIC_NOTE = "پهنه لرزه‌ای توسط کاربر تعیین نشده است (پیش‌فرض نمایشی).";
export const UNKNOWN_SEISMIC_NOTE = "پهنهٔ لرزه‌ای مشخص نشده است؛ ضریب و برش پایه محاسبه نمی‌شوند.";
export const UNKNOWN_SEISMIC_DETAIL = "پهنهٔ لرزه‌ای مشخص یا تأیید نشده است؛ ضریب و برش پایه محاسبه نمی‌شوند.";

export function effectiveSeismicZone(site: SiteModel | null | undefined): SeismicZone | null {
  if (!site || typeof site !== "object") return null;
  if (site.seismicZone === "high" && Array.isArray(site.notes) && site.notes.includes(LEGACY_ASSUMED_SEISMIC_NOTE)) return null;
  return site.seismicZone === "low" || site.seismicZone === "moderate" || site.seismicZone === "high" || site.seismicZone === "veryHigh"
    ? site.seismicZone
    : null;
}

/** فقط نمای دادهٔ قدیمی اصلاح می‌شود؛ خود نسخهٔ ذخیره‌شده تغییر نمی‌کند. */
export function normalizeSeismicSite(site: SiteModel): SiteModel {
  if (!site || typeof site !== "object") return site;
  if (site.seismicZone === "high" && effectiveSeismicZone(site) === null) return { ...site, seismicZone: null };
  return site;
}

function safeAssumptions(assumptions: Assumption[] | undefined): Assumption[] {
  return (assumptions ?? []).map((assumption) =>
    assumption.id === "st-zone" || assumption.id === "st-R"
      ? { ...assumption, value: "نامشخص", basis: UNKNOWN_SEISMIC_DETAIL }
      : assumption,
  );
}

/** نتیجهٔ فرضی در فایل‌ها، رتبه‌بندی یا نمای تاریخی عدد واقعی تلقی نمی‌شود. */
export function normalizeSeismicScheme(scheme: CanonicalScheme): CanonicalScheme {
  const site = normalizeSeismicSite(scheme.site);
  const zone = effectiveSeismicZone(site);
  const coefficient = scheme.structural?.seismicCoefficient;
  const shear = scheme.structural?.seismicBaseShearKN;
  const metric = scheme.metrics?.find((item) => item.id === "baseShear");
  const domainIssue = zone
    ? checkValidity("STRUCT-SEISMIC-CW", "floors", scheme.floors) ??
      (typeof coefficient === "number" ? checkValidity("STRUCT-SEISMIC-CW", "C", coefficient) : null)
    : null;
  const recordedOutside = zone && scheme.structural?.seismicScreening?.status === "outside-domain";
  const resultsValid = !domainIssue && !recordedOutside && typeof coefficient === "number" && Number.isFinite(coefficient) && coefficient > 0 &&
    typeof shear === "number" && Number.isFinite(shear) && shear > 0 &&
    (!metric || (typeof metric.value === "number" && Number.isFinite(metric.value) && Math.abs(metric.value - shear) < 1e-9));
  if (zone !== null && resultsValid) return site === scheme.site ? scheme : { ...scheme, site };
  const detail = domainIssue?.message ?? (recordedOutside ? scheme.structural.seismicScreening!.detail :
    zone ? "ضریب یا برش پایه معتبر و کامل نیست؛ نتیجهٔ لرزه‌ای غیرقابل استفاده است." : UNKNOWN_SEISMIC_DETAIL);
  return {
    ...scheme,
    site,
    structural: {
      ...scheme.structural,
      seismicCoefficient: null,
      seismicBaseShearKN: null,
      seismicScreening: { status: domainIssue || recordedOutside ? "outside-domain" : "insufficient", detail },
      assumptions: zone ? scheme.structural.assumptions : safeAssumptions(scheme.structural.assumptions),
      validityNotes: [...new Set([...(scheme.structural.validityNotes ?? []), detail])],
    },
    metrics: (scheme.metrics ?? []).filter((metric) => metric.id !== "baseShear"),
    assumptions: zone ? scheme.assumptions : safeAssumptions(scheme.assumptions),
    trace: (scheme.trace ?? []).map((step) => ({
      ...step,
      output: step.output.replace(/برش پایه[^،]*(?:،|$)/u, "برش پایه محاسبه نشده،"),
    })),
  };
}

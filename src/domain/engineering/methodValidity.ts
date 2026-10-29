import { checkValidity, FORMULAS, type ValidityIssue } from "./registry";
import type { CanonicalScheme } from "../types";

/** فقط حدود عددیِ ثبت‌شدهٔ روش‌های فعلی؛ نه اثبات کفایت، قانون یا پوشش تمام استثناها. */
export function methodDomainIssues(scheme: CanonicalScheme): ValidityIssue[] {
  const issues: ValidityIssue[] = [];
  const add = (id: string, parameter: string, value: unknown) => {
    // صفر یا مقدار نامعتبر اغلب نمای «دادهٔ لازم موجود نیست» است؛ guard ورودی آن را جدا گزارش می‌کند.
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return;
    const issue = checkValidity(id, parameter, value);
    if (issue && !issues.some((item) => item.formulaId === issue.formulaId && item.parameter === issue.parameter && item.value === issue.value)) issues.push(issue);
  };
  const structure = scheme.structural;
  const spans = [...(structure?.spansX ?? []), ...(structure?.spansY ?? [])].filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (spans.length) {
    for (const span of spans) add("STRUCT-GRID", "span", span);
    add("STRUCT-BEAM-DEPTH", "L_max", Math.max(...spans));
    add("STRUCT-SLAB-DEPTH", "min span", Math.min(...spans));
  }
  const plate = [...(scheme.footprintRects ?? [])].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (plate) {
    add("STRUCT-GRID", "plate width", plate.w);
    add("STRUCT-GRID", "plate width", plate.h);
  }
  add("STRUCT-AXIAL-SCREEN", "floors", scheme.floors);
  if (structure && structure.columns > 0) add("STRUCT-AXIAL-SCREEN", "tributary area", Number((scheme.footprintAreaM2 / structure.columns).toFixed(2)));
  add("STRUCT-SEISMIC-CW", "floors", scheme.floors);
  add("STRUCT-SEISMIC-CW", "C", structure?.seismicCoefficient);
  add("MEP-WATER-DEMAND", "occupancy", scheme.mep?.occupancy);
  add("MEP-PIPE-FLOW", "d", scheme.mep?.waterMainDiameterMm);
  add("MEP-ELECTRICAL-DEMAND", "units", scheme.unitsTotal);
  add("PARKING-BRUTE-AREA", "footprint", scheme.footprintAreaM2);
  add("CIRC-TRAVEL-LOWERBOUND", "distance", scheme.circulation?.maxTravelDistanceM);
  for (const level of scheme.levels ?? []) {
    for (const room of level.rooms ?? []) {
      if (room.habitable) add("DAYLIGHT-PROXY", "area", room.areaM2);
    }
  }
  return issues;
}

const METHODS_WITH_LIMITS = ["STRUCT-GRID", "STRUCT-AXIAL-SCREEN", "STRUCT-BEAM-DEPTH", "STRUCT-SLAB-DEPTH", "STRUCT-SEISMIC-CW", "MEP-WATER-DEMAND", "MEP-PIPE-FLOW", "MEP-ELECTRICAL-DEMAND", "PARKING-BRUTE-AREA", "CIRC-TRAVEL-LOWERBOUND", "DAYLIGHT-PROXY"];
const RULES_WITH_LIMITS = new Set(METHODS_WITH_LIMITS.flatMap((id) => FORMULAS[id]?.usedByRules ?? []));

export function methodIssuesForRule(scheme: CanonicalScheme, ruleId: string): string[] {
  if (!RULES_WITH_LIMITS.has(ruleId)) return [];
  const computed = methodDomainIssues(scheme).filter((issue) => FORMULAS[issue.formulaId]?.usedByRules.includes(ruleId)).map((issue) => issue.message);
  const recorded = ruleId === "STRUCT-02-SEISMIC" && scheme.structural?.seismicScreening?.status === "outside-domain"
    ? [scheme.structural.seismicScreening.detail] : [];
  return [...new Set([...computed, ...recorded])];
}

/** نتایج لرزه‌ایِ null قبلاً بی‌خطر شده‌اند؛ اعداد خارج‌دامنهٔ سایر روش‌ها هنوز خام‌اند. */
export function unsafeMethodOutputIssues(scheme: CanonicalScheme): ValidityIssue[] {
  return methodDomainIssues(scheme).filter((issue) =>
    issue.formulaId !== "STRUCT-SEISMIC-CW" || scheme.structural?.seismicBaseShearKN != null || scheme.structural?.seismicCoefficient != null,
  );
}

export class UnsafeMethodDomainError extends Error {
  constructor(public readonly issues: ValidityIssue[]) {
    super("روش محاسبه خارج از دامنه است؛ اعداد خام قابل صدور نیستند. ورودی را اصلاح یا روش مناسب را انتخاب کنید.");
    this.name = "UnsafeMethodDomainError";
  }
}

export function assertMethodOutputsExportable(scheme: CanonicalScheme): void {
  const issues = unsafeMethodOutputIssues(scheme);
  if (issues.length) throw new UnsafeMethodDomainError(issues);
}

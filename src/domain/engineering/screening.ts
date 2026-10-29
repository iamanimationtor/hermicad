import { ANALYSIS_STATUS } from "../constants";
import type { CanonicalScheme } from "../types";
import { normalizeFoundationScheme } from "./foundation";
import { normalizeSeismicScheme } from "./seismic";
import { methodDomainIssues } from "./methodValidity";

/** نمای خواندنی/صدوری، بدون تغییر رکورد تاریخی؛ هیچ پرونده‌ای در این نسخه اجرایی نیست. */
export function normalizeScreeningScheme(scheme: CanonicalScheme): CanonicalScheme {
  const safe = normalizeSeismicScheme(normalizeFoundationScheme(scheme));
  return {
    ...safe,
    analysisStatus: {
      level: "preliminary-screening",
      requiresEngineerReview: true,
      notForConstruction: true,
      limitations: [...new Set([...(safe.analysisStatus?.limitations ?? []), ...ANALYSIS_STATUS.limitations])],
      outsideDomain: methodDomainIssues(safe),
    },
  };
}

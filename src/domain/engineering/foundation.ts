import { checkValidity } from "./registry";
import type { CanonicalScheme } from "../types";

/** دامنهٔ عددیِ داخلی است، نه مرز احرازشدهٔ طراحی یا مقررات. */
export interface FoundationScreening {
  status: "available" | "insufficient" | "outside-domain";
  detail: string;
}

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function unusable(message: string): string {
  return message.replace("نتیجه فقط نشانگر است.", "خروجی این روش غیرقابل استفاده است.");
}

/** با دادهٔ غایب یا خارج از حدود روش هرگز نتیجهٔ قابل استفاده صادر نمی‌شود. */
export function foundationScreening(soilBearingKPa: unknown, widthM: unknown): FoundationScreening {
  if (!positive(soilBearingKPa)) {
    return { status: "insufficient", detail: "ظرفیت باربری خاک مشخص یا معتبر نیست؛ عرض پی محاسبه نمی‌شود." };
  }
  const soilIssue = checkValidity("STRUCT-FOOTING-SCREEN", "q_allow", soilBearingKPa);
  if (soilIssue) return { status: "outside-domain", detail: unusable(soilIssue.message) };
  if (!positive(widthM)) {
    return { status: "insufficient", detail: "بار خدمت و هندسهٔ لازم برای غربال پی مشخص یا معتبر نیست؛ عرض پی محاسبه نمی‌شود." };
  }
  const widthIssue = checkValidity("STRUCT-FOOTING-SCREEN", "b", widthM);
  if (widthIssue) return { status: "outside-domain", detail: unusable(widthIssue.message) };
  return { status: "available", detail: "برآورد صرفاً در حدود عددی روش داخلی است؛ طراحی یا تأیید ژئوتکنیک نیست." };
}

/** وضعیت صریح محاسبهٔ جدید، در صورت حذف مقدار خارج‌دامنه، از بین نرود. */
export function foundationStateForScheme(scheme: CanonicalScheme): FoundationScreening {
  const state = foundationScreening(scheme.site?.soilBearingKPa, scheme.structural?.requiredFoundationWidthM);
  const recorded = scheme.structural?.foundationScreening;
  if (state.status === "insufficient" && positive(scheme.site?.soilBearingKPa) && recorded?.status === "outside-domain") return recorded;
  return state;
}

/** بازنمایی امن پروندهٔ قدیمی؛ رکورد تاریخی در پایگاه داده دست‌نخورده می‌ماند. */
export function normalizeFoundationScheme(scheme: CanonicalScheme): CanonicalScheme {
  const state = foundationStateForScheme(scheme);
  if (state.status === "available") return scheme;
  return {
    ...scheme,
    structural: {
      ...scheme.structural,
      requiredFoundationWidthM: null,
      foundationScreening: state,
      validityNotes: [...new Set([...(scheme.structural.validityNotes ?? []), state.detail])],
    },
  };
}

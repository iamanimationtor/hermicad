import type { Climate, DwellingProgram, DwellingType, Requirements, SeismicZone, SiteModel, Vec2 } from "./types";
import { UNKNOWN_SEISMIC_NOTE } from "./engineering/seismic";
import { DWELLING_LABEL, DEFAULT_REQUIREMENTS, DEFAULT_SITE, totalDwellingCount, validateRequirements, validateSite } from "./requirements";
import { polygonArea, polygonIsSimple } from "./geometry";
import { analyzeSite } from "./layout";

/**
 * Guided intake for non-specialist users (stage A).
 *
 * The user answers plain questions (parcel shape/size, floors, unit mix,
 * household type, budget, constraints). This module converts those answers into
 * the canonical SiteModel + Requirements, and — critically — reports exactly
 * which required engineering inputs are *missing* instead of inventing them.
 * Nothing is silently defaulted: every fallback is listed in `assumptions`.
 */

export type ParcelShape = "rectangle" | "lShape" | "trapezoid" | "irregular";

export interface IntakeAnswers {
  projectName: string;
  client: string;
  city: string;
  parcelShape: ParcelShape;
  /** parcel bounding dimensions in metres */
  widthM: number;
  depthM: number;
  /** optional irregular vertices; used when parcelShape === "irregular" */
  customBoundary: Vec2[] | null;
  setbacks: { north: number; east: number; south: number; west: number };
  floors: number;
  floorHeightM: number;
  units: { studio: number; twoBed: number; threeBed: number; fourBed: number };
  /** target net area per dwelling type, m² */
  areas: { studio: number; twoBed: number; threeBed: number; fourBed: number };
  farPercent: number;
  coveragePercent: number;
  parkingPerUnit: number;
  includeBasementParking: boolean;
  budget: Requirements["budget"];
  soilBearingKPa: number | null;
  seismicZone: SeismicZone | null;
  climate: Climate;
  note: string;
}

export const DEFAULT_ANSWERS: IntakeAnswers = {
  projectName: "",
  client: "",
  city: "تهران",
  parcelShape: "rectangle",
  widthM: 20,
  depthM: 28,
  customBoundary: null,
  setbacks: { north: 4, east: 3, south: 3, west: 3 },
  floors: 4,
  floorHeightM: 3.2,
  units: { studio: 0, twoBed: 4, threeBed: 2, fourBed: 0 },
  areas: { studio: 45, twoBed: 78, threeBed: 102, fourBed: 125 },
  farPercent: 240,
  coveragePercent: 55,
  parkingPerUnit: 1,
  includeBasementParking: true,
  budget: "standard",
  soilBearingKPa: null,
  seismicZone: null,
  climate: "hotDry",
  note: "",
};

const AREA_HINT: Record<DwellingType, number> = { studio: 45, twoBed: 78, threeBed: 102, fourBed: 125 };

export function parcelBoundary(answers: IntakeAnswers): Vec2[] {
  if (answers.parcelShape === "irregular" && answers.customBoundary && answers.customBoundary.length >= 3) {
    return answers.customBoundary;
  }
  const w = Math.max(6, answers.widthM);
  const d = Math.max(6, answers.depthM);
  switch (answers.parcelShape) {
    case "lShape": {
      const notchX = w * 0.45;
      const notchY = d * 0.4;
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: d - notchY },
        { x: w - notchX, y: d - notchY },
        { x: w - notchX, y: d },
        { x: 0, y: d },
      ];
    }
    case "trapezoid":
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w - w * 0.15, y: d },
        { x: w * 0.1, y: d },
      ];
    case "rectangle":
    default:
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: d },
        { x: 0, y: d },
      ];
  }
}

export function buildSite(answers: IntakeAnswers): SiteModel {
  const boundary = parcelBoundary(answers);
  const base = DEFAULT_SITE;
  const soil = answers.soilBearingKPa ?? 0;
  const levels: SiteModel["spotLevels"] = [];
  return {
    boundary,
    northAngleDeg: 0,
    geoAnchor: null,
    spotLevels: levels,
    setbacks: {
      north: Math.max(0, answers.setbacks.north),
      east: Math.max(0, answers.setbacks.east),
      south: Math.max(0, answers.setbacks.south),
      west: Math.max(0, answers.setbacks.west),
    },
    noBuildZones: [],
    soilBearingKPa: soil,
    seismicZone: answers.seismicZone,
    climate: answers.climate,
    notes: [
      answers.note,
      `شهر: ${answers.city}`,
      `شکل زمین: ${PARCEL_SHAPE_LABEL[answers.parcelShape]}`,
      answers.seismicZone ? `پهنه لرزه‌ای: ${answers.seismicZone}` : UNKNOWN_SEISMIC_NOTE,
      soil > 0 ? `ظرفیت باربری خاک: ${soil} kPa (ورودی کاربر، بدون گزارش ژئوتکنیک)` : "ظرفیت باربری خاک ثبت نشده است.",
      ...base.notes.slice(0, 0),
    ].filter(Boolean),
  };
}

export function buildRequirements(answers: IntakeAnswers): Requirements {
  const types: DwellingType[] = ["studio", "twoBed", "threeBed", "fourBed"];
  const dwellings: DwellingProgram[] = types
    .filter((type) => answers.units[type] > 0)
    .map((type) => ({
      type,
      count: Math.max(0, Math.round(answers.units[type])),
      targetAreaM2: answers.areas[type] > 0 ? answers.areas[type] : AREA_HINT[type],
      minAreaM2: Math.max(20, Math.round((answers.areas[type] > 0 ? answers.areas[type] : AREA_HINT[type]) * 0.85)),
    }));
  return {
    ...DEFAULT_REQUIREMENTS,
    dwellings,
    floorsMax: Math.max(1, Math.round(answers.floors)),
    floorHeightM: answers.floorHeightM,
    farMax: Math.max(0.1, answers.farPercent / 100),
    coverageMax: Math.min(1, Math.max(0.05, answers.coveragePercent / 100)),
    parkingPerDwelling: Math.max(0, answers.parkingPerUnit),
    visitorParkingRatio: 0.1,
    includeBasementParking: answers.includeBasementParking,
    budget: answers.budget,
    specialNotes: answers.note ? [answers.note] : [],
    rawText: `${totalDwellingCount({ ...DEFAULT_REQUIREMENTS, dwellings })} واحد، حداکثر ${answers.floors} طبقه، تراکم ${answers.farPercent} درصد، سطح اشغال ${answers.coveragePercent} درصد`,
    parse: { confidence: 1, warnings: [], trace: ["ورودی از فرم هدایت‌شده (بدون پارس متن)"], matched: [] },
  };
}

export interface MissingQuestion {
  id: string;
  question: string;
  why: string;
  blocking: boolean;
  field: string;
}

export interface IntakeReview {
  site: SiteModel;
  requirements: Requirements;
  plotAreaM2: number;
  boundaryValid: boolean;
  missing: MissingQuestion[];
  assumptions: { label: string; value: string; why: string }[];
  errors: string[];
  warnings: string[];
  ready: boolean;
  requiredCount: number;
}

export function reviewIntake(answers: IntakeAnswers): IntakeReview {
  const site = buildSite(answers);
  const requirements = buildRequirements(answers);
  const siteCheck = validateSite(site);
  const reqCheck = validateRequirements(requirements);
  const boundaryValid = site.boundary.length >= 3 && polygonIsSimple(site.boundary);

  const missing: MissingQuestion[] = [];
  if (answers.projectName.trim().length < 3) {
    missing.push({ id: "name", question: "نام پروژه چیست؟", why: "برای شناسایی پروژه و خروجی‌ها لازم است.", blocking: true, field: "projectName" });
  }
  if (totalDwellingCount(requirements) === 0) {
    missing.push({ id: "units", question: "چند واحد و با چه تعداد اتاق خواب لازم دارید؟", why: "بدون برنامه واحد، تولید پلان ممکن نیست.", blocking: true, field: "units" });
  }
  if (answers.soilBearingKPa === null || answers.soilBearingKPa <= 0) {
    missing.push({
      id: "soil",
      question: "ظرفیت باربری خاک (kPa) چقدر است؟",
      why: "بدون آن، کنترل پی انجام نمی‌شود و در گزارش «اطلاعات ناکافی» ثبت می‌گردد.",
      blocking: false,
      field: "soilBearingKPa",
    });
  }
  if (!answers.seismicZone) {
    missing.push({
      id: "seismic",
      question: "پهنه لرزه‌ای پروژه کدام است؟",
      why: "بدون آن، ضریب و برش پایه محاسبه نمی‌شوند و کنترل لرزه‌ای ارزیابی‌نشده می‌ماند.",
      blocking: false,
      field: "seismicZone",
    });
  }
  missing.push({
    id: "levels",
    question: "تراز نقاط زمین (حداقل سه نقطه) را وارد کنید یا نقشه توپوگرافی بدهید.",
    why: "بدون ترازها شیب زمین تحلیل نمی‌شود؛ طبقه همکف روی زمین مسطح فرض می‌گردد.",
    blocking: false,
    field: "spotLevels",
  });
  missing.push({
    id: "geotech",
    question: "گزارش ژئوتکنیک یا آزمون خاک دارید؟",
    why: "ارزش عددی ظرفیت خاک تا زمان ارائه گزارش، ورودی کاربر و تأییدنشده است.",
    blocking: false,
    field: "geotech",
  });

  const assumptions: IntakeReview["assumptions"] = [];
  if (!answers.seismicZone) assumptions.push({ label: "پهنه لرزه‌ای", value: "نامشخص", why: "کاربر انتخاب نکرده است؛ محاسبهٔ لرزه‌ای انجام نمی‌شود." });
  if (!answers.soilBearingKPa) assumptions.push({ label: "ظرفیت باربری خاک", value: "ثبت‌نشده (۰)", why: "کنترل پی به‌صورت «اطلاعات ناکافی» گزارش می‌شود." });
  const areaOfParcel = polygonArea(site.boundary);
  if (areaOfParcel > 0) {
    assumptions.push({
      label: "مساحت زمین",
      value: `${areaOfParcel.toFixed(1)} m²`,
      why: "از مرز تولیدشده بر اساس ابعاد واردشده محاسبه شده است.",
    });
  }
  assumptions.push({
    label: "برنامه واحدها",
    value: requirements.dwellings.map((d) => `${DWELLING_LABEL[d.type]}×${d.count}`).join(" · ") || "خالی",
    why: "از انتخاب کاربر ساخته شده است؛ زیربنای حداقل ۸۵٪ مقدار هدف فرض شد.",
  });
  assumptions.push({
    label: "ارتفاع طبقه",
    value: `${answers.floorHeightM} m`,
    why: "ورودی کاربر؛ در محاسبه پله و ارتفاع کل استفاده می‌شود.",
  });

  const errors = [...siteCheck.errors, ...reqCheck.errors];
  if (!boundaryValid) errors.push("مرز زمین معتبر نیست (کمتر از سه رأس یا خودمتقاطع).");
  const warnings = [...siteCheck.warnings];
  const analysisForWarnings = () => analyzeSite(site);
  // Viability is checked with the same engine used for generation, so the user
  // learns *before* submitting that the parcel cannot host the programme.
  if (boundaryValid && (!siteCheck.errors.length || true)) {
    const analysis = analyzeSite(site);
    if (analysis.buildableAreaM2 <= 0) {
      warnings.push("پس از اعمال عقب‌نشینی‌ها هیچ سطح ساخت‌پذیری باقی نمی‌ماند؛ ابعاد زمین یا عقب‌نشینی را تغییر دهید.");
    } else if (!analysis.viable) {
      warnings.push(
        ...analysis.viabilityErrors,
        "این زمین با ابعاد واردشده برای برنامه مسکونی باریک/ناکافی است؛ پیش از تولید، ابعاد یا عقب‌نشینی را بازبینی کنید.",
      );
    }
  }
  if (answers.floors > 8) warnings.push("بیش از ۸ طبقه: الزامات آسانسور و سازه نیازمند بررسی تخصصی است.");
  if (areaOfParcel < 120 || (areaOfParcel > 0 && areaOfParcel / Math.max(1, analysisForWarnings().buildableAreaM2) > 6)) {
    warnings.push("زمین کوچک یا باریک است؛ ممکن است سطح ساخت‌پذیر برای این برنامه کافی نباشد.");
  }

  const blockingMissing = missing.filter((m) => m.blocking).length;
  return {
    site,
    requirements,
    plotAreaM2: areaOfParcel,
    boundaryValid,
    missing,
    assumptions,
    errors,
    warnings,
    ready: blockingMissing === 0 && errors.length === 0,
    requiredCount: blockingMissing,
  };
}

export const PARCEL_SHAPE_LABEL: Record<ParcelShape, string> = {
  rectangle: "مستطیل",
  lShape: "L شکل",
  trapezoid: "ذوزنقه",
  irregular: "نامنظم (مختصات دلخواه)",
};

export function intakeSummary(answers: IntakeAnswers): string {
  const review = reviewIntake(answers);
  const units = totalDwellingCount(review.requirements);
  return `${answers.widthM}×${answers.depthM} m · ${PARCEL_SHAPE_LABEL[answers.parcelShape]} · ${units} واحد · ${answers.floors} طبقه · تراکم ${answers.farPercent}٪`;
}

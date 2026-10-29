import { clamp } from "./geometry";
import { effectiveSeismicZone } from "./engineering/seismic";
import { methodIssuesForRule } from "./engineering/methodValidity";
import { RULES } from "./codes";
import type {
  CanonicalScheme,
  RankedScheme,
  ScoreCriterion,
  ScoreBreakdown,
  SchemeVerification,
  ValidationReport,
} from "./types";

export interface CriterionDef {
  id: string;
  label: string;
  metricId: string;
  direction: "higher" | "lower";
  unit: string;
  weight: number;
  group: string;
}

/** Weighted criteria used for multi-criteria ranking (weights are user-editable). */
export const CRITERIA: CriterionDef[] = [
  { id: "density", label: "بهره‌برداری از تراکم", metricId: "far", direction: "higher", unit: "-", weight: 0.14, group: "yield" },
  { id: "unitYield", label: "تعداد واحد تأمین‌شده", metricId: "units", direction: "higher", unit: "واحد", weight: 0.12, group: "yield" },
  { id: "efficiency", label: "بهره‌وری سطوح", metricId: "efficiency", direction: "higher", unit: "%", weight: 0.1, group: "quality" },
  { id: "daylight", label: "کیفیت نور روز", metricId: "daylight", direction: "higher", unit: "%", weight: 0.12, group: "quality" },
  { id: "crossVent", label: "تهویه دوطرفه", metricId: "crossVent", direction: "higher", unit: "%", weight: 0.08, group: "quality" },
  { id: "egress", label: "ایمنی تخلیه (فاصله تا خروج)", metricId: "travelDistance", direction: "lower", unit: "m", weight: 0.1, group: "safety" },
  { id: "parking", label: "کفایت پارکینگ", metricId: "parkingProvided", direction: "higher", unit: "جایگاه", weight: 0.08, group: "safety" },
  { id: "structure", label: "کارایی سازه (برش پایه)", metricId: "baseShear", direction: "lower", unit: "kN", weight: 0.1, group: "structure" },
  { id: "cost", label: "شاخص هزینه ساخت", metricId: "costIndex", direction: "lower", unit: "شاخص", weight: 0.12, group: "cost" },
  { id: "floors", label: "ارتفاع ساختمان", metricId: "floors", direction: "lower", unit: "طبقه", weight: 0.04, group: "cost" },
];

export const WEIGHT_GROUPS = [
  { id: "yield", label: "بهره‌وری و تراکم", default: 0.26 },
  { id: "quality", label: "کیفیت فضایی و نور", default: 0.3 },
  { id: "safety", label: "ایمنی و پارکینگ", default: 0.18 },
  { id: "structure", label: "کارایی سازه", default: 0.1 },
  { id: "cost", label: "اقتصاد ساخت", default: 0.16 },
];

export type WeightMap = Record<string, number>;

export const DEFAULT_WEIGHTS: WeightMap = Object.fromEntries(WEIGHT_GROUPS.map((g) => [g.id, g.default]));

export function normalizeWeights(weights: WeightMap): WeightMap {
  const merged: WeightMap = {};
  for (const g of WEIGHT_GROUPS) merged[g.id] = Math.max(0, weights[g.id] ?? g.default);
  const total = Object.values(merged).reduce((s, x) => s + x, 0) || 1;
  for (const key of Object.keys(merged)) merged[key] = merged[key] / total;
  return merged;
}

const METRIC_METHOD_RULES: Record<string, string> = {
  far: "CODE-04-FAR", units: "CODE-04-UNIT-SUPPLY", efficiency: "ARCH-04-EFFICIENCY", floors: "CODE-04-HEIGHT",
  baseShear: "STRUCT-02-SEISMIC", parkingProvided: "NBR-21-PARKING", travelDistance: "FIRE-03-TRAVEL",
  daylight: "NBR-15-DAYLIGHT", crossVent: "NBR-15-CROSSVENT", columnSize: "STRUCT-02-COLUMN",
  transformer: "MEP-13-ELECTRICAL", costIndex: "STRUCT-02-COLUMN",
};
const RULE_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

function metricValue(scheme: CanonicalScheme, id: string): number | null {
  const ruleId = METRIC_METHOD_RULES[id];
  if (ruleId) {
    const rule = RULE_BY_ID.get(ruleId);
    try {
      if (!rule || (rule.guard?.(scheme) ?? []).length || (rule.domainGuard?.(scheme) ?? []).length ||
          methodIssuesForRule(scheme, ruleId).length) return null;
    } catch { return null; }
  }
  const value = Array.isArray(scheme.metrics) ? scheme.metrics.find((m) => m?.id === id)?.value : undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // مقدار ثبت‌شدهٔ معیار نباید با دادهٔ مبنایی که کنترل شده ناسازگار باشد.
  const direct: Record<string, number | undefined> = {
    units: scheme.unitsTotal, floors: scheme.floors, parkingProvided: scheme.parking?.providedStalls,
    travelDistance: scheme.circulation?.maxTravelDistanceM, columnSize: scheme.structural?.columnSizeMm,
    transformer: scheme.mep?.transformerKVA,
    daylight: scheme.daylight?.habitableRooms > 0
      ? Number((100 * scheme.daylight.compliantRooms / scheme.daylight.habitableRooms).toFixed(1)) : undefined,
  };
  if (id in direct && (typeof direct[id] !== "number" || !Number.isFinite(direct[id]) || Math.abs(value - direct[id]!) >= 1e-9)) return null;
  if (id === "baseShear") {
    const shear = scheme.structural?.seismicBaseShearKN;
    const coefficient = scheme.structural?.seismicCoefficient;
    if (!effectiveSeismicZone(scheme.site) || typeof shear !== "number" || !Number.isFinite(shear) || shear <= 0 ||
        typeof coefficient !== "number" || !Number.isFinite(coefficient) || coefficient <= 0 ||
        typeof value !== "number" || Math.abs(value - shear) >= 1e-9) return null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalize(value: number, min: number, max: number, direction: "higher" | "lower"): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(max - min) < 1e-9) return 1;
  const t = (value - min) / (max - min);
  return clamp(direction === "higher" ? t : 1 - t, 0, 1);
}

export function rankSchemes(
  schemes: CanonicalScheme[],
  reports: Record<string, ValidationReport>,
  weightsInput: WeightMap,
): RankedScheme[] {
  const weights = normalizeWeights(weightsInput);
  const ranges = new Map<string, { min: number; max: number }>();
  const comparisonComplete = schemes.every((s) => CRITERIA.every((c) => metricValue(s, c.metricId) !== null));
  for (const c of CRITERIA) {
    const values = schemes.map((s) => metricValue(s, c.metricId)).filter((value): value is number => value !== null);
    ranges.set(c.id, values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 0 });
  }
  const breakdowns: ScoreBreakdown[] = schemes.map((scheme) => {
    const report = reports[scheme.id];
    const hardBlocked = report ? report.blocked : false;
    const criteria: ScoreCriterion[] = CRITERIA.map((c) => {
      const raw = metricValue(scheme, c.metricId);
      const range = ranges.get(c.id) ?? { min: 0, max: 0 };
      // نبود داده سهمی در مجموع جزئی نمی‌گیرد؛ صفر یک اندازه‌گیری فیزیکی نیست.
      const normalized = raw === null ? 0 : normalize(raw, range.min, range.max, c.direction);
      const groupWeight =
        weights[c.group] ?? WEIGHT_GROUPS.find((g) => g.id === c.group)?.default ?? 0.2;
      const groupTotal = CRITERIA.filter((x) => x.group === c.group).reduce((s, x) => s + x.weight, 0) || 1;
      const weight = groupWeight * (c.weight / groupTotal);
      return {
        id: c.id,
        label: c.label,
        weight,
        raw,
        normalized,
        contribution: normalized * weight,
        unit: c.unit,
        direction: c.direction,
      };
    });
    const weighted = criteria.reduce((s, c) => s + c.contribution, 0);
    const penalty = hardBlocked ? 0.6 : 1;
    return {
      schemeId: scheme.id,
      schemeCode: scheme.code,
      criteria,
      rawScore: Number((weighted * 100).toFixed(2)),
      total: Number((weighted * penalty * 100).toFixed(2)),
      hardBlocked,
    };
  });

  const paretoFlags = computePareto(schemes);
  return breakdowns
    .map((b) => {
      const scheme = schemes.find((s) => s.id === b.schemeId);
      const report = reports[b.schemeId];
      const verification = buildVerification(report, b.hardBlocked);
      if (!comparisonComplete) {
        verification.notes.push("مقایسه کامل نیست: دادهٔ یک یا چند معیار در گزینه‌ها نامعلوم است. سهم معیار ناموجود صفر در مجموع جزئی است، نه اندازه‌گیری؛ رتبهٔ برتر و پارتو تعیین نشده‌اند.");
      }
      const penalised = Number((b.rawScore * (b.hardBlocked ? 0.6 : 1) * verification.confidencePenalty).toFixed(2));
      return {
        schemeId: b.schemeId,
        schemeCode: b.schemeCode,
        strategyLabel: scheme?.strategyLabel ?? "",
        score: penalised,
        rawScore: b.rawScore,
        blocked: b.hardBlocked,
        criticalIssues: report ? report.issues.filter((i) => i.severity === "critical").length : 0,
        pareto: paretoFlags.get(b.schemeId) ?? null,
        comparisonComplete,
        criteria: b.criteria,
        verification,
      } satisfies RankedScheme;
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Evidence-aware verification summary for a ranked scheme.
 *
 * The score is *advisory*. A scheme can never be reported as compliant or safe:
 * - failures of rules whose threshold comes from the project itself are marked
 *   as project-input deviations, not legal violations;
 * - failures of internal assumptions are flagged separately;
 * - unevaluated (insufficient) rules and unverified code-set status reduce the
 *   confidence penalty and are listed as explicit notes.
 */
export function buildVerification(report: ValidationReport | undefined, blocked: boolean): SchemeVerification {
  const evaluations = report?.evaluations ?? [];
  const failures = evaluations.filter((e) => e.status === "fail");
  const count = (tier: string) => failures.filter((e) => e.evidence === tier).length;
  const evidenceTiers: Record<string, number> = {};
  for (const evaluation of evaluations) {
    evidenceTiers[evaluation.evidence] = (evidenceTiers[evaluation.evidence] ?? 0) + 1;
  }
  const insufficientRules = evaluations.filter((e) => e.status === "insufficient").length;
  const projectInputFailures = count("project-input");
  const internalAssumptionFailures = count("internal-assumption");
  const unverifiedExternalFailures = count("unverified-external");
  const integrityFailures = count("integrity-check");
  const notes: string[] = [];
  let confidencePenalty = 1;

  if (blocked) notes.push("نقص بحرانی: امتیاز با ضریب ۰٫۶ کاهش یافته است.");
  if (insufficientRules > 0) {
    confidencePenalty *= 0.9;
    notes.push(`${insufficientRules} قاعده به‌دلیل نبود داده ارزیابی نشد؛ نبود داده به معنی انطباق نیست.`);
  }
  if (internalAssumptionFailures > 0) {
    confidencePenalty *= 0.95;
    notes.push(`${internalAssumptionFailures} انحراف از آستانه داخلی (غیررسمی) ثبت شده است.`);
  }
  if (report?.codeSetVerification !== "externally-verified") {
    notes.push("سند ضوابط تأییدنشده است؛ امتیاز صرفاً مشورتی و برای مقایسه گزینه‌ها است.");
  }
  if (unverifiedExternalFailures > 0) {
    notes.push(`${unverifiedExternalFailures} انحراف از رابطه تأییدنشده بیرونی (لرزه‌ای) وجود دارد؛ نیازمند تحلیل تخصصی است.`);
  }
  return {
    claim: "not-established",
    advisory: true,
    label: "امتیاز مشورتی — انطباق اثبات‌نشده",
    ruleCount: evaluations.length,
    insufficientRules,
    projectInputFailures,
    internalAssumptionFailures,
    unverifiedExternalFailures,
    integrityFailures,
    evidenceTiers,
    confidencePenalty: Number(confidencePenalty.toFixed(4)),
    notes,
  };
}

function computePareto(schemes: CanonicalScheme[]): Map<string, boolean | null> {
  const flags = new Map<string, boolean | null>();
  // مقایسهٔ پارتو میان گزینه‌های ناقص قابل اثبات نیست، حتی برای گزینهٔ کامل.
  if (schemes.some((s) => CRITERIA.some((c) => metricValue(s, c.metricId) === null))) {
    for (const scheme of schemes) flags.set(scheme.id, null);
    return flags;
  }
  const vectors = schemes.map((s) => ({
    id: s.id,
    values: CRITERIA.map((c) => {
      const raw = metricValue(s, c.metricId)!;
      return c.direction === "higher" ? raw : -raw;
    }),
  }));
  for (const a of vectors) {
    let dominated = false;
    for (const b of vectors) {
      if (a.id === b.id) continue;
      const allAtLeast = b.values.every((v, i) => v >= a.values[i] - 1e-9);
      const someBetter = b.values.some((v, i) => v > a.values[i] + 1e-9);
      if (allAtLeast && someBetter) {
        dominated = true;
        break;
      }
    }
    flags.set(a.id, !dominated);
  }
  return flags;
}

export function comparisonMatrix(schemes: CanonicalScheme[]): {
  criterion: CriterionDef;
  values: { schemeId: string; schemeCode: string; value: number | null }[];
  best: string | null;
}[] {
  return CRITERIA.map((criterion) => {
    const values = schemes.map((s) => ({
      schemeId: s.id,
      schemeCode: s.code,
      value: metricValue(s, criterion.metricId),
    }));
    const known = values.filter((item): item is typeof item & { value: number } => item.value !== null);
    const sorted = [...known].sort((a, b) => (criterion.direction === "higher" ? b.value - a.value : a.value - b.value));
    return { criterion, values, best: known.length === values.length ? sorted[0]?.schemeId ?? null : null };
  });
}

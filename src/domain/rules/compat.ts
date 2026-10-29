import { qualifyRuleMessage } from "./resultStatus";
import { RULES } from "../codes";
import { methodIssuesForRule } from "../engineering/methodValidity";
import type {
  CanonicalScheme,
  EvidenceLevel,
  RuleEvaluation,
  RuleStatus,
  ValidationReport,
} from "../types";

/**
 * Backwards compatibility for reports stored before the stage-3 provenance
 * model. Old rows are never rewritten; they are normalised on read so the UI
 * and API always receive complete, honest metadata. Missing provenance is
 * reported as "legacy/unverified", never silently upgraded.
 */
const LEGACY_NOTE =
  "این ارزیابی از نسخه پیش از مدل مستندات ذخیره شده است؛ منبع و بند آن ثبت نشده و باید تأییدنشده تلقی شود.";

const VALID_STATUSES: RuleStatus[] = ["pass", "fail", "warn", "na", "insufficient"];

function statusOf(value: unknown): RuleStatus {
  return VALID_STATUSES.includes(value as RuleStatus) ? (value as RuleStatus) : "insufficient";
}

function evidenceFor(status: RuleStatus, sourceStatus: unknown): EvidenceLevel {
  if (status === "insufficient") return "internal-assumption";
  if (sourceStatus === "project-requirement") return "project-input";
  if (sourceStatus === "internal-integrity-check") return "integrity-check";
  if (sourceStatus === "unverified-citation") return "unverified-external";
  return "internal-assumption";
}

export function isLegacyReport(raw: unknown): boolean {
  const report = raw as Partial<ValidationReport> | null;
  if (!report || !Array.isArray(report.evaluations)) return true;
  return report.evaluations.some((e) => !(e as Partial<RuleEvaluation>).evidence);
}

export function normalizeStoredEvaluation(raw: unknown): RuleEvaluation {
  const e = (raw ?? {}) as Partial<RuleEvaluation>;
  const status = statusOf(e.status);
  return {
    ruleId: e.ruleId ?? "UNKNOWN",
    title: e.title ?? e.ruleId ?? "قاعده ناشناخته",
    category: e.category ?? "unknown",
    source: e.source ?? "منبع ثبت نشده (گزارش قدیمی)",
    edition: e.edition ?? "legacy",
    sourceStatus: e.sourceStatus ?? "unverified-citation",
    verification: e.verification ?? "unverified",
    evidence: e.evidence ?? evidenceFor(status, e.sourceStatus),
    method: e.method ?? "مستند نشده (گزارش قدیمی)",
    formula: e.formula ?? "ثبت نشده",
    inputs: e.inputs ?? [],
    inputsDetailed: e.inputsDetailed ?? [],
    limitations: e.limitations ?? LEGACY_NOTE,
    document: e.document ?? {
      title: null,
      version: null,
      clause: null,
      availability: "official-text-not-obtained",
      auditNote: LEGACY_NOTE,
    },
    tests: e.tests,
    severity: e.severity ?? "minor",
    status,
    // گزارش قدیمی، یا حتی فیلد اظهاریِ اضافه‌شده به آن، تأیید مقرراتی نیست.
    regulatoryCompliance: "not-established",
    observed: e.observed ?? "—",
    required: e.required ?? null,
    unit: e.unit ?? "",
    message: qualifyRuleMessage(e.message ?? LEGACY_NOTE),
    remediation: e.remediation ?? "نیازمند بازاعتبارسنجی با نسخه فعلی موتور است.",
    trace: e.trace ?? [LEGACY_NOTE],
    location: e.location,
  };
}

export function normalizeStoredReport(raw: unknown, scheme?: CanonicalScheme): ValidationReport | null {
  const report = raw as Partial<ValidationReport> | null;
  if (!report || !Array.isArray(report.evaluations) || report.evaluations.length === 0) return null;
  const revised = new Map<string, RuleEvaluation>();
  const rules = new Map(RULES.map((rule) => [rule.id, rule]));
  const evaluations = report.evaluations.map((rawEvaluation) => {
    const evaluation = normalizeStoredEvaluation(rawEvaluation);
    const rule = rules.get(evaluation.ruleId);
    if (!scheme || !rule) return evaluation;
    let outside: string[] = [];
    let missing: string[] = [];
    try {
      outside = [...(rule.domainGuard?.(scheme) ?? []), ...methodIssuesForRule(scheme, rule.id)];
      missing = rule.guard?.(scheme) ?? [];
    } catch {
      // مدل ناقص قدیمی نیز نباید با خطای خواندن به نتیجهٔ مثبت تبدیل شود.
      missing = ["ساختار دادهٔ لازم برای بررسی این قاعده کامل یا معتبر نیست."];
    }
    if (!outside.length && !missing.length) return evaluation;
    const observed = outside.length ? "خارج از دامنه" : "ارزیابی نشد";
    if (evaluation.status === "insufficient" && evaluation.observed === observed) return evaluation;
    const reasons = outside.length ? outside : missing;
    const replacement: RuleEvaluation = {
      ...evaluation,
      status: "insufficient",
      observed,
      required: null,
      unit: "",
      message: qualifyRuleMessage(`${reasons.join(" ")} نتیجهٔ قبلی برای این بازنمایی غیرقابل استفاده است؛ بازتولید و بازبینی لازم است.`),
      trace: [...reasons, `وضعیت ذخیره‌شدهٔ قبلی: ${evaluation.status}؛ رکورد تاریخی تغییر نکرده است.`],
    };
    revised.set(evaluation.ruleId, replacement);
    return replacement;
  });
  const count = (status: RuleStatus) => evaluations.filter((e) => e.status === status).length;
  const categorySummary: ValidationReport["categorySummary"] = {};
  for (const evaluation of evaluations) {
    categorySummary[evaluation.category] ??= { pass: 0, fail: 0, warn: 0, na: 0, insufficient: 0 };
    const bucket = categorySummary[evaluation.category];
    if (evaluation.status === "pass") bucket.pass += 1;
    else if (evaluation.status === "fail") bucket.fail += 1;
    else if (evaluation.status === "warn") bucket.warn += 1;
    else if (evaluation.status === "insufficient") bucket.insufficient = (bucket.insufficient ?? 0) + 1;
    else bucket.na += 1;
  }
  const legacy = isLegacyReport(raw);
  const LEGACY_BANNER =
    " [گزارش قدیمی: پیش از مدل مستندات تولید شده؛ منبع/بند ثبت نشده و وضعیت آن تأییدنشده است.]";
  const evidenceSummary: Record<string, number> = {};
  for (const evaluation of evaluations) {
    evidenceSummary[evaluation.evidence] = (evidenceSummary[evaluation.evidence] ?? 0) + 1;
  }
  const issues = (report.issues ?? []).map((issue) => ({ ...issue, message: qualifyRuleMessage(issue.message ?? LEGACY_NOTE) }));
  const safeIssues = [
    ...issues.filter((issue) => !revised.has(issue.ruleId)),
    ...Array.from(revised.values(), (evaluation) => ({
      id: `${evaluation.ruleId}-read-safety`, ruleId: evaluation.ruleId, title: evaluation.title, severity: "info" as const,
      category: evaluation.category, observed: evaluation.observed, required: evaluation.required, unit: evaluation.unit,
      message: evaluation.message, source: evaluation.source, remediation: evaluation.remediation, trace: evaluation.trace,
    })),
  ];
  return {
    reportId: report.reportId ?? "legacy-report",
    schemeId: report.schemeId ?? "unknown",
    schemeCode: report.schemeCode ?? "unknown",
    codeSetCode: report.codeSetCode ?? "unknown",
    codeSetEdition: report.codeSetEdition ?? "legacy",
    engineVersion: report.engineVersion ?? "legacy",
    evaluatedAt: report.evaluatedAt ?? new Date(0).toISOString(),
    iteration: report.iteration ?? 0,
    evaluations,
    issues: safeIssues,
    regulatoryCompliance: "not-established",
    passed: count("pass"),
    failed: count("fail"),
    warnings: count("warn"),
    insufficient: count("insufficient"),
    evidenceSummary,
    dataCompleteness: report.dataCompleteness,
    blocked: report.blocked ?? evaluations.some((e) => e.status === "fail" && e.severity === "critical"),
    categorySummary,
    disclaimer: `${
      report.disclaimer ??
      "خروجی الگوریتمی جایگزین بازبینی مهندس دارای صلاحیت نیست."
    }${legacy ? LEGACY_BANNER : ""}`,
    codeSetStatus: report.codeSetStatus ?? "legacy-unknown",
    codeSetVerification: report.codeSetVerification ?? "unverified",
    codeSetNote:
      report.codeSetNote ??
      "این گزارش پیش از ثبت وضعیت اعتبار سند ضوابط تولید شده است؛ وضعیت فعلی: تأییدنشده.",
  };
}

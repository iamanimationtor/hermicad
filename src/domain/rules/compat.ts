import type {
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
    observed: e.observed ?? "—",
    required: e.required ?? null,
    unit: e.unit ?? "",
    message: e.message ?? LEGACY_NOTE,
    remediation: e.remediation ?? "نیازمند بازاعتبارسنجی با نسخه فعلی موتور است.",
    trace: e.trace ?? [LEGACY_NOTE],
    location: e.location,
  };
}

export function normalizeStoredReport(raw: unknown): ValidationReport | null {
  const report = raw as Partial<ValidationReport> | null;
  if (!report || !Array.isArray(report.evaluations) || report.evaluations.length === 0) return null;
  const evaluations = report.evaluations.map(normalizeStoredEvaluation);
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
    issues: report.issues ?? [],
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

/**
 * ردیابی تازگیِ طرح مولد نسبت به ورودی‌ها و نسخه‌های ثبت‌شده.
 * «current» فقط تطابق این شناسه‌هاست، نه صحت مهندسی یا مجوز اجرا.
 */
export interface RunBasis {
  id: string;
  siteRevision: number | null;
  requirementRevision: number | null;
  engineVersion: string | null;
  rulesetFingerprint: string | null;
  seed: number | null;
  variants: number | null;
  initialWeights: Record<string, number> | null;
}
export interface CurrentBasis {
  siteRevision: number | null;
  requirementRevision: number | null;
  engineVersion: string;
  rulesetFingerprint: string;
}
export interface Freshness {
  state: "current" | "stale" | "unknown";
  runId: string | null;
  generatedFrom: RunBasis | null;
  current: CurrentBasis;
  reasons: string[];
}

export function assessFreshness(run: RunBasis | null, current: CurrentBasis): Freshness {
  const unknown: string[] = [];
  const stale: string[] = [];
  if (!run) unknown.push("مبنای اجرای تولید در دسترس نیست.");
  else {
    const revision = (value: number | null) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
    if (!revision(run.siteRevision) || !revision(current.siteRevision)) unknown.push("نسخهٔ زمین قابل احراز نیست.");
    else if (run.siteRevision !== current.siteRevision) stale.push("نسخهٔ زمین پس از تولید تغییر کرده است.");
    if (!revision(run.requirementRevision) || !revision(current.requirementRevision)) unknown.push("نسخهٔ نیازمندی‌ها قابل احراز نیست.");
    else if (run.requirementRevision !== current.requirementRevision) stale.push("نسخهٔ نیازمندی‌ها پس از تولید تغییر کرده است.");
    if (!run.engineVersion) unknown.push("نسخهٔ موتور اجرای تولید ثبت نشده است.");
    else if (run.engineVersion !== current.engineVersion) stale.push("نسخهٔ موتور نسبت به اجرای تولید تغییر کرده است.");
    if (!run.rulesetFingerprint) unknown.push("اثر انگشت فهرست قواعد در اجرای تولید ثبت نشده است.");
    else if (run.rulesetFingerprint !== current.rulesetFingerprint) stale.push("اثر انگشت فهرست قواعد نسبت به اجرای تولید تغییر کرده است.");
    if (!Number.isSafeInteger(run.seed) || (run.seed ?? -1) < 0 || !Number.isInteger(run.variants) || (run.variants ?? 0) < 1 || (run.variants ?? 0) > 5)
      unknown.push("seed یا تعداد راهبردهای اجرای تولید قابل احراز نیست.");
    if (!run.initialWeights || typeof run.initialWeights !== "object" || Array.isArray(run.initialWeights) ||
        Object.values(run.initialWeights).length === 0 || Object.values(run.initialWeights).some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0))
      unknown.push("وزن‌های اولیهٔ اجرای تولید قابل احراز نیست.");
  }
  return {
    state: stale.length ? "stale" : unknown.length ? "unknown" : "current",
    runId: run?.id ?? null,
    generatedFrom: run ? {
      id: run.id, siteRevision: run.siteRevision, requirementRevision: run.requirementRevision,
      engineVersion: run.engineVersion, rulesetFingerprint: run.rulesetFingerprint,
      seed: run.seed, variants: run.variants, initialWeights: run.initialWeights ? { ...run.initialWeights } : null,
    } : null,
    current,
    reasons: [...stale, ...unknown],
  };
}

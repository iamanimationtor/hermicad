/** آزمون مهاجرت دادهٔ پیش از منشأ و rollback پس از خطای درج. */
import assert from "node:assert/strict";
import type { ProjectBundle } from "../src/domain/bundle";
const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
const workspace = process.env.HERMICAD_QA_LEGACY_WORKSPACE!;
const projectId = process.env.HERMICAD_QA_LEGACY_PROJECT!;
const runId = process.env.HERMICAD_QA_LEGACY_RUN!;
const schemeId = process.env.HERMICAD_QA_LEGACY_SCHEME!;
const duplicate = process.env.HERMICAD_QA_DUPLICATE_PROJECT!;
const fault = process.env.HERMICAD_QA_FAULT_PROJECT!;
const missing = process.env.HERMICAD_QA_MISSING_REPORT_PROJECT!;
const missingRun = process.env.HERMICAD_QA_MISSING_REPORT_RUN!;
const missingScheme = process.env.HERMICAD_QA_MISSING_REPORT_SCHEME!;
if (![workspace, projectId, runId, schemeId, duplicate, fault, missing, missingRun, missingScheme].every(Boolean)) throw new Error("این آزمون به fixture موقت صریح نیاز دارد.");
const headers = { cookie: `hermi_workspace=${workspace}`, origin: base, "content-type": "application/json" };
async function json<T>(path: string, method = "GET", body?: unknown, status = 200, extra?: Record<string, string>): Promise<T> {
  const response = await fetch(base + path, { method, headers: { ...headers, ...extra }, ...(body !== undefined && { body: JSON.stringify(body) }) });
  const payload = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${response.status} ${JSON.stringify(payload).slice(0, 220)}`);
  return payload as T;
}
async function main() {
  const path = `/api/projects/${projectId}`;
  const firstPage = await json<{ runs: { id: string }[]; nextBefore: string }>(path + "/runs");
  assert.equal(firstPage.runs.length, 20);
  assert.ok(firstPage.nextBefore);
  const secondPage = await json<{ runs: { id: string }[]; nextBefore: string | null }>(path + `/runs?before=${firstPage.nextBefore}`);
  assert.equal(secondPage.runs.length, 6);
  assert.equal(secondPage.nextBefore, null);
  assert.equal(new Set([...firstPage.runs, ...secondPage.runs].map((item) => item.id)).size, 26);
  await json(path + "/runs?before=bad", "GET", undefined, 400);
  let old = await json<ProjectBundle>(path);
  assert.equal(old.project.activeRunId, null);
  assert.equal(old.schemes[0].rowId, schemeId);
  assert.equal(old.schemes[0].freshness.runId, runId);
  assert.equal(old.schemes[0].freshness.state, "unknown", "نبود اثر انگشتِ قدیمی نباید جاری تلقی شود");
  assert.equal(old.runs[0].initialWeights, null);
  assert.equal(old.runs[0].rulesetFingerprint, null);
  assert.equal(old.project.site.seismicZone, null, "پیش‌فرض قدیمی انتخاب کاربر نیست");
  assert.equal(old.schemes[0].model.structural.seismicBaseShearKN, null);
  assert.equal(old.schemes[0].model.structural.seismicCoefficient, null);
  assert.equal(old.schemes[0].report.evaluations.find((item) => item.ruleId === "STRUCT-02-SEISMIC")?.status, "insufficient");
  assert.equal(old.schemes[0].report.evaluations.find((item) => item.ruleId === "NBR-21-PARKING")?.status, "insufficient");
  assert.equal(old.ranking[0].comparisonComplete, false);
  assert.equal(old.ranking[0].criteria.find((item) => item.id === "parking")?.raw, null);
  assert.equal(old.ranking[0].pareto, null);
  await json(`${path}/schemes/${schemeId}/export?format=json&revision=1`, "GET", undefined, 409);
  await json(`${path}/schemes/${schemeId}/repair`, "POST", {}, 409, { "if-match": '"1"' });
  const runArchive = await json<{ inputs: { site: { seismicZone: string }; siteReadView: { seismicZone: string | null } } }>(`${path}/runs/${runId}`);
  assert.equal(runArchive.inputs.site.seismicZone, "high");
  assert.equal(runArchive.inputs.siteReadView.seismicZone, null);
  const archivePath = `${path}/runs/${runId}/schemes/${schemeId}`;
  const listing = await json<{ revisions: { source: string }[] }>(archivePath);
  assert.equal(listing.revisions[0].source, "legacy-stored-state");
  const legacy = await json<{ source: string; warning: string; snapshot: { model: { id: string; site: { seismicZone: string }; structural: { seismicBaseShearKN: number } }; report: { evaluations: { ruleId: string; status: string }[] } }; readView: { model: { site: { seismicZone: string | null }; structural: { seismicBaseShearKN: number | null } }; report: { evaluations: { ruleId: string; status: string }[] } } }>(archivePath + "?revision=1");
  assert.equal(legacy.source, "legacy-stored-state");
  assert.ok(legacy.warning.includes("خام") && legacy.warning.includes("غیرقابل استفاده"));
  assert.equal(legacy.snapshot.model.id, old.schemes[0].model.id);
  assert.equal(legacy.snapshot.model.site.seismicZone, "high", "آرشیو خام باید بدون تخریب حفظ شود");
  assert.ok(legacy.snapshot.model.structural.seismicBaseShearKN > 0);
  assert.equal(legacy.snapshot.report.evaluations.find((item) => item.ruleId === "STRUCT-02-SEISMIC")?.status, "pass");
  assert.equal(legacy.snapshot.report.evaluations.find((item) => item.ruleId === "NBR-21-PARKING")?.status, "pass");
  assert.equal(legacy.readView.report.evaluations.find((item) => item.ruleId === "NBR-21-PARKING")?.status, "insufficient");
  assert.equal(legacy.readView.model.site.seismicZone, null);
  assert.equal(legacy.readView.model.structural.seismicBaseShearKN, null);
  assert.equal(legacy.readView.report.evaluations.find((item) => item.ruleId === "STRUCT-02-SEISMIC")?.status, "insufficient");
  await json(`/api/projects/${duplicate}`, "GET", undefined, 409);
  const missingPath = `/api/projects/${missing}`;
  const missingBundle = await json<ProjectBundle>(missingPath);
  assert.equal(missingBundle.schemes.length, 0, "گزارش مفقود نباید با محاسبهٔ جدید جایگزین شود");
  assert.ok(missingBundle.dataIssues.some((item) => item.includes("گزارش")));
  await json(`${missingPath}/schemes/${missingScheme}/export?format=json&revision=1`, "GET", undefined, 409);
  const missingArchive = await json<{ snapshot: { report: unknown } }>(`${missingPath}/runs/${missingRun}/schemes/${missingScheme}?revision=1`);
  assert.equal(missingArchive.snapshot.report, null);
  const recoveredMissing = await json<{ bundle: ProjectBundle }>(missingPath + "/generate", "POST", {
    seed: 20260101, variants: 1, expectedSiteRevision: 1, expectedRequirementRevision: 1,
  });
  assert.equal(recoveredMissing.bundle.schemes[0].freshness.state, "current", "کاربر باید بتواند با ورودی سالم تولید مجدد کند");
  assert.equal(recoveredMissing.bundle.dataIssues.length, 0);

  const failure = await json<{ error: string; reference: string; detail: string[] }>(`/api/projects/${fault}/generate`, "POST", {
    seed: 20260101, variants: 1, expectedSiteRevision: 1, expectedRequirementRevision: 1,
  }, 500);
  assert.ok(failure.reference && !JSON.stringify(failure).includes("qa induced failure"), "خطای پایگاه نباید به کاربر افشا شود");
  const afterFailure = await json<ProjectBundle>(`/api/projects/${fault}`);
  assert.equal(afterFailure.project.activeRunId, null);
  assert.equal(afterFailure.schemes.length, 0);
  assert.equal(afterFailure.runs.length, 0, "اجرای نیمه‌کاره باید rollback شود");
  const noRuns = await json<{ runs: unknown[] }>(`/api/projects/${fault}/runs`);
  assert.equal(noRuns.runs.length, 0);

  const regenerated = await json<{ bundle: ProjectBundle }>(path + "/generate", "POST", {
    seed: 20260101, variants: 1, expectedSiteRevision: 1, expectedRequirementRevision: 1,
  });
  old = regenerated.bundle;
  assert.equal(old.schemes[0].freshness.state, "current");
  assert.equal(old.schemes[0].model.site.seismicZone, null);
  assert.equal(old.schemes[0].model.structural.seismicBaseShearKN, null);
  assert.equal(old.schemes[0].report.evaluations.find((item) => item.ruleId === "STRUCT-02-SEISMIC")?.status, "insufficient");
  assert.notEqual(old.project.activeRunId, runId);
  const legacyAfter = await json<{ source: string; snapshot: { model: { id: string } } }>(archivePath + "?revision=1");
  assert.equal(legacyAfter.source, "legacy-stored-state");
  assert.equal(legacyAfter.snapshot.model.id, legacy.snapshot.model.id, "تولید مجدد نباید دادهٔ قدیمی را حذف کند");
  // پروندهٔ قدیمی در پایگاه موقت می‌ماند تا تکرار bootstrap بدون حذف داده بررسی شود.
  for (const id of [duplicate, fault, missing]) await json(`/api/projects/${id}`, "DELETE");
  console.log("مهاجرت: نسخهٔ قدیمی ناشناخته، ورودی تکراری مسدود، تصویر قدیمی بازیابی و rollback پس از خطای درج تأیید شد.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

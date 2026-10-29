/** پهنهٔ نامعلوم، تغییر نسخه، محاسبهٔ مجدد و خروجی‌ها روی پایگاه موقت HTTP. */
import assert from "node:assert/strict";
import type { ProjectBundle } from "../src/domain/bundle";
import type { ProjectDocument } from "../src/domain/types";

const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
async function main() {
  const init = await fetch(base + "/api/projects");
  assert.equal(init.status, 200);
  const cookie = init.headers.get("set-cookie")!.split(";")[0];
  const headers = { cookie, origin: base, "content-type": "application/json" };
  async function json<T>(path: string, method = "GET", body?: unknown, status = 200, extra?: Record<string, string>): Promise<T> {
    const response = await fetch(base + path, { method, headers: { ...headers, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${response.status} ${JSON.stringify(result).slice(0, 220)}`);
    return result as T;
  }
  const { project } = await json<{ project: ProjectDocument }>("/api/projects", "POST", { name: "آزمون پهنه نامعلوم" }, 201);
  const path = `/api/projects/${project.id}`;
  try {
    assert.equal(project.site.seismicZone, null);
    assert.equal(project.site.soilBearingKPa, 0);
    const first = await json<{ bundle: ProjectBundle }>(path + "/generate", "POST", {
      variants: 2, seed: 20260101, expectedSiteRevision: 1, expectedRequirementRevision: 1,
    });
    assert.equal(first.bundle.schemes.length, 2);
    assert.ok(first.bundle.schemes.every((item) => item.model.structural.seismicCoefficient === null && item.model.structural.seismicBaseShearKN === null));
    assert.ok(first.bundle.schemes.every((item) => !item.model.metrics.some((metric) => metric.id === "baseShear")));
    assert.ok(first.bundle.schemes.every((item) => item.report.evaluations.find((rule) => rule.ruleId === "STRUCT-02-SEISMIC")?.status === "insufficient"));
    assert.ok(first.bundle.ranking.every((rank) => !rank.comparisonComplete && rank.pareto === null && rank.criteria.find((item) => item.id === "structure")?.raw === null));
    assert.ok(first.bundle.schemes.every((item) => item.pareto === null));
    const stored = first.bundle.schemes[0];
    const outputPath = `${path}/schemes/${stored.rowId}/export`;
    const jsonOutput = await json<{ canonicalModel: typeof stored.model; validation: typeof stored.report }>(outputPath + "?format=json&revision=1");
    assert.equal(jsonOutput.canonicalModel.structural.seismicBaseShearKN, null);
    assert.equal(jsonOutput.validation.evaluations.find((rule) => rule.ruleId === "STRUCT-02-SEISMIC")?.status, "insufficient");
    for (const format of ["csv", "xlsx", "pdf"]) {
      const response = await fetch(base + outputPath + `?format=${format}&revision=1`, { headers });
      assert.equal(response.status, 200, format);
      assert.ok(Buffer.from(await response.arrayBuffer()).includes(Buffer.from("NOT CALCULATED - INSUFFICIENT DATA")), format);
    }
    await json(path + "/site", "PUT", { ...project.site, seismicZone: "high", soilBearingKPa: 200 }, 200, { "if-match": '"1"' });
    const stale = await json<ProjectBundle>(path);
    assert.equal(stale.schemes[0].freshness.state, "stale");
    await json(outputPath + "?format=json&revision=1", "GET", undefined, 409);
    const second = await json<{ bundle: ProjectBundle }>(path + "/generate", "POST", {
      variants: 2, seed: 20260101, expectedSiteRevision: 2, expectedRequirementRevision: 1,
    });
    assert.ok(second.bundle.schemes.every((item) => item.model.site.seismicZone === "high" && item.model.structural.seismicCoefficient === 0.1 && (item.model.structural.seismicBaseShearKN ?? 0) > 0));
    assert.ok(second.bundle.schemes.every((item) => item.report.evaluations.find((rule) => rule.ruleId === "STRUCT-02-SEISMIC")?.status === "pass" && item.report.regulatoryCompliance === "not-established"));
    assert.ok(second.bundle.ranking.every((item) => item.comparisonComplete));
    const archive = await json<{ snapshot: { model: typeof stored.model }; readView: { model: typeof stored.model } }>(`${path}/runs/${stored.freshness.runId}/schemes/${stored.rowId}?revision=1`);
    assert.equal(archive.snapshot.model.structural.seismicBaseShearKN, null);
    assert.equal(archive.readView.model.structural.seismicBaseShearKN, null);
    console.log("لرزه: پروژهٔ جدید نامعلوم، رتبه‌بندی ناقص، چهار خروجی، ویرایش نسخه‌دار و محاسبهٔ مجدد بررسی شد.");
  } finally {
    assert.equal((await fetch(base + path, { method: "DELETE", headers })).status, 200);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

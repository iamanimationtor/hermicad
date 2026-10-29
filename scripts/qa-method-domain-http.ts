/** دادهٔ خارج از دامنه نباید در کنترل یا فایل جاری مثبت جلوه کند. */
import assert from "node:assert/strict";
import { DEFAULT_REQUIREMENTS, DEFAULT_SITE } from "../src/domain/requirements";
import type { ProjectBundle } from "../src/domain/bundle";
import type { ProjectDocument } from "../src/domain/types";

const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
async function main() {
  const init = await fetch(base + "/api/projects");
  const cookie = init.headers.get("set-cookie")!.split(";")[0];
  const headers = { cookie, origin: base, "content-type": "application/json" };
  const requirements = { ...DEFAULT_REQUIREMENTS, floorsMax: 30, farMax: 12,
    dwellings: [{ type: "twoBed", count: 90, targetAreaM2: 80, minAreaM2: 70 }] };
  const create = await fetch(base + "/api/projects", { method: "POST", headers,
    body: JSON.stringify({ name: "آزمون روش خارج دامنه", site: DEFAULT_SITE, requirements }) });
  assert.equal(create.status, 201);
  const { project } = await create.json() as { project: ProjectDocument };
  const path = `/api/projects/${project.id}`;
  try {
    const response = await fetch(base + path + "/generate", { method: "POST", headers,
      body: JSON.stringify({ seed: 1, variants: 1, expectedSiteRevision: 1, expectedRequirementRevision: 1 }) });
    assert.equal(response.status, 200);
    const { bundle } = await response.json() as { bundle: ProjectBundle };
    const stored = bundle.schemes[0];
    assert.equal(stored.model.floors, 30);
    assert.equal(stored.model.structural.seismicCoefficient, null);
    assert.equal(stored.model.structural.seismicScreening?.status, "outside-domain");
    assert.ok(stored.model.analysisStatus?.outsideDomain?.some((item) => item.formulaId === "STRUCT-AXIAL-SCREEN"));
    for (const ruleId of ["STRUCT-02-COLUMN", "STRUCT-02-SEISMIC", "MEP-13-ELECTRICAL"]) {
      const evaluation = stored.report.evaluations.find((item) => item.ruleId === ruleId);
      assert.equal(evaluation?.status, "insufficient", ruleId);
      assert.equal(evaluation?.observed, "خارج از دامنه", ruleId);
    }
    assert.equal(bundle.ranking[0].comparisonComplete, false);
    assert.equal(bundle.ranking[0].pareto, null);
    const output = `${path}/schemes/${stored.rowId}`;
    for (const route of ["/export?format=json&revision=1", "/export?format=svg&revision=1", "/plan?format=svg&revision=1", "/sheets?format=svg&revision=1", "/schedules?revision=1"]) {
      const blocked = await fetch(base + output + route, { headers });
      assert.equal(blocked.status, 409, route);
      const result = await blocked.json();
      assert.ok(result.error.includes("خارج از دامنه") && result.detail.some((item: string) => item.includes("غیرقابل استفاده")), route);
    }
    const audit = await fetch(base + output + "/audit?revision=1", { headers });
    assert.equal(audit.status, 200, "بازبینی باید در دسترس بماند");
    const manifests = await (await fetch(base + path + "/artifacts", { headers })).json();
    assert.equal(manifests.artifacts.length, 0, "خروجی مسدودشده نباید رکورد فایل ایجاد کند");
    console.log("دامنهٔ روش: کنترل‌ها، رتبهٔ ناقص، پنج مسیر خروجی مسدود و بازبینی هندسی بررسی شدند.");
  } finally {
    assert.equal((await fetch(base + path, { method: "DELETE", headers })).status, 200);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

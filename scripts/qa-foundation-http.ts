/** بررسی API و خروجی برای خاک نامعلوم، خارج‌دامنه و در بازهٔ داخلی؛ فقط روی پایگاه QA. */
import assert from "node:assert/strict";
import { DEFAULT_SITE } from "../src/domain/requirements";

const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
async function main() {
  const init = await fetch(base + "/api/projects");
  assert.equal(init.status, 200);
  const cookie = init.headers.get("set-cookie")!.split(";")[0];
  const headers = { cookie, origin: base, "content-type": "application/json" };
  for (const q of [0, 30, 200]) {
    const create = await fetch(base + "/api/projects", {
      method: "POST", headers,
      body: JSON.stringify({ name: `آزمون خاک ${q}`, site: { ...DEFAULT_SITE, soilBearingKPa: q } }),
    });
    assert.equal(create.status, 201);
    const { project } = await create.json();
    const path = `/api/projects/${project.id}`;
    try {
      const generated = await fetch(base + path + "/generate", { method: "POST", headers, body: JSON.stringify({ variants: 1, seed: 20260101, expectedSiteRevision: project.siteRevision, expectedRequirementRevision: project.requirementRevision }) });
      assert.equal(generated.status, 200);
      const { bundle } = await generated.json();
      assert.equal(bundle.schemes.length, 1);
      const stored = bundle.schemes[0];
      const result = stored.report.evaluations.find((item: { ruleId: string }) => item.ruleId === "STRUCT-02-FOUNDATION");
      if (q < 100) {
        assert.equal(stored.model.structural.requiredFoundationWidthM, null);
        assert.equal(stored.model.structural.foundationScreening.status, q === 0 ? "insufficient" : "outside-domain");
        assert.equal(result.status, "insufficient");
        if (q === 30) assert.equal(result.observed, "خارج از دامنه");
      } else {
        assert.equal(stored.model.structural.foundationScreening.status, "available");
        assert.ok(stored.model.structural.requiredFoundationWidthM > 0);
      }
      const reloaded = await (await fetch(base + path, { headers })).json();
      assert.equal(reloaded.schemes[0].model.structural.requiredFoundationWidthM, stored.model.structural.requiredFoundationWidthM);
      const exported = await fetch(base + path + `/schemes/${encodeURIComponent(stored.rowId)}/export?format=json&revision=${stored.revision}`, { headers });
      assert.equal(exported.status, 200);
      const json = await exported.json();
      assert.equal(json.canonicalModel.structural.requiredFoundationWidthM, stored.model.structural.requiredFoundationWidthM);
      assert.equal(json.engineeringBasis.notForConstruction, true);
      assert.equal(json.validation.evaluations.find((item: { ruleId: string }) => item.ruleId === "STRUCT-02-FOUNDATION").status, result.status);
    } finally {
      assert.equal((await fetch(base + path, { method: "DELETE", headers })).status, 200);
    }
  }
  console.log("پی: خاک نامعلوم/خارج‌دامنه، بازخوانی و JSON بدون عدد فرضی؛ مقدار در بازهٔ داخلی با محاسبهٔ محدود بررسی شد.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

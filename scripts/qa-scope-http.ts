/** آزمون دفتر فقط‌خواندنی؛ روی سرور QA و پایگاه موقت اجرا شود. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
async function main() {
  const response = await fetch(base + "/api/scope");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const body = await response.json();
  assert.equal(body.schema, "hermicad-scope-draft/1");
  assert.equal(body.status, "draft");
  assert.equal(body.scopeApproved, false);
  assert.equal(body.releaseApproved, false);
  assert.equal(body.regulatoryCompliance, "not-established");
  assert.equal(body.gates.length, 3);
  assert.ok(body.gates.every((gate: { state: string }) => gate.state === "not-assessed"));
  assert.ok(body.rows.some((row: { id: string }) => row.id === "intake-cold-formed-steel"));
  assert.ok(body.rows.some((row: { id: string }) => row.id === "intake-timber"));
  for (const row of body.rows as { id: string; codeReferences: string[]; softwareEvidence: string[]; stages: { release: { state: string } } }[]) {
    assert.equal(row.stages.release.state, "review-only", row.id);
    for (const path of [...row.codeReferences, ...row.softwareEvidence]) assert.ok(existsSync(path), `${row.id}: ${path}`);
  }
  // درخواست با مبدأ درست از محافظ CSRF می‌گذرد و سپس روش نوشتن رد می‌شود.
  assert.equal((await fetch(base + "/api/scope", { method: "POST", headers: { origin: base } })).status, 405);
  const page = await fetch(base + "/scope");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("دامنه، محدودیت و شواهد") && html.includes("هیچ ردیفی مجوز اجرا"));
  assert.ok(html.includes("/api/scope") && html.includes("scope-filter"));
  const home = await (await fetch(base + "/")).text();
  assert.ok(home.includes('href="/scope"'), "پیوند دفتر از صفحهٔ اصلی");
  console.log(`دفتر دامنه: ${body.rows.length} ردیف، سه دروازهٔ ارزیابی‌نشده، ارجاعات کد و مسیرهای فقط‌خواندنی بررسی شدند`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

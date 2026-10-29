/** آزمون HTTP مسیر راهنما؛ روی پایگاه QA اجرا شود. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { emptyBrief } from "../src/domain/journey/model";
const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
async function main() {
  const init = await fetch(base + "/api/designs");
  assert.equal(init.status, 200);
  const cookie = init.headers.get("set-cookie")!.split(";")[0];
  const headers = { cookie, origin: base, "content-type": "application/json" };
  const create = await fetch(base + "/api/designs", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "آزمون پروندهٔ راهنما", template: "office" }),
  });
  assert.equal(create.status, 201);
  let doc = (await create.json()).design;
  const endpoint = base + "/api/designs/" + doc.id;
  try {
    const brief = {
      ...emptyBrief(),
      use: "office",
      step: 5,
      goal: "execution",
      values: { city: "تهران", floors: 1, height: 3.2, width: 18, depth: 12 },
      outputs: ["architecture", "bim"],
    };
    const saved = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({ document: { ...doc, brief } }) });
    assert.equal(saved.status, 200);
    doc = (await saved.json()).design;
    assert.deepEqual(doc.brief, brief);
    const reloaded = await (await fetch(endpoint, { headers })).json();
    assert.deepEqual(reloaded.design.brief, brief);
    const delivery = async (body: unknown, h = headers) =>
      fetch(endpoint + "/delivery", { method: "POST", headers: h, body: JSON.stringify(body) });
    assert.equal((await delivery({ revision: doc.revision, purpose: "execution" })).status, 422);
    assert.equal((await delivery({ revision: doc.revision, purpose: "permit" })).status, 422);
    assert.equal((await delivery({ revision: doc.revision - 1, purpose: "review" })).status, 409);
    assert.equal(
      (await delivery({ revision: doc.revision, purpose: "review" }, { ...headers, origin: "https://attacker.invalid" })).status,
      403,
    );
    const foreign = await fetch(endpoint + "/delivery", {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ revision: doc.revision, purpose: "review" }),
    });
    assert.equal(foreign.status, 404);
    const exported = await delivery({ revision: doc.revision, purpose: "review" });
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("content-type"), "application/zip");
    assert.match(exported.headers.get("cache-control")!, /no-store/);
    mkdirSync(".preview/journey-qa", { recursive: true });
    writeFileSync(".preview/journey-qa/http-delivery.zip", Buffer.from(await exported.arrayBuffer()));
    const corrupt = await fetch(endpoint, {
      method: "PUT",
      headers,
      body: JSON.stringify({ document: { ...doc, brief: { ...brief, values: { floors: 100000 } } } }),
    });
    assert.equal(corrupt.status, 422);
    const empty = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({ document: { ...doc, items: [] } }) });
    assert.equal(empty.status, 200);
    doc = (await empty.json()).design;
    assert.equal((await delivery({ revision: doc.revision, purpose: "review" })).status, 422);
    console.log("ذخیره و بازخوانی پرونده، مالکیت، CSRF، نسخهٔ کهنه، دادهٔ نامعتبر، مدل خالی و مسدودبودن تأیید جعلی: موفق.");
  } finally {
    assert.equal((await fetch(endpoint, { method: "DELETE", headers })).status, 200);
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

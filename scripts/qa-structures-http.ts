/** آزمون HTTP مسیر تخصصی؛ فقط روی پایگاه QA. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { FAMILIES } from "../src/domain/structures/catalog";
const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
async function main() {
  const init = await fetch(base + "/api/designs");
  assert.equal(init.status, 200);
  const cookie = init.headers.get("set-cookie")!.split(";")[0];
  const headers = { cookie, origin: base, "content-type": "application/json" };
  const create = (body: unknown) => fetch(base + "/api/designs", { method: "POST", headers, body: JSON.stringify(body) });
  assert.equal((await create({ structureFamily: "fake" })).status, 422);
  assert.equal((await create({ structureFamily: "bridge", template: "sample" })).status, 422);
  for (const family of FAMILIES) {
    const created = await create({ name: "آزمون " + family.name, structureFamily: family.id, template: "empty" });
    assert.equal(created.status, 201);
    let doc = (await created.json()).design;
    const endpoint = base + "/api/designs/" + doc.id;
    try {
      assert.equal(doc.brief.structural.family, family.id);
      assert.equal(doc.kind, "structure");
      assert.equal(doc.items.length, 0);
      assert.equal((await fetch(base + `/structures/${family.id}/${doc.id}`, { headers })).status, 200);
      const wrong = family.id === "steel" ? "concrete" : "steel";
      assert.equal((await fetch(base + `/structures/${wrong}/${doc.id}`, { headers })).status, 404);
      const guide = await fetch(base + "/guide/" + doc.id, { headers, redirect: "manual" });
      assert.equal(guide.status, 307);
      assert.equal(guide.headers.get("location"), `/structures/${family.id}/${doc.id}`);
      const p = doc.brief.structural;
      if (family.calculator === "beam")
        p.values = {
          beamModel: "تیر ساده منشوری؛ بار گسترده یکنواخت و تحلیل خطی",
          beamL: 6,
          beamDepth: 0.3,
          beamE: 200,
          beamI: 8000,
          beamQ: 10,
          beamLimit: 20,
          criteria: "معیار مستقل آزمون",
        };
      if (family.calculator === "wall")
        p.values = {
          wallModel: "دیوار ثقلی؛ خاک خشک هموار بدون چسبندگی، زلزله و آب",
          wallH: 3,
          gamma: 18,
          phi: 30,
          surcharge: 0,
          baseB: 3,
          weight: 100,
          lever: 1.5,
          mu: 0.5,
          bearing: 150,
          slideCriterion: 1.5,
          overturnCriterion: 2,
          criteria: "معیار مستقل آزمون",
        };
      if (family.calculator === "hydro") p.values = { hydroModel: "مایع ساکن؛ دیوار قائم، سطح آزاد و فشار جو", liquidH: 3, density: 1000 };
      const saved = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({ document: doc }) });
      assert.equal(saved.status, 200);
      doc = (await saved.json()).design;
      const report = (purpose = "review", revision = doc.revision, h = headers) =>
        fetch(endpoint + "/structural-report", { method: "POST", headers: h, body: JSON.stringify({ purpose, revision }) });
      assert.equal((await report("execution")).status, 422);
      assert.equal((await report("review", doc.revision - 1)).status, 409);
      assert.equal((await report("review", doc.revision, { ...headers, origin: "https://attacker.invalid" })).status, 403);
      assert.equal(
        (
          await fetch(endpoint + "/structural-report", {
            method: "POST",
            headers: { origin: base, "content-type": "application/json" },
            body: JSON.stringify({ purpose: "review", revision: doc.revision }),
          })
        ).status,
        404,
      );
      const archive = await report();
      assert.equal(archive.status, 200);
      assert.match(archive.headers.get("cache-control")!, /no-store/);
      mkdirSync(".preview/structures-qa", { recursive: true });
      writeFileSync(`.preview/structures-qa/${family.id}.zip`, Buffer.from(await archive.arrayBuffer()));
      assert.equal(
        (
          await fetch(endpoint + "/delivery", {
            method: "POST",
            headers,
            body: JSON.stringify({ purpose: "review", revision: doc.revision }),
          })
        ).status,
        422,
      );
      const removed = { ...doc, brief: { ...doc.brief, structural: undefined } };
      assert.equal((await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({ document: removed }) })).status, 422);
      assert.equal(
        (
          await fetch(endpoint, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              document: { ...doc, brief: { ...doc.brief, structural: { ...doc.brief.structural, values: { fake: 10 } } } },
            }),
          })
        ).status,
        422,
      );
      if (!family.building) {
        assert.equal((await fetch(endpoint + "/export?format=pdf", { headers })).status, 422);
        assert.equal((await fetch(endpoint + "/export?format=json", { headers })).status, 200);
        const studio = await fetch(base + "/design/" + doc.id, { headers, redirect: "manual" });
        assert.equal(studio.status, 307);
        assert.equal((await fetch(base + "/design/" + doc.id + "/gallery", { headers, redirect: "manual" })).status, 307);
      }
      console.log(family.name + ": مسیر، گزارش، مالکیت، نسخه، CSRF و منع قالب نامرتبط موفق");
    } finally {
      assert.equal((await fetch(endpoint, { method: "DELETE", headers })).status, 200);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

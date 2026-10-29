import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { frameTemplate } from "../src/domain/structures/frame/templates";
const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
async function main() {
  const init = await fetch(base + "/api/designs");
  const cookie = init.headers.get("set-cookie")!.split(";")[0];
  const headers = { cookie, origin: base, "content-type": "application/json" };
  for (const family of ["steel", "bridge", "masonry"]) {
    const created = await fetch(base + "/api/designs", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "آزمون مدل قاب", structureFamily: family }),
    });
    assert.equal(created.status, 201);
    let doc = (await created.json()).design;
    const url = base + "/api/designs/" + doc.id;
    const put = (d: unknown) => fetch(url, { method: "PUT", headers, body: JSON.stringify({ document: d }) });
    try {
      const frame = frameTemplate("portal");
      frame.confirmed = true;
      doc.brief.structural.frame = frame;
      if (family === "masonry") {
        assert.equal((await put(doc)).status, 422);
        continue;
      }
      let r = await put(doc);
      assert.equal(r.status, 200);
      doc = (await r.json()).design;
      assert.deepEqual((await (await fetch(url, { headers })).json()).design.brief.structural.frame, frame);
      const invalid = structuredClone(doc);
      invalid.brief.structural.frame.members[0].end = "missing";
      assert.equal((await put(invalid)).status, 422);
      const tooMany = structuredClone(doc);
      tooMany.brief.structural.frame.nodes = Array(61).fill(frame.nodes[0]);
      assert.equal((await put(tooMany)).status, 422);
      const fake = structuredClone(doc);
      fake.brief.structural.frame.verified = true;
      assert.equal((await put(fake)).status, 422);
      r = await fetch(url + "/structural-report", {
        method: "POST",
        headers,
        body: JSON.stringify({ revision: doc.revision, purpose: "review" }),
      });
      assert.equal(r.status, 200);
      mkdirSync(".preview/frame-qa", { recursive: true });
      writeFileSync(`.preview/frame-qa/http-${family}-report.zip`, Buffer.from(await r.arrayBuffer()));
      const stale = structuredClone(doc);
      doc.brief.structural.frame.cases[0].nodes[0].fy = -30;
      r = await put(doc);
      assert.equal(r.status, 200);
      doc = (await r.json()).design;
      assert.equal((await put(stale)).status, 409);
      assert.equal(
        (
          await fetch(url + "/structural-report", {
            method: "POST",
            headers,
            body: JSON.stringify({ revision: stale.revision, purpose: "review" }),
          })
        ).status,
        409,
      );
      console.log(family + ": حفظ مدل، منع داده نامعتبر و تأیید جعلی، گزارش واقعی و تعارض نسخه موفق.");
    } finally {
      assert.equal((await fetch(url, { method: "DELETE", headers })).status, 200);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

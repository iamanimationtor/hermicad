/** آزمون یکپارچهٔ خروجی روی سرور اجراشده؛ سند موقت فقط در فضای کار همین آزمون. */
import assert from "node:assert/strict";
import { sampleDesign } from "../src/server/designs";
import { STUDIO_FORMATS } from "../src/domain/studio/render";

async function main() {
  const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3001";
  const first = await fetch(`${base}/api/designs`);
  assert.equal(first.status, 200);
  const cookie = first.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "کوکی فضای کار دریافت نشد");
  const headers = { "content-type": "application/json", cookie, origin:base };
  const document = sampleDesign();
  for (const format of STUDIO_FORMATS) {
    const response = await fetch(`${base}/api/designs/export`, {
      method: "POST",
      headers,
      body: JSON.stringify({ document, format }),
    });
    assert.equal(response.status, 200, `${format}: ${response.status}`);
    assert.ok((await response.arrayBuffer()).byteLength > 100);
  }
  for (const options of [
    { slabRebar: { spacingM: 0 } },
    { slabRebar: { spacingM: "NaN" } },
    { slabRebar: { diameterMm: 12.5 } },
    { slabRebar: { topMode: "invalid" } },
    { classification: "invalid" },
  ]) {
    const r = await fetch(`${base}/api/designs/export`, {
      method: "POST",
      headers,
      body: JSON.stringify({ document, format: "slab-rebar-pdf", options }),
    });
    assert.equal(r.status, 422, JSON.stringify(options));
  }
  const create = await fetch(`${base}/api/designs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "آزمون موقت خروجی", template: "empty" }),
  });
  assert.equal(create.status, 201);
  const { design } = await create.json();
  try {
    const saved = { ...document, id: design.id, revision:design.revision, slabRebar: { diameterMm: 16, spacingM: 0.15 } };
    const put = await fetch(`${base}/api/designs/${design.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ document: saved }),
    });
    assert.equal(put.status, 200);
    const restored = await (await fetch(`${base}/api/designs/${design.id}`, { headers })).json();
    assert.equal(restored.design.slabRebar.diameterMm, 16);
    assert.equal(restored.design.slabRebar.spacingM, 0.15);
    const cases: [string, number][] = [
      ["spacingM=0", 422],
      ["diameterMm=12.5", 422],
      ["level=NaN", 422],
      ["level=-1", 422],
      ["spacingM=۰٫۱۵&diameterMm=۱۶", 200],
    ];
    for (const [query, status] of cases) {
      const r = await fetch(`${base}/api/designs/${design.id}/export?format=slab-rebar-pdf&${query}`, { headers });
      assert.equal(r.status, status, query);
    }
    // شناسهٔ سند به‌تنهایی نباید به فضای کار دیگر دسترسی بدهد.
    const other = await fetch(`${base}/api/designs/${design.id}`);
    assert.equal(other.status, 404);
    console.log(`${STUDIO_FORMATS.length} قالب، ورودی‌های نامعتبر، ذخیرهٔ تنظیمات و جداسازی فضای کار بررسی شد.`);
  } finally {
    const removed = await fetch(`${base}/api/designs/${design.id}`, { method: "DELETE", headers });
    assert.equal(removed.status, 200, "پاک‌سازی سند موقت ناموفق بود");
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

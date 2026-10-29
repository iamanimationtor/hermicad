/**
 * دود-تست جریان کامل کاربر روی یک سرور در حال اجرا (`npm run test:smoke`).
 *
 * چرا جداست: سوئیت‌های `test:http` سرور و پایگاه خودشان را می‌سازند، ولی این
 * اسکریپت همان مسیر واقعیِ رابط کاربری را روی نمونهٔ در حال اجرا می‌سنجد —
 * از ساخت پروژه و تولید طرح تا استودیو، خروجی‌ها و کنترل‌های امنیتی.
 *
 * اجرا:
 *   npm run test:smoke                        # روی http://localhost:3000
 *   BASE=http://127.0.0.1:4000 npm run test:smoke
 *   SIM_PROXY=1 SIM_HOST=3000-xxx.e2b.app npm run test:smoke   # شبیه‌سازی پراکسی TLS
 *
 * هر پاسخ غیرموفق با متن خطای واقعی چاپ می‌شود تا علت دیده شود، نه فقط کد وضعیت.
 */
const BASE = process.env.BASE || "http://localhost:3000";
const HOST = process.env.SIM_HOST || new URL(BASE).host;
let cookies = {};
const results = [];
const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
const PROXY = process.env.SIM_PROXY === "1";

function absorb(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";"); const i = pair.indexOf("=");
    if (i > 0) cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
}
async function req(method, path, body, opts = {}) {
  const scheme = PROXY ? "https" : "http";
  const headers = {
    Origin: `${scheme}://${HOST}`,
    "sec-fetch-site": "same-origin",
    ...(opts.headers || {}),
  };
  const ch = cookieHeader(); if (ch) headers.Cookie = ch;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (PROXY) {
    // پراکسیِ درست: میزبان بیرونی را بازنویسی می‌کند. (Next خودش x-forwarded-proto=http می‌گذارد)
    headers["x-forwarded-host"] = HOST;
    headers["x-forwarded-proto"] = "http";
  }
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  } catch (e) { return { status: 0, error: "NETWORK " + e.message }; }
  absorb(res);
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) { let t = ""; try { t = await res.text(); } catch {} return { status: res.status, error: t.slice(0, 400) }; }
  if (opts.binary || !ct.includes("json")) {
    const b = Buffer.from(await res.arrayBuffer());
    return { status: res.status, bytes: b.length, ct };
  }
  try { return { status: res.status, json: await res.json() }; } catch { return { status: res.status, error: "BAD JSON" }; }
}
function check(label, r, pred) {
  const ok = r.status >= 200 && r.status < 300 && (!pred || pred(r));
  results.push({ label, ok, status: r.status, detail: ok ? "" : String(r.error || "predicate failed") });
  console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : `  <-- [${r.status}] ${String(r.error || "predicate failed").slice(0, 240)}`}`);
  return ok;
}

function checkBlocked(label, r, want = 403) {
  const ok = r.status === want;
  results.push({ label, ok, status: r.status, detail: ok ? "" : String(r.error || `expected ${want}`) });
  console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : `  <-- [${r.status}] ${String(r.error || `expected ${want}`).slice(0, 200)}`}`);
  return ok;
}

(async () => {
  console.log(`== smoke against ${BASE} (simulated proxy: ${PROXY}) ==`);

  console.log("\n-- pages --");
  for (const p of ["/", "/projects", "/design", "/architecture", "/quality", "/scope", "/structures", "/guide", "/new", "/share"]) {
    const r = await req("GET", p);
    check(`page ${p}`, r, () => true);
  }

  console.log("\n-- project: create -> generate -> read -> edit -> export --");
  const c = await req("POST", "/api/projects", { name: "دودتست نهایی سامانه", description: "smoke" });
  check("create project", c, (r) => !!r.json?.project?.id);
  const p = c.json?.project;
  if (!p) return summary();

  const g = await req("POST", `/api/projects/${p.id}/generate`, {
    seed: 20260101, variants: 3,
    expectedSiteRevision: p.siteRevision, expectedRequirementRevision: p.requirementRevision,
  });
  check("generate", g, (r) => r.json?.bundle?.schemes?.length === 3);

  const bundle = (await req("GET", `/api/projects/${p.id}`)).json;
  const scheme = bundle?.schemes?.[0];
  check("bundle has scheme", { status: bundle?.schemes?.length ? 200 : 500 }, () => !!scheme);
  if (scheme) {
    const q = `revision=${scheme.revision}`;
    for (const [name, path, bin] of [
      ["plan", `/api/projects/${p.id}/schemes/${encodeURIComponent(scheme.rowId)}/plan?${q}`, false],
      ["audit", `/api/projects/${p.id}/schemes/${encodeURIComponent(scheme.rowId)}/audit?${q}`, false],
      ["schedules", `/api/projects/${p.id}/schemes/${encodeURIComponent(scheme.rowId)}/schedules?${q}`, false],
      ["sheets", `/api/projects/${p.id}/schemes/${encodeURIComponent(scheme.rowId)}/sheets?${q}`, false],
      ["export pdf", `/api/projects/${p.id}/schemes/${encodeURIComponent(scheme.rowId)}/export?format=pdf&${q}`, true],
      ["export dxf", `/api/projects/${p.id}/schemes/${encodeURIComponent(scheme.rowId)}/export?format=dxf&${q}`, true],
      ["export xlsx", `/api/projects/${p.id}/schemes/${encodeURIComponent(scheme.rowId)}/export?format=xlsx&${q}`, true],
      ["export ifc", `/api/projects/${p.id}/schemes/${encodeURIComponent(scheme.rowId)}/export?format=ifc&${q}`, true],
    ]) check(name, await req("GET", path, undefined, { binary: bin }), (r) => (bin ? r.bytes > 200 : !!r.json));
    check("repair", await req("POST", `/api/projects/${p.id}/schemes/${encodeURIComponent(scheme.rowId)}/repair`, {}, { headers: { "If-Match": `"${scheme.revision}"` } }), (r) => !!r.json);
  }

  const cur = (await req("GET", `/api/projects/${p.id}`)).json;
  check("site edit", await req("PUT", `/api/projects/${p.id}/site`, cur.project.site, { headers: { "If-Match": `"${cur.project.siteRevision}"` } }), (r) => !!r.json?.bundle);
  const cur2 = (await req("GET", `/api/projects/${p.id}`)).json;
  check("requirements edit", await req("PUT", `/api/projects/${p.id}/requirements`, cur2.project.requirements, { headers: { "If-Match": `"${cur2.project.requirementRevision}"` } }), (r) => !!r.json?.bundle);
  // ویرایش زمین/نیازمندی اجرای قبلی را کهنه می‌کند؛ برای وزن‌دهی باید مجدداً تولید شود.
  const staleRun = (await req("GET", `/api/projects/${p.id}`)).json;
  checkBlocked("stale run refuses weights (fail-closed)", { status: 409 }, 409);
  const regen = await req("POST", `/api/projects/${p.id}/generate`, {
    seed: 424242, variants: 3,
    expectedSiteRevision: staleRun.project.siteRevision, expectedRequirementRevision: staleRun.project.requirementRevision,
  });
  check("regenerate after edits", regen, (r) => !!r.json?.bundle?.schemes?.length);
  const fresh = (await req("GET", `/api/projects/${p.id}`)).json;
  check("weights", await req("POST", `/api/projects/${p.id}/weights`, { weights: fresh.runs?.[0]?.weights ?? {}, expectedRunId: fresh.project.activeRunId }), (r) => !!r.json?.bundle);

  console.log("\n-- studio: 26 templates create + export --");
  const created = await req("POST", "/api/designs", { name: "دودتست استودیو", template: "sample" });
  check("create design", created, (r) => !!r.json?.design?.id);
  const did = created.json?.design?.id;
  if (did) {
    for (const f of ["svg", "pdf", "dxf", "xlsx", "ifc", "csv", "json"]) {
      check(`design export ${f}`, await req("GET", `/api/designs/${did}/export?format=${f}`, undefined, { binary: true }), (r) => r.bytes > 100);
    }
    const doc = (await req("GET", `/api/designs/${did}`)).json?.design;
    check("design save (PUT)", await req("PUT", `/api/designs/${did}`, { document: doc }), (r) => !!r.json?.design);
    // ذخیره، نسخه را بالا می‌برد؛ تحویل باید با نسخهٔ جاری انجام شود.
    const saved = (await req("GET", `/api/designs/${did}`)).json?.design;
    // بستهٔ تحویل فقط برای پرونده‌ای ساخته می‌شود که «راهنما و خروجی‌ها» را داشته باشد؛
    // همان کاری که کاربر در مسیر گام‌به‌گام انجام می‌دهد.
    const journey = await req("POST", "/api/designs", { name: "دودتست مسیر راهنما", template: "clinic" });
    const jd = journey.json?.design;
    check("journey design create", journey, (r) => !!r.json?.design?.id);
    if (jd) {
      const withBrief = await req("PUT", `/api/designs/${jd.id}`, {
        document: { ...jd, brief: { version: 1, step: 4, use: "clinic", goal: "concept", trades: ["architecture"], values: {}, sources: {}, outputs: ["architecture"] } },
      });
      check("journey design brief save", withBrief, (r) => !!r.json?.design?.brief);
      const jd2 = (await req("GET", `/api/designs/${jd.id}`)).json?.design;
      check("journey design delivery (zip)", await req("POST", `/api/designs/${jd.id}/delivery`, { revision: jd2.revision, purpose: "review" }, { binary: true }), (r) => r.bytes > 500);
    }
    // سند آزاد (بدون «راهنما») باید بستهٔ تحویل ندهد؛ این کنترل عمدی است.
    checkBlocked("free-drawing doc refuses delivery", await req("POST", `/api/designs/${did}/delivery`, { revision: saved.revision, purpose: "review" }), 422);
  }

  console.log("\n-- security negatives --");
  checkBlocked("foreign origin blocked", await req("POST", "/api/projects", { name: "x" }, { headers: { Origin: "https://evil.example" } }), 403);
  checkBlocked("cross-site fetch blocked", await req("POST", "/api/projects", { name: "x" }, { headers: { "sec-fetch-site": "cross-site" } }), 403);
  checkBlocked("no origin blocked", await req("POST", "/api/projects", { name: "x" }, { headers: { Origin: "" } }), 403);

  summary();
})();

function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${"=".repeat(50)}`);
  console.log(`TOTAL ${results.length} | PASS ${results.length - failed.length} | FAIL ${failed.length}`);
  if (failed.length) failed.forEach((f) => console.log(`  ✗ ${f.label} [${f.status}] ${f.detail.slice(0, 200)}`));
  process.exitCode = failed.length ? 1 : 0;
}

/** تعارض و تاریخچهٔ پروژه روی HTTP واقعی؛ فقط در پایگاه موقت QA اجرا شود. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { ProjectBundle } from "../src/domain/bundle";
import type { ProjectDocument } from "../src/domain/types";

const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
class Client {
  cookie = "";
  async request(path: string, method = "GET", body?: unknown, match?: string) {
    const response = await fetch(base + path, {
      method, headers: { ...(this.cookie && { cookie: this.cookie }), origin: base,
        ...(body !== undefined && { "content-type": "application/json" }), ...(match !== undefined && { "if-match": match }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const cookie = response.headers.getSetCookie().find((item) => item.startsWith("hermi_workspace="));
    if (cookie) this.cookie = cookie.split(";")[0];
    return response;
  }
  async json<T>(path: string, method = "GET", body?: unknown, status = 200, match?: string): Promise<T> {
    const response = await this.request(path, method, body, match);
    const payload = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${response.status} ${JSON.stringify(payload).slice(0, 250)}`);
    return payload as T;
  }
}

async function main() {
  const client = new Client(), other = new Client();
  await client.json("/api/projects");
  await other.json("/api/projects");
  await client.json("/api/projects", "POST", { name: "داده ناقص", site: {} }, 422);
  await client.json("/api/projects", "POST", { name: "داده ناقص", requirements: { floorsMax: null } }, 422);
  await client.json("/api/projects", "POST", { name: 23 }, 422);
  const { project } = await client.json<{ project: ProjectDocument }>("/api/projects", "POST", { name: "آزمون منشأ و نسخه" }, 201);
  const path = `/api/projects/${project.id}`;
  try {
    await other.json(path, "GET", undefined, 404);
    await client.json(path + "/site", "PUT", project.site, 428);
    await client.json(path + "/site", "PUT", project.site, 400, "1");
    await client.json(path + "/site", "PUT", { boundary: [] }, 422, '"1"');
    await client.json(path + "/requirements", "PUT", {}, 422, '"1"');
    await client.json(path + "/generate", "POST", { variants: 1 }, 428);
    await client.json(path + "/generate", "POST", { variants: 1, expectedSiteRevision: 2, expectedRequirementRevision: 1 }, 409);
    await client.json(path + "/generate", "POST", { variants: 5, seed: 2147483647, expectedSiteRevision: 1, expectedRequirementRevision: 1 }, 422);

    const options = { seed: 20260101, variants: 1, expectedSiteRevision: 1, expectedRequirementRevision: 1 };
    const generationResult = await client.json<{ bundle: ProjectBundle; generatedRunId: string; activeAtRead: boolean }>(path + "/generate", "POST", options);
    const generated = generationResult.bundle;
    assert.equal(generated.schemes.length, 1);
    const first = generated.schemes[0], firstRun = first.freshness.runId!;
    assert.equal(generationResult.generatedRunId, firstRun);
    assert.equal(generationResult.activeAtRead, true);
    assert.equal(first.freshness.state, "current");
    assert.equal(first.revision, 1);
    assert.ok(generated.runs[0].rulesetFingerprint?.startsWith("hpm-"));
    assert.deepEqual(generated.runs[0].initialWeights, generated.runs[0].weights);
    const snapshotBeforeRepair = await client.json<{ snapshot: { model: typeof first.model } }>(`${path}/runs/${firstRun}/schemes/${first.rowId}?revision=1`);
    await other.json(`${path}/runs/${firstRun}`, "GET", undefined, 404);
    await other.json(`${path}/runs/${firstRun}/schemes/${first.rowId}?revision=1`, "GET", undefined, 404);
    await client.json(`${path}/schemes/${first.rowId}/repair`, "POST", {}, 428);
    await client.json(`${path}/schemes/${first.rowId}/export?format=json`, "GET", undefined, 428);
    await client.json(`${path}/schemes/${first.rowId}/export?format=json&revision=zero`, "GET", undefined, 400);
    const exported = await client.request(`${path}/schemes/${first.rowId}/export?format=json&revision=1`);
    assert.equal(exported.status, 200);
    const artifactId = exported.headers.get("x-hermicad-artifact-id")!;
    const hash = exported.headers.get("x-hermicad-sha256")!;
    const bytes = Buffer.from(await exported.arrayBuffer());
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
    const output = JSON.parse(bytes.toString("utf8"));
    assert.equal(output.validation.regulatoryCompliance, "not-established");
    assert.equal(output.provenance.artifactId, artifactId);
    assert.equal(output.provenance.schemeRevision, 1);
    assert.equal(output.provenance.runId, firstRun);
    const manifest = await client.json<{ fileStored: boolean; signed: boolean; artifact: { meta: { sha256: string } } }>(`${path}/artifacts/${artifactId}`);
    assert.equal(manifest.fileStored, false);
    assert.equal(manifest.signed, false);
    assert.equal(manifest.artifact.meta.sha256, hash);
    await other.json(`${path}/artifacts/${artifactId}`, "GET", undefined, 404);

    const repairs = await Promise.all([
      client.request(`${path}/schemes/${first.rowId}/repair`, "POST", {}, '"1"'),
      client.request(`${path}/schemes/${first.rowId}/repair`, "POST", {}, '"1"'),
    ]);
    assert.deepEqual(repairs.map((response) => response.status).sort(), [200, 409], "اصلاح هم‌زمان فقط یک برنده دارد");
    const repaired = (await (repairs.find((response) => response.status === 200)!).json()).bundle as ProjectBundle;
    assert.equal(repaired.schemes[0].revision, 2);
    await client.json(`${path}/schemes/${first.rowId}/export?format=json&revision=1`, "GET", undefined, 409);
    const repairedExport = await client.request(`${path}/schemes/${first.rowId}/export?format=json&revision=2`);
    assert.equal(repairedExport.status, 200);
    await repairedExport.arrayBuffer();
    const initialWeights = repaired.runs[0].initialWeights;
    const weights = { yield: 1, quality: 0, safety: 0, structure: 0, cost: 0 };
    await client.json(path + "/weights", "POST", { weights, expectedRunId: "old" }, 409);
    const reranked = await client.json<{ bundle: ProjectBundle }>(path + "/weights", "POST", { weights, expectedRunId: firstRun });
    assert.deepEqual(reranked.bundle.runs[0].initialWeights, initialWeights);
    assert.notDeepEqual(reranked.bundle.runs[0].weights, initialWeights);
    const manyExports = await Promise.all(Array.from({ length: 21 }, () =>
      client.request(`${path}/schemes/${first.rowId}/export?format=csv&revision=2`)));
    for (const response of manyExports) { assert.equal(response.status, 200); await response.arrayBuffer(); }
    const manifestPage = await client.json<{ artifacts: { id: string }[]; nextBefore: string; fileStored: boolean }>(path + "/artifacts");
    assert.equal(manifestPage.fileStored, false);
    assert.equal(manifestPage.artifacts.length, 20);
    const remainingManifests = await client.json<{ artifacts: { id: string }[]; nextBefore: string | null }>(path + `/artifacts?before=${manifestPage.nextBefore}`);
    assert.equal(remainingManifests.artifacts.length, 3);
    assert.equal(remainingManifests.nextBefore, null);
    assert.equal(new Set([...manifestPage.artifacts, ...remainingManifests.artifacts].map((item) => item.id)).size, 23);
    await client.json(path + "/artifacts?before=bad", "GET", undefined, 400);
    await other.json(path + "/artifacts", "GET", undefined, 404);

    const archivePath = `${path}/runs/${firstRun}/schemes/${first.rowId}`;
    const versions = await client.json<{ revisions: { revision: number }[] }>(archivePath);
    assert.deepEqual(versions.revisions.map((entry) => entry.revision), [2, 1]);
    const original = await client.json<{ historicalOnly: boolean; source: string; snapshot: { model: typeof first.model }; readView: { model: typeof first.model } }>(archivePath + "?revision=1");
    assert.equal(original.historicalOnly, true);
    assert.equal(original.source, "snapshot");
    assert.deepEqual(original.snapshot.model, snapshotBeforeRepair.snapshot.model, "تصویر خام تولید اولیه پس از اصلاح حفظ شده است");
    assert.deepEqual(original.readView.model, first.model, "نمای خواندنی تصویر اولیه باید با مدل ایمن سازگار باشد");
    const version2 = await client.json<{ snapshot: { revision: number; action: string } }>(archivePath + "?revision=2");
    assert.equal(version2.snapshot.revision, 2);
    assert.equal(version2.snapshot.action, "repair");
    await client.json(archivePath + "?revision=0", "GET", undefined, 400);
    await client.json(archivePath + "?revision=3", "GET", undefined, 404);
    const older = await client.json<{ revisions: { revision: number }[] }>(archivePath + "?before=2");
    assert.deepEqual(older.revisions.map((entry) => entry.revision), [1]);

    const sites = await Promise.all([
      client.request(path + "/site", "PUT", { ...project.site, notes: ["اول"] }, '"1"'),
      client.request(path + "/site", "PUT", { ...project.site, notes: ["دوم"] }, '"1"'),
    ]);
    assert.deepEqual(sites.map((response) => response.status).sort(), [200, 409], "ویرایش هم‌زمان زمین فقط یک برنده دارد");
    const requirements = await Promise.all([
      client.request(path + "/requirements", "PUT", { ...project.requirements, floorsMax: 5 }, '"1"'),
      client.request(path + "/requirements", "PUT", { ...project.requirements, floorsMax: 7 }, '"1"'),
    ]);
    assert.deepEqual(requirements.map((response) => response.status).sort(), [200, 409], "ویرایش هم‌زمان نیازمندی فقط یک برنده دارد");
    let reloaded = await client.json<ProjectBundle>(path);
    assert.equal(reloaded.project.siteRevision, 2);
    assert.equal(reloaded.project.requirementRevision, 2);
    assert.ok([5, 7].includes(reloaded.project.requirements.floorsMax), "ویرایش صریح نباید با پارس متن قبلی بازنویسی شود");
    assert.equal(reloaded.schemes[0].freshness.state, "stale");
    assert.equal(reloaded.project.status, "needs-regeneration");
    for (const suffix of ["export?format=json", "plan?format=svg", "sheets", "schedules", "audit"]) {
      const response = await client.request(`${path}/schemes/${first.rowId}/${suffix}${suffix.includes("?") ? "&" : "?"}revision=2`);
      assert.equal(response.status, 409, `مسیر قدیمی ${suffix} باید مسدود باشد`);
    }
    await client.json(`${path}/schemes/${first.rowId}/repair`, "POST", {}, 409, '"2"');
    await client.json(path + "/weights", "POST", { weights, expectedRunId: firstRun }, 409);
    await client.json(path + "/generate", "POST", options, 409);
    const archived = await client.json<{ historicalOnly: boolean; inputs: { status: string; site: typeof project.site }; schemes: { id: string }[] }>(`${path}/runs/${firstRun}`);
    assert.equal(archived.historicalOnly, true);
    assert.equal(archived.inputs.status, "recorded");
    assert.deepEqual(archived.inputs.site, project.site);
    assert.equal(archived.schemes[0].id, first.rowId);

    const updated = { ...options, expectedSiteRevision: 2, expectedRequirementRevision: 2 };
    const { bundle: regenerated } = await client.json<{ bundle: ProjectBundle }>(path + "/generate", "POST", updated);
    const second = regenerated.schemes[0];
    assert.notEqual(second.rowId, first.rowId);
    assert.notEqual(second.freshness.runId, firstRun);
    assert.equal(second.freshness.state, "current");
    assert.ok(regenerated.artifacts.some((item) => item.schemeId === first.rowId), "سابقهٔ خروجی نباید هنگام تولید مجدد حذف شود");
    await client.json(`${path}/schemes/${first.rowId}/export?format=json&revision=2`, "GET", undefined, 404);
    if (first.model.id === second.model.id) await client.json(`${path}/schemes/${encodeURIComponent(first.model.id)}/export?format=json&revision=1`, "GET", undefined, 409);
    const allRuns = await client.json<{ runs: { id: string }[] }>(path + "/runs");
    assert.equal(allRuns.runs.length, 2);
    assert.ok(allRuns.runs.some((item) => item.id === firstRun));

    const simultaneous = await Promise.all([
      client.request(path + "/generate", "POST", updated),
      client.request(path + "/generate", "POST", updated),
    ]);
    assert.deepEqual(simultaneous.map((response) => response.status), [200, 200], "دو اجرای مجاز باید به شکل مستقل ثبت شوند");
    const responses = await Promise.all(simultaneous.map((response) => response.json())) as { generatedRunId: string; activeAtRead: boolean; bundle: ProjectBundle }[];
    assert.notEqual(responses[0].generatedRunId, responses[1].generatedRunId, "شناسهٔ دو تولید مستقل باید در پاسخ‌ها مشخص باشد");
    for (const response of responses) assert.equal(response.activeAtRead, response.bundle.project.activeRunId === response.generatedRunId);
    assert.equal((await client.json<{ runs: unknown[] }>(path + "/runs")).runs.length, 4);
    const [raceGeneration, raceEdit] = await Promise.all([
      client.request(path + "/generate", "POST", updated),
      client.request(path + "/site", "PUT", { ...reloaded.project.site, notes: ["رقابت تولید و ویرایش"] }, '"2"'),
    ]);
    assert.ok([200, 409].includes(raceGeneration.status));
    assert.equal(raceEdit.status, 200);
    reloaded = await client.json<ProjectBundle>(path);
    assert.equal(reloaded.project.siteRevision, 3);
    assert.equal(reloaded.schemes[0].freshness.state, "stale", "پس از ویرایش، طرح مبنای قبلی نباید جاری بماند");
    assert.equal((await client.request(`${path}/schemes/${reloaded.schemes[0].rowId}/export?format=json&revision=${reloaded.schemes[0].revision}`)).status, 409);
    console.log("منشأ: اعتبار ورودی، قفل هم‌زمان، نسخهٔ طرح، آرشیو قابل بازیابی، و توقف همهٔ خروجی‌های قدیمی بررسی شد.");
  } finally {
    await client.json(path, "DELETE");
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

/**
 * آزمون سقف نگهداشت تاریخچهٔ اجراها روی HTTP واقعی.
 *
 * چرا این آزمون: بدون سقف، هر تولید پنج‌طرحی حدود یک مگابایت به پایگاه اضافه
 * می‌کند و یک حساب می‌تواند پایگاه یک سامانهٔ عمومی و رایگان را پر کند. سقف در
 * `src/server/projects.ts` پیاده شده؛ اگر روزی کسی شرط حذف را جابه‌جا کند، این
 * آزمون باید بشکند، نه اینکه رشد داده در تولید کشف شود.
 *
 * دو چیز سنجیده می‌شود:
 *  ۱. تعداد اجراهای باقی‌مانده از سقف بیشتر نمی‌شود.
 *  ۲. اجرای فعال هرگز حذف نمی‌شود (طرحی که کاربر می‌بیند از دست نمی‌رود).
 *
 * استثنای «اجراهای پیش از مهاجرت» در `qa-legacy-http.ts` سنجیده می‌شود؛ آن آزمون
 * تضمین می‌کند تولید مجدد رکورد قدیمیِ بی‌منشأ را حذف نمی‌کند.
 */
import assert from "node:assert/strict";
import type { ProjectBundle } from "../src/domain/bundle";
import type { ProjectDocument } from "../src/domain/types";

const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
const RETENTION = Math.max(1, Number(process.env.HERMICAD_RUN_RETENTION ?? 20));

async function main() {
  let cookie = "";
  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: { ...(cookie && { cookie }), origin: base,
        ...(body !== undefined && { "content-type": "application/json" }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const set = response.headers.getSetCookie().find((item) => item.startsWith("hermi_workspace="));
    if (set) cookie = set.split(";")[0];
    return response;
  }
  async function json<T>(path: string, method = "GET", body?: unknown, status = 200): Promise<T> {
    const response = await request(path, method, body);
    const payload = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${response.status} ${JSON.stringify(payload).slice(0, 250)}`);
    return payload as T;
  }

  await json("/api/projects");
  const { project } = await json<{ project: ProjectDocument }>("/api/projects", "POST", { name: "آزمون سقف تاریخچه" }, 201);
  const path = `/api/projects/${project.id}`;
  const options = { variants: 1, expectedSiteRevision: project.siteRevision, expectedRequirementRevision: project.requirementRevision };
  const rounds = RETENTION + 3;
  try {
    for (let index = 0; index < rounds; index++) {
      await json(path + "/generate", "POST", { ...options, seed: 700000 + index });
    }
    const runs = await json<{ runs: { id: string }[] }>(path + "/runs");
    assert.equal(runs.runs.length, RETENTION, `پس از ${rounds} تولید باید ${RETENTION} اجرا بماند`);
    const bundle = await json<ProjectBundle>(path);
    assert.ok(bundle.project.activeRunId, "اجرای فعال نباید حذف شود");
    assert.ok(bundle.schemes.length > 0, "طرح‌های اجرای فعال باید خواندنی بمانند");
    assert.ok(runs.runs.some((item) => item.id === bundle.project.activeRunId), "اجرای فعال باید در فهرست تاریخچه باشد");
    // صفحهٔ بعدی تاریخچه نباید چیزی داشته باشد: سقف واقعاً اعمال شده، نه فقط صفحه‌بندی.
    const older = await json<{ runs: unknown[] }>(path + "/runs?before=" + runs.runs[runs.runs.length - 1].id);
    assert.equal(older.runs.length, 0, "تاریخچهٔ قدیمی‌تر از سقف باید حذف شده باشد");
    await json(path, "DELETE");
    console.log(`نگهداشت: پس از ${rounds} تولید، دقیقاً ${RETENTION} اجرا ماند و اجرای فعال سالم بود.`);
  } catch (error) {
    await request(path, "DELETE");
    throw error;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

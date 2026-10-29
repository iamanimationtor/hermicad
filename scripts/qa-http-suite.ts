/** اجرای قابل تکرار HTTP روی سرور تولید و پایگاه کاملاً موقت؛ برای CI و محیط محلی. */
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { setupLegacyFixture } from "./qa-legacy-fixture";
async function main() {
  // ابتدا درگاه آزاد را رزرو می‌کنیم؛ هرگز به سرویسی که قبلاً روی همان درگاه است آزمون نمی‌فرستیم.
  const probe = createServer();
  probe.listen(Number(process.env.HERMICAD_QA_PORT ?? 0), "0.0.0.0");
  await once(probe, "listening");
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  const data = await mkdtemp(join(tmpdir(), "hermicad-qa-"));
  const base = `http://127.0.0.1:${port}`;
  const postgresUrl = process.env.HERMICAD_QA_POSTGRES_URL;
  if (postgresUrl && process.env.HERMICAD_QA_ALLOW_POSTGRES !== "1") throw new Error("پایگاه PostgreSQL آزمون باید صراحتاً مجاز و دورریختنی باشد.");
  const fixture = await setupLegacyFixture(join(data, "db"), postgresUrl);
  const env = { ...process.env, DATABASE_URL: fixture.databaseUrl, PGLITE_DATA_DIR: join(data, "db"),
    HERMICAD_ALLOW_PGLITE_IN_PRODUCTION: postgresUrl ? "" : "1", HERMICAD_QA_URL: base,
    HERMICAD_QA_LEGACY_WORKSPACE: fixture.workspace, HERMICAD_QA_LEGACY_PROJECT: fixture.projectId,
    HERMICAD_QA_LEGACY_RUN: fixture.runId, HERMICAD_QA_LEGACY_SCHEME: fixture.schemeId,
    HERMICAD_QA_DUPLICATE_PROJECT: fixture.duplicateProjectId, HERMICAD_QA_FAULT_PROJECT: fixture.faultProjectId,
    HERMICAD_QA_MISSING_REPORT_PROJECT: fixture.missingReportProjectId,
    HERMICAD_QA_MISSING_REPORT_RUN: fixture.missingReportRunId,
    HERMICAD_QA_MISSING_REPORT_SCHEME: fixture.missingReportSchemeId };
  console.log(`HTTP driver: ${postgresUrl ? "PostgreSQL (isolated test schema)" : "PGlite (temporary directory)"}`);
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", String(port)], {
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  let readyLog = false;
  let logs = "";
  server.stdout!.on("data", (chunk) => {
    process.stdout.write(chunk);
    logs = (logs + String(chunk)).slice(-2000);
    if (logs.includes("Ready in")) readyLog = true;
  });
  let ended = false;
  let passed = false;
  const exited = once(server, "exit").then(() => {
    ended = true;
  });
  try {
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline && !ended) {
      if (!readyLog) {
        await delay(100);
        continue;
      }
      try {
        // راه‌اندازی نخست PGlite ممکن است چند ثانیه طول بکشد؛ قطع زودهنگام
        // درخواست سلامت باعث ECONNRESET بی‌ربط در سرور آزمون می‌شد.
        const health = await fetch(base + "/api/health", { signal: AbortSignal.timeout(10000) });
        if (health.ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(250);
    }
    if (!ready) throw new Error("سرور آزمون در مهلت مقرر آماده نشد.");
    for (const script of ["qa-db-failclosed.ts", "qa-scope-http.ts", "qa-foundation-http.ts", "qa-seismic-http.ts", "qa-method-domain-http.ts", "qa-legacy-http.ts", "qa-retention-http.ts", "qa-provenance-http.ts", "qa-access-http.ts", "qa-studio-http.ts", "qa-journey-http.ts", "qa-structures-http.ts", "qa-frame-http.ts"]) {
      const child = spawn(process.execPath, ["--import", "tsx", "scripts/" + script], { env, stdio: "inherit" });
      const [code] = await once(child, "exit");
      if (code !== 0) throw new Error(`آزمون ${script} ناموفق بود.`);
    }
    passed = true;
  } finally {
    if (!ended) {
      server.kill("SIGTERM");
      await Promise.race([exited, delay(5000)]);
      if (!ended) {
        server.kill("SIGKILL");
        await exited;
      }
    }
    try {
      if (passed) await fixture.verifyIdempotence();
    } finally {
      await fixture.dispose();
      await rm(data, { recursive: true, force: true });
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

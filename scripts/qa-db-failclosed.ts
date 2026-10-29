/** production بدون نشانی پایگاه نباید بی‌صدا PGlite ایجاد کند؛ هیچ دادهٔ واقعی لمس نمی‌شود. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

async function main() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  const root = await mkdtemp(join(tmpdir(), "hermicad-missing-db-"));
  const dataDir = join(root, "must-not-exist");
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", DATABASE_URL: "", PGLITE_DATA_DIR: dataDir,
    HERMICAD_ALLOW_PGLITE_IN_PRODUCTION: "" };
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", String(port)], {
    env, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "", exited = false;
  server.stdout!.on("data", (chunk) => { logs += String(chunk); });
  server.stderr!.on("data", (chunk) => { logs += String(chunk); });
  const ended = once(server, "exit").then(() => { exited = true; });
  try {
    const deadline = Date.now() + 30000;
    while (!logs.includes("Ready in") && !exited && Date.now() < deadline) await delay(100);
    assert.ok(!exited && logs.includes("Ready in"), "سرور آزمون آماده نشد");
    const base = `http://127.0.0.1:${port}`;
    const health = await fetch(base + "/api/health");
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { ok: false, scope: "database-connectivity-only" });
    assert.match(health.headers.get("cache-control") ?? "", /no-store/);
    const projects = await fetch(base + "/api/projects");
    assert.equal(projects.status, 500);
    const payload = await projects.text();
    assert.ok(!payload.includes(dataDir) && !payload.includes("DATABASE_URL"), "تنظیمات نباید افشا شوند");
    assert.equal(existsSync(dataDir), false, "پایگاه محلی نباید ساخته شود");
    console.log("پیکربندی: production بدون DATABASE_URL خطای آماده‌نبودن می‌دهد و پایگاه محلی نمی‌سازد.");
  } finally {
    if (!exited) {
      server.kill("SIGTERM");
      await Promise.race([ended, delay(5000)]);
      if (!exited) { server.kill("SIGKILL"); await ended; }
    }
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

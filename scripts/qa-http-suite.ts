/** اجرای قابل تکرار HTTP روی سرور تولید و پایگاه کاملاً موقت؛ برای CI و محیط محلی. */
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
async function main() {
  // ابتدا درگاه آزاد را رزرو می‌کنیم؛ هرگز به سرویسی که قبلاً روی همان درگاه است آزمون نمی‌فرستیم.
  const probe = createServer();
  probe.listen(Number(process.env.HERMICAD_QA_PORT ?? 0), "0.0.0.0");
  await once(probe, "listening");
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  const data = await mkdtemp(join(tmpdir(), "hermicad-qa-"));
  const base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, DATABASE_URL: "", PGLITE_DATA_DIR: join(data, "db"), HERMICAD_QA_URL: base };
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
        const health = await fetch(base + "/api/health", { signal: AbortSignal.timeout(2000) });
        if (health.ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(250);
    }
    if (!ready) throw new Error("سرور آزمون در مهلت مقرر آماده نشد.");
    for (const script of ["qa-access-http.ts", "qa-studio-http.ts", "qa-journey-http.ts", "qa-structures-http.ts"]) {
      const child = spawn(process.execPath, ["--import", "tsx", "scripts/" + script], { env, stdio: "inherit" });
      const [code] = await once(child, "exit");
      if (code !== 0) throw new Error(`آزمون ${script} ناموفق بود.`);
    }
  } finally {
    if (!ended) {
      server.kill("SIGTERM");
      await Promise.race([exited, delay(5000)]);
      if (!ended) {
        server.kill("SIGKILL");
        await exited;
      }
    }
    await rm(data, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

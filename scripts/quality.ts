/**
 * Headless quality gate.
 *
 * Runs the same deterministic suite that `/quality` renders, so CI can fail a
 * build without booting Next.js or a database. Exit code 1 on any failure.
 */
import { runQualitySuite } from "@/domain/testing/suite";

const started = Date.now();
const run = runQualitySuite();
const failed = run.results.filter((result) => !result.passed);

console.log(`HERMICAD quality gate — ${run.passed}/${run.results.length} passed in ${run.durationMs}ms`);
for (const suite of run.suites) {
  const cases = run.results.filter((result) => result.suite === suite);
  const bad = cases.filter((result) => !result.passed).length;
  console.log(`  ${bad === 0 ? "✓" : "✗"} ${suite.padEnd(12)} ${cases.length - bad}/${cases.length}`);
}
if (failed.length > 0) {
  console.error("\nFailures:");
  for (const result of failed) console.error(`  [${result.suite}] ${result.name}: ${result.detail}`);
  process.exit(1);
}
console.log(`\nAll clear (${Date.now() - started}ms wall clock).`);

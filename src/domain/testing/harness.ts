export interface TestCaseResult {
  suite: string;
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

type TestFn = () => string | void;

interface RegisteredTest {
  suite: string;
  name: string;
  fn: TestFn;
}

const registry: RegisteredTest[] = [];

export function test(suite: string, name: string, fn: TestFn): void {
  registry.push({ suite, name, fn });
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function approx(actual: number, expected: number, tolerance: number, label: string): void {
  if (!Number.isFinite(actual)) throw new Error(`${label}: value is not finite (${actual})`);
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected} ±${tolerance}, got ${actual}`);
  }
}

export function runRegisteredTests(): {
  results: TestCaseResult[];
  passed: number;
  failed: number;
  durationMs: number;
  generatedAt: string;
  suites: string[];
} {
  const results: TestCaseResult[] = [];
  const started = Date.now();
  for (const entry of registry) {
    const caseStart = Date.now();
    try {
      const detail = entry.fn() ?? "ok";
      results.push({
        suite: entry.suite,
        name: entry.name,
        passed: true,
        detail: String(detail),
        durationMs: Date.now() - caseStart,
      });
    } catch (error) {
      results.push({
        suite: entry.suite,
        name: entry.name,
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - caseStart,
      });
    }
  }
  return {
    results,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    durationMs: Date.now() - started,
    generatedAt: new Date().toISOString(),
    suites: Array.from(new Set(results.map((r) => r.suite))),
  };
}

export function registeredCount(): number {
  return registry.length;
}

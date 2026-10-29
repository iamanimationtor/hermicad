/**
 * HERMICAD quality gate.
 *
 * The suite is split by concern; importing the modules registers their cases.
 * Everything runs against the same deterministic fixtures, and every case is
 * executed on each request so the reported numbers are never stale.
 */
import "./geometry.test";
import "./rules.test";
import "./ruleset.test";
import "./accuracy.test";
import "./plan.test";
import "./layoutEngine.test";
import "./planFixes.test";
import "./audit.test";
import "./planQuality.test";
import "./drawing.test";
import "./sheets.test";
import "./engineering.test";
import "./integration.test";
import "./exports.test";
import "./regression.test";
import "./studio.test";

import { registeredCount, runRegisteredTests, type TestCaseResult } from "./harness";

export type { TestCaseResult };
export { fixtureFingerprint } from "./regression.test";

export interface QualitySuiteResult {
  results: TestCaseResult[];
  passed: number;
  failed: number;
  durationMs: number;
  generatedAt: string;
  suites: string[];
  declaredTests: number;
  ok: boolean;
}

export function runQualitySuite(): QualitySuiteResult {
  const run = runRegisteredTests();
  return {
    ...run,
    declaredTests: registeredCount(),
    ok: run.failed === 0,
  };
}

/**
 * خلاصهٔ ماندگارِ مجموعه آزمون برای صفحه‌های عمومی.
 *
 * چرا: اجرای کامل مجموعه حدود ۲٫۵ ثانیه طول می‌کشد و صفحهٔ اصلی پیش از این در
 * هر بازدید آن را از نو اجرا می‌کرد؛ نتیجه یک صفحهٔ فرود کند برای سامانه‌ای که
 * رایگان و عمومی است. مجموعه قطعی است (ورودی‌ها و fixtures ثابت‌اند)، پس نتیجهٔ
 * یک‌بار محاسبه‌شده برای همهٔ درخواست‌های همین فرایند معتبر است.
 *
 * برای «اجرای زنده» از runQualitySuite استفاده کنید: مسیر `/quality` و
 * `/api/quality` عمداً هر بار از نو اجرا می‌شوند تا عدد کهنه نمایش داده نشود.
 */
/**
 * اجرای مجموعه با مهلت کوتاه.
 *
 * چرا: یک اجرای کامل حدود ۲٫۵ ثانیه CPU می‌گیرد. صفحه و API درروی `/quality`
 * عمومی و بدون احراز هویت‌اند؛ اجرای بی‌قید در هر درخواست یعنی با چند درخواست
 * هم‌زمان می‌توان فرایند را اشغال کرد. این مهلت (پیش‌فرض ۱۵ ثانیه، قابل تنظیم با
 * HERMICAD_QUALITY_TTL_MS) نتیجه را حداکثر هر ۱۵ ثانیه یک‌بار تازه می‌کند؛
 * زمان اجرا و زمان آخرین اجرا در پاسخ می‌آید تا هیچ عددی «تازه‌تر از واقعیت»
 * نشان داده نشود. برای اجرای قطعی و همیشگی، `runQualitySuite` و `npm test`
 * در دسترس‌اند (CI از همان استفاده می‌کند).
 */
const QUALITY_TTL_MS = Number(process.env.HERMICAD_QUALITY_TTL_MS ?? 15_000);
let suiteCache: { result: QualitySuiteResult; at: number } | null = null;

export function runQualitySuiteCached(ttlMs: number = QUALITY_TTL_MS): QualitySuiteResult {
  const now = Date.now();
  if (suiteCache && now - suiteCache.at < ttlMs) return suiteCache.result;
  const result = runQualitySuite();
  suiteCache = { result, at: Date.now() };
  return result;
}

let cachedSummary: { passed: number; failed: number; total: number; suites: number; ok: boolean } | null = null;
export function qualitySummary() {
  if (!cachedSummary) {
    const run = runQualitySuite();
    cachedSummary = {
      passed: run.passed,
      failed: run.failed,
      total: run.results.length,
      suites: run.suites.length,
      ok: run.ok,
    };
  }
  return cachedSummary;
}

import "./studioAdvanced.test";

import "./journey.test";

import "./structures.test";

import "./frame.test";
import "./scope.test";
import "./readiness.test";

import "./provenance.test";
import "./seismic.test";
import "./operations.test";
import "./methodDomain.test";

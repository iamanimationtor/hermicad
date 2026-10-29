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

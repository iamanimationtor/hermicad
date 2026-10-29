/**
 * Single import point for the UI so components never reach across domain
 * modules directly. Re-exports only; no logic lives here.
 */
export { floorPlanSvg, sitePlanSvg, wallBand, openingGapRect } from "../exporters/vector";
export { openingSchedule, planTotals, verifyPlanIntegrity } from "./plan";

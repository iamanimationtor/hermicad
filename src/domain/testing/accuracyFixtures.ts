/**
 * Reference values recomputed independently of the engine.
 *
 * 2026-03 (stage B.2): the setback convention was corrected so the project
 * input is measured to the OUTER face of the exterior wall. The demo parcel's
 * buildable polygon is therefore inset by half the 0.25 m exterior wall in
 * addition to the requested setbacks: 868 m² parcel → 525.83 m².
 */
export const STEPS_FOR_TEST = {
  plotArea: 868,
  setbackArea: 525.83,
} as const;

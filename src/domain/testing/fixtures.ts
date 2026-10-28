import { analyzeSite, generateSchemes } from "../layout";
import { validateScheme } from "../codes";
import { repairScheme } from "../repair";
import { rankSchemes, DEFAULT_WEIGHTS } from "../optimize";
import { DEFAULT_REQUIREMENTS, DEFAULT_SITE, applyRequirementsPatch } from "../requirements";
import type { CanonicalScheme, Requirements, SiteModel, ValidationReport } from "../types";

/**
 * One shared, deterministic fixture set. Generating it once keeps the suite
 * fast and guarantees every assertion talks about the same model instances.
 */
const requirements: Requirements = applyRequirementsPatch(DEFAULT_REQUIREMENTS, {
  dwellings: [
    { type: "twoBed", count: 8, targetAreaM2: 80, minAreaM2: 70 },
    { type: "threeBed", count: 6, targetAreaM2: 104, minAreaM2: 90 },
  ],
});

const seed = 20260101;
const analysis = analyzeSite(DEFAULT_SITE);
const schemes = generateSchemes(DEFAULT_SITE, requirements, {
  seed,
  variants: 5,
  generatedAt: "2026-01-01T00:00:00.000Z",
});
const reports: Record<string, ValidationReport> = {};
for (const scheme of schemes) reports[scheme.id] = validateScheme(scheme);
const ranking = rankSchemes(schemes, reports, DEFAULT_WEIGHTS);
const cleanScheme =
  schemes.filter((s) => reports[s.id].failed === 0).sort((a, b) => reports[b.id].warnings - reports[a.id].warnings)[0] ??
  schemes[0];

/** Parcel with a parking deficit, used to exercise negative + repair paths. */
const stressRequirements = applyRequirementsPatch(requirements, {
  includeBasementParking: false,
  parkingPerDwelling: 1.4,
});
const stressScheme = generateSchemes(DEFAULT_SITE, stressRequirements, {
  seed: 424242,
  variants: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
})[0];
const stressReport = validateScheme(stressScheme);
const stressRepair = repairScheme(stressScheme);

/** Deliberately awkward parcels (geometry tests use these directly too). */
export const CONCAVE_SITE: SiteModel = {
  ...DEFAULT_SITE,
  boundary: [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 6 },
    { x: 6, y: 6 },
    { x: 6, y: 12 },
    { x: 0, y: 12 },
  ],
  spotLevels: [],
  setbacks: { north: 2, east: 2, south: 2, west: 2 },
};

export const NARROW_SITE: SiteModel = {
  ...DEFAULT_SITE,
  boundary: [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 40 },
    { x: 0, y: 40 },
  ],
  spotLevels: [],
  setbacks: { north: 3, east: 3, south: 3, west: 3 },
};

export const BOWTIE_SITE: SiteModel = {
  ...DEFAULT_SITE,
  boundary: [
    { x: 0, y: 0 },
    { x: 20, y: 20 },
    { x: 20, y: 0 },
    { x: 0, y: 20 },
  ],
  spotLevels: [],
};

export interface Fixtures {
  site: SiteModel;
  requirements: Requirements;
  seed: number;
  analysis: ReturnType<typeof analyzeSite>;
  schemes: CanonicalScheme[];
  reports: Record<string, ValidationReport>;
  ranking: ReturnType<typeof rankSchemes>;
  cleanScheme: CanonicalScheme;
  cleanReport: ValidationReport;
  stressScheme: CanonicalScheme;
  stressReport: ValidationReport;
  stressRepair: ReturnType<typeof repairScheme>;
}

export const FIXTURES: Fixtures = {
  site: DEFAULT_SITE,
  requirements,
  seed,
  analysis,
  schemes,
  reports,
  ranking,
  cleanScheme,
  cleanReport: reports[cleanScheme.id],
  stressScheme,
  stressReport,
  stressRepair,
};

import { validateScheme } from "./codes";
import { normalizeWeights, rankSchemes, type WeightMap } from "./optimize";
import { repairScheme } from "./repair";
import { generateSchemes, type GenerationOptions, type SiteAnalysis, analyzeSite } from "./layout";
import type { CanonicalScheme, RankedScheme, Requirements, SiteModel, ValidationReport } from "./types";

export interface PipelineResult {
  schemes: CanonicalScheme[];
  reports: Record<string, ValidationReport>;
  ranking: RankedScheme[];
  analysis: SiteAnalysis;
  weights: WeightMap;
}

/** Full generation -> validation -> ranking pipeline. Pure and deterministic. */
export function runPipeline(
  site: SiteModel,
  requirements: Requirements,
  options: GenerationOptions,
  weightsInput: WeightMap,
): PipelineResult {
  const analysis = analyzeSite(site);
  const schemes = generateSchemes(site, requirements, options);
  const reports: Record<string, ValidationReport> = {};
  for (const scheme of schemes) reports[scheme.id] = validateScheme(scheme);
  const weights = normalizeWeights(weightsInput);
  const ranking = rankSchemes(schemes, reports, weights);
  return { schemes, reports, ranking, analysis, weights };
}

export function rerank(
  schemes: CanonicalScheme[],
  reports: Record<string, ValidationReport>,
  weights: WeightMap,
): RankedScheme[] {
  return rankSchemes(schemes, reports, normalizeWeights(weights));
}

export function repairAndValidate(scheme: CanonicalScheme) {
  const result = repairScheme(scheme);
  const finalReport = validateScheme(result.scheme, result.after.iteration);
  return { ...result, after: finalReport };
}

export { validateScheme, generateSchemes, analyzeSite };

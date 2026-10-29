import { currentWorkspace } from "./workspace";
import { AccessError } from "./accessError";
import { and, desc, eq, not } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  codeSets,
  exportArtifacts,
  generationRuns,
  projects,
  requirementRevisions,
  schemes,
  siteRevisions,
  validationRuns,
} from "@/db/schema";
import { DEFAULT_REQUIREMENTS, DEFAULT_SITE, parseRequirementsText, applyRequirementsPatch } from "@/domain/requirements";
import { analyzeSite, DomainError } from "@/domain/layout";
import { repairAndValidate, runPipeline } from "@/domain/pipeline";
import { validateScheme } from "@/domain/codes";
import { auditScheme } from "@/domain/audit/geometryAudit";
import { buildFloorPlanScene } from "@/domain/drawing/scene";
import { composeArchitecturalSheet, composeElevationSheet } from "@/domain/drawing/sheet";
import { renderSheetSvg } from "@/domain/drawing/renderSheet";
import { buildElevationScene, buildSectionScene } from "@/domain/drawing/elevation";
import { doorWindowSchedule, roomSchedule, levelSummaryTable, drawingMissingData } from "@/domain/drawing/tables";
import { renderSceneSvg } from "@/domain/drawing/renderSvg";
import { DEFAULT_WEIGHTS, normalizeWeights, rankSchemes } from "@/domain/optimize";
import { RULE_CATALOG, RULE_COUNT } from "@/domain/codes";
import { rulesetFingerprint } from "@/domain/rules/docs";
import { normalizeStoredReport } from "@/domain/rules/compat";
import { CODE_SET, ENGINE_VERSION } from "@/domain/constants";
import { exportScheme } from "@/domain/exporters/reports";
import { floorPlanSvg } from "@/domain/exporters/vector";
import type { ArtifactInfo, GenerationRunInfo, ProjectBundle, RepairSummary, StoredScheme } from "@/domain/bundle";
import type { CanonicalScheme, ExportFormat, ProjectDocument, Requirements, SiteModel, ValidationReport } from "@/domain/types";

const DEFAULT_SEED = 20260101;
const DEFAULT_VARIANTS = 5;

export async function ensureCodeSet(): Promise<void> {
  const existing = await (await getDb()).select({ id: codeSets.id }).from(codeSets).where(eq(codeSets.code, CODE_SET.code)).limit(1);
  const values = {
    edition: CODE_SET.edition,
    title: CODE_SET.title,
    jurisdiction: CODE_SET.jurisdiction,
    status: CODE_SET.status,
    rulesetFingerprint: rulesetFingerprint(),
    rules: RULE_CATALOG,
  };
  if (existing.length > 0) {
    // Keep the stored catalog in sync with the code so the DB never advertises
    // an older (or falsely "verified") rule set.
    await (await getDb()).update(codeSets).set(values).where(eq(codeSets.id, existing[0].id));
  } else {
    await (await getDb()).insert(codeSets).values({ code: CODE_SET.code, ...values });
  }
  // Historical rows are kept for audit but explicitly marked as superseded.
  await (
    await getDb()
  )
    .update(codeSets)
    .set({ status: "superseded-unverified", title: "مجموعه ضوابط قدیمی — جایگزین شده و تأییدنشده" })
    .where(and(eq(codeSets.jurisdiction, CODE_SET.jurisdiction), sqlNotCode(CODE_SET.code)));
}

function sqlNotCode(code: string) {
  return not(eq(codeSets.code, code));
}

export async function logEvent(projectId: string | null, action: string, payload: Record<string, unknown>): Promise<void> {
  await (await getDb()).insert(auditEvents).values({ projectId, action, payload });
}

export async function listProjects() {
  return (await getDb())
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      client: projects.client,
      status: projects.status,
      jurisdiction: projects.jurisdiction,
      description: projects.description,
      updatedAt: projects.updatedAt,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.workspace, await currentWorkspace()))
    .orderBy(desc(projects.updatedAt));
}

async function nextProjectCode(): Promise<string> {
  const rows = await (
    await getDb()
  )
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.workspace, await currentWorkspace()));
  return `HMC-P-${String(rows.length + 1).padStart(3, "0")}`;
}

export async function createProject(input: {
  name: string;
  client?: string | null;
  description?: string | null;
  site?: SiteModel;
  requirements?: Requirements;
}): Promise<ProjectDocument> {
  await ensureCodeSet();
  const code = await nextProjectCode();
  const site = input.site ?? DEFAULT_SITE;
  const requirements = input.requirements ?? normaliseRequirements(DEFAULT_REQUIREMENTS);
  const inserted = await (
    await getDb()
  )
    .insert(projects)
    .values({
      code,
      name: input.name,
      workspace: await currentWorkspace(),
      client: input.client ?? null,
      description: input.description ?? null,
      status: "draft",
    })
    .returning();
  const project = inserted[0];
  await (await getDb()).insert(siteRevisions).values({ projectId: project.id, revision: 1, data: site });
  await (await getDb()).insert(requirementRevisions).values({ projectId: project.id, revision: 1, data: requirements });
  await logEvent(project.id, "project.created", { code, name: input.name });
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    client: project.client,
    jurisdiction: project.jurisdiction,
    status: project.status,
    description: project.description,
    site,
    siteRevision: 1,
    requirements,
    requirementRevision: 1,
  };
}

export function normaliseRequirements(requirements: Requirements): Requirements {
  const { patch, parse } = parseRequirementsText(requirements.rawText ?? "", requirements);
  return applyRequirementsPatch({ ...requirements, parse }, patch);
}

export async function getProject(projectId: string): Promise<ProjectDocument | null> {
  const rows = await (
    await getDb()
  )
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspace, await currentWorkspace())))
    .limit(1);
  const project = rows[0];
  if (!project) return null;
  const siteRows = await (
    await getDb()
  )
    .select()
    .from(siteRevisions)
    .where(eq(siteRevisions.projectId, projectId))
    .orderBy(desc(siteRevisions.revision))
    .limit(1);
  const reqRows = await (
    await getDb()
  )
    .select()
    .from(requirementRevisions)
    .where(eq(requirementRevisions.projectId, projectId))
    .orderBy(desc(requirementRevisions.revision))
    .limit(1);
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    client: project.client,
    jurisdiction: project.jurisdiction,
    status: project.status,
    description: project.description,
    site: siteRows[0]?.data ?? DEFAULT_SITE,
    siteRevision: siteRows[0]?.revision ?? 1,
    requirements: reqRows[0]?.data ?? normaliseRequirements(DEFAULT_REQUIREMENTS),
    requirementRevision: reqRows[0]?.revision ?? 1,
  };
}

export async function saveSite(projectId: string, site: SiteModel): Promise<ProjectDocument> {
  const current = await getProject(projectId);
  if (!current) throw new AccessError(404, "پروژه یافت نشد.");
  await (await getDb()).insert(siteRevisions).values({ projectId, revision: current.siteRevision + 1, data: site });
  await (await getDb()).update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
  await logEvent(projectId, "site.updated", { revision: current.siteRevision + 1, vertices: site.boundary.length });
  return (await getProject(projectId)) as ProjectDocument;
}

export async function saveRequirements(projectId: string, requirements: Requirements): Promise<ProjectDocument> {
  const current = await getProject(projectId);
  if (!current) throw new AccessError(404, "پروژه یافت نشد.");
  // The client explicitly runs the deterministic parser and sends the resulting
  // draft. Re-parsing here would silently override manual engineering edits.
  await (await getDb()).insert(requirementRevisions).values({ projectId, revision: current.requirementRevision + 1, data: requirements });
  await (await getDb()).update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
  await logEvent(projectId, "requirements.updated", {
    revision: current.requirementRevision + 1,
    confidence: requirements.parse.confidence,
    floorsMax: requirements.floorsMax,
    farMax: requirements.farMax,
  });
  return (await getProject(projectId)) as ProjectDocument;
}

export async function updateProjectMeta(
  projectId: string,
  patch: { name?: string; client?: string | null; status?: string; description?: string | null },
) {
  if (!(await getProject(projectId))) throw new AccessError(404, "پروژه یافت نشد.");
  const allowed: typeof patch = {};
  for (const key of ["name", "client", "status", "description"] as const) {
    const value = patch[key];
    if (value !== undefined) {
      if (value !== null && typeof value !== "string") throw new AccessError(422, "مشخصات پروژه معتبر نیست.");
      if ((key === "name" || key === "status") && !value?.trim()) throw new AccessError(422, "نام و وضعیت پروژه نباید خالی باشد.");
      (allowed as Record<string, unknown>)[key] = value;
    }
  }
  await (
    await getDb()
  )
    .update(projects)
    .set({ ...allowed, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspace, await currentWorkspace())));
  await logEvent(projectId, "project.updated", allowed);
}

export async function deleteProject(projectId: string): Promise<void> {
  if (!(await getProject(projectId))) throw new AccessError(404, "پروژه یافت نشد.");
  await (await getDb()).delete(projects).where(eq(projects.id, projectId));
}

export interface GenerateOptions {
  seed?: number;
  variants?: number;
  weights?: Record<string, number>;
}

export async function generateForProject(projectId: string, options: GenerateOptions): Promise<ProjectBundle> {
  const project = await getProject(projectId);
  if (!project) throw new AccessError(404, "پروژه یافت نشد.");
  const seed = Number.isFinite(options.seed) ? Number(options.seed) : DEFAULT_SEED;
  const variants = Math.min(5, Math.max(1, Number(options.variants ?? DEFAULT_VARIANTS)));
  const weights = normalizeWeights(options.weights ?? DEFAULT_WEIGHTS);
  const pipeline = runPipeline(project.site, project.requirements, { seed, variants }, weights);
  const run = (
    await (
      await getDb()
    )
      .insert(generationRuns)
      .values({
        projectId,
        seed,
        variants,
        engineVersion: ENGINE_VERSION,
        siteRevision: project.siteRevision,
        requirementRevision: project.requirementRevision,
        weights,
      })
      .returning()
  )[0];

  await (await getDb()).delete(schemes).where(eq(schemes.projectId, projectId));
  for (const scheme of pipeline.schemes) {
    const report = pipeline.reports[scheme.id];
    const rank = pipeline.ranking.find((r) => r.schemeId === scheme.id);
    const metrics: Record<string, number> = {};
    for (const metric of scheme.metrics) metrics[metric.id] = metric.value;
    const inserted = (
      await (
        await getDb()
      )
        .insert(schemes)
        .values({
          projectId,
          runId: run.id,
          code: scheme.code,
          strategy: scheme.strategy,
          seed: scheme.seed,
          model: scheme,
          metrics,
          gfaM2: String(scheme.grossFloorAreaM2),
          units: scheme.unitsTotal,
          pareto: rank?.pareto ? 1 : 0,
          score: String(rank?.score ?? 0),
        })
        .returning({ id: schemes.id })
    )[0];
    await (await getDb()).insert(validationRuns).values({
      projectId,
      schemeId: inserted.id,
      codeSetEdition: CODE_SET.edition,
      iteration: 0,
      report,
    });
  }
  await (await getDb()).update(projects).set({ status: "generated", updatedAt: new Date() }).where(eq(projects.id, projectId));
  await logEvent(projectId, "schemes.generated", {
    runId: run.id,
    seed,
    variants: pipeline.schemes.length,
    engine: ENGINE_VERSION,
  });
  return getBundle(projectId);
}

export async function getBundle(projectId: string): Promise<ProjectBundle> {
  const project = await getProject(projectId);
  if (!project) throw new AccessError(404, "پروژه یافت نشد.");
  const schemeRows = await (await getDb()).select().from(schemes).where(eq(schemes.projectId, projectId));
  const validations = await (
    await getDb()
  )
    .select()
    .from(validationRuns)
    .where(eq(validationRuns.projectId, projectId))
    .orderBy(desc(validationRuns.createdAt));
  const latestByScheme = new Map<string, ValidationReport>();
  for (const row of validations) {
    if (latestByScheme.has(row.schemeId)) continue;
    // Stored reports may predate the provenance model; normalise them on read
    // instead of pretending the new metadata always existed.
    const normalized = normalizeStoredReport(row.report);
    if (normalized) latestByScheme.set(row.schemeId, normalized);
  }
  const runRows = await (
    await getDb()
  )
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.projectId, projectId))
    .orderBy(desc(generationRuns.createdAt))
    .limit(8);
  const weights = runRows[0]?.weights ?? DEFAULT_WEIGHTS;
  const stored: StoredScheme[] = schemeRows.map((row) => {
    const model = row.model;
    const report = latestByScheme.get(row.id) ?? validateScheme(model);
    return {
      rowId: row.id,
      model,
      report,
      pareto: row.pareto === 1,
      score: Number(row.score),
      createdAt: row.createdAt.toISOString(),
    };
  });
  const reportsByModelId: Record<string, ValidationReport> = {};
  for (const s of stored) reportsByModelId[s.model.id] = s.report;
  const ranking = stored.length
    ? rankSchemes(
        stored.map((s) => s.model),
        reportsByModelId,
        weights,
      )
    : [];
  const artifactsRows = await (
    await getDb()
  )
    .select()
    .from(exportArtifacts)
    .where(eq(exportArtifacts.projectId, projectId))
    .orderBy(desc(exportArtifacts.createdAt))
    .limit(12);
  const artifacts: ArtifactInfo[] = artifactsRows.map((row) => ({
    id: row.id,
    format: row.format,
    filename: row.filename,
    bytes: row.bytes,
    createdAt: row.createdAt.toISOString(),
    schemeId: row.schemeId,
  }));
  const runs: GenerationRunInfo[] = runRows.map((row) => ({
    id: row.id,
    seed: row.seed,
    variants: row.variants,
    engineVersion: row.engineVersion,
    weights: row.weights,
    createdAt: row.createdAt.toISOString(),
  }));
  return {
    project,
    schemes: stored.sort((a, b) => b.score - a.score),
    ranking,
    runs,
    artifacts,
    warnings: [
      ...analyzeSite(project.site).warnings,
      ...project.requirements.parse.warnings,
      `${RULE_COUNT} قاعده نسخه‌بندی‌شده در سند ${CODE_SET.code}@${CODE_SET.edition} اجرا شد.`,
    ],
  };
}

async function findScheme(projectId: string, modelId: string) {
  if (!(await getProject(projectId))) throw new AccessError(404, "پروژه یافت نشد.");
  const rows = await (
    await getDb()
  )
    .select()
    .from(schemes)
    .where(and(eq(schemes.projectId, projectId), eq(schemes.code, modelId)))
    .limit(1);
  if (rows[0]) return rows[0];
  const all = await (await getDb()).select().from(schemes).where(eq(schemes.projectId, projectId));
  return all.find((row) => row.model.id === modelId || row.id === modelId) ?? null;
}

export async function repairSchemeById(projectId: string, modelId: string): Promise<{ bundle: ProjectBundle; repair: RepairSummary }> {
  const schemeRow = await findScheme(projectId, modelId);
  if (!schemeRow) throw new Error("طرح یافت نشد.");
  const result = repairAndValidate(schemeRow.model);
  await (
    await getDb()
  )
    .update(schemes)
    .set({
      model: result.scheme,
      metrics: Object.fromEntries(result.scheme.metrics.map((m) => [m.id, m.value])),
      gfaM2: String(result.scheme.grossFloorAreaM2),
      units: result.scheme.unitsTotal,
    })
    .where(eq(schemes.id, schemeRow.id));
  await (await getDb()).insert(validationRuns).values({
    projectId,
    schemeId: schemeRow.id,
    codeSetEdition: CODE_SET.edition,
    iteration: result.iterations,
    report: result.after,
  });
  await logEvent(projectId, "scheme.repaired", {
    scheme: result.scheme.code,
    applied: result.actions.filter((a) => a.applied).length,
    iterations: result.iterations,
  });
  const bundle = await getBundle(projectId);
  return {
    bundle,
    repair: {
      schemeCode: result.scheme.code,
      iterations: result.iterations,
      actions: result.actions,
      beforeFailed: result.before.failed,
      afterFailed: result.after.failed,
      beforeWarnings: result.before.warnings,
      afterWarnings: result.after.warnings,
    },
  };
}

export async function saveWeights(projectId: string, weights: Record<string, number>): Promise<ProjectBundle> {
  if (!(await getProject(projectId))) throw new AccessError(404, "پروژه یافت نشد.");
  const runRows = await (
    await getDb()
  )
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.projectId, projectId))
    .orderBy(desc(generationRuns.createdAt))
    .limit(1);
  const normalised = normalizeWeights(weights);
  if (runRows[0]) {
    await (await getDb()).update(generationRuns).set({ weights: normalised }).where(eq(generationRuns.id, runRows[0].id));
  }
  await logEvent(projectId, "weights.updated", normalised);
  return getBundle(projectId);
}

export async function exportSchemeById(
  projectId: string,
  modelId: string,
  format: ExportFormat,
): Promise<{ filename: string; mime: string; data: Buffer }> {
  const schemeRow = await findScheme(projectId, modelId);
  if (!schemeRow) throw new Error("طرح یافت نشد.");
  const validation = await (
    await getDb()
  )
    .select()
    .from(validationRuns)
    .where(eq(validationRuns.schemeId, schemeRow.id))
    .orderBy(desc(validationRuns.createdAt))
    .limit(1);
  const report = validation[0]?.report ?? validateScheme(schemeRow.model);
  const result = exportScheme(schemeRow.model, report, format);
  await (await getDb()).insert(exportArtifacts).values({
    projectId,
    schemeId: schemeRow.id,
    format,
    filename: result.filename,
    bytes: result.data.length,
    meta: result.meta,
  });
  return result;
}

export async function auditSchemeById(projectId: string, modelId: string) {
  const row = await findScheme(projectId, modelId);
  if (!row) throw new Error("طرح یافت نشد.");
  return auditScheme(row.model);
}

export async function planSheet(projectId: string, modelId: string, levelIndex: number) {
  const row = await findScheme(projectId, modelId);
  if (!row) throw new Error("طرح یافت نشد.");
  const scene = buildFloorPlanScene(row.model, levelIndex, { includeSiteContext: true });
  return { scene, svg: renderSceneSvg(scene) };
}

export async function sheetBundle(projectId: string, modelId: string, kind: "plan" | "elevations", levelIndex = 0) {
  const row = await findScheme(projectId, modelId);
  if (!row) throw new Error("طرح یافت نشد.");
  const doc = kind === "elevations" ? composeElevationSheet(row.model) : composeArchitecturalSheet(row.model, { levelIndex });
  return { doc, svg: renderSheetSvg(doc) };
}

export async function scheduleData(projectId: string, modelId: string, levelIndex = 0) {
  const row = await findScheme(projectId, modelId);
  if (!row) throw new Error("طرح یافت نشد.");
  const scheme = row.model;
  const level = scheme.levels[Math.min(levelIndex, scheme.levels.length - 1)];
  return {
    level: { index: level.index, name: level.name },
    doorWindow: doorWindowSchedule(scheme, levelIndex),
    rooms: roomSchedule(scheme, levelIndex),
    levels: levelSummaryTable(scheme),
    missingData: drawingMissingData(scheme),
    elevations: (["south", "north", "east", "west"] as const).map((side) => {
      const scene = buildElevationScene(scheme, side);
      return {
        side,
        label: scene.levelName,
        scaleDenominator: scene.sheet.scaleDenominator,
        openings: scene.meta.openingCount,
        walls: scene.meta.wallCount,
        issues: scene.issues.length,
        ok: scene.consistency.ok,
        missing: scene.missingData.map((row) => row.item),
      };
    }),
    section: (() => {
      const scene = buildSectionScene(scheme);
      return {
        label: scene.levelName,
        cutCoordinateM: scene.cutCoordinateM,
        scaleDenominator: scene.sheet.scaleDenominator,
        totalHeightM: Number((scheme.levels.length * scheme.floorHeightM).toFixed(2)),
        slabThicknessM: Number((scheme.structural.slabThicknessMm / 1000).toFixed(3)),
        missing: scene.missingData.map((row) => row.item),
      };
    })(),
  };
}

export async function saveWeightsIfMissing(): Promise<void> {
  // reserved for future migration hooks
}

export function schemeFloorSvg(scheme: CanonicalScheme, levelIndex = 0): string {
  return floorPlanSvg(scheme, levelIndex);
}

export async function ensureDemoProject(): Promise<ProjectDocument | null> {
  const existing = await listProjects();
  if (existing.length > 0) return getProject(existing[0].id);
  try {
    const project = await createProject({
      name: "مجتمع مسکونی آفتاب — زمین نامنظم شش‌ضلعی",
      client: "کارفرمای نمونه",
      description:
        "پروژه نمایشی مرجع: زمین نامنظم شیب‌دار، ۱۴ واحد مسکونی، تولید چند طرح، اعتبارسنجی و بهینه‌سازی. تمام اعداد از موتور واقعی محاسبه شده‌اند.",
      site: DEFAULT_SITE,
      requirements: normaliseRequirements(DEFAULT_REQUIREMENTS),
    });
    await generateForProject(project.id, { seed: DEFAULT_SEED, variants: DEFAULT_VARIANTS, weights: DEFAULT_WEIGHTS });
    await logEvent(project.id, "project.seeded", { flow: "demo-residential-irregular-plot", engine: ENGINE_VERSION });
    return getProject(project.id);
  } catch (error) {
    if (error instanceof DomainError) return null;
    throw error;
  }
}

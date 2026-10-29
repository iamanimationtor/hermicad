import { createHash, randomUUID } from "node:crypto";
import { currentWorkspace } from "./workspace";
import { assertWorkspaceProjectQuota } from "./quota";
import { AccessError } from "./accessError";
import { and, desc, eq, inArray, lt, not, or, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import {
  auditEvents,
  codeSets,
  exportArtifacts,
  generationRuns,
  projects,
  requirementRevisions,
  schemes,
  schemeSnapshots,
  siteRevisions,
  validationRuns,
} from "@/db/schema";
import { DEFAULT_PROJECT_SITE, DEFAULT_REQUIREMENTS, DEFAULT_SITE, parseRequirementsText, applyRequirementsPatch, validateRequirements, validateSite } from "@/domain/requirements";
import { analyzeSite, DomainError } from "@/domain/layout";
import { repairAndValidate, runPipeline } from "@/domain/pipeline";
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
import { normalizeScreeningScheme } from "@/domain/engineering/screening";
import { normalizeSeismicSite } from "@/domain/engineering/seismic";
import { assertMethodOutputsExportable } from "@/domain/engineering/methodValidity";
import { CODE_SET, ENGINE_VERSION } from "@/domain/constants";
import { assessFreshness, type CurrentBasis } from "@/domain/provenance";
import { exportScheme } from "@/domain/exporters/reports";
import { floorPlanSvg } from "@/domain/exporters/vector";
import type { ArtifactInfo, GenerationResponse, GenerationRunInfo, ProjectBundle, RepairSummary, StoredScheme } from "@/domain/bundle";
import type { CanonicalScheme, ExportFormat, ProjectDocument, Requirements, SiteModel, ValidationReport } from "@/domain/types";

const DEFAULT_SEED = 20260101;
const DEFAULT_VARIANTS = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type ProjectRow = typeof projects.$inferSelect;

/** تمام نوشتن‌های وابسته به نسخهٔ پروژه از همین قفل عبور می‌کنند. */
async function lockProject(tx: Tx, projectId: string, workspace: string): Promise<ProjectRow | null> {
  if (!UUID.test(projectId)) return null;
  const [row] = await tx.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspace, workspace))).for("update").limit(1);
  return row ?? null;
}

async function readProjectInputs(tx: Tx, projectId: string) {
  const sites = await tx.select().from(siteRevisions).where(eq(siteRevisions.projectId, projectId))
    .orderBy(desc(siteRevisions.revision), desc(siteRevisions.createdAt)).limit(2);
  const requirements = await tx.select().from(requirementRevisions).where(eq(requirementRevisions.projectId, projectId))
    .orderBy(desc(requirementRevisions.revision), desc(requirementRevisions.createdAt)).limit(2);
  if (!sites[0] || !requirements[0]) throw new AccessError(409, "نسخهٔ زمین یا نیازمندی‌ها در پایگاه داده موجود نیست؛ بازیابی داده لازم است.");
  if (sites[1]?.revision === sites[0].revision || requirements[1]?.revision === requirements[0].revision)
    throw new AccessError(409, "نسخه‌های ورودی تکراری‌اند؛ تا رفع تعارض، خروجی معتبر نیست.");
  return { site: sites[0], requirements: requirements[0] };
}

function projectDocument(row: ProjectRow, inputs: Awaited<ReturnType<typeof readProjectInputs>>): ProjectDocument {
  return {
    id: row.id, code: row.code, name: row.name, client: row.client, jurisdiction: row.jurisdiction,
    status: row.status, activeRunId: row.activeRunId, description: row.description,
    site: normalizeSeismicSite(inputs.site.data), siteRevision: inputs.site.revision,
    requirements: inputs.requirements.data, requirementRevision: inputs.requirements.revision,
  };
}

function currentBasis(inputs: Awaited<ReturnType<typeof readProjectInputs>>): CurrentBasis {
  return { siteRevision: inputs.site.revision, requirementRevision: inputs.requirements.revision,
    engineVersion: ENGINE_VERSION, rulesetFingerprint: rulesetFingerprint() };
}

/** رکوردهای قبل از اشاره‌گر فعال، بدون دست‌کاری تاریخچه، از آخرین اجرای دارای طرح خوانده می‌شوند. */
async function activeRun(tx: Tx, row: ProjectRow) {
  if (row.activeRunId) {
    const [run] = await tx.select().from(generationRuns)
      .where(and(eq(generationRuns.id, row.activeRunId), eq(generationRuns.projectId, row.id))).limit(1);
    return run ?? null;
  }
  const [legacy] = await tx.select({ run: generationRuns }).from(generationRuns)
    .innerJoin(schemes, eq(schemes.runId, generationRuns.id))
    .where(eq(generationRuns.projectId, row.id))
    .orderBy(desc(generationRuns.createdAt), desc(generationRuns.id)).limit(1);
  return legacy?.run ?? null;
}

function requireFreshRun(run: Awaited<ReturnType<typeof activeRun>>, inputs: Awaited<ReturnType<typeof readProjectInputs>>) {
  const freshness = assessFreshness(run, currentBasis(inputs));
  if (freshness.state !== "current") {
    throw new AccessError(409, `طرح به‌روز نیست یا مبنای آن احراز نشده است؛ تولید مجدد لازم است. ${freshness.reasons.join(" ")}`);
  }
  return freshness;
}

export async function ensureCodeSet(): Promise<void> {
  await (await getDb()).transaction(async (tx) => {
    // جدول تاریخی constraint یکتایی ندارد؛ قفل از درج هم‌زمان نسخهٔ تکراری جلوگیری می‌کند،
    // بدون حذف خودکار داده‌های احتمالی قدیمی.
    await tx.execute(sql`lock table code_sets in share row exclusive mode`);
    const existing = await tx.select({ id: codeSets.id }).from(codeSets).where(eq(codeSets.code, CODE_SET.code)).limit(1);
    const values = {
      edition: CODE_SET.edition, title: CODE_SET.title, jurisdiction: CODE_SET.jurisdiction,
      status: CODE_SET.status, rulesetFingerprint: rulesetFingerprint(), rules: RULE_CATALOG,
    };
    if (existing.length > 0) await tx.update(codeSets).set(values).where(eq(codeSets.id, existing[0].id));
    else await tx.insert(codeSets).values({ code: CODE_SET.code, ...values });
    await tx.update(codeSets).set({ status: "superseded-unverified", title: "مجموعه ضوابط قدیمی — جایگزین شده و تأییدنشده" })
      .where(and(eq(codeSets.jurisdiction, CODE_SET.jurisdiction), sqlNotCode(CODE_SET.code)));
  });
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

export async function createProject(input: {
  name: string;
  client?: string | null;
  description?: string | null;
  site?: SiteModel;
  requirements?: Requirements;
}): Promise<ProjectDocument> {
  await ensureCodeSet();
  const workspace = await currentWorkspace();
  await assertWorkspaceProjectQuota(workspace);
  const id = randomUUID();
  const code = `HMC-P-${id}`; // وابسته به تعداد پروژه‌های موجود نیست و پس از حذف تکرار نمی‌شود.
  const site = normalizeSeismicSite(input.site ?? DEFAULT_PROJECT_SITE);
  const requirements = input.requirements ?? normaliseRequirements(DEFAULT_REQUIREMENTS);
  const siteCheck = validateSite(site);
  const requirementCheck = validateRequirements(requirements);
  if (!siteCheck.ok || !requirementCheck.ok) throw new DomainError("ورودی پروژه معتبر نیست.", [...siteCheck.errors, ...requirementCheck.errors]);
  return (await getDb()).transaction(async (tx) => {
    const [project] = await tx.insert(projects).values({
      id, code, name: input.name, workspace,
      client: input.client ?? null, description: input.description ?? null, status: "draft",
    }).returning();
    const [siteRow] = await tx.insert(siteRevisions).values({ projectId: id, revision: 1, data: site }).returning();
    const [requirementsRow] = await tx.insert(requirementRevisions).values({ projectId: id, revision: 1, data: requirements }).returning();
    await tx.insert(auditEvents).values({ projectId: id, action: "project.created", payload: { code, name: input.name } });
    return projectDocument(project, { site: siteRow, requirements: requirementsRow });
  });
}

export function normaliseRequirements(requirements: Requirements): Requirements {
  const { patch, parse } = parseRequirementsText(requirements.rawText ?? "", requirements);
  return applyRequirementsPatch({ ...requirements, parse }, patch);
}

export async function getProject(projectId: string): Promise<ProjectDocument | null> {
  const workspace = await currentWorkspace();
  return (await getDb()).transaction(async (tx) => {
    const project = await lockProject(tx, projectId, workspace);
    return project ? projectDocument(project, await readProjectInputs(tx, projectId)) : null;
  });
}

export async function saveSite(projectId: string, site: SiteModel, expectedRevision: number): Promise<ProjectDocument> {
  site = normalizeSeismicSite(site);
  const check = validateSite(site);
  if (!check.ok) throw new DomainError("زمین معتبر نیست.", check.errors);
  const workspace = await currentWorkspace();
  return (await getDb()).transaction(async (tx) => {
    const project = await lockProject(tx, projectId, workspace);
    if (!project) throw new AccessError(404, "پروژه یافت نشد.");
    const inputs = await readProjectInputs(tx, projectId);
    if (inputs.site.revision !== expectedRevision) throw new AccessError(409, "نسخهٔ زمین تغییر کرده است؛ پیش‌نویس خود را نگه دارید و آخرین نسخه را بازخوانی کنید.");
    if (expectedRevision >= 2147483647) throw new AccessError(409, "سقف فنی نسخهٔ زمین پر شده است؛ بازیابی لازم است.");
    const [siteRow] = await tx.insert(siteRevisions).values({ projectId, revision: expectedRevision + 1, data: site }).returning();
    await tx.update(projects).set({ updatedAt: new Date(), status: project.status === "generated" ? "needs-regeneration" : project.status }).where(eq(projects.id, projectId));
    await tx.insert(auditEvents).values({ projectId, action: "site.updated", payload: { revision: siteRow.revision, vertices: site.boundary.length } });
    return projectDocument(project, { ...inputs, site: siteRow });
  });
}

export async function saveRequirements(projectId: string, requirements: Requirements, expectedRevision: number): Promise<ProjectDocument> {
  const check = validateRequirements(requirements);
  if (!check.ok) throw new DomainError("نیازمندی‌ها معتبر نیستند.", check.errors);
  const workspace = await currentWorkspace();
  return (await getDb()).transaction(async (tx) => {
    const project = await lockProject(tx, projectId, workspace);
    if (!project) throw new AccessError(404, "پروژه یافت نشد.");
    const inputs = await readProjectInputs(tx, projectId);
    if (inputs.requirements.revision !== expectedRevision) throw new AccessError(409, "نسخهٔ نیازمندی‌ها تغییر کرده است؛ پیش‌نویس خود را نگه دارید و آخرین نسخه را بازخوانی کنید.");
    if (expectedRevision >= 2147483647) throw new AccessError(409, "سقف فنی نسخهٔ نیازمندی پر شده است؛ بازیابی لازم است.");
    // پارس مجدد نباید ویرایش صریح کاربر را بی‌صدا تغییر دهد.
    const [requirementsRow] = await tx.insert(requirementRevisions).values({ projectId, revision: expectedRevision + 1, data: requirements }).returning();
    await tx.update(projects).set({ updatedAt: new Date(), status: project.status === "generated" ? "needs-regeneration" : project.status }).where(eq(projects.id, projectId));
    await tx.insert(auditEvents).values({ projectId, action: "requirements.updated", payload: {
      revision: requirementsRow.revision, confidence: requirements.parse.confidence,
      floorsMax: requirements.floorsMax, farMax: requirements.farMax,
    } });
    return projectDocument(project, { ...inputs, requirements: requirementsRow });
  });
}

export async function updateProjectMeta(
  projectId: string,
  patch: { name?: string; client?: string | null; status?: string; description?: string | null },
) {
  const allowed: typeof patch = {};
  for (const key of ["name", "client", "status", "description"] as const) {
    const value = patch[key];
    if (value !== undefined) {
      if (value !== null && typeof value !== "string") throw new AccessError(422, "مشخصات پروژه معتبر نیست.");
      if ((key === "name" || key === "status") && !value?.trim()) throw new AccessError(422, "نام و وضعیت پروژه نباید خالی باشد.");
      (allowed as Record<string, unknown>)[key] = value;
    }
  }
  const workspace = await currentWorkspace();
  await (await getDb()).transaction(async (tx) => {
    if (!(await lockProject(tx, projectId, workspace))) throw new AccessError(404, "پروژه یافت نشد.");
    await tx.update(projects).set({ ...allowed, updatedAt: new Date() }).where(eq(projects.id, projectId));
    await tx.insert(auditEvents).values({ projectId, action: "project.updated", payload: allowed });
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  const workspace = await currentWorkspace();
  await (await getDb()).transaction(async (tx) => {
    if (!(await lockProject(tx, projectId, workspace))) throw new AccessError(404, "پروژه یافت نشد.");
    await tx.delete(projects).where(and(eq(projects.id, projectId), eq(projects.workspace, workspace)));
  });
}

export interface GenerateOptions {
  seed?: number;
  variants?: number;
  weights?: Record<string, number>;
  expectedSiteRevision?: number;
  expectedRequirementRevision?: number;
}

/**
 * سقف تعداد اجراهای نگه‌داشته‌شده برای هر پروژه.
 *
 * چرا لازم است: اندازه‌گیری واقعی نشان داد هر اجرای پنج‌طرحی حدود ۱٫۱ مگابایت
 * (طرح + گزارش + تصویر نسخه) به پایگاه اضافه می‌کند. بدون سقف، صد بار تولید
 * مجدد روی یک پروژه حدود ۱۱۰ مگابایت می‌شود و در یک سامانهٔ رایگان و عمومی
 * می‌توان پایگاه را از یک حساب پر کرد. با سقف پیش‌فرض ۲۰، تاریخچهٔ اخیر برای
 * مقایسه و ردیابی باقی می‌ماند و رشد محدود می‌شود.
 *
 * دو استثنا هرگز حذف نمی‌شوند:
 *  ۱. اجرای فعالِ پروژه؛ حذفش یعنی از دست رفتن طرحی که کاربر می‌بیند.
 *  ۲. اجراهای پیش از مهاجرت (بدون اثر انگشت مجموعه قواعد). این رکوردها منشأ
 *     کامل ندارند، بازتولیدشدنی نیستند و تنها نسخهٔ آن تاریخ‌اند؛ حذفشان با
 *     تضمین «تولید مجدد دادهٔ قدیمی را حذف نمی‌کند» در تضاد است. نگهداشت فقط
 *     اجراهایی را می‌شمارد و حذف می‌کند که همین نسخهٔ برنامه با منشأ کامل ساخته
 *     است.
 *
 * حذف با آبشار پایگاه داده انجام می‌شود: schemes → validation_runs /
 * scheme_snapshots / export_artifacts همه ON DELETE CASCADE دارند.
 *
 * توجه: `created_at` ردیف‌های هم‌تراکنش یکسان است؛ برای همین ترتیب با شناسه
 * شکسته می‌شود تا نتیجه در هر بار اجرا قطعی (deterministic) بماند.
 */
const RUN_RETENTION = Math.max(1, Number(process.env.HERMICAD_RUN_RETENTION ?? 20));

async function pruneOldRuns(tx: Db, projectId: string, keepRunId: string): Promise<void> {
  await tx.execute(sql`
    DELETE FROM generation_runs
    WHERE project_id = ${projectId}::uuid
      AND ruleset_fingerprint IS NOT NULL
      AND id <> ${keepRunId}::uuid
      AND id NOT IN (
        SELECT id FROM generation_runs
        WHERE project_id = ${projectId}::uuid
        ORDER BY created_at DESC, id DESC
        LIMIT ${RUN_RETENTION}
      )
      AND id NOT IN (
        SELECT active_run_id FROM projects
        WHERE id = ${projectId}::uuid AND active_run_id IS NOT NULL
      )
  `);
}

export async function generateForProject(projectId: string, options: GenerateOptions): Promise<GenerationResponse> {
  const project = await getProject(projectId);
  if (!project) throw new AccessError(404, "پروژه یافت نشد.");
  if (!Number.isSafeInteger(options.expectedSiteRevision) || !Number.isSafeInteger(options.expectedRequirementRevision))
    throw new AccessError(428, "نسخهٔ زمین و نیازمندیِ دیده‌شده برای تولید لازم است.");
  if (options.expectedSiteRevision !== project.siteRevision || options.expectedRequirementRevision !== project.requirementRevision)
    throw new AccessError(409, "ورودی پروژه تغییر کرده است؛ ابتدا آخرین نسخه را بازخوانی کنید.");
  const seed = options.seed ?? DEFAULT_SEED;
  const variants = options.variants ?? DEFAULT_VARIANTS;
  if (!Number.isInteger(variants) || variants < 1 || variants > 5 || !Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647 - (variants - 1) * 7919)
    throw new AccessError(422, "seed باید عدد صحیح نامنفی و با احتساب تعداد طرح در بازهٔ عدد صحیح پایگاه داده باشد؛ تعداد طرح بین ۱ تا ۵ است.");
  if (options.weights && (typeof options.weights !== "object" || Array.isArray(options.weights) ||
    Object.values(options.weights).some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1000)))
    throw new AccessError(422, "وزن‌ها باید عدد متناهی نامنفی باشند.");
  const weights = normalizeWeights(options.weights ?? DEFAULT_WEIGHTS);
  // محاسبه خارج از تراکنش است؛ پیش از ثبت، نسخه‌ها دوباره زیر قفل کنترل می‌شوند.
  const pipeline = runPipeline(project.site, project.requirements, { seed, variants }, weights);
  if (!pipeline.schemes.length) throw new DomainError("هیچ طرح قابل بررسی ساخته نشد.", ["ورودی‌ها و محدودیت‌های هندسی را بازبینی کنید."]);
  const workspace = await currentWorkspace();
  const generatedRunId = await (await getDb()).transaction(async (tx) => {
    const locked = await lockProject(tx, projectId, workspace);
    if (!locked) throw new AccessError(404, "پروژه یافت نشد.");
    const inputs = await readProjectInputs(tx, projectId);
    if (inputs.site.revision !== project.siteRevision || inputs.requirements.revision !== project.requirementRevision)
      throw new AccessError(409, "ورودی‌ها هنگام محاسبه تغییر کردند؛ هیچ طرح جدیدی ثبت نشد.");
    const [run] = await tx.insert(generationRuns).values({
      projectId, seed, variants, engineVersion: ENGINE_VERSION,
      siteRevision: project.siteRevision, requirementRevision: project.requirementRevision,
      rulesetFingerprint: rulesetFingerprint(), initialWeights: weights, weights,
    }).returning();
    for (const scheme of pipeline.schemes) {
      const report = pipeline.reports[scheme.id];
      const rank = pipeline.ranking.find((item) => item.schemeId === scheme.id);
      const metrics = Object.fromEntries(scheme.metrics.map((metric) => [metric.id, metric.value]));
      const [inserted] = await tx.insert(schemes).values({
        projectId, runId: run.id, code: scheme.code, strategy: scheme.strategy, seed: scheme.seed, model: scheme,
        metrics, gfaM2: String(scheme.grossFloorAreaM2), units: scheme.unitsTotal,
        pareto: rank?.pareto ? 1 : 0, score: String(rank?.score ?? 0),
      }).returning({ id: schemes.id });
      await tx.insert(validationRuns).values({ projectId, schemeId: inserted.id, codeSetEdition: CODE_SET.edition, iteration: 0, report });
      await tx.insert(schemeSnapshots).values({ projectId, schemeId: inserted.id, revision: 1, action: "generated", model: scheme, report });
    }
    await tx.update(projects).set({ activeRunId: run.id, status: "generated", updatedAt: new Date() }).where(eq(projects.id, projectId));
    await tx.insert(auditEvents).values({ projectId, action: "schemes.generated", payload: {
      runId: run.id, seed, variants: pipeline.schemes.length, engine: ENGINE_VERSION,
    } });
    await pruneOldRuns(tx, projectId, run.id);
    return run.id;
  });
  const bundle = await getBundle(projectId);
  return { bundle, generatedRunId, activeAtRead: bundle.project.activeRunId === generatedRunId };
}

export async function getBundle(projectId: string): Promise<ProjectBundle> {
  const workspace = await currentWorkspace();
  return (await getDb()).transaction(async (tx) => {
    const row = await lockProject(tx, projectId, workspace);
    if (!row) throw new AccessError(404, "پروژه یافت نشد.");
    const inputs = await readProjectInputs(tx, projectId);
    const project = projectDocument(row, inputs);
    const run = await activeRun(tx, row);
    const dataIssues: string[] = [];
    if (row.activeRunId && !run) dataIssues.push("اجرای فعال در پایگاه داده یافت نشد؛ برای بازبینی آرشیو یا تولید مجدد اقدام کنید.");
    const freshness = assessFreshness(run, currentBasis(inputs));
    const schemeRows = run
      ? await tx.select().from(schemes).where(and(eq(schemes.projectId, projectId), eq(schemes.runId, run.id)))
      : [];
    if (run && schemeRows.length === 0) dataIssues.push("اجرای فعال طرح ثبت‌شده ندارد؛ دادهٔ حذف‌شده قابل بازسازی از این رکورد نیست.");
    const ids = schemeRows.map((scheme) => scheme.id);
    const snapshots = ids.length
      ? await tx.select({ schemeId: schemeSnapshots.schemeId, report: schemeSnapshots.report }).from(schemeSnapshots)
        .innerJoin(schemes, and(eq(schemeSnapshots.schemeId, schemes.id), eq(schemeSnapshots.revision, schemes.revision)))
        .where(inArray(schemeSnapshots.schemeId, ids))
      : [];
    const latestByScheme = new Map<string, ValidationReport>();
    for (const snapshot of snapshots) {
      const report = normalizeStoredReport(snapshot.report);
      if (report) latestByScheme.set(snapshot.schemeId, report);
    }
    for (const scheme of schemeRows) {
      if (latestByScheme.has(scheme.id)) continue;
      if (!run?.rulesetFingerprint) {
        // دادهٔ قدیمی ممکن است تصویر نسخه نداشته باشد؛ گزارش خواندنی آن همچنان ناشناخته است.
        const [validation] = await tx.select().from(validationRuns).where(eq(validationRuns.schemeId, scheme.id))
          .orderBy(desc(validationRuns.createdAt), desc(validationRuns.id)).limit(1);
        const report = normalizeStoredReport(validation?.report);
        if (report) latestByScheme.set(scheme.id, report);
      }
      if (!latestByScheme.has(scheme.id)) dataIssues.push(`گزارش یا تصویر نسخهٔ طرح ${scheme.code} موجود نیست؛ این طرح از نمایش و خروجی کنار گذاشته شد.`);
    }
    const recentRuns = await tx.select().from(generationRuns).where(eq(generationRuns.projectId, projectId))
      .orderBy(desc(generationRuns.createdAt), desc(generationRuns.id)).limit(8);
    if (run && !recentRuns.some((item) => item.id === run.id)) { recentRuns.unshift(run); recentRuns.pop(); }
    if (run) recentRuns.sort((a, b) => Number(b.id === run.id) - Number(a.id === run.id));
    const weights = run?.weights ?? DEFAULT_WEIGHTS;
    const stored: StoredScheme[] = schemeRows.flatMap((scheme) => {
      const previous = latestByScheme.get(scheme.id);
      if (!previous) return [];
      const model = normalizeScreeningScheme(scheme.model);
      const report = normalizeStoredReport(previous, model);
      if (!report) { dataIssues.push(`گزارش طرح ${scheme.code} خواندنی نیست؛ طرح کنار گذاشته شد.`); return []; }
      return [{
        rowId: scheme.id, revision: scheme.revision, freshness, model, report,
        pareto: scheme.pareto === 1, score: Number(scheme.score), createdAt: scheme.createdAt.toISOString(),
      }];
    });
    const reportsByModelId: Record<string, ValidationReport> = {};
    for (const scheme of stored) reportsByModelId[scheme.model.id] = scheme.report;
    const ranking = stored.length ? rankSchemes(stored.map((scheme) => scheme.model), reportsByModelId, weights) : [];
    // پرچم عددی قدیمی برای دادهٔ ناقص نمی‌تواند «غیرپارتو» یا «پارتو» را اثبات کند.
    for (const scheme of stored) scheme.pareto = ranking.find((item) => item.schemeId === scheme.model.id)?.pareto ?? null;
    const artifactsRows = await tx.select().from(exportArtifacts).where(eq(exportArtifacts.projectId, projectId))
      .orderBy(desc(exportArtifacts.createdAt)).limit(12);
    const artifacts: ArtifactInfo[] = artifactsRows.map((item) => ({
      id: item.id, format: item.format, filename: item.filename, bytes: item.bytes,
      createdAt: item.createdAt.toISOString(), schemeId: item.schemeId,
    }));
    const runs: GenerationRunInfo[] = recentRuns.map((item) => ({
      id: item.id, seed: item.seed, variants: item.variants, engineVersion: item.engineVersion,
      siteRevision: item.siteRevision, requirementRevision: item.requirementRevision,
      rulesetFingerprint: item.rulesetFingerprint, initialWeights: item.initialWeights,
      weights: item.weights, createdAt: item.createdAt.toISOString(),
    }));
    return {
      project, schemes: stored.sort((a, b) => b.score - a.score), ranking, runs, artifacts, dataIssues,
      warnings: [
        ...analyzeSite(project.site).warnings, ...project.requirements.parse.warnings,
        ...(run && freshness.state !== "current" ? ["طرح‌های نمایش‌داده‌شده به‌روز نیستند یا مبنای آن‌ها احراز نشده؛ تولید مجدد لازم است.", ...freshness.reasons] : []),
        `${RULE_COUNT} کنترل داخلی نسخه‌بندی‌شده در ${CODE_SET.code}@${CODE_SET.edition} وجود دارد؛ انطباق احراز نشده است.`,
      ],
    };
  });
}

/** صفحه‌بندی پایدار بر اساس UUID است و ترتیب زمانی ادعا نمی‌شود. */
export async function listRunArchives(projectId: string, before?: string) {
  const workspace = await currentWorkspace();
  if (before && !UUID.test(before)) throw new AccessError(400, "نشانگر صفحه نامعتبر است.");
  return (await getDb()).transaction(async (tx) => {
    const project = await lockProject(tx, projectId, workspace);
    if (!project) throw new AccessError(404, "پروژه یافت نشد.");
    const where = [eq(generationRuns.projectId, projectId)];
    if (before) where.push(lt(generationRuns.id, before));
    const rows = await tx.select({ id: generationRuns.id, seed: generationRuns.seed, variants: generationRuns.variants,
      siteRevision: generationRuns.siteRevision, requirementRevision: generationRuns.requirementRevision,
      engineVersion: generationRuns.engineVersion, createdAt: generationRuns.createdAt })
      .from(generationRuns).where(and(...where)).orderBy(desc(generationRuns.id)).limit(21);
    const page = rows.slice(0, 20);
    return { historicalOnly: true, order: "uuid-desc-not-chronological", runs: page.map((run) => ({
      ...run, createdAt: run.createdAt.toISOString(), url: `/api/projects/${projectId}/runs/${run.id}`,
    })), nextBefore: rows.length > 20 ? page[page.length - 1].id : null };
  });
}

/** دادهٔ تاریخی تنها برای بازرسی؛ هرگز مبنای خروجی جاری تلقی نمی‌شود. */
export async function getRunArchive(projectId: string, runId: string) {
  const workspace = await currentWorkspace();
  if (!UUID.test(runId)) throw new AccessError(404, "اجرا یافت نشد.");
  return (await getDb()).transaction(async (tx) => {
    const project = await lockProject(tx, projectId, workspace);
    if (!project) throw new AccessError(404, "پروژه یافت نشد.");
    const [run] = await tx.select().from(generationRuns).where(and(eq(generationRuns.id, runId), eq(generationRuns.projectId, projectId))).limit(1);
    if (!run) throw new AccessError(404, "اجرا یافت نشد.");
    const sites = await tx.select().from(siteRevisions).where(and(eq(siteRevisions.projectId, projectId), eq(siteRevisions.revision, run.siteRevision))).limit(2);
    const requirements = await tx.select().from(requirementRevisions).where(and(eq(requirementRevisions.projectId, projectId), eq(requirementRevisions.revision, run.requirementRevision))).limit(2);
    const rows = await tx.select({ id: schemes.id, code: schemes.code, revision: schemes.revision, strategy: schemes.strategy, createdAt: schemes.createdAt })
      .from(schemes).where(and(eq(schemes.projectId, projectId), eq(schemes.runId, run.id))).orderBy(schemes.code);
    return {
      historicalOnly: true,
      warning: "این آرشیو صرفاً برای بازبینی است، نه فایل جاری، تأیید مهندسی، گواهی انطباق یا اثبات بازتولید. ورودی خام ممکن است فرض تاریخی داشته باشد؛ siteReadView بازنمایی ایمن است. تاریخچهٔ قبل از این سازوکار ممکن است ناقص باشد.",
      isActive: (await activeRun(tx, project))?.id === run.id,
      run: { id: run.id, seed: run.seed, variants: run.variants, engineVersion: run.engineVersion,
        siteRevision: run.siteRevision, requirementRevision: run.requirementRevision,
        rulesetFingerprint: run.rulesetFingerprint, initialWeights: run.initialWeights, currentWeights: run.weights,
        createdAt: run.createdAt.toISOString() },
      inputs: { site: sites.length === 1 ? sites[0].data : null,
        siteReadView: sites.length === 1 ? normalizeSeismicSite(sites[0].data) : null,
        requirements: requirements.length === 1 ? requirements[0].data : null,
        status: sites.length === 1 && requirements.length === 1 ? "recorded" : "missing-or-ambiguous" },
      schemes: rows.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(),
        revisionsUrl: `/api/projects/${projectId}/runs/${runId}/schemes/${item.id}` })),
    };
  });
}

export async function getArchiveScheme(projectId: string, runId: string, schemeId: string, revision?: number, before?: number) {
  const workspace = await currentWorkspace();
  if (!UUID.test(runId) || !UUID.test(schemeId)) throw new AccessError(404, "طرح تاریخی یافت نشد.");
  return (await getDb()).transaction(async (tx) => {
    const project = await lockProject(tx, projectId, workspace);
    if (!project) throw new AccessError(404, "پروژه یافت نشد.");
    const [row] = await tx.select().from(schemes).where(and(eq(schemes.id, schemeId), eq(schemes.projectId, projectId), eq(schemes.runId, runId))).limit(1);
    if (!row) throw new AccessError(404, "طرح تاریخی یافت نشد.");
    const warning = "تصویر خام فقط برای بازبینی تاریخی است و ممکن است فرض‌ها و کنترل‌های مثبت قدیمیِ غیرقابل استفاده داشته باشد؛ صحت و انطباق تضمین نشده‌اند. نمای readView محدودیت‌های شناخته‌شده را بدون تغییر رکورد نشان می‌دهد.";
    if (revision !== undefined) {
      const snapshots = await tx.select().from(schemeSnapshots).where(and(eq(schemeSnapshots.schemeId, row.id), eq(schemeSnapshots.revision, revision))).limit(2);
      if (snapshots.length > 1) throw new AccessError(409, "نسخه‌های تاریخی تکراری‌اند؛ بازیابی داده لازم است.");
      if (snapshots[0]) {
        const model = normalizeScreeningScheme(snapshots[0].model);
        return { historicalOnly: true, warning, source: "snapshot", snapshot: snapshots[0],
          readView: { model, report: normalizeStoredReport(snapshots[0].report, model) } };
      }
      const [anySnapshot] = await tx.select({ id: schemeSnapshots.id }).from(schemeSnapshots).where(eq(schemeSnapshots.schemeId, row.id)).limit(1);
      if (!anySnapshot && row.revision === revision) {
        const [validation] = await tx.select().from(validationRuns).where(eq(validationRuns.schemeId, row.id))
          .orderBy(desc(validationRuns.createdAt), desc(validationRuns.id)).limit(1);
        const model = normalizeScreeningScheme(row.model);
        return { historicalOnly: true, warning, source: "legacy-stored-state", snapshot: {
          schemeId: row.id, revision: row.revision, action: "unknown-before-migration", model: row.model, report: validation?.report ?? null,
        }, readView: { model, report: normalizeStoredReport(validation?.report, model) } };
      }
      throw new AccessError(404, "نسخهٔ تاریخی یافت نشد.");
    }
    const conditions = [eq(schemeSnapshots.schemeId, row.id)];
    if (before !== undefined) conditions.push(lt(schemeSnapshots.revision, before));
    const snapshots = await tx.select({ id: schemeSnapshots.id, revision: schemeSnapshots.revision, action: schemeSnapshots.action, createdAt: schemeSnapshots.createdAt })
      .from(schemeSnapshots).where(and(...conditions)).orderBy(desc(schemeSnapshots.revision)).limit(21);
    const hasMore = snapshots.length > 20;
    const page = snapshots.slice(0, 20);
    const legacy = !before && !page.length && row.revision === 1;
    return { historicalOnly: true, warning, schemeId: row.id, currentStoredRevision: row.revision,
      revisions: legacy ? [{ revision: 1, action: "unknown-before-migration", source: "legacy-stored-state" }] : page,
      nextBefore: hasMore ? page[page.length - 1].revision : null,
      revisionUrl: `/api/projects/${projectId}/runs/${runId}/schemes/${schemeId}?revision={revision}`,
    };
  });
}

/** کنترل مالکیت و تازگی زیر همان قفلِ ویرایش ورودی انجام می‌شود. */
async function withCurrentScheme<T>(
  projectId: string,
  modelId: string,
  expectedRevision: number,
  operation: (tx: Tx, scheme: typeof schemes.$inferSelect) => Promise<T> | T,
): Promise<T> {
  const workspace = await currentWorkspace();
  return (await getDb()).transaction(async (tx) => {
    const project = await lockProject(tx, projectId, workspace);
    if (!project) throw new AccessError(404, "پروژه یافت نشد.");
    const inputs = await readProjectInputs(tx, projectId);
    const run = await activeRun(tx, project);
    if (!run) throw new AccessError(404, "طرح فعال یافت نشد.");
    requireFreshRun(run, inputs);
    const rows = await tx.select().from(schemes).where(and(eq(schemes.projectId, projectId), eq(schemes.runId, run.id)));
    let scheme = rows.find((item) => item.id === modelId);
    if (!scheme) {
      // شناسهٔ مدل/کد قدیمی ممکن است در چند اجرا تکرار شود؛ در ابهام هرگز به طرح دیگری اشاره نکنید.
      const aliases = await tx.select({ id: schemes.id }).from(schemes).where(and(
        eq(schemes.projectId, projectId),
        or(eq(schemes.code, modelId), sql`${schemes.model}->>'id' = ${modelId}`),
      )).limit(2);
      if (aliases.length > 1) throw new AccessError(409, "شناسهٔ طرح در چند اجرا تکرار شده است؛ از شناسهٔ ردیف اجرای فعال استفاده کنید.");
      scheme = rows.find((item) => item.id === aliases[0]?.id);
    }
    if (!scheme) throw new AccessError(404, "طرح فعال یافت نشد.");
    if (scheme.revision !== expectedRevision) throw new AccessError(409, "نسخهٔ طرح تغییر کرده است؛ آن را بازخوانی کنید.");
    const [snapshot] = await tx.select({ report: schemeSnapshots.report }).from(schemeSnapshots).where(and(
      eq(schemeSnapshots.schemeId, scheme.id), eq(schemeSnapshots.revision, scheme.revision),
    )).limit(1);
    if (!snapshot || !normalizeStoredReport(snapshot.report))
      throw new AccessError(409, "تصویر نسخهٔ طرح یا گزارش آن موجود نیست؛ خروجی و ویرایش متوقف شد.");
    return operation(tx, scheme);
  });
}

export async function repairSchemeById(projectId: string, modelId: string, expectedRevision: number): Promise<{ bundle: ProjectBundle; repair: RepairSummary }> {
  const repair = await withCurrentScheme(projectId, modelId, expectedRevision, async (tx, schemeRow) => {
    const result = repairAndValidate(normalizeScreeningScheme(schemeRow.model));
    const changed = result.actions.some((action) => action.applied);
    if (changed && schemeRow.revision === 2147483647) throw new AccessError(409, "سقف فنی نسخهٔ طرح پر شده است؛ بازیابی لازم است.");
    const revision = schemeRow.revision + (changed ? 1 : 0);
    if (changed) {
      await tx.update(schemes).set({
        revision, model: result.scheme,
        metrics: Object.fromEntries(result.scheme.metrics.map((metric) => [metric.id, metric.value])),
        gfaM2: String(result.scheme.grossFloorAreaM2), units: result.scheme.unitsTotal,
      }).where(eq(schemes.id, schemeRow.id));
      await tx.insert(validationRuns).values({
        projectId, schemeId: schemeRow.id, codeSetEdition: CODE_SET.edition,
        iteration: result.iterations, report: result.after,
      });
      await tx.insert(schemeSnapshots).values({
        projectId, schemeId: schemeRow.id, revision, action: "repair", model: result.scheme, report: result.after,
      });
      await tx.insert(auditEvents).values({ projectId, action: "scheme.repaired", payload: {
        scheme: result.scheme.code, revision, applied: result.actions.filter((action) => action.applied).length,
        iterations: result.iterations,
      } });
    }
    return {
      schemeCode: result.scheme.code, runId: schemeRow.runId, schemeRowId: schemeRow.id, revision,
      iterations: result.iterations, actions: result.actions,
      beforeFailed: result.before.failed, afterFailed: result.after.failed,
      beforeWarnings: result.before.warnings, afterWarnings: result.after.warnings,
    } satisfies RepairSummary;
  });
  return { bundle: await getBundle(projectId), repair };
}

export async function saveWeights(projectId: string, weights: Record<string, number>, expectedRunId?: string): Promise<ProjectBundle> {
  const workspace = await currentWorkspace();
  await (await getDb()).transaction(async (tx) => {
    const project = await lockProject(tx, projectId, workspace);
    if (!project) throw new AccessError(404, "پروژه یافت نشد.");
    const run = await activeRun(tx, project);
    if (!run) throw new AccessError(404, "اجرای فعال یافت نشد.");
    if (!expectedRunId) throw new AccessError(428, "شناسهٔ اجرای دیده‌شده لازم است.");
    if (run.id !== expectedRunId) throw new AccessError(409, "اجرای فعال تغییر کرده است؛ آن را بازخوانی کنید.");
    requireFreshRun(run, await readProjectInputs(tx, projectId));
    if (!weights || typeof weights !== "object" || Array.isArray(weights) ||
      Object.values(weights).some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1000))
      throw new AccessError(422, "وزن‌ها باید عدد متناهی نامنفی باشند.");
    const normalised = normalizeWeights(weights);
    await tx.update(generationRuns).set({ weights: normalised }).where(eq(generationRuns.id, run.id));
    await tx.insert(auditEvents).values({ projectId, action: "weights.updated", payload: { runId: run.id, weights: normalised } });
  });
  return getBundle(projectId);
}

export async function exportSchemeById(
  projectId: string,
  modelId: string,
  format: ExportFormat,
  expectedRevision: number,
): Promise<{ filename: string; mime: string; data: Buffer; artifactId: string; sha256: string; revision: number; runId: string }> {
  return withCurrentScheme(projectId, modelId, expectedRevision, async (tx, schemeRow) => {
    const [snapshot] = await tx.select().from(schemeSnapshots).where(and(
      eq(schemeSnapshots.schemeId, schemeRow.id), eq(schemeSnapshots.revision, schemeRow.revision),
    )).limit(1);
    const [run] = await tx.select().from(generationRuns).where(and(eq(generationRuns.id, schemeRow.runId), eq(generationRuns.projectId, projectId))).limit(1);
    if (!run) throw new AccessError(409, "مبنای اجرای طرح موجود نیست.");
    const model = normalizeScreeningScheme(schemeRow.model);
    const report = normalizeStoredReport(snapshot?.report, model);
    if (!report) throw new AccessError(409, "گزارش نسخهٔ طرح موجود نیست؛ خروجی متوقف شد.");
    const result = exportScheme(model, report, format);
    const artifactId = randomUUID();
    const basis = {
      artifactId, projectId, runId: run.id, schemeRowId: schemeRow.id, schemeRevision: schemeRow.revision,
      siteRevision: run.siteRevision, requirementRevision: run.requirementRevision, engineVersion: run.engineVersion,
      rulesetFingerprint: run.rulesetFingerprint, seed: run.seed, variants: run.variants,
      initialWeights: run.initialWeights, currentWeights: run.weights,
      freshnessAtExport: "identifier-match-only", regulatoryCompliance: "not-established", notForConstruction: true,
    };
    // JSON می‌تواند مبنای ردیابی را درون خود حمل کند. هش محتوای نهایی در دفتر و سرآیند ثبت می‌شود، نه در خود فایل.
    const data = format === "json"
      ? Buffer.from(JSON.stringify({ ...JSON.parse(result.data.toString("utf8")), provenance: basis }, null, 2), "utf8")
      : result.data;
    const sha256 = createHash("sha256").update(data).digest("hex");
    const dot = result.filename.lastIndexOf(".");
    const stem = dot > 0 ? result.filename.slice(0, dot) : result.filename;
    const extension = dot > 0 ? result.filename.slice(dot) : "";
    const filename = `${stem}-rev${schemeRow.revision}-${artifactId.slice(0, 8)}${extension}`;
    await tx.insert(exportArtifacts).values({
      id: artifactId, projectId, schemeId: schemeRow.id, format, filename, bytes: data.length,
      meta: { ...result.meta, provenance: basis, sha256, hashAlgorithm: "sha256" },
    });
    return { filename, mime: result.mime, data, artifactId, sha256, revision: schemeRow.revision, runId: run.id };
  });
}

/** فهرست قابل صفحه‌بندی تمام رکوردهای خروجی، بدون ادعای نگهداری فایل. */
export async function listArtifactManifests(projectId: string, before?: string) {
  const workspace = await currentWorkspace();
  if (before && !UUID.test(before)) throw new AccessError(400, "نشانگر صفحه نامعتبر است.");
  return (await getDb()).transaction(async (tx) => {
    if (!(await lockProject(tx, projectId, workspace))) throw new AccessError(404, "پروژه یافت نشد.");
    const where = [eq(exportArtifacts.projectId, projectId)];
    if (before) where.push(lt(exportArtifacts.id, before));
    const rows = await tx.select({ id: exportArtifacts.id, schemeId: exportArtifacts.schemeId, format: exportArtifacts.format,
      filename: exportArtifacts.filename, bytes: exportArtifacts.bytes, createdAt: exportArtifacts.createdAt })
      .from(exportArtifacts).where(and(...where)).orderBy(desc(exportArtifacts.id)).limit(21);
    const page = rows.slice(0, 20);
    return { historicalOnly: true, fileStored: false, order: "uuid-desc-not-chronological",
      artifacts: page.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(),
        manifestUrl: `/api/projects/${projectId}/artifacts/${item.id}` })),
      nextBefore: rows.length > 20 ? page[page.length - 1].id : null };
  });
}

/** فقط فراداده؛ فایل خروجی در پایگاه نگهداری نمی‌شود و هش امضا نیست. */
export async function getArtifactManifest(projectId: string, artifactId: string) {
  const workspace = await currentWorkspace();
  if (!UUID.test(artifactId)) throw new AccessError(404, "رکورد خروجی یافت نشد.");
  return (await getDb()).transaction(async (tx) => {
    if (!(await lockProject(tx, projectId, workspace))) throw new AccessError(404, "پروژه یافت نشد.");
    const [artifact] = await tx.select().from(exportArtifacts).where(and(eq(exportArtifacts.id, artifactId), eq(exportArtifacts.projectId, projectId))).limit(1);
    if (!artifact) throw new AccessError(404, "رکورد خروجی یافت نشد.");
    return { historicalOnly: true, fileStored: false, signed: false,
      warning: "این رکورد فقط فراداده است؛ فایل ذخیره نشده، هش امضای دیجیتال نیست و انطباق یا صحت مهندسی را اثبات نمی‌کند.",
      artifact: { ...artifact, createdAt: artifact.createdAt.toISOString() } };
  });
}

export async function auditSchemeById(projectId: string, modelId: string, expectedRevision: number) {
  return withCurrentScheme(projectId, modelId, expectedRevision, (_tx, row) => auditScheme(normalizeScreeningScheme(row.model)));
}

export async function planSheet(projectId: string, modelId: string, levelIndex: number, expectedRevision: number) {
  return withCurrentScheme(projectId, modelId, expectedRevision, (_tx, row) => {
    const model = normalizeScreeningScheme(row.model);
    assertMethodOutputsExportable(model);
    const scene = buildFloorPlanScene(model, levelIndex, { includeSiteContext: true });
    return { scene, svg: renderSceneSvg(scene) };
  });
}

export async function sheetBundle(projectId: string, modelId: string, kind: "plan" | "elevations", expectedRevision: number, levelIndex = 0) {
  return withCurrentScheme(projectId, modelId, expectedRevision, (_tx, row) => {
    const model = normalizeScreeningScheme(row.model);
    assertMethodOutputsExportable(model);
    const doc = kind === "elevations" ? composeElevationSheet(model) : composeArchitecturalSheet(model, { levelIndex });
    return { doc, svg: renderSheetSvg(doc) };
  });
}

export async function scheduleData(projectId: string, modelId: string, expectedRevision: number, levelIndex = 0) {
  return withCurrentScheme(projectId, modelId, expectedRevision, (_tx, row) => {
  const scheme = normalizeScreeningScheme(row.model);
  assertMethodOutputsExportable(scheme);
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
  });
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
    await generateForProject(project.id, { seed: DEFAULT_SEED, variants: DEFAULT_VARIANTS, weights: DEFAULT_WEIGHTS,
      expectedSiteRevision: project.siteRevision, expectedRequirementRevision: project.requirementRevision });
    await logEvent(project.id, "project.seeded", { flow: "demo-residential-irregular-plot", engine: ENGINE_VERSION });
    return getProject(project.id);
  } catch (error) {
    if (error instanceof DomainError) return null;
    throw error;
  }
}

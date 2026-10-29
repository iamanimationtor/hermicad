/** سازندهٔ پایگاه قدیمی مصنوعی برای آزمون مهاجرت؛ فقط برای محیط موقت QA. */
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { DEFAULT_SITE, DEFAULT_REQUIREMENTS } from "../src/domain/requirements";
import { generateSchemes } from "../src/domain/layout";
import { validateScheme } from "../src/domain/codes";
import { ENGINE_VERSION } from "../src/domain/constants";
import { LEGACY_ASSUMED_SEISMIC_NOTE } from "../src/domain/engineering/seismic";
import { SCHEMA_DDL } from "../src/db/bootstrap";
import assert from "node:assert/strict";

// ساختار مؤثر پیش از افزوده‌شدن منشأ و تصویر نسخه. جدول‌های دیگر را bootstrap می‌سازد.
const OLD_DDL = `
create table projects (id uuid primary key, code text not null, name text not null, workspace text not null,
 client text, jurisdiction text not null default 'IR-Tehran', status text not null default 'draft', description text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table site_revisions (id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
 revision integer not null default 1, data jsonb not null, created_at timestamptz not null default now());
create table requirement_revisions (id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
 revision integer not null default 1, data jsonb not null, created_at timestamptz not null default now());
create table generation_runs (id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
 seed integer not null, variants integer not null, engine_version text not null, site_revision integer not null,
 requirement_revision integer not null, weights jsonb not null, created_at timestamptz not null default now());
create table schemes (id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
 run_id uuid not null references generation_runs(id) on delete cascade, code text not null, strategy text not null, seed integer not null,
 model jsonb not null, metrics jsonb not null, gfa_m2 numeric(12,2) not null, units integer not null, pareto integer not null default 0,
 score numeric(8,4) not null, created_at timestamptz not null default now());
create table validation_runs (id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
 scheme_id uuid not null references schemes(id) on delete cascade, code_set_edition text not null, iteration integer not null default 0,
 report jsonb not null, created_at timestamptz not null default now());
`;

export interface LegacyFixture {
  workspace: string;
  projectId: string;
  runId: string;
  schemeId: string;
  duplicateProjectId: string;
  faultProjectId: string;
  missingReportProjectId: string;
  missingReportRunId: string;
  missingReportSchemeId: string;
  databaseUrl: string;
  verifyIdempotence: () => Promise<void>;
  dispose: () => Promise<void>;
}

export async function setupLegacyFixture(dataDir: string, postgresUrl?: string): Promise<LegacyFixture> {
  const projectId = randomUUID(), runId = randomUUID(), schemeId = randomUUID();
  const duplicateProjectId = randomUUID(), faultProjectId = randomUUID();
  const missingReportProjectId = randomUUID(), missingReportRunId = randomUUID(), missingReportSchemeId = randomUUID();
  const workspace = "ws_legacy_" + randomBytes(12).toString("hex");
  let execute: (sql: string, params?: unknown[]) => Promise<unknown>;
  let close: () => Promise<void>;
  let dispose: () => Promise<void> = async () => {};
  let databaseUrl = "";
  if (postgresUrl) {
    // فقط schema تصادفی و مختص این آزمون ایجاد/حذف می‌شود؛ هرگز جداول دیگر دست‌کاری نمی‌شوند.
    const schema = `hermicad_qa_${randomBytes(8).toString("hex")}`;
    const admin = new pg.Client({ connectionString: postgresUrl });
    await admin.connect();
    await admin.query(`create schema "${schema}"`);
    const scoped = new URL(postgresUrl);
    scoped.searchParams.set("options", `-c search_path=${schema},public`);
    databaseUrl = scoped.toString();
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    execute = (sql, params) => client.query(sql, params);
    close = () => client.end();
    dispose = async () => { await admin.query(`drop schema "${schema}" cascade`); await admin.end(); };
  } else {
    await mkdir(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    execute = (sql, params) => params ? client.query(sql, params) : client.exec(sql);
    close = () => client.close();
  }
  try {
    await execute(OLD_DDL);
    const legacySite = { ...DEFAULT_SITE, seismicZone: "high" as const, notes: [LEGACY_ASSUMED_SEISMIC_NOTE] };
    for (const id of [projectId, duplicateProjectId, faultProjectId, missingReportProjectId]) {
      await execute("insert into projects(id, code, name, workspace, status) values ($1,$2,$3,$4,'generated')", [id, `HMC-LEGACY-${id}`, "پروژهٔ مهاجرتی آزمون", workspace]);
      await execute("insert into site_revisions(project_id, revision, data) values ($1,1,$2::jsonb)", [id, JSON.stringify(id === projectId ? legacySite : DEFAULT_SITE)]);
      await execute("insert into requirement_revisions(project_id, revision, data) values ($1,1,$2::jsonb)", [id, JSON.stringify(DEFAULT_REQUIREMENTS)]);
    }
    await execute("insert into site_revisions(project_id, revision, data) values ($1,1,$2::jsonb)", [duplicateProjectId, JSON.stringify(DEFAULT_SITE)]);
    // شبیه‌سازی نتیجهٔ موتور قدیمی: high عدد تولید کرد و قاعده مثبت بود؛ یادداشت نشان می‌دهد انتخاب کاربر نبوده است.
    const model = generateSchemes({ ...legacySite, notes: [] }, DEFAULT_REQUIREMENTS, { seed: 20260101, variants: 1 })[0];
    const report = validateScheme(model);
    assert.equal(report.evaluations.find((item) => item.ruleId === "STRUCT-02-SEISMIC")?.status, "pass");
    assert.equal(report.evaluations.find((item) => item.ruleId === "NBR-21-PARKING")?.status, "pass");
    model.site = legacySite;
    // خلاصهٔ قدیمیِ ناقص می‌تواند گزارش مثبتِ ذخیره‌شده داشته باشد؛ فقط نمای امن اصلاح می‌شود.
    model.parking.requiredStalls = null as unknown as number;
    await execute("insert into generation_runs(id,project_id,seed,variants,engine_version,site_revision,requirement_revision,weights) values($1,$2,20260101,1,$3,1,1,$4::jsonb)", [runId, projectId, ENGINE_VERSION, JSON.stringify({ yield: 0.26, quality: 0.3, safety: 0.18, structure: 0.1, cost: 0.16 })]);
    await execute("insert into schemes(id,project_id,run_id,code,strategy,seed,model,metrics,gfa_m2,units,pareto,score) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,0,0)", [schemeId, projectId, runId, model.code, model.strategy, model.seed, JSON.stringify(model), "{}", String(model.grossFloorAreaM2), model.unitsTotal]);
    await execute("insert into validation_runs(project_id,scheme_id,code_set_edition,iteration,report) values($1,$2,$3,0,$4::jsonb)", [projectId, schemeId, report.codeSetEdition, JSON.stringify(report)]);
    // اجراهای قدیمی بدون طرح، وضعیت واقعی پس از حذف طرح‌ها در تولیدهای پیشین را نیز شبیه‌سازی می‌کنند.
    for (let i = 0; i < 25; i++) await execute(
      "insert into generation_runs(id,project_id,seed,variants,engine_version,site_revision,requirement_revision,weights) values($1,$2,20260101,1,$3,1,1,$4::jsonb)",
      [randomUUID(), projectId, ENGINE_VERSION, JSON.stringify({ yield: 1 })],
    );
    // طرح قدیمی با گزارش مفقود؛ نباید در نمای عادی بازاعتبارسنجیِ جعلی شود.
    await execute("insert into generation_runs(id,project_id,seed,variants,engine_version,site_revision,requirement_revision,weights) values($1,$2,20260101,1,$3,1,1,$4::jsonb)", [missingReportRunId, missingReportProjectId, ENGINE_VERSION, JSON.stringify({ yield: 0.26, quality: 0.3, safety: 0.18, structure: 0.1, cost: 0.16 })]);
    await execute("insert into schemes(id,project_id,run_id,code,strategy,seed,model,metrics,gfa_m2,units,pareto,score) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,0,0)", [missingReportSchemeId, missingReportProjectId, missingReportRunId, model.code, model.strategy, model.seed, JSON.stringify(model), "{}", String(model.grossFloorAreaM2), model.unitsTotal]);
    // خطای تزریقی پس از درج اجرا و طرح، برای اثبات rollback اتمی در هر دو درایور.
    await execute(`create function qa_reject_validation() returns trigger language plpgsql as $$
      begin if new.project_id = '${faultProjectId}'::uuid then raise exception 'qa induced failure'; end if; return new; end $$;
      create trigger qa_reject_validation before insert on validation_runs for each row execute function qa_reject_validation();`);
  } catch (error) {
    await close();
    await dispose();
    throw error;
  }
  await close();
  const verifyIdempotence = async () => {
    const countsSql = `select (select count(*)::int from projects) as projects,
      (select count(*)::int from generation_runs) as runs, (select count(*)::int from schemes) as schemes,
      (select count(*)::int from scheme_snapshots) as snapshots, (select count(*)::int from validation_runs) as validations`;
    if (databaseUrl) {
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        const before = await client.query(countsSql);
        assert.ok(before.rows[0].projects >= 1 && before.rows[0].runs >= 2);
        await client.query(SCHEMA_DDL);
        await client.query(SCHEMA_DDL);
        assert.deepEqual((await client.query(countsSql)).rows, before.rows);
        const columns = await client.query("select column_name from information_schema.columns where table_schema=current_schema() and table_name='generation_runs'");
        assert.ok(columns.rows.some((row) => row.column_name === "ruleset_fingerprint"));
        assert.ok(columns.rows.some((row) => row.column_name === "initial_weights"));
      } finally { await client.end(); }
    } else {
      const client = new PGlite(dataDir);
      try {
        const before = await client.query<{ projects: number; runs: number }>(countsSql);
        assert.ok(before.rows[0].projects >= 1 && before.rows[0].runs >= 2);
        await client.exec(SCHEMA_DDL);
        await client.exec(SCHEMA_DDL);
        assert.deepEqual((await client.query(countsSql)).rows, before.rows);
        const columns = await client.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema=current_schema() and table_name='generation_runs'");
        assert.ok(columns.rows.some((row) => row.column_name === "ruleset_fingerprint"));
        assert.ok(columns.rows.some((row) => row.column_name === "initial_weights"));
      } finally { await client.close(); }
    }
    console.log("Bootstrap افزایشی در اجرای تکراری بدون حذف داده اعمال شد.");
  };
  return { workspace, projectId, runId, schemeId, duplicateProjectId, faultProjectId,
    missingReportProjectId, missingReportRunId, missingReportSchemeId, databaseUrl, verifyIdempotence, dispose };
}

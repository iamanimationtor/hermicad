/**
 * Schema bootstrap.
 *
 * HERMICAD ships a single, idempotent DDL script so that a fresh environment
 * (local PGlite, a CI container, or a Postgres instance) can start serving in
 * one step. The statements mirror `src/db/schema.ts` exactly; when the Drizzle
 * schema changes, update both — the quality gate checks the two stay in sync.
 */
export const SCHEMA_DDL = /* sql */ `
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  client text,
  jurisdiction text not null default 'IR-Tehran',
  status text not null default 'draft',
  active_run_id uuid,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists site_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  revision integer not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists requirement_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  revision integer not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists code_sets (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  edition text not null,
  title text not null,
  jurisdiction text not null,
  status text not null default 'internal-thresholds-unverified',
  ruleset_fingerprint text,
  rules jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists generation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  seed integer not null,
  variants integer not null,
  engine_version text not null,
  site_revision integer not null,
  requirement_revision integer not null,
  ruleset_fingerprint text,
  initial_weights jsonb,
  weights jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists schemes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  run_id uuid not null references generation_runs(id) on delete cascade,
  code text not null,
  strategy text not null,
  seed integer not null,
  revision integer not null default 1,
  model jsonb not null,
  metrics jsonb not null,
  gfa_m2 numeric(12, 2) not null,
  units integer not null,
  pareto integer not null default 0,
  score numeric(8, 4) not null,
  created_at timestamptz not null default now()
);

create table if not exists validation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  scheme_id uuid not null references schemes(id) on delete cascade,
  code_set_edition text not null,
  iteration integer not null default 0,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists scheme_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  scheme_id uuid not null references schemes(id) on delete cascade,
  revision integer not null,
  action text not null,
  model jsonb not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  unique (scheme_id, revision)
);

create table if not exists export_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  scheme_id uuid references schemes(id) on delete cascade,
  format text not null,
  filename text not null,
  bytes integer not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  actor text not null default 'engineer',
  action text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists design_documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'architecture',
  revision integer not null default 1,
  workspace text not null default 'public',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- پایگاه‌داده‌های موجود: ستون فضای کار به‌صورت idempotent اضافه می‌شود
alter table design_documents add column if not exists workspace text not null default 'public';

create index if not exists projects_status_idx on projects (status);
create index if not exists design_documents_updated_idx on design_documents (updated_at desc);
create index if not exists design_documents_workspace_idx on design_documents (workspace, updated_at desc);
create index if not exists schemes_project_idx on schemes (project_id);
create index if not exists validation_runs_scheme_idx on validation_runs (scheme_id);
create index if not exists audit_events_project_idx on audit_events (project_id);

create table if not exists workspace_access (
  workspace text primary key,
  username text unique,
  password_hash text,
  recovery_hash text unique,
  created_at timestamptz not null default now()
);
create table if not exists workspace_sessions (
  token_hash text primary key,
  workspace text not null references workspace_access(workspace) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists workspace_sessions_workspace_idx on workspace_sessions(workspace);
create table if not exists auth_attempts (
  key text primary key,
  count integer not null,
  started_at timestamptz not null
);
create table if not exists design_shares (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references design_documents(id) on delete cascade,
  workspace text not null,
  token_hash text not null unique,
  snapshot jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists design_shares_owner_idx on design_shares(workspace,design_id);
alter table projects add column if not exists workspace text not null default 'public';
alter table projects add column if not exists active_run_id uuid;
alter table generation_runs add column if not exists ruleset_fingerprint text;
alter table generation_runs add column if not exists initial_weights jsonb;
alter table schemes add column if not exists revision integer not null default 1;
create index if not exists projects_workspace_idx on projects(workspace);
create index if not exists generation_runs_project_created_idx on generation_runs(project_id, created_at desc);
create index if not exists schemes_run_idx on schemes(run_id);
create index if not exists scheme_snapshots_project_idx on scheme_snapshots(project_id, scheme_id, revision);
`;

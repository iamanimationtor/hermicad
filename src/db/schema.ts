import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  CanonicalScheme,
  Requirements,
  SiteModel,
  ValidationReport,
} from "@/domain/types";
import type { StudioDocument } from "@/domain/studio/document";

/**
 * HERMICAD persistence layer.
 *
 * Design note: the Canonical Engineering Model (CEM) is stored as an immutable
 * JSONB snapshot (revisioned), while queryable / auditable facets are promoted
 * to relational columns. Engineering logic never reads the database directly;
 * it receives a CEM document. This keeps the engines testable and independent.
 */

export const projects = pgTable("projects", {
  workspace: text("workspace").notNull().default("public"),
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  client: text("client"),
  jurisdiction: text("jurisdiction").notNull().default("IR-Tehran"),
  status: text("status").notNull().default("draft"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const siteRevisions = pgTable("site_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(1),
  data: jsonb("data").$type<SiteModel>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const requirementRevisions = pgTable("requirement_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(1),
  data: jsonb("data").$type<Requirements>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const codeSets = pgTable("code_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  edition: text("edition").notNull(),
  title: text("title").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  status: text("status").notNull().default("internal-thresholds-unverified"),
  rulesetFingerprint: text("ruleset_fingerprint"),
  rules: jsonb("rules").$type<{ id: string; title: string; source: string; category: string; severity: string }[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const generationRuns = pgTable("generation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  seed: integer("seed").notNull(),
  variants: integer("variants").notNull(),
  engineVersion: text("engine_version").notNull(),
  siteRevision: integer("site_revision").notNull(),
  requirementRevision: integer("requirement_revision").notNull(),
  weights: jsonb("weights").$type<Record<string, number>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const schemes = pgTable("schemes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  runId: uuid("run_id")
    .notNull()
    .references(() => generationRuns.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  strategy: text("strategy").notNull(),
  seed: integer("seed").notNull(),
  model: jsonb("model").$type<CanonicalScheme>().notNull(),
  metrics: jsonb("metrics").$type<Record<string, number>>().notNull(),
  gfaM2: numeric("gfa_m2", { precision: 12, scale: 2 }).notNull(),
  units: integer("units").notNull(),
  pareto: integer("pareto").notNull().default(0),
  score: numeric("score", { precision: 8, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const validationRuns = pgTable("validation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  schemeId: uuid("scheme_id")
    .notNull()
    .references(() => schemes.id, { onDelete: "cascade" }),
  codeSetEdition: text("code_set_edition").notNull(),
  iteration: integer("iteration").notNull().default(0),
  report: jsonb("report").$type<ValidationReport>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const exportArtifacts = pgTable("export_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  schemeId: uuid("scheme_id").references(() => schemes.id, { onDelete: "cascade" }),
  format: text("format").notNull(),
  filename: text("filename").notNull(),
  bytes: integer("bytes").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  actor: text("actor").notNull().default("engineer"),
  action: text("action").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Design Studio documents.
 *
 * The free-hand drawing is stored as a single versioned JSON document — the
 * same shape the pure engine and the exporters consume — so a saved drawing can
 * be re-rendered to SVG/PDF/DXF at any time without the UI.
 */
export const designDocuments = pgTable("design_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("architecture"),
  revision: integer("revision").notNull().default(1),
  /** فضای کار بازدیدکننده (کوکی) — اسناد هر کاربر از بقیه جدا می‌ماند. */
  workspace: text("workspace").notNull().default("public"),
  data: jsonb("data").$type<StudioDocument>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** حساب اختیاری؛ مهمان همچنان بدون ثبت‌نام کار می‌کند. فقط چکیدهٔ رمز/کلید ذخیره می‌شود. */
export const workspaceAccess = pgTable("workspace_access", {
  workspace: text("workspace").primaryKey(),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  recoveryHash: text("recovery_hash").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const workspaceSessions = pgTable("workspace_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  workspace: text("workspace").notNull().references(() => workspaceAccess.workspace, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const authAttempts = pgTable("auth_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
});
export const designShares = pgTable("design_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  designId: uuid("design_id").notNull().references(() => designDocuments.id, { onDelete: "cascade" }),
  workspace: text("workspace").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  snapshot: jsonb("snapshot").$type<StudioDocument>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

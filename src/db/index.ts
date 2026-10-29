import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { SCHEMA_DDL } from "./bootstrap";
import { assertDatabaseConfiguration } from "./config";

/**
 * HERMICAD database entry point.
 *
 * Two drivers behind one interface:
 *  - `DATABASE_URL=postgres://…`  → node-postgres pool (production / CI).
 *  - no `DATABASE_URL`            → embedded PGlite for development.
 *    In production this fallback requires an explicit local/testing opt-in.
 *
 * The connection is created **lazily** on first query. That matters because
 * Next.js evaluates route modules in several short-lived worker processes
 * (build, static analysis, dev server); opening the embedded database at import
 * time would have two processes claim the same data directory and abort.
 *
 * Nothing in `src/domain` imports this module: engines stay pure and testable.
 */

export type Db = NodePgDatabase<Record<string, never>>;

export type DatabaseDriver = "postgres" | "pglite";

const globalForDb = globalThis as typeof globalThis & {
  __hermicadDbPromise?: Promise<Db>;
  __hermicadDriver?: DatabaseDriver;
};

const databaseUrl = process.env.DATABASE_URL?.trim();

export const driver: DatabaseDriver = databaseUrl ? "postgres" : "pglite";

async function createPostgres(): Promise<Db> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(SCHEMA_DDL);
    return drizzleNode(pool) as unknown as Db;
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
}

async function createPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { mkdir } = await import("node:fs/promises");
  const dataDir = process.env.PGLITE_DATA_DIR ?? ".data/hermicad";
  // PGlite creates its data directory but not missing parents.
  await mkdir(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  try {
    await client.exec(SCHEMA_DDL);
    return drizzle(client) as unknown as Db;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

/** Resolves the single, process-wide database handle (creating it on demand). */
export async function getDb(): Promise<Db> {
  assertDatabaseConfiguration({ databaseUrl, nodeEnv: process.env.NODE_ENV,
    allowEmbeddedInProduction: process.env.HERMICAD_ALLOW_PGLITE_IN_PRODUCTION });
  if (!globalForDb.__hermicadDbPromise) {
    globalForDb.__hermicadDbPromise = (databaseUrl ? createPostgres() : createPglite()).catch(
      (error) => {
        // Never cache a failed connection: the next request may succeed.
        delete globalForDb.__hermicadDbPromise;
        throw error;
      },
    );
  }
  return globalForDb.__hermicadDbPromise;
}

import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { config } from "@/lib/config";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzlePostgres<typeof schema>>;
type Handle = { db: DB; driver: "postgres" | "pglite"; close: () => Promise<void> };

/** Embedded database folder; `PGLITE_DIR` points tests or a second server at a throwaway copy. */
export const PGLITE_DIR = process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite");
const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

// One connection per process. In dev, Next hot-reloads modules, so keep the handle on globalThis.
const g = globalThis as unknown as { __skinproofDb?: Promise<Handle> };

async function open(): Promise<Handle> {
  const url = config().DATABASE_URL;
  if (url) {
    const sql = postgres(url, { max: 5, onnotice: () => {} });
    const db = drizzlePostgres(sql, { schema });
    await migratePostgres(db, { migrationsFolder: MIGRATIONS_DIR });
    return { db, driver: "postgres", close: () => sql.end() };
  }
  // Serverless file systems are read-only and per-instance, so the embedded database can't work there.
  if (process.env.VERCEL) throw new Error("DATABASE_URL is required on Vercel — create a free Postgres (e.g. Neon) and set it in the project's environment variables.");
  fs.mkdirSync(PGLITE_DIR, { recursive: true });
  const client = new PGlite(PGLITE_DIR);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });
  // The pglite and postgres-js drizzle databases expose the same query-builder API; the cast keeps one type.
  return { db: db as unknown as DB, driver: "pglite", close: () => client.close() };
}

function handle(): Promise<Handle> {
  g.__skinproofDb ??= open().catch((err) => {
    g.__skinproofDb = undefined; // allow a retry on the next request
    throw err;
  });
  return g.__skinproofDb;
}

/** Ready-to-use database (migrations applied once per process). */
export async function db(): Promise<DB> {
  return (await handle()).db;
}

export async function dbDriver(): Promise<"postgres" | "pglite"> {
  return (await handle()).driver;
}

export async function closeDb(): Promise<void> {
  if (!g.__skinproofDb) return;
  const h = await g.__skinproofDb;
  g.__skinproofDb = undefined;
  await h.close();
}

export { schema };

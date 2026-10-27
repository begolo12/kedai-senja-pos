import type { SQL } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __posPool?: Pool;
  __posDb?: DB;
};

export const connectionString =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5433/postgres";

function create(): DB {
  const needsSsl =
    /sslmode=require/.test(connectionString) ||
    /neon\.tech/.test(connectionString) ||
    process.env.PGSSL === "1";

  const pool =
    globalForDb.__posPool ??
    new Pool({
      connectionString,
      max: 5,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
  globalForDb.__posPool = pool;

  const db = drizzle(pool, { schema });
  globalForDb.__posDb = db;
  return db;
}

export const db: DB = globalForDb.__posDb ?? create();

/** Postgres aggregate rows come back as strings; callers normalise to number. */
export async function rows<T extends Record<string, unknown>>(query: SQL) {
  const result = await db.execute(query);
  return result.rows as T[];
}

export async function closeDb() {
  await globalForDb.__posPool?.end();
  globalForDb.__posPool = undefined;
  globalForDb.__posDb = undefined;
}
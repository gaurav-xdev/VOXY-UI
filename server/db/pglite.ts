import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Db, QueryResult, Queryable } from "./index";

/**
 * PGlite is real PostgreSQL compiled to WASM. It is used ONLY for automated tests and
 * zero-install local development; staging/production require a real PostgreSQL server
 * (enforced in config.ts and createDb()).
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  if (dataDir && !dataDir.startsWith("memory:")) mkdirSync(path.dirname(dataDir), { recursive: true });
  const lite = new PGlite(dataDir);
  await lite.waitReady;

  const run = async <T>(q: { query: PGlite["query"] }, text: string, params?: unknown[]): Promise<QueryResult<T>> => {
    const r = await q.query<T>(text, params as unknown[]);
    return { rows: r.rows as T[], rowCount: Math.max(r.affectedRows ?? 0, r.rows.length) };
  };

  const db: Db = {
    kind: "pglite",
    query: <T>(text: string, params?: unknown[]) => run<T>(lite, text, params),
    exec: async (sql: string) => {
      await lite.exec(sql);
    },
    tx: <T>(fn: (q: Queryable) => Promise<T>) =>
      lite.transaction((tx) =>
        fn({
          query: <R>(t: string, p?: unknown[]) => run<R>(tx, t, p),
          exec: async (sql: string) => {
            await tx.exec(sql);
          },
        }),
      ),
    async ping() {
      await db.query("SELECT 1");
    },
    async close() {
      await lite.close();
    },
  };
  return db;
}

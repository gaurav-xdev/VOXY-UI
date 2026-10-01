import pg from "pg";
import type { AppConfig } from "../config";
import { DatabaseUnavailableError, isConnectionError, type Db, type Isolation, type QueryResult, type Queryable } from "./index";

// Return timestamptz as Date (default) and keep int8 as string to avoid silent precision loss.
export function createPgDb(config: AppConfig): Db {
  const pool = new pg.Pool({
    connectionString: config.database.url,
    max: config.database.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    idle_in_transaction_session_timeout: 15_000,
    application_name: "voxy-server",
    ssl: config.database.ssl ? { rejectUnauthorized: true } : undefined,
  });
  // An idle client erroring must never crash the process.
  pool.on("error", () => {});

  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (isConnectionError(err)) throw new DatabaseUnavailableError(err);
      throw err;
    }
  };

  const run = async <T>(q: pg.Pool | pg.PoolClient, text: string, params?: unknown[]): Promise<QueryResult<T>> => {
    const r = await q.query(text, params as unknown[]);
    return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
  };

  const db: Db = {
    kind: "pg",
    query: <T>(text: string, params?: unknown[]) => wrap(() => run<T>(pool, text, params)),
    exec: (sql: string) =>
      wrap(async () => {
        await pool.query(sql);
      }),
    async tx<T>(fn: (q: Queryable) => Promise<T>, opts?: { isolation?: Isolation }): Promise<T> {
      const attempts = opts?.isolation === "SERIALIZABLE" ? 3 : 1;
      for (let i = 1; ; i++) {
        const client = await wrap(() => pool.connect());
        try {
          await client.query(`BEGIN ISOLATION LEVEL ${opts?.isolation ?? "READ COMMITTED"}`);
          const result = await fn({
            query: <R>(t: string, p?: unknown[]) => run<R>(client, t, p),
            exec: async (sql: string) => {
              await client.query(sql);
            },
          });
          await client.query("COMMIT");
          return result;
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          const code = (err as { code?: string }).code;
          if ((code === "40001" || code === "40P01") && i < attempts) continue;
          if (isConnectionError(err)) throw new DatabaseUnavailableError(err);
          throw err;
        } finally {
          client.release();
        }
      }
    },
    async ping() {
      await db.query("SELECT 1");
    },
    async close() {
      await pool.end();
    },
  };
  return db;
}

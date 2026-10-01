import type { AppConfig } from "../config";

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Run a multi-statement SQL script (migrations only; no parameters). */
  exec(sql: string): Promise<void>;
}

export type Isolation = "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";

export interface Db extends Queryable {
  readonly kind: "pg" | "pglite";
  /** Run `fn` inside a transaction. Rolls back on any thrown error. */
  tx<T>(fn: (q: Queryable) => Promise<T>, opts?: { isolation?: Isolation }): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** Thrown when the database cannot be reached / is overloaded. Mapped to a safe 503. */
export class DatabaseUnavailableError extends Error {
  constructor(public readonly cause: unknown) {
    super("database unavailable");
    this.name = "DatabaseUnavailableError";
  }
}

const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "57P01",
  "57P02",
  "57P03",
  "53300",
  "53400",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "57014",
]);

export function isConnectionError(err: unknown): boolean {
  if (err instanceof DatabaseUnavailableError) return true;
  const code = (err as { code?: string } | null)?.code;
  if (code && CONNECTION_CODES.has(code)) return true;
  const msg = String((err as { message?: string } | null)?.message ?? "");
  return /timeout|connection terminated|connection refused|Client has encountered a connection error|Cannot use a pool after calling end/i.test(msg);
}

export async function createDb(config: AppConfig): Promise<Db> {
  const url = config.database.url;
  if (url.startsWith("pglite://") || url === "memory://") {
    if (config.hardened) throw new Error("pglite is not allowed in staging/production");
    const { createPgliteDb } = await import("./pglite");
    return createPgliteDb(url === "memory://" ? undefined : url.slice("pglite://".length));
  }
  const { createPgDb } = await import("./pg");
  return createPgDb(config);
}

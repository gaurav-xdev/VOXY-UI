import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./index";

const here = path.dirname(fileURLToPath(import.meta.url));

export function migrationsDir(): string {
  // dist-server/migrations (built) or server/db/migrations (source)
  const built = path.resolve(here, "migrations");
  return built;
}

export interface Migration {
  id: string;
  sql: string;
  checksum: string;
}

export function loadMigrations(dir = migrationsDir()): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((f) => {
      const sql = readFileSync(path.join(dir, f), "utf8");
      return { id: f.replace(/\.sql$/, ""), sql, checksum: createHash("sha256").update(sql).digest("hex") };
    });
}

/**
 * Forward-only migrations. Each file runs in its own transaction, serialised across
 * instances with an advisory lock. Applied migrations are checksummed: editing a
 * migration after it shipped is a hard error (create a new migration instead).
 */
export async function migrate(db: Db, dir = migrationsDir()): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied: string[] = [];
  for (const m of loadMigrations(dir)) {
    await db.tx(async (q) => {
      await q.query("SELECT pg_advisory_xact_lock(724116)");
      const existing = await q.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE id = $1", [m.id]);
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== m.checksum) throw new Error(`Migration ${m.id} was modified after being applied`);
        return;
      }
      await q.exec(m.sql);
      await q.query("INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)", [m.id, m.checksum]);
      applied.push(m.id);
    });
  }
  return applied;
}

/** Fail closed at boot if the schema is behind the code. */
export async function assertSchemaCurrent(db: Db, dir = migrationsDir()): Promise<void> {
  let done: Set<string>;
  try {
    const r = await db.query<{ id: string }>("SELECT id FROM schema_migrations");
    done = new Set(r.rows.map((x) => x.id));
  } catch {
    throw new Error("Database schema is not initialised. Run `npm run db:migrate` before starting the server.");
  }
  const pending = loadMigrations(dir).filter((m) => !done.has(m.id));
  if (pending.length) throw new Error(`Pending database migrations: ${pending.map((m) => m.id).join(", ")}. Run \`npm run db:migrate\`.`);
}

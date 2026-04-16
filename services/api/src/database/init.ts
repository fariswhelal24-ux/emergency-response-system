import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOOT_TABLE_DEFINITIONS: string[] = [
  `
    CREATE TABLE IF NOT EXISTS ambulances (
      id SERIAL PRIMARY KEY,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      unit_code TEXT UNIQUE,
      crew_count INTEGER NOT NULL DEFAULT 2,
      support_level TEXT NOT NULL DEFAULT 'BLS',
      current_latitude DOUBLE PRECISION,
      current_longitude DOUBLE PRECISION,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
];

// Ensures the `users` table has every column the application code relies on,
// regardless of how the DB was originally provisioned (some environments
// created it with legacy snake_case/camelCase or missing optional columns).
const USERS_SCHEMA_GUARD: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id UUID PRIMARY KEY,
     full_name TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL,
     phone TEXT,
     password_hash TEXT NOT NULL DEFAULT '',
     role TEXT NOT NULL DEFAULT 'CITIZEN',
     avatar_url TEXT,
     is_active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  // Backfill from common legacy camelCase column names if they exist.
  `UPDATE users
     SET full_name = COALESCE(NULLIF(full_name, ''), "fullName")
     WHERE full_name IS NULL OR full_name = ''`,
  `UPDATE users
     SET password_hash = COALESCE(NULLIF(password_hash, ''), "passwordHash")
     WHERE password_hash IS NULL OR password_hash = ''`,
  // Unique email index (safe to re-run).
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email)`
];

const REFRESH_TOKENS_SCHEMA_GUARD: string[] = [
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL,
     token TEXT NOT NULL UNIQUE,
     expires_at TIMESTAMPTZ NOT NULL,
     revoked_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`
];

const candidateMigrationDirs = async (): Promise<string[]> => {
  const here = __dirname;
  const candidates = [
    path.join(here, "migrations"),
    path.resolve(here, "../../src/database/migrations"),
    path.resolve(process.cwd(), "src/database/migrations"),
    path.resolve(process.cwd(), "services/api/src/database/migrations")
  ];

  const resolved: string[] = [];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) {
        resolved.push(candidate);
      }
    } catch {
      // directory not present; try next candidate
    }
  }

  return Array.from(new Set(resolved));
};

const runPendingMigrations = async (): Promise<void> => {
  const dirs = await candidateMigrationDirs();
  if (dirs.length === 0) {
    console.warn("[DB] No migrations directory found at runtime; skipping migrations.");
    return;
  }

  const migrationDir = dirs[0];

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const entries = await readdir(migrationDir);
  const files = entries.filter((name) => name.endsWith(".sql")).sort();

  for (const fileName of files) {
    const alreadyApplied = await db.query<{ id: string }>(
      "SELECT id FROM schema_migrations WHERE id = $1 LIMIT 1",
      [fileName]
    );

    if (alreadyApplied.rowCount) {
      continue;
    }

    const fullPath = path.join(migrationDir, fileName);
    const sql = await readFile(fullPath, "utf8");
    const client = await db.getClient();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [fileName]);
      await client.query("COMMIT");
      console.log(`[DB] Applied migration ${fileName}`);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`[DB] Migration ${fileName} failed:`, error);
    } finally {
      client.release();
    }
  }
};

const runStatementsSafely = async (statements: string[], label: string): Promise<void> => {
  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Many of these ALTER/UPDATE statements are only relevant when legacy
      // columns exist. We intentionally swallow per-statement failures so a
      // missing legacy column (e.g. "fullName") does not block boot.
      console.warn(`[DB] ${label} statement skipped:`, message);
    }
  }
};

export const initDatabase = async (): Promise<void> => {
  try {
    await runPendingMigrations();
  } catch (error) {
    console.warn("[DB] Pending migrations check failed:", error);
  }

  await runStatementsSafely(USERS_SCHEMA_GUARD, "users schema guard");
  await runStatementsSafely(REFRESH_TOKENS_SCHEMA_GUARD, "refresh_tokens schema guard");
  await runStatementsSafely(BOOT_TABLE_DEFINITIONS, "boot table definition");
};

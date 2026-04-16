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

export const initDatabase = async (): Promise<void> => {
  try {
    await runPendingMigrations();
  } catch (error) {
    console.warn("[DB] Pending migrations check failed:", error);
  }

  for (const statement of BOOT_TABLE_DEFINITIONS) {
    try {
      await db.query(statement);
    } catch (error) {
      console.warn("[DB] Boot table definition failed:", error);
    }
  }
};

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationDir = path.join(__dirname, "migrations");

const run = async (): Promise<void> => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();

  for (const fileName of files) {
    const alreadyApplied = await db.query<{ id: string }>(
      "SELECT id FROM schema_migrations WHERE id = $1 LIMIT 1",
      [fileName]
    );

    if (alreadyApplied.rowCount) {
      console.log(`Skipping migration ${fileName} (already applied)`);
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
      console.log(`Applied migration ${fileName}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  await db.close();
  console.log("Migrations complete.");
};

run().catch(async (error) => {
  console.error("Migration failed:", error);
  await db.close();
  process.exit(1);
});

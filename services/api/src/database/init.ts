import { db } from "./pool.js";

const TABLE_DEFINITIONS: string[] = [
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

export const initDatabase = async (): Promise<void> => {
  for (const statement of TABLE_DEFINITIONS) {
    await db.query(statement);
  }
};

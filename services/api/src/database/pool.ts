import { Pool, QueryResult } from "pg";
import { URL } from "node:url";

import { env } from "../config/env.js";

let pool = new Pool({
  connectionString: env.databaseUrl
});

let hasSwitchedToLocalUserFallback = false;

const resolveLocalUserFallbackDatabaseUrl = (): string | null => {
  try {
    const parsed = new URL(env.databaseUrl);
    const currentUser = parsed.username.trim().toLowerCase();
    const localUser = (process.env.PGUSER ?? process.env.USER ?? "").trim();
    if (!localUser || localUser.toLowerCase() === currentUser) {
      return null;
    }

    parsed.username = localUser;
    parsed.password = "";
    return parsed.toString();
  } catch {
    return null;
  }
};

const shouldSwitchToLocalUserFallback = (error: unknown): boolean => {
  if (hasSwitchedToLocalUserFallback) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /role ".*" does not exist/i.test(message);
};

const switchToLocalUserFallback = async (): Promise<boolean> => {
  const fallbackConnectionString = resolveLocalUserFallbackDatabaseUrl();
  if (!fallbackConnectionString) {
    return false;
  }

  hasSwitchedToLocalUserFallback = true;

  try {
    await pool.end();
  } catch {
    // no-op
  }

  pool = new Pool({
    connectionString: fallbackConnectionString
  });

  console.warn(
    `[DB] DATABASE_URL user is unavailable on this machine. Auto-switched to local user from PGUSER/USER.`
  );

  return true;
};

export { pool };

export const db = {
  query: <Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<Row>> =>
    pool.query<Row>(text, params).catch(async (error: unknown) => {
      if (!shouldSwitchToLocalUserFallback(error)) {
        throw error;
      }

      const switched = await switchToLocalUserFallback();
      if (!switched) {
        throw error;
      }

      return pool.query<Row>(text, params);
    }),
  getClient: () =>
    pool.connect().catch(async (error: unknown) => {
      if (!shouldSwitchToLocalUserFallback(error)) {
        throw error;
      }

      const switched = await switchToLocalUserFallback();
      if (!switched) {
        throw error;
      }

      return pool.connect();
    }),
  close: () => pool.end()
};

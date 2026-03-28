import { Pool, QueryResult } from "pg";

import { env } from "../config/env";

const pool = new Pool({
  connectionString: env.databaseUrl
});

export { pool };

export const db = {
  query: <Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<Row>> =>
    pool.query<Row>(text, params),
  getClient: () => pool.connect(),
  close: () => pool.end()
};

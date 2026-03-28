import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { config } from "./config";
import * as schema from "./schema";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 5,
});

export const db = drizzle(sql, {
  schema,
});

export const checkDatabase = async () => {
  await sql`select 1 as ok`;
};

export type Database = typeof db;

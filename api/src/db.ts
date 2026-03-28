import { sql as drizzleSql } from "drizzle-orm";
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

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const checkDatabase = async () => {
  await sql`select 1 as ok`;
};

export const runInTransaction = async <T>(
  actor: string,
  callback: (tx: DbTransaction) => Promise<T>,
) => {
  return db.transaction(async (tx) => {
    await tx.execute(drizzleSql`select set_config('app.current_user', ${actor}, true)`);
    return callback(tx);
  });
};

export type Database = typeof db;

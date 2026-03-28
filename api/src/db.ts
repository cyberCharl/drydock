import postgres from "postgres";

import { config } from "./config";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 5,
});

export const checkDatabase = async () => {
  await sql`select 1 as ok`;
};

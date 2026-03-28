import { Hono } from "hono";
import { serve } from "bun";

import { checkDatabase } from "./db";
import { config } from "./config";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    name: "drydock-api",
    status: "ok",
  });
});

app.get("/health", async (c) => {
  await checkDatabase();

  return c.json({
    status: "ok",
    database: "reachable",
  });
});

await checkDatabase();

serve({
  fetch: app.fetch,
  port: config.apiPort,
});

console.log(`drydock-api listening on http://0.0.0.0:${config.apiPort}`);

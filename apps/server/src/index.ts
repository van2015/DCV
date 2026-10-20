import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { resolveDataDir } from "./config.js";

const hostname = "127.0.0.1";
const port = Number.parseInt(process.env.DCV_PORT ?? "4317", 10);
const webRoot =
  process.env.DCV_WEB_ROOT ?? fileURLToPath(new URL("../../web/dist", import.meta.url));
const dataDir = resolveDataDir();
const token = process.env.DCV_TOKEN ?? randomUUID();

const app = createApp({
  webRoot,
  dataDir,
  security: { token }
});

serve({ fetch: app.fetch, hostname, port }, (info) => {
  process.stdout.write(`DCV server listening on http://${hostname}:${info.port}\n`);
});

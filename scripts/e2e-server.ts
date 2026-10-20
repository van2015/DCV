import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createFixtureRepos } from "./create-fixture-repos.js";

const dataDir = resolve(process.env.DCV_DATA_DIR ?? ".tmp/e2e-data");
const fixturesDir = resolve(process.env.DCV_FIXTURES_DIR ?? ".tmp/e2e-fixtures");

await rm(dataDir, { recursive: true, force: true });
await createFixtureRepos(fixturesDir);

process.env.DCV_DATA_DIR = dataDir;
process.env.DCV_WEB_ROOT ??= resolve("apps/web/dist");

await import("../apps/server/dist/index.js");

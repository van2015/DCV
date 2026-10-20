import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const roots: string[] = [];

async function createWebRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dcv-web-"));
  roots.push(root);
  await writeFile(join(root, "index.html"), "<html><body>DCV</body></html>");
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("static SPA serving", () => {
  it("serves index.html for client routes", async () => {
    const app = createApp({ webRoot: await createWebRoot() });
    const response = await app.request("/projects/1");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("DCV");
  });

  it("does not serve the SPA for unknown API routes", async () => {
    const app = createApp({ webRoot: await createWebRoot() });
    const response = await app.request("/api/missing");
    expect(response.status).toBe(404);
  });
});

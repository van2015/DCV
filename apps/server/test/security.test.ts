import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { makeTempDir, removeTempDirs } from "./helpers/git.js";

const tempDirs: string[] = [];
const TOKEN = "token-de-prueba";

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

function appWithSecurity(webRoot?: string) {
  return createApp({ security: { token: TOKEN }, ...(webRoot ? { webRoot } : {}) });
}

async function appWithApi() {
  const dataDir = await makeTempDir("dcv-security-data-");
  tempDirs.push(dataDir);
  return createApp({ security: { token: TOKEN }, dataDir });
}

describe("Seguridad local", () => {
  it("exime al health check y exige token en el resto de la API", async () => {
    const app = await appWithApi();

    const health = await app.request("/api/health");
    expect(health.status).toBe(200);

    const unauthorized = await app.request("/api/projects");
    expect(unauthorized.status).toBe(401);
    expect(((await unauthorized.json()) as { error: { code: string } }).error.code).toBe(
      "unauthorized"
    );

    const authorized = await app.request("/api/projects", {
      headers: { "x-dcv-token": TOKEN }
    });
    expect(authorized.status).toBe(200);

    const viaQuery = await app.request(`/api/events?token=${TOKEN}`);
    expect(viaQuery.status).toBe(200);
    await viaQuery.body?.cancel().catch(() => undefined);
  });

  it("rechaza Host y Origin ajenos aunque el token sea válido", async () => {
    const app = appWithSecurity();

    const badHost = await app.request("/api/projects", {
      headers: { host: "evil.example", "x-dcv-token": TOKEN }
    });
    expect(badHost.status).toBe(403);
    expect(((await badHost.json()) as { error: { code: string } }).error.code).toBe(
      "invalid_host"
    );

    const badOrigin = await app.request("/api/projects", {
      headers: { origin: "https://evil.example", "x-dcv-token": TOKEN }
    });
    expect(badOrigin.status).toBe(403);
    expect(((await badOrigin.json()) as { error: { code: string } }).error.code).toBe(
      "invalid_origin"
    );

    const localOrigin = await app.request("/api/projects", {
      headers: { origin: "http://127.0.0.1:5173", "x-dcv-token": TOKEN }
    });
    expect(localOrigin.status).toBe(404);
  });

  it("inyecta el token de sesión en la SPA", async () => {
    const webRoot = await makeTempDir("dcv-web-");
    tempDirs.push(webRoot);
    await writeFile(
      join(webRoot, "index.html"),
      "<html><head><title>DCV</title></head><body></body></html>",
      "utf8"
    );
    const app = appWithSecurity(webRoot);

    const response = await app.request("/");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`window.__DCV_TOKEN__="${TOKEN}"`);
    expect((await app.request("/index.html")).status).toBe(200);
  });
});

import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("health endpoint", () => {
  it("reports ok with the analyzer version", async () => {
    const response = await createApp().request("/api/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; analyzerVersion: string };
    expect(body.ok).toBe(true);
    expect(body.analyzerVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

import { describe, expect, it } from "vitest";
import { isAnalyzableSourcePath } from "./discovery.js";

describe("isAnalyzableSourcePath", () => {
  it("accepts application TypeScript files", () => {
    expect(isAnalyzableSourcePath("src/index.ts")).toBe(true);
    expect(isAnalyzableSourcePath("src/components/Button.tsx")).toBe(true);
  });

  it("rejects non-TypeScript files", () => {
    expect(isAnalyzableSourcePath("src/index.js")).toBe(false);
    expect(isAnalyzableSourcePath("README.md")).toBe(false);
  });

  it("rejects declarations and tests", () => {
    expect(isAnalyzableSourcePath("src/types.d.ts")).toBe(false);
    expect(isAnalyzableSourcePath("src/app.test.ts")).toBe(false);
    expect(isAnalyzableSourcePath("src/app.spec.tsx")).toBe(false);
    expect(isAnalyzableSourcePath("test/helpers.ts")).toBe(false);
    expect(isAnalyzableSourcePath("src/__tests__/view.tsx")).toBe(false);
  });

  it("rejects build and dependency directories", () => {
    expect(isAnalyzableSourcePath("node_modules/pkg/index.ts")).toBe(false);
    expect(isAnalyzableSourcePath("dist/index.ts")).toBe(false);
    expect(isAnalyzableSourcePath("packages/app/coverage/report.ts")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  ProjectImportRequestSchema,
  ProjectUpdateRequestSchema,
  declarationNodeId,
  memberKey,
  moduleNodeId,
  packageNodeId,
  type Project
} from "./index.js";

describe("shared DTO schemas", () => {
  it("parses a local import request", () => {
    const parsed = ProjectImportRequestSchema.parse({
      source: "local",
      location: "/tmp/repo"
    });
    expect(parsed.source).toBe("local");
  });

  it("rejects an import request without a location", () => {
    const result = ProjectImportRequestSchema.safeParse({ source: "url", location: "" });
    expect(result.success).toBe(false);
  });

  it("requires at least one field in an update", () => {
    expect(ProjectUpdateRequestSchema.safeParse({}).success).toBe(false);
    expect(ProjectUpdateRequestSchema.safeParse({ branch: "main" }).success).toBe(true);
  });

  it("serializes a project round-trip", () => {
    const project: Project = {
      id: "p1",
      name: "demo",
      sourceType: "local",
      location: "/tmp/demo",
      repoPath: "/tmp/demo",
      branch: "main",
      defaultBranch: "main",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: null,
      managed: false,
      lastCommit: null
    };
    expect(JSON.parse(JSON.stringify(project))).toEqual(project);
  });

  it("builds stable node and member identifiers", () => {
    expect(declarationNodeId("src/a.ts", "class", "A")).toBe("src/a.ts#class:A");
    expect(moduleNodeId("src/a.ts")).toBe("module:src/a.ts");
    expect(packageNodeId("src")).toBe("package:src");
    expect(memberKey({ kind: "method", name: "run" })).toBe("method:run");
  });
});

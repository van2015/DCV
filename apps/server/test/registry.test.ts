import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Project } from "@dcv/shared";
import { ProjectRegistry } from "../src/projects/registry.js";
import { makeTempDir, removeTempDirs } from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

function sampleProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "demo",
    sourceType: "local",
    location: "/tmp/demo",
    repoPath: "/tmp/demo",
    branch: "main",
    defaultBranch: "main",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: null,
    managed: false,
    lastCommit: null,
    ...overrides
  };
}

describe("ProjectRegistry", () => {
  it("persists, updates and recovers projects after a restart", async () => {
    const directory = await makeTempDir();
    tempDirs.push(directory);
    const filePath = join(directory, "projects.json");

    const registry = new ProjectRegistry(filePath);
    const project = sampleProject();
    await registry.add(project);
    expect(await registry.list()).toEqual([project]);

    await registry.update(project.id, {
      branch: "feature",
      lastOpenedAt: "2026-02-01T00:00:00.000Z",
      lastCommit: "abc123"
    });

    const restarted = new ProjectRegistry(filePath);
    const recovered = await restarted.get(project.id);
    expect(recovered).toMatchObject({
      id: project.id,
      branch: "feature",
      lastOpenedAt: "2026-02-01T00:00:00.000Z",
      lastCommit: "abc123"
    });

    expect(await restarted.remove(project.id)).toMatchObject({ id: project.id });
    const afterRemoval = new ProjectRegistry(filePath);
    expect(await afterRemoval.list()).toEqual([]);
    expect((await readdir(directory)).sort()).toEqual(["projects.json"]);
  });

  it("returns an empty library before the file exists", async () => {
    const directory = await makeTempDir();
    tempDirs.push(directory);
    const registry = new ProjectRegistry(join(directory, "projects.json"));
    expect(await registry.list()).toEqual([]);
  });

  it("rejects a corrupted registry without overwriting it", async () => {
    const directory = await makeTempDir();
    tempDirs.push(directory);
    const filePath = join(directory, "projects.json");
    await writeFile(filePath, "{not json", "utf8");

    const registry = new ProjectRegistry(filePath);
    await expect(registry.list()).rejects.toMatchObject({ code: "registry_corrupt" });
    expect(await readFile(filePath, "utf8")).toBe("{not json");
  });

  it("serializes concurrent writes", async () => {
    const directory = await makeTempDir();
    tempDirs.push(directory);
    const registry = new ProjectRegistry(join(directory, "projects.json"));

    await Promise.all([
      registry.add(sampleProject({ id: "a", name: "a" })),
      registry.add(sampleProject({ id: "b", name: "b" })),
      registry.add(sampleProject({ id: "c", name: "c" }))
    ]);

    expect((await registry.list()).map((project) => project.id).sort()).toEqual(["a", "b", "c"]);
  });
});

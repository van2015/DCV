import { access, realpath } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectService } from "../src/projects/service.js";
import {
  commitFile,
  createFixtureRepo,
  initRepo,
  makeTempDir,
  removeTempDirs
} from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

async function makeService(): Promise<{ service: ProjectService; dataDir: string }> {
  const dataDir = await makeTempDir("dcv-data-");
  tempDirs.push(dataDir);
  const service = new ProjectService({
    dataDir,
    now: () => new Date("2026-03-01T12:00:00.000Z")
  });
  await service.init();
  return { service, dataDir };
}

describe("ProjectService local imports", () => {
  it("imports a local repository without modifying it", async () => {
    const { service } = await makeService();
    const repo = await createFixtureRepo(await makeTempDir("dcv-repo-"));
    tempDirs.push(repo);
    const canonicalRepo = await realpath(repo);

    const result = await service.importProject({ source: "local", location: repo });

    expect(result.warnings).toEqual([]);
    expect(result.project).toMatchObject({
      sourceType: "local",
      managed: false,
      branch: "main",
      defaultBranch: "main",
      repoPath: canonicalRepo,
      location: canonicalRepo,
      createdAt: "2026-03-01T12:00:00.000Z",
      lastOpenedAt: null
    });

    await service.remove(result.project.id);
    await expect(access(join(repo, "README.md"))).resolves.toBeUndefined();
  });

  it("canonicalizes a subdirectory to the repository root", async () => {
    const { service } = await makeService();
    const repo = await createFixtureRepo(await makeTempDir("dcv-repo-"));
    tempDirs.push(repo);

    const result = await service.importProject({
      source: "local",
      location: join(repo, "src")
    });

    expect(result.project.repoPath).toBe(await realpath(repo));
  });

  it("rejects a path that is not a Git repository", async () => {
    const { service } = await makeService();
    const directory = await makeTempDir("dcv-plain-");
    tempDirs.push(directory);

    await expect(
      service.importProject({ source: "local", location: directory })
    ).rejects.toMatchObject({ code: "not_a_git_repository" });
  });

  it("detects duplicate local repositories", async () => {
    const { service } = await makeService();
    const repo = await createFixtureRepo(await makeTempDir("dcv-repo-"));
    tempDirs.push(repo);

    const first = await service.importProject({ source: "local", location: repo });
    await expect(
      service.importProject({ source: "local", location: join(repo, "src") })
    ).rejects.toMatchObject({
      code: "project_exists",
      details: { projectId: first.project.id }
    });
  });

  it("registers a repository without TypeScript and returns a warning", async () => {
    const { service } = await makeService();
    const repo = await initRepo(await makeTempDir("dcv-ts-empty-"));
    tempDirs.push(repo);
    await commitFile(repo, "README.md", "# Sin TypeScript\n", "docs: readme");

    const result = await service.importProject({ source: "local", location: repo });

    expect(result.project.name.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "no_typescript" })
    ]);
  });

  it("rejects an unknown branch", async () => {
    const { service } = await makeService();
    const repo = await createFixtureRepo(await makeTempDir("dcv-repo-"));
    tempDirs.push(repo);

    await expect(
      service.importProject({ source: "local", location: repo, branch: "missing" })
    ).rejects.toMatchObject({ code: "branch_not_found" });
  });
});

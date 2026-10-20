import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Project } from "@dcv/shared";
import { ProjectService } from "../src/projects/service.js";
import {
  addRemote,
  checkout,
  commitFile,
  createBareRemote,
  createFixtureRepo,
  git,
  makeTempDir,
  push,
  removeTempDirs
} from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

interface RemoteFixture {
  source: string;
  remote: string;
  url: string;
}

async function createRemoteFixture(withFeature = false): Promise<RemoteFixture> {
  const root = await makeTempDir("dcv-remote-");
  tempDirs.push(root);
  const source = await createFixtureRepo(join(root, "source"));
  const remote = await createBareRemote(join(root, "remote.git"));
  await addRemote(source, remote);
  await push(source);

  if (withFeature) {
    await checkout(source, "feature", true);
    await commitFile(source, "src/feature.ts", "export const feature = true;\n", "feat: feature");
    await push(source, "feature");
    await checkout(source, "main");
  }

  return { source, remote, url: pathToFileURL(remote).toString() };
}

async function makeService(dataDir?: string): Promise<{ service: ProjectService; dataDir: string }> {
  const directory = dataDir ?? (await makeTempDir("dcv-data-"));
  if (!dataDir) {
    tempDirs.push(directory);
  }
  const service = new ProjectService({
    dataDir: directory,
    cloneAllowedProtocols: ["file:"],
    now: () => new Date("2026-03-01T12:00:00.000Z")
  });
  await service.init();
  return { service, dataDir: directory };
}

async function importedProject(service: ProjectService, url: string): Promise<Project> {
  const result = await service.importProject({ source: "url", location: url });
  return result.project;
}

describe("ProjectService URL imports", () => {
  it("clones a public URL into managed storage and deletes it on removal", async () => {
    const fixture = await createRemoteFixture();
    const { service, dataDir } = await makeService();
    const progress: number[] = [];

    const result = await service.importProject({ source: "url", location: fixture.url }, (event) => {
      if (event.percent !== null) {
        progress.push(event.percent);
      }
    });
    const project = result.project;

    expect(progress.at(-1)).toBe(100);
    expect(project).toMatchObject({
      sourceType: "url",
      managed: true,
      branch: "main",
      defaultBranch: "main",
      location: fixture.url
    });
    expect(project.repoPath.startsWith(join(dataDir, "repos"))).toBe(true);
    await expect(access(join(project.repoPath, "HEAD"))).resolves.toBeUndefined();

    await service.remove(project.id);
    await expect(access(project.repoPath)).rejects.toThrow();
    expect(await service.list()).toEqual([]);
  });

  it("rejects unsupported protocols", async () => {
    const { service } = await makeService();
    await expect(
      service.importProject({ source: "url", location: "ftp://example.com/repo.git" })
    ).rejects.toMatchObject({ code: "invalid_protocol" });
  });

  it("rejects URLs with embedded credentials", async () => {
    const { service } = await makeService();
    await expect(
      service.importProject({
        source: "url",
        location: "https://user:secret@example.com/repo.git"
      })
    ).rejects.toMatchObject({ code: "credentials_not_allowed" });
  });

  it("cleans up after a failed clone", async () => {
    const fixture = await createRemoteFixture();
    const { service, dataDir } = await makeService();
    const missing = pathToFileURL(join(fixture.remote, "..", "missing.git")).toString();

    await expect(
      service.importProject({ source: "url", location: missing })
    ).rejects.toMatchObject({ code: "clone_failed" });

    expect(await service.list()).toEqual([]);
    expect(await readdir(join(dataDir, "repos"))).toEqual([]);
  });

  it("detects duplicate URLs without cloning again", async () => {
    const fixture = await createRemoteFixture();
    const { service } = await makeService();
    const project = await importedProject(service, fixture.url);

    await expect(
      service.importProject({ source: "url", location: fixture.url })
    ).rejects.toMatchObject({
      code: "project_exists",
      details: { projectId: project.id }
    });
  });

  it("removes the clone when the requested branch does not exist", async () => {
    const fixture = await createRemoteFixture();
    const { service, dataDir } = await makeService();

    await expect(
      service.importProject({ source: "url", location: fixture.url, branch: "missing" })
    ).rejects.toMatchObject({ code: "branch_not_found" });

    expect(await service.list()).toEqual([]);
    expect(await readdir(join(dataDir, "repos"))).toEqual([]);
  });

  it("lists branches, persists branch changes and refreshes managed clones", async () => {
    const fixture = await createRemoteFixture(true);
    const { service, dataDir } = await makeService();
    const project = await importedProject(service, fixture.url);

    expect(await service.branches(project.id)).toEqual(["feature", "main"]);
    expect(project.defaultBranch).toBe("main");

    const updated = await service.setBranch(project.id, "feature");
    expect(updated.branch).toBe("feature");

    const restarted = await makeService(dataDir);
    expect((await restarted.service.get(project.id)).branch).toBe("feature");

    await checkout(fixture.source, "feature");
    const newSha = await commitFile(
      fixture.source,
      "src/feature-2.ts",
      "export const featureTwo = true;\n",
      "feat: second feature change"
    );
    await push(fixture.source, "feature");

    await restarted.service.refresh(project.id);
    expect((await git(project.repoPath, ["rev-parse", "feature"])).stdout.trim()).toBe(newSha);

    await restarted.service.remove(project.id);
    await expect(access(project.repoPath)).rejects.toThrow();
  });
});

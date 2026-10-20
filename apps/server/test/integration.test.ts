import { ANALYZER_VERSION, type CommitListResponse, type ModelResponse } from "@dcv/shared";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AnalysisService } from "../src/analysis/service.js";
import { FileModelCache } from "../src/analysis/cache.js";
import { InProcessAnalyzer } from "../src/analysis/in-process-executor.js";
import { SnapshotBuilder } from "../src/analysis/snapshot-builder.js";
import { createApp } from "../src/app.js";
import { EventBus } from "../src/events.js";
import { ProjectService } from "../src/projects/service.js";
import { createScenarioRepo, type FixtureScenario } from "./helpers/fixtures.js";
import { makeTempDir, removeTempDirs } from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

async function setup(scenario: FixtureScenario) {
  const dataDir = await makeTempDir("dcv-integration-data-");
  const repo = await createScenarioRepo(await makeTempDir("dcv-integration-repo-"), scenario);
  tempDirs.push(dataDir, repo.repo);

  const bus = new EventBus();
  const service = new ProjectService({ dataDir, cloneAllowedProtocols: ["file:"] });
  await service.init();
  const analysis = new AnalysisService({
    dataDir,
    analyzerVersion: ANALYZER_VERSION,
    bus,
    createAnalyzer: (context) =>
      new InProcessAnalyzer(
        new SnapshotBuilder({
          ...context,
          cache: new FileModelCache(dataDir, context.analyzerVersion)
        })
      )
  });

  const app = createApp({ dataDir, service, analysis, bus });
  const imported = await app.request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "local", location: repo.repo })
  });
  expect(imported.status).toBe(201);
  const { project } = (await imported.json()) as { project: { id: string } };

  return { app, dataDir, projectId: project.id, commits: repo.commits };
}

async function listCommits(
  app: ReturnType<typeof createApp>,
  projectId: string
): Promise<CommitListResponse> {
  const response = await app.request(`/api/projects/${projectId}/commits?branch=main`);
  expect(response.status).toBe(200);
  return (await response.json()) as CommitListResponse;
}

async function model(
  app: ReturnType<typeof createApp>,
  projectId: string,
  sha: string
): Promise<ModelResponse> {
  const response = await app.request(
    `/api/projects/${projectId}/commits/${sha}/model?branch=main`
  );
  expect(response.status).toBe(200);
  return (await response.json()) as ModelResponse;
}

async function cacheEntries(dataDir: string): Promise<string[]> {
  const versionDir = join(dataDir, "cache", ANALYZER_VERSION);
  const entries = await readdir(versionDir).catch(() => []);
  return entries.filter((entry) => entry.endsWith(".json"));
}

describe("integración de extremo a extremo sobre repositorios fixture", () => {
  it("importa un repo OO, navega el histórico y detecta renombrados usando cache", async () => {
    const { app, dataDir, projectId, commits } = await setup("oo");

    const listed = await listCommits(app, projectId);
    expect(listed.commits.map((commit) => commit.sha)).toEqual(commits.map((c) => c.sha));
    expect(listed.commits.map((commit) => commit.subject)).toEqual(commits.map((c) => c.subject));
    expect(listed.commits.map((commit) => commit.shortSha)).toEqual(
      commits.map((c) => c.sha.slice(0, 7))
    );

    const baseline = await model(app, projectId, commits[0]!.sha);
    expect(baseline.diff.isEmpty).toBe(true);
    expect(baseline.diff.from).toBeNull();
    const baselineDeclarations = baseline.snapshot.files.flatMap((file) => file.declarations);
    const dog = baselineDeclarations.find((declaration) => declaration.name === "Dog");
    expect(dog?.kind).toBe("class");

    const renamed = await model(app, projectId, commits[2]!.sha);
    expect(renamed.diff.isEmpty).toBe(false);
    expect(renamed.diff.from).toBe(commits[1]!.sha);
    const movedFile = renamed.diff.files.find(
      (file) => file.path === "src/domain/creature.ts"
    );
    expect(movedFile).toMatchObject({
      status: "renamed",
      previousPath: "src/domain/animal.ts",
      probable: false
    });
    const renamedDeclarations = renamed.snapshot.files.flatMap((file) => file.declarations);
    const dogNow = renamedDeclarations.find((declaration) => declaration.name === "Dog");
    expect(dogNow?.path).toBe("src/domain/creature.ts");
    expect(
      renamed.diff.members.some(
        (member) => member.parentName === "Dog" && member.memberKey === "method:speak" && member.status === "body-only"
      )
    ).toBe(true);

    const cached = await cacheEntries(dataDir);
    expect(cached.length).toBeGreaterThan(0);

    const again = await model(app, projectId, commits[2]!.sha);
    expect(again.diff).toEqual(renamed.diff);
    expect(await cacheEntries(dataDir)).toEqual(cached);
  });

  it("cubre escenarios funcional, monorepo con alias y archivo roto", async () => {
    const functional = await setup("functional");
    const functionalCommits = await listCommits(functional.app, functional.projectId);
    const formatOnly = await model(
      functional.app,
      functional.projectId,
      functionalCommits.commits[2]!.sha
    );
    expect(formatOnly.diff.isEmpty).toBe(true);
    expect(formatOnly.diagnostics).toEqual([]);

    const monorepo = await setup("monorepo");
    const monorepoCommits = await listCommits(monorepo.app, monorepo.projectId);
    const monorepoModel = await model(
      monorepo.app,
      monorepo.projectId,
      monorepoCommits.commits[0]!.sha
    );
    expect(
      monorepoModel.snapshot.edges.some(
        (edge) =>
          edge.kind === "imports" &&
          edge.to === "module:packages/core/src/index.ts" &&
          edge.from === "module:packages/app/src/main.ts"
      )
    ).toBe(true);

    const broken = await setup("broken");
    const brokenCommits = await listCommits(broken.app, broken.projectId);
    const withError = await model(broken.app, broken.projectId, brokenCommits.commits[1]!.sha);
    expect(
      withError.diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === "error" && diagnostic.path === "src/broken.ts"
      )
    ).toBe(true);

    const fixed = await model(broken.app, broken.projectId, brokenCommits.commits[2]!.sha);
    expect(
      fixed.diagnostics.some(
        (diagnostic) => diagnostic.severity === "error" && diagnostic.path === "src/broken.ts"
      )
    ).toBe(false);
    expect(fixed.diff.files.some((file) => file.path === "src/broken.ts")).toBe(true);
  });
});

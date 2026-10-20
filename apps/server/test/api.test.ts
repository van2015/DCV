import {
  ANALYZER_VERSION,
  type CommitListResponse,
  type ImportProgressEvent,
  type ModelResponse
} from "@dcv/shared";
import { afterEach, describe, expect, it } from "vitest";
import { AnalysisService } from "../src/analysis/service.js";
import { FileModelCache } from "../src/analysis/cache.js";
import { InProcessAnalyzer } from "../src/analysis/in-process-executor.js";
import { SnapshotBuilder } from "../src/analysis/snapshot-builder.js";
import { createApp } from "../src/app.js";
import { EventBus } from "../src/events.js";
import { ProjectService } from "../src/projects/service.js";
import {
  createFixtureRepo,
  makeTempDir,
  removeTempDirs
} from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

async function setup() {
  const dataDir = await makeTempDir("dcv-api-data-");
  const repo = await createFixtureRepo(await makeTempDir("dcv-api-repo-"));
  tempDirs.push(dataDir, repo);

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
  return { app, service, bus, repo };
}

async function importFixture(app: ReturnType<typeof createApp>, repo: string) {
  const response = await app.request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "local", location: repo })
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { project: { id: string } };
}

describe("API de proyectos e histórico", () => {
  it("gestiona el ciclo de vida de un proyecto local", async () => {
    const { app, repo } = await setup();

    const empty = await app.request("/api/projects");
    expect(await empty.json()).toEqual([]);

    const imported = await importFixture(app, repo);
    const projectId = imported.project.id;

    const list = await app.request("/api/projects");
    expect(await list.json()).toHaveLength(1);

    const duplicate = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "local", location: repo })
    });
    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as { error: { code: string } }).error.code).toBe(
      "project_exists"
    );

    const branches = await app.request(`/api/projects/${projectId}/branches`);
    expect((await branches.json()) as { branches: string[] }).toMatchObject({
      branches: expect.arrayContaining(["main"])
    });

    const patched = await app.request(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lastCommit: null })
    });
    expect(patched.status).toBe(200);

    const invalidBranch = await app.request(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branch: "no-existe" })
    });
    expect(invalidBranch.status).toBe(404);
    expect(((await invalidBranch.json()) as { error: { code: string } }).error.code).toBe(
      "branch_not_found"
    );

    const refresh = await app.request(`/api/projects/${projectId}/refresh`, { method: "POST" });
    expect(refresh.status).toBe(200);

    const removed = await app.request(`/api/projects/${projectId}`, { method: "DELETE" });
    expect(removed.status).toBe(204);
    expect(await (await app.request("/api/projects")).json()).toEqual([]);
  });

  it("enumera commits del más antiguo a la punta", async () => {
    const { app, repo } = await setup();
    const { project } = await importFixture(app, repo);

    const response = await app.request(`/api/projects/${project.id}/commits`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as CommitListResponse;

    expect(body.branch).toBe("main");
    expect(body.commits).toHaveLength(3);
    expect(body.commits[0]!.subject).toBe("feat: modelo de usuario");
    expect(body.commits.at(-1)!.subject).toBe("docs: readme");
    expect(body.commits[1]!.parents[0]).toBe(body.commits[0]!.sha);
  });

  it("devuelve modelo, diff y diagnósticos por commit", async () => {
    const { app, repo } = await setup();
    const { project } = await importFixture(app, repo);
    const commits = (await (
      await app.request(`/api/projects/${project.id}/commits`)
    ).json()) as CommitListResponse;

    const first = await app.request(
      `/api/projects/${project.id}/commits/${commits.commits[0]!.sha}/model`
    );
    expect(first.status).toBe(200);
    const firstModel = (await first.json()) as ModelResponse;
    expect(firstModel.commit.subject).toBe("feat: modelo de usuario");
    expect(firstModel.snapshot.stats.classes).toBe(1);
    expect(firstModel.snapshot.stats.interfaces).toBe(1);
    expect(firstModel.diff.isEmpty).toBe(true);
    expect(firstModel.diff.from).toBeNull();
    expect(firstModel.warnings).toEqual([]);

    const second = await app.request(
      `/api/projects/${project.id}/commits/${commits.commits[1]!.sha}/model`
    );
    const secondModel = (await second.json()) as ModelResponse;
    expect(secondModel.diff.isEmpty).toBe(false);
    expect(secondModel.diff.from).toBe(commits.commits[0]!.sha);
    expect(secondModel.diff.declarations.some((change) => change.status === "added")).toBe(
      true
    );

    const head = await app.request(
      `/api/projects/${project.id}/commits/${commits.commits[2]!.sha}/model`
    );
    const headModel = (await head.json()) as ModelResponse;
    expect(headModel.commit.subject).toBe("docs: readme");
    expect(headModel.diff.isEmpty).toBe(true);

    const projectAfter = (await (
      await app.request(`/api/projects/${project.id}`)
    ).json()) as { lastCommit: string | null };
    expect(projectAfter.lastCommit).toBe(commits.commits[2]!.sha);
  });

  it("devuelve errores con envelope para proyectos o commits inválidos", async () => {
    const { app } = await setup();

    const missing = await app.request("/api/projects/inexistente/commits");
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      "project_not_found"
    );

    const badBody = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ no json"
    });
    expect(badBody.status).toBe(400);
    expect(((await badBody.json()) as { error: { code: string } }).error.code).toBe(
      "invalid_request"
    );

    const badSource = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "ftp", location: "x" })
    });
    expect(badSource.status).toBe(400);

    const repo = await createFixtureRepo(await makeTempDir("dcv-api-repo-"));
    tempDirs.push(repo);
    const { project } = await importFixture(app, repo);

    const badSha = await app.request(`/api/projects/${project.id}/commits/zzzz/model`);
    expect(badSha.status).toBeGreaterThanOrEqual(400);
    expect(((await badSha.json()) as { error: { code: string } }).error.code).toBeTruthy();
  });

  it("publica eventos de importación y análisis por el bus", async () => {
    const { app, repo, bus } = await setup();
    const events: ImportProgressEvent[] = [];
    bus.subscribe((event) => events.push(event));

    const { project } = await importFixture(app, repo);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["import:start", "import:done"])
    );
    expect(events.find((event) => event.type === "import:done")?.projectId).toBe(project.id);

    const commits = (await (
      await app.request(`/api/projects/${project.id}/commits`)
    ).json()) as CommitListResponse;
    await app.request(`/api/projects/${project.id}/commits/${commits.commits[0]!.sha}/model`);

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["analysis:start", "analysis:progress", "analysis:done"])
    );
  });

  it("emite eventos SSE globales y filtrados por proyecto", async () => {
    const { app, bus } = await setup();

    const global = await app.request("/api/events");
    expect(global.status).toBe(200);
    const globalRead = readFirstChunk(global);
    await delay(20);
    bus.publish({
      type: "import:progress",
      projectId: null,
      message: "Clonando…",
      progress: 0.5
    });
    const globalChunk = await globalRead;
    expect(globalChunk).toContain("event: import:progress");
    expect(globalChunk).toContain('"progress":0.5');

    const scoped = await app.request("/api/projects/p1/events");
    const scopedRead = readFirstChunk(scoped);
    await delay(20);
    bus.publish({
      type: "analysis:start",
      projectId: "p2",
      message: "otro",
      progress: null
    });
    bus.publish({
      type: "analysis:start",
      projectId: "p1",
      message: "propio",
      progress: null
    });
    const scopedChunk = await scopedRead;
    expect(scopedChunk).toContain('"projectId":"p1"');
    expect(scopedChunk).not.toContain('"projectId":"p2"');
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readFirstChunk(response: Response, timeoutMs = 3000): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const timer = setTimeout(() => {
    void reader.cancel().catch(() => undefined);
  }, timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes("data:")) {
        break;
      }
    }
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
  return buffer;
}

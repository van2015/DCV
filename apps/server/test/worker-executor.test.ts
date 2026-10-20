import type { Snapshot } from "@dcv/shared";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { WorkerAnalyzer } from "../src/analysis/worker-executor.js";
import { makeTempDir, removeTempDirs } from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

const WORKER_SOURCE = `
import { parentPort } from "node:worker_threads";

parentPort.on("message", (message) => {
  if (message.type !== "analyze") return;
  const { id, commit } = message;
  if (commit === "boom") {
    parentPort.postMessage({ id, type: "error", error: { code: "blob_missing", message: "sin blob" } });
    return;
  }
  if (commit === "never") return;
  parentPort.postMessage({ id, type: "progress", parsed: 1, total: 2 });
  parentPort.postMessage({
    id,
    type: "result",
    snapshot: { commit, branch: "main", analyzerVersion: "1.0.0", files: [], edges: [], diagnostics: [], stats: { files: 0, declarations: 0, classes: 0, interfaces: 0, enums: 0, types: 0, functions: 0, edges: 0 } }
  });
});
`;

async function createAnalyzer(): Promise<WorkerAnalyzer> {
  const directory = await makeTempDir("dcv-worker-");
  tempDirs.push(directory);
  const workerPath = join(directory, "fake-worker.mjs");
  await writeFile(workerPath, WORKER_SOURCE, "utf8");
  return new WorkerAnalyzer(
    { repoPath: directory, branch: "main", analyzerVersion: "1.0.0", dataDir: directory },
    pathToFileURL(workerPath)
  );
}

describe("WorkerAnalyzer", () => {
  it("resuelve snapshots y emite progreso", async () => {
    const analyzer = await createAnalyzer();
    const progress: [number, number][] = [];

    const snapshot: Snapshot = await analyzer.analyze("c1", {
      onProgress: (parsed, total) => progress.push([parsed, total])
    });

    expect(snapshot.commit).toBe("c1");
    expect(progress).toEqual([[1, 2]]);
    await analyzer.dispose();
  });

  it("propaga los errores reportados por el worker", async () => {
    const analyzer = await createAnalyzer();

    await expect(analyzer.analyze("boom")).rejects.toMatchObject({
      code: "blob_missing",
      message: "sin blob"
    });
    await analyzer.dispose();
  });

  it("rechaza los trabajos pendientes al cancelar", async () => {
    const analyzer = await createAnalyzer();
    const controller = new AbortController();

    const promise = analyzer.analyze("never", { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ code: "analysis_cancelled" });
    await analyzer.dispose();
  });

  it("rechaza y cierra al liberar el worker", async () => {
    const analyzer = await createAnalyzer();
    const pending = analyzer.analyze("never");
    const rejection = expect(pending).rejects.toMatchObject({ code: "analysis_cancelled" });

    await analyzer.dispose();
    await rejection;

    await expect(analyzer.analyze("c1")).rejects.toMatchObject({
      code: "analysis_cancelled"
    });
  });
});

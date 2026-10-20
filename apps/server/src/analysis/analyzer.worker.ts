import { ANALYZER_VERSION } from "@dcv/shared";
import { parentPort, workerData } from "node:worker_threads";
import { AppError } from "../errors.js";
import { FileModelCache } from "./cache.js";
import { SnapshotBuilder } from "./snapshot-builder.js";

interface WorkerContext {
  repoPath: string;
  branch: string;
  analyzerVersion?: string;
  dataDir: string;
}

const context = workerData as WorkerContext;
const analyzerVersion = context.analyzerVersion ?? ANALYZER_VERSION;
const builder = new SnapshotBuilder({
  repoPath: context.repoPath,
  branch: context.branch,
  analyzerVersion,
  cache: new FileModelCache(context.dataDir, analyzerVersion)
});

parentPort?.on("message", (message: { type?: string; id?: number; commit?: string }) => {
  if (message.type !== "analyze" || typeof message.id !== "number" || !message.commit) {
    return;
  }
  const { id, commit } = message;
  void builder
    .build(commit, {
      onProgress: (parsed, total) => {
        parentPort?.postMessage({ id, type: "progress", parsed, total });
      }
    })
    .then((snapshot) => {
      parentPort?.postMessage({ id, type: "result", snapshot });
    })
    .catch((error: unknown) => {
      parentPort?.postMessage({
        id,
        type: "error",
        error: {
          code: error instanceof AppError ? error.code : "analysis_failed",
          message: error instanceof Error ? error.message : "El análisis falló."
        }
      });
    });
});

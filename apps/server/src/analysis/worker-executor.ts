import type { Snapshot } from "@dcv/shared";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { AppError } from "../errors.js";
import type { AnalyzeOptions, ProjectAnalyzer } from "./queue.js";

interface WorkerMessage {
  id?: number;
  type?: "result" | "progress" | "error";
  snapshot?: Snapshot;
  parsed?: number;
  total?: number;
  error?: { code: string; message: string };
}

interface PendingRequest {
  resolve: (snapshot: Snapshot) => void;
  reject: (error: unknown) => void;
  onProgress?: (parsed: number, total: number) => void;
  onAbort?: () => void;
  signal?: AbortSignal;
}

export interface WorkerAnalyzerContext {
  repoPath: string;
  branch: string;
  analyzerVersion: string;
  dataDir: string;
}

export class WorkerAnalyzer implements ProjectAnalyzer {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private closed = false;

  constructor(
    context: WorkerAnalyzerContext,
    workerUrl: URL = defaultWorkerUrl()
  ) {
    this.worker = new Worker(workerUrl, { workerData: context });
    this.worker.on("message", (message: WorkerMessage) => this.onMessage(message));
    this.worker.on("error", (error) => this.failAll(error));
    this.worker.on("exit", (code) => {
      if (!this.closed && code !== 0) {
        this.failAll(new AppError("analysis_failed", `El worker terminó con código ${code}.`, 500));
      }
    });
  }

  analyze(commit: string, options: AnalyzeOptions = {}): Promise<Snapshot> {
    if (this.closed) {
      return Promise.reject(new AppError("analysis_cancelled", "El análisis fue cancelado.", 409));
    }

    const id = this.nextId++;
    return new Promise<Snapshot>((resolve, reject) => {
      const request: PendingRequest = {
        resolve,
        reject,
        onProgress: options.onProgress,
        signal: options.signal
      };

      if (options.signal) {
        const onAbort = () => {
          const pending = this.pending.get(id);
          if (pending) {
            this.pending.delete(id);
            pending.reject(new AppError("analysis_cancelled", "El análisis fue cancelado.", 409));
          }
        };
        request.onAbort = onAbort;
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      this.pending.set(id, request);
      this.worker.postMessage({ type: "analyze", id, commit });
    });
  }

  async dispose(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.failAll(new AppError("analysis_cancelled", "El análisis fue cancelado.", 409));
    await this.worker.terminate();
  }

  private onMessage(message: WorkerMessage): void {
    if (typeof message.id !== "number") {
      return;
    }
    const request = this.pending.get(message.id);
    if (!request) {
      return;
    }

    if (message.type === "progress") {
      request.onProgress?.(message.parsed ?? 0, message.total ?? 0);
      return;
    }

    this.pending.delete(message.id);
    this.detachAbort(request);

    if (message.type === "result" && message.snapshot) {
      request.resolve(message.snapshot);
      return;
    }

    request.reject(
      new AppError(
        message.error?.code ?? "analysis_failed",
        message.error?.message ?? "El análisis falló.",
        500
      )
    );
  }

  private detachAbort(request: PendingRequest): void {
    if (request.signal && request.onAbort) {
      request.signal.removeEventListener("abort", request.onAbort);
    }
  }

  private failAll(error: unknown): void {
    for (const [id, request] of this.pending) {
      this.pending.delete(id);
      this.detachAbort(request);
      request.reject(error);
    }
  }
}

function defaultWorkerUrl(): URL {
  const candidates = [
    new URL("./analysis/analyzer.worker.js", import.meta.url),
    new URL("./analyzer.worker.ts", import.meta.url),
    new URL("./analyzer.worker.js", import.meta.url)
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(fileURLToPath(candidate))) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return candidates[0]!;
}

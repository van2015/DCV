import type { ImportProgressEvent, Snapshot } from "@dcv/shared";
import type { EventBus } from "../events.js";
import { AnalysisQueue, type ProjectAnalyzer } from "./queue.js";
import { SnapshotStore } from "./snapshot-store.js";
import { WorkerAnalyzer, type WorkerAnalyzerContext } from "./worker-executor.js";

export interface AnalysisServiceOptions {
  dataDir: string;
  analyzerVersion: string;
  bus?: EventBus;
  createAnalyzer?: (context: WorkerAnalyzerContext) => ProjectAnalyzer;
  maxSnapshotsPerProject?: number;
}

export interface AnalysisTarget {
  projectId: string;
  repoPath: string;
  branch: string;
}

export class AnalysisService {
  private readonly dataDir: string;
  private readonly analyzerVersion: string;
  private readonly bus: EventBus | undefined;
  private readonly createAnalyzer: (context: WorkerAnalyzerContext) => ProjectAnalyzer;
  private readonly maxSnapshotsPerProject: number;
  private readonly queue: AnalysisQueue;
  private readonly stores = new Map<string, SnapshotStore>();
  private readonly analyzers = new Map<string, ProjectAnalyzer>();

  constructor(options: AnalysisServiceOptions) {
    this.dataDir = options.dataDir;
    this.analyzerVersion = options.analyzerVersion;
    this.bus = options.bus;
    this.createAnalyzer =
      options.createAnalyzer ?? ((context) => new WorkerAnalyzer(context));
    this.maxSnapshotsPerProject = options.maxSnapshotsPerProject ?? 50;
    this.queue = new AnalysisQueue((queueKey) => this.requireAnalyzer(queueKey));
  }

  async snapshot(target: AnalysisTarget, commit: string): Promise<Snapshot> {
    const store = this.storeFor(target);
    return store.get(commit);
  }

  prefetch(target: AnalysisTarget, commits: string[]): void {
    this.analyzerFor(target);
    const store = this.storeFor(target);
    for (const commit of commits) {
      void this.queue
        .enqueue(targetKey(target), commit, { prefetch: true })
        .then((snapshot) => store.put(commit, snapshot))
        .catch(() => undefined);
    }
  }

  cancel(projectId: string): void {
    this.queue.cancelPrefix(`${projectId}:`);
    for (const [key, analyzer] of [...this.analyzers]) {
      if (key.startsWith(`${projectId}:`)) {
        void analyzer.dispose?.();
        this.analyzers.delete(key);
      }
    }
  }

  async disposeAll(): Promise<void> {
    for (const analyzer of this.analyzers.values()) {
      await analyzer.dispose?.();
    }
    this.analyzers.clear();
    this.stores.clear();
  }

  private storeFor(target: AnalysisTarget): SnapshotStore {
    const key = targetKey(target);
    let store = this.stores.get(key);
    if (!store) {
      store = new SnapshotStore(
        { build: (commit) => this.build(target, commit) },
        key,
        this.maxSnapshotsPerProject
      );
      this.stores.set(key, store);
    }
    return store;
  }

  private requireAnalyzer(queueKey: string): ProjectAnalyzer {
    const analyzer = this.analyzers.get(queueKey);
    if (!analyzer) {
      throw new Error(`No hay analizador registrado para ${queueKey}.`);
    }
    return analyzer;
  }

  private analyzerFor(target: AnalysisTarget): ProjectAnalyzer {
    const key = targetKey(target);
    let analyzer = this.analyzers.get(key);
    if (!analyzer) {
      analyzer = this.createAnalyzer({
        repoPath: target.repoPath,
        branch: target.branch,
        analyzerVersion: this.analyzerVersion,
        dataDir: this.dataDir
      });
      this.analyzers.set(key, analyzer);
    }
    return analyzer;
  }

  private build(target: AnalysisTarget, commit: string): Promise<Snapshot> {
    this.analyzerFor(target);
    this.publish({
      type: "analysis:start",
      projectId: target.projectId,
      message: `Analizando ${commit.slice(0, 7)}…`,
      progress: null
    });

    return this.queue
      .enqueue(targetKey(target), commit, {
        onProgress: (parsed, total) => {
          this.publish({
            type: "analysis:progress",
            projectId: target.projectId,
            message: `Analizando ${commit.slice(0, 7)}…`,
            progress: total > 0 ? parsed / total : 0
          });
        }
      })
      .then((snapshot) => {
        this.publish({
          type: "analysis:done",
          projectId: target.projectId,
          message: `Análisis de ${commit.slice(0, 7)} completado.`,
          progress: 1
        });
        return snapshot;
      })
      .catch((error: unknown) => {
        this.publish({
          type: "analysis:error",
          projectId: target.projectId,
          message: error instanceof Error ? error.message : "El análisis falló.",
          progress: null,
          error: {
            code: errorCode(error),
            message: error instanceof Error ? error.message : "El análisis falló."
          }
        });
        throw error;
      });
  }

  private publish(event: ImportProgressEvent): void {
    this.bus?.publish(event);
  }
}

function targetKey(target: AnalysisTarget): string {
  return `${target.projectId}:${target.branch}`;
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }
  return "analysis_failed";
}

import type { Snapshot } from "@dcv/shared";
import { AppError } from "../errors.js";

export interface AnalyzeOptions {
  signal?: AbortSignal;
  onProgress?: (parsed: number, total: number) => void;
}

export interface ProjectAnalyzer {
  analyze(commit: string, options?: AnalyzeOptions): Promise<Snapshot>;
  dispose?(): void | Promise<void>;
}

export interface EnqueueOptions {
  prefetch?: boolean;
  onStart?: () => void;
  onProgress?: (parsed: number, total: number) => void;
}

interface Job {
  commit: string;
  prefetch: boolean;
  onStart?: () => void;
  onProgress?: (parsed: number, total: number) => void;
  resolve: (snapshot: Snapshot) => void;
  reject: (error: unknown) => void;
  promise: Promise<Snapshot>;
}

interface ProjectState {
  pending: Job[];
  running: Job | null;
  controller: AbortController | null;
  byCommit: Map<string, Job>;
}

export class AnalysisQueue {
  private readonly states = new Map<string, ProjectState>();

  constructor(private readonly analyzerFor: (projectId: string) => ProjectAnalyzer) {}

  enqueue(projectId: string, commit: string, options: EnqueueOptions = {}): Promise<Snapshot> {
    const state = this.stateFor(projectId);
    const existing = state.byCommit.get(commit);
    if (existing) {
      return existing.promise;
    }

    let resolve!: (snapshot: Snapshot) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Snapshot>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: Job = {
      commit,
      prefetch: options.prefetch ?? false,
      onStart: options.onStart,
      onProgress: options.onProgress,
      resolve,
      reject,
      promise
    };

    state.byCommit.set(commit, job);
    state.pending.push(job);

    const cleanup = () => {
      if (state.byCommit.get(commit) === job && state.running !== job) {
        state.byCommit.delete(commit);
      }
    };
    promise.then(cleanup, cleanup);

    this.pump(projectId);
    return promise;
  }

  pendingCount(projectId: string): number {
    const state = this.states.get(projectId);
    return state ? state.pending.length + (state.running ? 1 : 0) : 0;
  }

  isRunning(projectId: string): boolean {
    const state = this.states.get(projectId);
    return state ? state.running !== null : false;
  }

  cancelProject(projectId: string): void {
    const state = this.states.get(projectId);
    if (!state) {
      return;
    }
    const cancelled = new AppError("analysis_cancelled", "El análisis fue cancelado.", 409);
    for (const job of state.pending.splice(0)) {
      job.reject(cancelled);
    }
    state.controller?.abort();
  }

  cancelPrefix(prefix: string): void {
    for (const key of [...this.states.keys()]) {
      if (key.startsWith(prefix)) {
        this.cancelProject(key);
      }
    }
  }

  private stateFor(projectId: string): ProjectState {
    let state = this.states.get(projectId);
    if (!state) {
      state = { pending: [], running: null, controller: null, byCommit: new Map() };
      this.states.set(projectId, state);
    }
    return state;
  }

  private pump(projectId: string): void {
    const state = this.stateFor(projectId);
    if (state.running || state.pending.length === 0) {
      return;
    }

    const job = state.pending.shift()!;
    state.running = job;
    state.controller = new AbortController();

    job.onStart?.();

    const finish = () => {
      if (state.byCommit.get(job.commit) === job) {
        state.byCommit.delete(job.commit);
      }
      if (state.running === job) {
        state.running = null;
        state.controller = null;
      }
      this.pump(projectId);
    };

    let result: Promise<Snapshot>;
    try {
      result = this.analyzerFor(projectId).analyze(job.commit, {
        signal: state.controller.signal,
        onProgress: (parsed, total) => {
          if (state.running === job) {
            job.onProgress?.(parsed, total);
          }
        }
      });
    } catch (error) {
      job.reject(error);
      finish();
      return;
    }

    result.then(
      (snapshot) => {
        finish();
        job.resolve(snapshot);
      },
      (error: unknown) => {
        finish();
        job.reject(normalizeError(error));
      }
    );
  }
}

function normalizeError(error: unknown): unknown {
  if (error instanceof Error && error.name === "AbortError") {
    return new AppError("analysis_cancelled", "El análisis fue cancelado.", 409);
  }
  return error;
}

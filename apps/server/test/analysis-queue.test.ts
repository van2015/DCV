import type { Snapshot } from "@dcv/shared";
import { describe, expect, it } from "vitest";
import { AnalysisQueue, type AnalyzeOptions, type ProjectAnalyzer } from "../src/analysis/queue.js";

function snapshot(commit: string): Snapshot {
  return {
    commit,
    branch: "main",
    analyzerVersion: "1.0.0",
    files: [],
    edges: [],
    diagnostics: [],
    stats: {
      files: 0,
      declarations: 0,
      classes: 0,
      interfaces: 0,
      enums: 0,
      types: 0,
      functions: 0,
      edges: 0
    }
  };
}

class FakeAnalyzer implements ProjectAnalyzer {
  readonly calls: string[] = [];
  concurrency = 0;
  peakConcurrency = 0;
  private readonly releases = new Map<string, () => void>();

  analyze(commit: string, options: AnalyzeOptions = {}): Promise<Snapshot> {
    this.calls.push(commit);
    this.concurrency += 1;
    this.peakConcurrency = Math.max(this.peakConcurrency, this.concurrency);
    options.onProgress?.(0, 1);
    return new Promise<Snapshot>((resolve, reject) => {
      const finish = () => {
        this.concurrency -= 1;
      };
      options.signal?.addEventListener("abort", () => {
        finish();
        const error = new Error("Aborted");
        error.name = "AbortError";
        reject(error);
      });
      this.releases.set(commit, () => {
        finish();
        options.onProgress?.(1, 1);
        resolve(snapshot(commit));
      });
    });
  }

  release(commit: string): void {
    this.releases.get(commit)?.();
    this.releases.delete(commit);
  }
}

describe("AnalysisQueue", () => {
  it("coalescea peticiones del mismo commit", async () => {
    const analyzer = new FakeAnalyzer();
    const queue = new AnalysisQueue(() => analyzer);

    const first = queue.enqueue("p1", "c1");
    const second = queue.enqueue("p1", "c1");

    expect(first).toBe(second);
    expect(analyzer.calls).toEqual(["c1"]);

    analyzer.release("c1");
    await expect(first).resolves.toMatchObject({ commit: "c1" });
  });

  it("serializa los trabajos de un proyecto sin duplicar análisis", async () => {
    const analyzer = new FakeAnalyzer();
    const queue = new AnalysisQueue(() => analyzer);

    const first = queue.enqueue("p1", "c1");
    const second = queue.enqueue("p1", "c2");
    const duplicate = queue.enqueue("p1", "c2");

    expect(analyzer.calls).toEqual(["c1"]);
    expect(duplicate).toBe(second);
    expect(queue.pendingCount("p1")).toBe(2);
    expect(queue.isRunning("p1")).toBe(true);
    expect(queue.isRunning("p2")).toBe(false);

    analyzer.release("c1");
    await first;
    expect(analyzer.calls).toEqual(["c1", "c2"]);

    analyzer.release("c2");
    await second;
    expect(analyzer.peakConcurrency).toBe(1);
    expect(queue.pendingCount("p1")).toBe(0);
  });

  it("propaga el progreso de cada trabajo", async () => {
    const analyzer = new FakeAnalyzer();
    const queue = new AnalysisQueue(() => analyzer);
    const progress: number[] = [];

    const promise = queue.enqueue("p1", "c1", {
      onProgress: (parsed, total) => progress.push(parsed / total)
    });
    analyzer.release("c1");
    await promise;

    expect(progress).toEqual([0, 1]);
  });

  it("cancela el trabajo en curso y los pendientes del proyecto", async () => {
    const analyzer = new FakeAnalyzer();
    const queue = new AnalysisQueue(() => analyzer);

    const running = queue.enqueue("p1", "c1");
    const pending = queue.enqueue("p1", "c2");

    queue.cancelProject("p1");

    await expect(running).rejects.toMatchObject({ code: "analysis_cancelled" });
    await expect(pending).rejects.toMatchObject({ code: "analysis_cancelled" });
    expect(queue.pendingCount("p1")).toBe(0);
  });

  it("permite reencolar tras cancelar", async () => {
    const analyzer = new FakeAnalyzer();
    const queue = new AnalysisQueue(() => analyzer);

    const running = queue.enqueue("p1", "c1");
    queue.cancelProject("p1");
    await expect(running).rejects.toMatchObject({ code: "analysis_cancelled" });

    const retry = queue.enqueue("p1", "c1");
    analyzer.release("c1");
    await expect(retry).resolves.toMatchObject({ commit: "c1" });
  });
});

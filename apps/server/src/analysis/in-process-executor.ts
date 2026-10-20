import type { Snapshot } from "@dcv/shared";
import type { SnapshotBuilder } from "./snapshot-builder.js";
import type { AnalyzeOptions, ProjectAnalyzer } from "./queue.js";

export class InProcessAnalyzer implements ProjectAnalyzer {
  constructor(
    private readonly builder: SnapshotBuilder,
    private readonly disposeHook?: () => void
  ) {}

  async analyze(commit: string, options: AnalyzeOptions = {}): Promise<Snapshot> {
    return this.builder.build(commit, {
      signal: options.signal,
      onProgress: options.onProgress
    });
  }

  dispose(): void {
    this.disposeHook?.();
  }
}

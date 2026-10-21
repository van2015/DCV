import { diffSnapshots } from "@dcv/analyzer";
import type { CommitInfo, HeatmapResponse, Snapshot } from "@dcv/shared";
import { AppError } from "../errors.js";
import { diffTrees, type GitFileDiff } from "../git/diff.js";
import { listCommits } from "../git/history.js";
import {
  aggregateHeatmap,
  heatmapDelta,
  heatmapEntityCounts,
  type HeatmapDelta
} from "./heatmap.js";
import type { AnalysisTarget } from "./service.js";

export interface SnapshotSource {
  snapshot(target: AnalysisTarget, commit: string): Promise<Snapshot>;
}

export type CommitsLoader = (repoPath: string, branch: string) => Promise<CommitInfo[]>;
export type TreeDiffer = (
  repoPath: string,
  parentSha: string | null,
  commitSha: string
) => Promise<GitFileDiff[]>;

export interface HeatmapServiceOptions {
  commits?: CommitsLoader;
  diffTrees?: TreeDiffer;
}

export class HeatmapService {
  private readonly caches = new Map<string, Map<string, HeatmapDelta>>();
  private readonly commits: CommitsLoader;
  private readonly differ: TreeDiffer;

  constructor(
    private readonly snapshots: SnapshotSource,
    options: HeatmapServiceOptions = {}
  ) {
    this.commits = options.commits ?? listCommits;
    this.differ = options.diffTrees ?? diffTrees;
  }

  async get(target: AnalysisTarget, sha: string): Promise<HeatmapResponse> {
    const commits = await this.commits(target.repoPath, target.branch);
    const index = commits.findIndex((commit) => commit.sha === sha);
    if (index === -1) {
      throw new AppError(
        "commit_not_found",
        "El commit no pertenece al histórico de la rama.",
        404,
        { sha, branch: target.branch }
      );
    }

    const cache = this.cacheFor(target);
    for (let position = 1; position <= index; position += 1) {
      const commit = commits[position]!;
      if (cache.has(commit.sha)) {
        continue;
      }
      const parent = commits[position - 1]!;
      const [previous, current, fileChanges] = await Promise.all([
        this.snapshots.snapshot(target, parent.sha),
        this.snapshots.snapshot(target, commit.sha),
        this.differ(target.repoPath, parent.sha, commit.sha)
      ]);
      const fileRenames = new Map<string, string>();
      for (const change of fileChanges) {
        if (change.status === "renamed" && change.previousPath) {
          fileRenames.set(change.previousPath, change.path);
        }
      }
      const diff = diffSnapshots(previous, current, { fileRenames });
      cache.set(commit.sha, heatmapDelta(commit.sha, diff));
    }

    const deltas: HeatmapDelta[] = [];
    for (const commit of commits.slice(1, index + 1)) {
      const cached = cache.get(commit.sha);
      if (cached) {
        deltas.push(cached);
      }
    }
    const counts = aggregateHeatmap(deltas);
    const snapshot = await this.snapshots.snapshot(target, sha);
    const { nodes, members } = heatmapEntityCounts(counts, snapshot);

    return {
      branch: target.branch,
      commit: sha,
      commits: index + 1,
      nodes,
      members
    };
  }

  private cacheFor(target: AnalysisTarget): Map<string, HeatmapDelta> {
    const key = `${target.projectId}:${target.branch}`;
    let cache = this.caches.get(key);
    if (!cache) {
      cache = new Map();
      this.caches.set(key, cache);
    }
    return cache;
  }
}

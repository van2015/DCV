import {
  assembleSnapshot,
  isAnalyzableSourcePath,
  parseFile,
  type ParseFileInput
} from "@dcv/analyzer";
import type { FileModel, Snapshot } from "@dcv/shared";
import { readBlobs, readTree, type TreeEntry } from "../git/tree.js";
import type { FileModelCache } from "./cache.js";

export type ParseFileFunction = (input: ParseFileInput) => FileModel;

export interface BuildHooks {
  signal?: AbortSignal;
  onProgress?: (parsed: number, total: number) => void;
}

export interface SnapshotBuilderOptions {
  repoPath: string;
  branch: string;
  analyzerVersion: string;
  cache: FileModelCache;
  parse?: ParseFileFunction;
}

export class SnapshotBuilder {
  private readonly repoPath: string;
  private readonly branch: string;
  private readonly analyzerVersion: string;
  private readonly cache: FileModelCache;
  private readonly parse: ParseFileFunction;

  constructor(options: SnapshotBuilderOptions) {
    this.repoPath = options.repoPath;
    this.branch = options.branch;
    this.analyzerVersion = options.analyzerVersion;
    this.cache = options.cache;
    this.parse = options.parse ?? parseFile;
  }

  async build(commit: string, hooks: BuildHooks = {}): Promise<Snapshot> {
    const tree = await readTree(this.repoPath, commit);
    const analyzable = [...tree.values()].filter((entry) =>
      isAnalyzableSourcePath(entry.path)
    );
    const configEntries = [...tree.values()].filter((entry) => isTsConfigPath(entry.path));

    const models = new Map<string, FileModel>();
    const missing: TreeEntry[] = [];
    let processed = 0;

    for (const entry of analyzable) {
      hooks.signal?.throwIfAborted();
      const cached = await this.cache.get(entry.sha);
      if (cached) {
        models.set(entry.path, cached);
        processed += 1;
      } else {
        missing.push(entry);
      }
    }
    hooks.onProgress?.(processed, analyzable.length);

    const shasToRead = new Set<string>([
      ...missing.map((entry) => entry.sha),
      ...configEntries.map((entry) => entry.sha)
    ]);
    const blobs = await readBlobs(this.repoPath, shasToRead);

    for (const entry of missing) {
      hooks.signal?.throwIfAborted();
      const content = blobs.get(entry.sha);
      if (content === undefined) {
        continue;
      }
      const model = await this.cache.getOrParse(entry.sha, () =>
        this.parse({
          path: entry.path,
          content,
          contentHash: entry.sha,
          scriptKind: entry.path.endsWith(".tsx") ? "tsx" : "ts"
        })
      );
      models.set(entry.path, model);
      processed += 1;
      hooks.onProgress?.(processed, analyzable.length);
    }

    const readText = (path: string): string | null => {
      const entry = tree.get(path);
      if (!entry) {
        return null;
      }
      return blobs.get(entry.sha) ?? "";
    };

    const files = [...models.entries()].map(([path, model]) => ({
      path,
      blobSha: tree.get(path)!.sha,
      model
    }));

    return assembleSnapshot({
      commit,
      branch: this.branch,
      analyzerVersion: this.analyzerVersion,
      files,
      readText
    });
  }
}

function isTsConfigPath(path: string): boolean {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base === "tsconfig.json" || /^tsconfig\..+\.json$/.test(base);
}

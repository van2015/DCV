import type { FileModel } from "@dcv/shared";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { cacheDir } from "../config.js";
import { AppError } from "../errors.js";
import { writeJsonAtomic } from "../fs/atomic.js";

const BLOB_SHA_PATTERN = /^[0-9a-f]{4,64}$/i;

export interface EvictionResult {
  removed: number;
  totalBytes: number;
}

export class FileModelCache {
  private readonly directory: string;

  constructor(dataDir: string, analyzerVersion: string) {
    this.directory = join(cacheDir(dataDir), sanitizeVersion(analyzerVersion));
  }

  get versionDirectory(): string {
    return this.directory;
  }

  async get(blobSha: string): Promise<FileModel | null> {
    const filePath = this.pathFor(blobSha);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return isFileModel(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async set(blobSha: string, model: FileModel): Promise<void> {
    await writeJsonAtomic(this.pathFor(blobSha), model);
  }

  async getOrParse(
    blobSha: string,
    parse: () => Promise<FileModel> | FileModel
  ): Promise<FileModel> {
    const cached = await this.get(blobSha);
    if (cached) {
      return cached;
    }
    const model = await parse();
    await this.set(blobSha, model);
    return model;
  }

  async totalSize(): Promise<number> {
    return directorySize(this.directory);
  }

  async enforceLimit(maxBytes: number): Promise<EvictionResult> {
    let entries: { path: string; size: number; mtimeMs: number }[];
    try {
      entries = await fileEntries(this.directory);
    } catch {
      return { removed: 0, totalBytes: 0 };
    }

    let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    let removed = 0;
    entries.sort((left, right) => left.mtimeMs - right.mtimeMs);

    while (totalBytes > maxBytes && entries.length > 0) {
      const oldest = entries.shift()!;
      await rm(oldest.path, { force: true }).catch(() => undefined);
      totalBytes -= oldest.size;
      removed += 1;
    }

    return { removed, totalBytes };
  }

  private pathFor(blobSha: string): string {
    if (!BLOB_SHA_PATTERN.test(blobSha)) {
      throw new AppError("invalid_blob_sha", "El identificador de blob no es válido.", 400, {
        blobSha
      });
    }
    return join(this.directory, `${blobSha}.json`);
  }
}

function sanitizeVersion(version: string): string {
  return version.replaceAll(/[^A-Za-z0-9._-]/g, "_");
}

function isFileModel(value: unknown): value is FileModel {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<FileModel>;
  return (
    typeof candidate.contentHash === "string" &&
    (candidate.scriptKind === "ts" || candidate.scriptKind === "tsx") &&
    Array.isArray(candidate.imports) &&
    Array.isArray(candidate.declarations) &&
    Array.isArray(candidate.diagnostics)
  );
}

async function fileEntries(
  directory: string
): Promise<{ path: string; size: number; mtimeMs: number }[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: { path: string; size: number; mtimeMs: number }[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const filePath = join(directory, entry.name);
    const info = await stat(filePath);
    result.push({ path: filePath, size: info.size, mtimeMs: info.mtimeMs });
  }
  return result;
}

async function directorySize(directory: string): Promise<number> {
  const entries = await fileEntries(directory).catch(() => []);
  return entries.reduce((sum, entry) => sum + entry.size, 0);
}

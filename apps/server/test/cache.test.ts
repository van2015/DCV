import type { FileModel } from "@dcv/shared";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileModelCache } from "../src/analysis/cache.js";
import { makeTempDir, removeTempDirs } from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

function sampleModel(contentHash: string): FileModel {
  return {
    contentHash,
    scriptKind: "ts",
    imports: [],
    declarations: [],
    diagnostics: []
  };
}

describe("FileModelCache", () => {
  it("stores and retrieves FileModels atomically", async () => {
    const dataDir = await makeTempDir("dcv-cache-");
    tempDirs.push(dataDir);
    const cache = new FileModelCache(dataDir, "1.0.0");

    await cache.set(SHA_A, sampleModel(SHA_A));

    expect(await cache.get(SHA_A)).toEqual(sampleModel(SHA_A));
    expect(await cache.get(SHA_B)).toBeNull();
    expect(await readdir(cache.versionDirectory)).toEqual([`${SHA_A}.json`]);
  });

  it("treats corrupt entries as misses", async () => {
    const dataDir = await makeTempDir("dcv-cache-");
    tempDirs.push(dataDir);
    const cache = new FileModelCache(dataDir, "1.0.0");
    await mkdir(cache.versionDirectory, { recursive: true });
    await writeFile(join(cache.versionDirectory, `${SHA_A}.json`), "{ not json", "utf8");

    expect(await cache.get(SHA_A)).toBeNull();
  });

  it("reuses parsed models through getOrParse", async () => {
    const dataDir = await makeTempDir("dcv-cache-");
    tempDirs.push(dataDir);
    const cache = new FileModelCache(dataDir, "1.0.0");
    let parses = 0;

    const first = await cache.getOrParse(SHA_A, () => {
      parses += 1;
      return sampleModel(SHA_A);
    });
    const second = await cache.getOrParse(SHA_A, () => {
      parses += 1;
      return sampleModel(SHA_A);
    });

    expect(parses).toBe(1);
    expect(second).toEqual(first);
  });

  it("invalidates entries when the analyzer version changes", async () => {
    const dataDir = await makeTempDir("dcv-cache-");
    tempDirs.push(dataDir);
    const first = new FileModelCache(dataDir, "1.0.0");
    await first.set(SHA_A, sampleModel(SHA_A));

    const second = new FileModelCache(dataDir, "2.0.0");
    expect(await second.get(SHA_A)).toBeNull();
    await second.set(SHA_A, sampleModel(SHA_A));

    expect(await readdir(join(dataDir, "cache"))).toEqual(["1.0.0", "2.0.0"]);
  });

  it("evicts the oldest entries when the cache exceeds its size limit", async () => {
    const dataDir = await makeTempDir("dcv-cache-");
    tempDirs.push(dataDir);
    const cache = new FileModelCache(dataDir, "1.0.0");
    await cache.set(SHA_A, sampleModel(SHA_A));
    await cache.set(SHA_B, sampleModel(SHA_B));
    await cache.set(SHA_C, sampleModel(SHA_C));

    const totalBefore = await cache.totalSize();
    const limit = Math.floor(totalBefore / 3);
    const result = await cache.enforceLimit(limit);

    expect(result.removed).toBeGreaterThanOrEqual(2);
    expect(result.totalBytes).toBeLessThanOrEqual(limit);
    expect((await readdir(cache.versionDirectory)).length).toBe(1);
  });

  it("rejects invalid blob identifiers", async () => {
    const dataDir = await makeTempDir("dcv-cache-");
    tempDirs.push(dataDir);
    const cache = new FileModelCache(dataDir, "1.0.0");

    await expect(cache.get("../escape")).rejects.toMatchObject({ code: "invalid_blob_sha" });
  });
});

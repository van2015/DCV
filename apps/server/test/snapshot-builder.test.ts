import { parseFile } from "@dcv/analyzer";
import { afterEach, describe, expect, it } from "vitest";
import { FileModelCache } from "../src/analysis/cache.js";
import { SnapshotBuilder } from "../src/analysis/snapshot-builder.js";
import {
  checkout,
  commitFile,
  createFixtureRepo,
  initRepo,
  makeTempDir,
  removeTempDirs
} from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

describe("SnapshotBuilder", () => {
  it("builds deterministic snapshots and reuses cached models between commits", async () => {
    const repo = await initRepo(await makeTempDir("dcv-snapshot-"));
    const dataDir = await makeTempDir("dcv-data-");
    tempDirs.push(repo, dataDir);

    const c1 = await commitFile(
      repo,
      "src/shared.ts",
      "export class Shared {}\n",
      "add shared"
    );
    await commitFile(
      repo,
      "src/base.ts",
      "import { Shared } from './shared';\nexport class Base extends Shared {}\n",
      "add base"
    );
    await checkout(repo, "feature", true);
    await commitFile(repo, "src/feature.ts", "export const feature = true;\n", "feature");
    await checkout(repo, "main");

    const counts = new Map<string, number>();
    const parse = (input: Parameters<typeof parseFile>[0]) => {
      counts.set(input.path, (counts.get(input.path) ?? 0) + 1);
      return parseFile(input);
    };

    const cache = new FileModelCache(dataDir, "1.0.0");
    const builder = new SnapshotBuilder({
      repoPath: repo,
      branch: "main",
      analyzerVersion: "1.0.0",
      cache,
      parse
    });

    const first = await builder.build(c1);
    expect(first.stats.files).toBe(1);
    const firstJson = JSON.stringify(first);

    const second = await builder.build(c1);
    expect(JSON.stringify(second)).toBe(firstJson);
    expect(counts.get("src/shared.ts")).toBe(1);

    const restartBuilder = new SnapshotBuilder({
      repoPath: repo,
      branch: "main",
      analyzerVersion: "1.0.0",
      cache,
      parse
    });
    await restartBuilder.build(c1);
    expect(counts.get("src/shared.ts")).toBe(1);

    await builder.build("HEAD");
    expect(counts.get("src/shared.ts")).toBe(1);
    expect(counts.get("src/base.ts")).toBe(1);
  });

  it("does not serve cached models across analyzer versions", async () => {
    const repo = await createFixtureRepo(await makeTempDir("dcv-snapshot-"));
    const dataDir = await makeTempDir("dcv-data-");
    tempDirs.push(repo, dataDir);

    let parses = 0;
    const parse = (input: Parameters<typeof parseFile>[0]) => {
      parses += 1;
      return parseFile(input);
    };

    const first = new SnapshotBuilder({
      repoPath: repo,
      branch: "main",
      analyzerVersion: "1.0.0",
      cache: new FileModelCache(dataDir, "1.0.0"),
      parse
    });
    await first.build("HEAD");
    const parsesAfterFirst = parses;

    const second = new SnapshotBuilder({
      repoPath: repo,
      branch: "main",
      analyzerVersion: "2.0.0",
      cache: new FileModelCache(dataDir, "2.0.0"),
      parse
    });
    const rebuilt = await second.build("HEAD");

    expect(rebuilt.analyzerVersion).toBe("2.0.0");
    expect(parses).toBe(parsesAfterFirst * 2);
  });

  it("keeps relative imports resolved through the snapshot", async () => {
    const repo = await initRepo(await makeTempDir("dcv-snapshot-"));
    const dataDir = await makeTempDir("dcv-data-");
    tempDirs.push(repo, dataDir);

    await commitFile(repo, "src/base.ts", "export class Base {}\n", "base");
    await commitFile(
      repo,
      "src/user.ts",
      "import { Base } from './base';\nexport class User extends Base {}\n",
      "user"
    );

    const builder = new SnapshotBuilder({
      repoPath: repo,
      branch: "main",
      analyzerVersion: "1.0.0",
      cache: new FileModelCache(dataDir, "1.0.0")
    });
    const snapshot = await builder.build("HEAD");

    const user = snapshot.files.find((file) => file.path === "src/user.ts")!;
    expect(user.imports[0]!.resolvedPath).toBe("src/base.ts");
    expect(snapshot.edges.map((edge) => edge.kind)).toContain("extends");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { diffTrees } from "../src/git/diff.js";
import {
  commitFile,
  initRepo,
  makeTempDir,
  moveFile,
  removeFile,
  removeTempDirs
} from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

describe("git diff-tree", () => {
  it("detects added, modified, deleted and renamed files", async () => {
    const repo = await initRepo(await makeTempDir("dcv-diff-"));
    tempDirs.push(repo);

    await commitFile(
      repo,
      "src/a.ts",
      "export class A {\n  run(): void {}\n}\n",
      "add a"
    );
    const c1b = await commitFile(repo, "src/keep.ts", "export const keep = true;\n", "add keep");
    const c2 = await commitFile(repo, "src/new.ts", "export const value = 1;\n", "add new");
    expect((await diffTrees(repo, c1b, c2)).map((file) => file.status)).toEqual(["added"]);

    const c3 = await commitFile(
      repo,
      "src/a.ts",
      "export class A {\n  run(): void { return; }\n}\n",
      "modify a"
    );
    expect(await diffTrees(repo, c2, c3)).toEqual([
      expect.objectContaining({ status: "modified", path: "src/a.ts", previousPath: null })
    ]);

    const c4 = await removeFile(repo, "src/keep.ts", "delete keep");
    expect(await diffTrees(repo, c3, c4)).toEqual([
      expect.objectContaining({ status: "deleted", path: "src/keep.ts" })
    ]);

    const c5 = await moveFile(repo, "src/a.ts", "src/renamed.ts", "rename a");
    expect(await diffTrees(repo, c4, c5)).toEqual([
      expect.objectContaining({
        status: "renamed",
        path: "src/renamed.ts",
        previousPath: "src/a.ts",
        similarity: 100
      })
    ]);
  });

  it("treats the root commit as all additions", async () => {
    const repo = await initRepo(await makeTempDir("dcv-diff-"));
    tempDirs.push(repo);

    const root = await commitFile(repo, "src/a.ts", "export const a = 1;\n", "root");
    await commitFile(repo, "src/b.ts", "export const b = 2;\n", "second");

    const diffs = await diffTrees(repo, null, root);
    expect(diffs).toEqual([
      expect.objectContaining({ status: "added", path: "src/a.ts" })
    ]);
  });

  it("rejects invalid commit identifiers", async () => {
    const repo = await initRepo(await makeTempDir("dcv-diff-"));
    tempDirs.push(repo);

    await expect(diffTrees(repo, null, "--help")).rejects.toMatchObject({
      code: "invalid_commit"
    });
  });
});

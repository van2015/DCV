import { afterEach, describe, expect, it } from "vitest";
import { readBlobs, readTree } from "../src/git/tree.js";
import {
  commitFile,
  initRepo,
  makeTempDir,
  removeTempDirs
} from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

describe("git tree and blobs", () => {
  it("maps paths to blobs and reads their contents in a batch", async () => {
    const repo = await initRepo(await makeTempDir("dcv-tree-"));
    tempDirs.push(repo);

    const contents = new Map([
      ["src/a.ts", "export const a = 1;\n"],
      ["src/empty.ts", ""],
      ["src/unicode.ts", "export const saludo = 'ñ';\n"]
    ]);
    for (const [path, content] of contents) {
      await commitFile(repo, path, content, `add ${path}`);
    }

    const tree = await readTree(repo, "main");
    expect([...tree.keys()]).toEqual(["src/a.ts", "src/empty.ts", "src/unicode.ts"]);
    expect(tree.get("src/empty.ts")!.size).toBe(0);
    expect(tree.get("src/a.ts")!.mode).toBe("100644");

    const shas = [...tree.values()].map((entry) => entry.sha);
    const blobs = await readBlobs(repo, [...shas, shas[0]!]);

    expect(blobs.size).toBe(3);
    for (const [path, content] of contents) {
      expect(blobs.get(tree.get(path)!.sha)).toBe(content);
    }
  });

  it("reads the tree of a specific commit", async () => {
    const repo = await initRepo(await makeTempDir("dcv-tree-"));
    tempDirs.push(repo);

    const first = await commitFile(repo, "src/first.ts", "export const first = 1;\n", "first");
    await commitFile(repo, "src/second.ts", "export const second = 2;\n", "second");

    const tree = await readTree(repo, first);
    expect([...tree.keys()]).toEqual(["src/first.ts"]);
  });
});

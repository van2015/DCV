import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listCommits, getCommit } from "../src/git/history.js";
import {
  checkout,
  commitFile,
  createFixtureRepo,
  initRepo,
  makeTempDir,
  merge,
  removeTempDirs
} from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

describe("git history", () => {
  it("enumerates first-parent commits from oldest to newest including merges", async () => {
    const repo = await initRepo(await makeTempDir("dcv-history-"));
    tempDirs.push(repo);

    const base = await commitFile(repo, "src/base.ts", "export const base = 1;\n", "base", {
      date: "2026-01-01T10:00:00Z",
      author: { name: "Ana", email: "ana@example.com" }
    });
    await checkout(repo, "feature", true);
    await commitFile(repo, "src/feature.ts", "export const feature = true;\n", "feature", {
      date: "2026-01-02T10:00:00Z"
    });
    await checkout(repo, "main");
    const mainCommit = await commitFile(repo, "src/main.ts", "export const main = true;\n", "main", {
      date: "2026-01-03T10:00:00Z"
    });
    const mergeCommit = await merge(repo, "feature", "2026-01-04T10:00:00Z");

    const commits = await listCommits(repo, "main");

    expect(commits.map((commit) => commit.sha)).toEqual([base, mainCommit, mergeCommit]);
    expect(commits[0]).toMatchObject({
      subject: "base",
      authorName: "Ana",
      authorEmail: "ana@example.com",
      parents: [],
      changedFiles: 1
    });
    expect(commits[0]!.shortSha).toBe(base.slice(0, 7));
    expect(commits[1]!.parents).toEqual([base]);
    expect(commits[2]!.parents[0]).toBe(mainCommit);
    expect(commits[2]!.parents).toHaveLength(2);
    expect(commits[2]!.subject).toContain("feature");
    expect(commits[2]!.changedFiles).toBe(1);
    expect(new Date(commits[2]!.date).toISOString()).toBe("2026-01-04T10:00:00.000Z");

    const commit = await getCommit(repo, mergeCommit);
    expect(commit.sha).toBe(mergeCommit);
    expect(commit.parents[0]).toBe(mainCommit);
  });

  it("reads commits from a fixture branch", async () => {
    const repo = await createFixtureRepo(await makeTempDir("dcv-history-"));
    tempDirs.push(repo);

    const commits = await listCommits(repo, "main");

    expect(commits).toHaveLength(3);
    expect(commits.at(-1)!.subject).toBe("docs: readme");
    expect(commits.every((commit) => commit.changedFiles === 1)).toBe(true);
  });

  it("reports a missing branch explicitly", async () => {
    const repo = await createFixtureRepo(await makeTempDir("dcv-history-"));
    tempDirs.push(repo);

    await expect(listCommits(repo, "does-not-exist")).rejects.toMatchObject({
      code: "branch_not_found"
    });
  });

  it("reports an unreadable repository explicitly", async () => {
    const directory = await makeTempDir("dcv-not-git-");
    tempDirs.push(directory);

    await expect(listCommits(directory, "main")).rejects.toMatchObject({
      code: "repository_unreadable"
    });
  });

  it("reports an empty history explicitly", async () => {
    const repo = await initRepo(await makeTempDir("dcv-empty-"));
    tempDirs.push(repo);

    await expect(listCommits(repo, "main")).rejects.toMatchObject({
      code: "empty_history"
    });
  });

  it("validates that the repository path exists", async () => {
    await expect(listCommits(join("/tmp", "dcv-does-not-exist"), "main")).rejects.toMatchObject({
      code: "repository_unreadable"
    });
  });
});

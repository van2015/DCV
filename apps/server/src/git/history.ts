import type { CommitInfo } from "@dcv/shared";
import { AppError } from "../errors.js";
import { runGit, runGitRaw } from "./exec.js";
import { resolveBranchCommit } from "./repo.js";

const FIELD_SEPARATOR = "\x1f";
const RECORD_SEPARATOR = "\x1e";
const LOG_FORMAT =
  `%x1e` +
  ["%H", "%P", "%s", "%B", "%an", "%ae", "%aI"].join(`%x1f`);

export async function assertRepositoryReadable(repoPath: string): Promise<void> {
  const result = await runGitRaw(["-C", repoPath, "rev-parse", "--git-dir"], {
    allowFailure: true
  });
  if (result.exitCode !== 0) {
    throw new AppError(
      "repository_unreadable",
      "No se puede leer el repositorio Git del proyecto.",
      422,
      { repoPath }
    );
  }
}

export async function listCommits(repoPath: string, branch: string): Promise<CommitInfo[]> {
  await assertRepositoryReadable(repoPath);

  const anyCommit = await runGit(repoPath, ["rev-list", "--all", "--max-count=1"], {
    allowFailure: true
  });
  if (anyCommit.exitCode === 0 && anyCommit.stdout.trim() === "") {
    throw new AppError(
      "empty_history",
      "El repositorio no contiene commits para analizar.",
      422
    );
  }

  await resolveBranchCommit(repoPath, branch);

  const result = await runGit(
    repoPath,
    [
      "log",
      "--first-parent",
      "--reverse",
      "--no-color",
      "--diff-merges=first-parent",
      "--shortstat",
      `--format=${LOG_FORMAT}`,
      `refs/heads/${branch}`
    ],
    { maxBuffer: 256 * 1024 * 1024, timeoutMs: 120000 }
  );

  return result.stdout
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map(parseCommitRecord);
}

export async function getCommit(repoPath: string, sha: string): Promise<CommitInfo> {
  await assertRepositoryReadable(repoPath);
  const result = await runGit(
    repoPath,
    [
      "show",
      "--no-patch",
      "--no-color",
      "--format=%H%x1f%P%x1f%s%x1f%B%x1f%an%x1f%ae%x1f%aI",
      sha
    ],
    { allowFailure: true }
  );
  if (result.exitCode !== 0) {
    throw new AppError("commit_not_found", "El commit solicitado no existe.", 404, { sha });
  }
  const info = parseCommitRecord(result.stdout);
  const changed = await runGit(
    repoPath,
    ["diff-tree", "-r", "-M", "--name-only", "--no-commit-id", "--root", sha],
    { allowFailure: true }
  );
  return {
    ...info,
    changedFiles:
      changed.exitCode === 0
        ? changed.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0).length
        : info.changedFiles
  };
}

function parseCommitRecord(record: string): CommitInfo {
  const fields = record.split(FIELD_SEPARATOR);
  const sha = fields[0] ?? "";
  const parents = (fields[1] ?? "").split(" ").filter((parent) => parent.length > 0);
  const subject = fields[2] ?? "";
  const message = (fields[3] ?? "").trimEnd();
  const authorName = fields[4] ?? "";
  const authorEmail = fields[5] ?? "";
  const dateField = fields[6] ?? "";
  const date = dateField.split(/\r?\n/)[0]!.trim();
  const changedMatch = /(\d+) files? changed/.exec(record);

  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    subject,
    message,
    authorName,
    authorEmail,
    date,
    changedFiles: changedMatch ? Number.parseInt(changedMatch[1]!, 10) : 0
  };
}

import { AppError } from "../errors.js";
import { runGit } from "./exec.js";
import { assertRepositoryReadable } from "./history.js";

export type GitFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "type-changed"
  | "unknown";

export interface GitFileDiff {
  status: GitFileStatus;
  path: string;
  previousPath: string | null;
  similarity: number | null;
}

const SHA_PATTERN = /^[0-9a-f]{4,64}$/i;

export async function diffTrees(
  repoPath: string,
  parentSha: string | null,
  commitSha: string
): Promise<GitFileDiff[]> {
  await assertRepositoryReadable(repoPath);
  assertSha(commitSha);
  if (parentSha) {
    assertSha(parentSha);
  }

  const args = ["diff-tree", "-r", "-M", "--name-status", "-z", "--no-commit-id"];
  if (parentSha) {
    args.push(parentSha, commitSha);
  } else {
    args.push("--root", commitSha);
  }

  const result = await runGit(repoPath, args, {
    maxBuffer: 256 * 1024 * 1024,
    timeoutMs: 120000
  });

  return parseNameStatus(result.stdout);
}

function parseNameStatus(output: string): GitFileDiff[] {
  const tokens = output.split("\0");
  const diffs: GitFileDiff[] = [];

  for (let index = 0; index < tokens.length; ) {
    const statusToken = tokens[index++];
    if (!statusToken) {
      continue;
    }

    const code = statusToken[0]!;
    const similarity = statusToken.length > 1 ? Number.parseInt(statusToken.slice(1), 10) : null;

    if (code === "R" || code === "C") {
      const previousPath = tokens[index++] ?? "";
      const path = tokens[index++] ?? "";
      diffs.push({
        status: code === "R" ? "renamed" : "copied",
        path,
        previousPath,
        similarity: Number.isFinite(similarity) ? similarity : null
      });
      continue;
    }

    const path = tokens[index++] ?? "";
    diffs.push({
      status: statusFromCode(code),
      path,
      previousPath: null,
      similarity: null
    });
  }

  return diffs;
}

function statusFromCode(code: string): GitFileStatus {
  switch (code) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "T":
      return "type-changed";
    default:
      return "unknown";
  }
}

function assertSha(sha: string): void {
  if (!SHA_PATTERN.test(sha)) {
    throw new AppError("invalid_commit", "El identificador de commit no es válido.", 400, { sha });
  }
}

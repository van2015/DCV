import { isAnalyzableSourcePath } from "@dcv/analyzer";
import { realpath, stat } from "node:fs/promises";
import { AppError } from "../errors.js";
import { runGit } from "./exec.js";

export interface RepositoryBranches {
  branches: string[];
  defaultBranch: string;
}

export async function canonicalizeLocalRepository(inputPath: string): Promise<string> {
  let canonicalPath: string;
  try {
    canonicalPath = await realpath(inputPath);
  } catch {
    throw new AppError("path_not_found", "El path indicado no existe.", 400, { path: inputPath });
  }

  const info = await stat(canonicalPath);
  if (!info.isDirectory()) {
    throw new AppError("not_a_directory", "El path indicado no es un directorio.", 400, {
      path: inputPath
    });
  }

  const topLevel = await runGit(canonicalPath, ["rev-parse", "--show-toplevel"], {
    allowFailure: true
  });
  if (topLevel.exitCode === 0 && topLevel.stdout.trim()) {
    return realpath(topLevel.stdout.trim());
  }

  const bare = await runGit(canonicalPath, ["rev-parse", "--is-bare-repository"], {
    allowFailure: true
  });
  if (bare.exitCode === 0 && bare.stdout.trim() === "true") {
    return canonicalPath;
  }

  throw new AppError(
    "not_a_git_repository",
    "El path seleccionado no pertenece a un repositorio Git.",
    400,
    { path: inputPath }
  );
}

export async function listBranches(repoPath: string): Promise<string[]> {
  const result = await runGit(repoPath, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads"
  ]);
  return result.stdout
    .split(/\r?\n/)
    .map((branch) => branch.trim())
    .filter((branch) => branch.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

export async function getDefaultBranch(repoPath: string): Promise<string> {
  const result = await runGit(repoPath, ["symbolic-ref", "--short", "HEAD"], {
    allowFailure: true
  });
  if (result.exitCode === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }

  const branches = await listBranches(repoPath);
  if (branches.length === 0) {
    throw new AppError(
      "empty_repository",
      "El repositorio no contiene ramas con commits para analizar.",
      422
    );
  }
  return branches[0]!;
}

export async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  const result = await runGit(repoPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    allowFailure: true
  });
  return result.exitCode === 0;
}

export async function resolveBranchCommit(repoPath: string, branch: string): Promise<string> {
  const result = await runGit(
    repoPath,
    ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`],
    { allowFailure: true }
  );
  if (result.exitCode !== 0) {
    throw new AppError("branch_not_found", `La rama "${branch}" no existe.`, 404, { branch });
  }
  return result.stdout.trim();
}

export async function repositoryBranches(repoPath: string): Promise<RepositoryBranches> {
  const branches = await listBranches(repoPath);
  if (branches.length === 0) {
    throw new AppError(
      "empty_repository",
      "El repositorio no contiene ramas con commits para analizar.",
      422
    );
  }
  const defaultBranch = await getDefaultBranch(repoPath);
  return { branches, defaultBranch };
}

export async function hasAnalyzableTypeScript(
  repoPath: string,
  branch: string
): Promise<boolean> {
  const result = await runGit(repoPath, [
    "ls-tree",
    "-r",
    "--name-only",
    "-z",
    `refs/heads/${branch}`
  ]);
  return result.stdout
    .split("\0")
    .filter((path) => path.length > 0)
    .some((path) => isAnalyzableSourcePath(path));
}

export async function refreshRepository(repoPath: string, managed: boolean): Promise<void> {
  if (managed) {
    await runGit(repoPath, ["fetch", "--prune", "origin", "+refs/heads/*:refs/heads/*"], {
      timeoutMs: 120000
    });
    return;
  }
  await runGit(repoPath, ["for-each-ref", "--format=%(refname)", "refs/heads"]);
}

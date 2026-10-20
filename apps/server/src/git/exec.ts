import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppError } from "../errors.js";

const execFileAsync = promisify(execFile);

export interface GitOptions {
  timeoutMs?: number;
  maxBuffer?: number;
  allowFailure?: boolean;
}

export interface GitOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    LC_ALL: "C",
    LANG: "C"
  };
}

export async function runGit(
  repoPath: string,
  args: string[],
  options: GitOptions = {}
): Promise<GitOutput> {
  return runGitRaw(["-C", repoPath, ...args], options);
}

export async function runGitRaw(
  args: string[],
  options: GitOptions = {}
): Promise<GitOutput> {
  try {
    const result = await execFileAsync("git", args, {
      encoding: "utf8",
      env: gitEnv(),
      timeout: options.timeoutMs ?? 30000,
      maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
      windowsHide: true
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as Error & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };
    const stdout = failure.stdout?.toString() ?? "";
    const stderr = failure.stderr?.toString() ?? "";
    const exitCode = typeof failure.code === "number" ? failure.code : 1;

    if (options.allowFailure) {
      return { stdout, stderr, exitCode };
    }

    if (failure.killed) {
      throw new AppError("git_timeout", "La operación de Git excedió el tiempo límite.", 504, {
        args
      });
    }

    throw new AppError(
      "git_failed",
      `Git falló al ejecutar "${args[0] ?? "git"}": ${firstLine(stderr) || failure.message}`,
      422,
      { args, exitCode, stderr: stderr.slice(0, 4000) }
    );
  }
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
}

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function makeTempDir(prefix = "dcv-test-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeTempDirs(directories: string[]): Promise<void> {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
}

export async function git(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = {}
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      ...env
    }
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

export async function initRepo(directory: string, branch = "main"): Promise<string> {
  await mkdir(directory, { recursive: true });
  await git(directory, ["init", "-b", branch]);
  await git(directory, ["config", "user.name", "DCV Test"]);
  await git(directory, ["config", "user.email", "dcv@example.com"]);
  await git(directory, ["config", "commit.gpgsign", "false"]);
  return directory;
}

export interface CommitOptions {
  date?: string;
  author?: { name: string; email: string };
}

export async function commitFile(
  repo: string,
  relativePath: string,
  contents: string,
  message: string,
  options: CommitOptions = {}
): Promise<string> {
  const filePath = join(repo, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
  await git(repo, ["add", "--", relativePath]);
  const env: NodeJS.ProcessEnv = {};
  if (options.date) {
    env.GIT_AUTHOR_DATE = options.date;
    env.GIT_COMMITTER_DATE = options.date;
  }
  if (options.author) {
    env.GIT_AUTHOR_NAME = options.author.name;
    env.GIT_AUTHOR_EMAIL = options.author.email;
  }
  await git(repo, ["commit", "-m", message], env);
  return headSha(repo);
}

export async function removeFile(repo: string, relativePath: string, message: string): Promise<string> {
  await unlink(join(repo, relativePath));
  await git(repo, ["add", "-A"]);
  await git(repo, ["commit", "-m", message]);
  return headSha(repo);
}

export async function moveFile(
  repo: string,
  from: string,
  to: string,
  message: string
): Promise<string> {
  await mkdir(dirname(join(repo, to)), { recursive: true });
  await git(repo, ["mv", "--", from, to]);
  await git(repo, ["commit", "-m", message]);
  return headSha(repo);
}

export async function headSha(repo: string): Promise<string> {
  return (await git(repo, ["rev-parse", "HEAD"])).stdout.trim();
}

export async function createBareRemote(directory: string, branch = "main"): Promise<string> {
  await mkdir(directory, { recursive: true });
  await git(directory, ["init", "--bare", "-b", branch]);
  return directory;
}

export async function addRemote(repo: string, remotePath: string, name = "origin"): Promise<void> {
  await git(repo, ["remote", "add", name, pathToFileURL(remotePath).toString()]);
}

export async function push(repo: string, branch = "main", remote = "origin"): Promise<void> {
  await git(repo, ["push", "-u", remote, branch]);
}

export async function checkout(repo: string, branch: string, create = false): Promise<void> {
  await git(repo, create ? ["checkout", "-b", branch] : ["checkout", branch]);
}

export async function merge(repo: string, branch: string, date?: string): Promise<string> {
  const env: NodeJS.ProcessEnv = date
    ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    : {};
  await git(repo, ["merge", "--no-ff", "--no-edit", branch], env);
  return headSha(repo);
}

export async function createFixtureRepo(directory: string): Promise<string> {
  await initRepo(directory);
  await commitFile(
    directory,
    "src/user.ts",
    [
      "export interface User {",
      "  id: string;",
      "  name: string;",
      "}",
      "",
      "export class UserService {",
      "  find(id: string): User | undefined {",
      "    return undefined;",
      "  }",
      "}",
      ""
    ].join("\n"),
    "feat: modelo de usuario",
    { date: "2026-01-01T10:00:00Z" }
  );
  await commitFile(
    directory,
    "src/order.ts",
    [
      "import type { User } from './user';",
      "",
      "export interface Order {",
      "  id: string;",
      "  user: User;",
      "}",
      ""
    ].join("\n"),
    "feat: pedidos",
    { date: "2026-01-02T10:00:00Z" }
  );
  await commitFile(
    directory,
    "README.md",
    "# Demo\n",
    "docs: readme",
    { date: "2026-01-03T10:00:00Z" }
  );
  return directory;
}

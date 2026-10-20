import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { posix, resolve, win32 } from "node:path";

export interface DataDirOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
}

export function resolveDataDir(options: DataDirOptions = {}): string {
  const env = options.env ?? process.env;
  if (env.DCV_DATA_DIR) {
    return resolve(env.DCV_DATA_DIR);
  }

  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();

  if (platform === "win32") {
    const base = env.APPDATA ?? win32.join(home, "AppData", "Roaming");
    return win32.join(base, "DCV");
  }
  if (platform === "darwin") {
    return posix.join(home, "Library", "Application Support", "DCV");
  }
  const base = env.XDG_DATA_HOME ?? posix.join(home, ".local", "share");
  return posix.join(base, "dcv");
}

export function reposDir(dataDir: string): string {
  return resolve(dataDir, "repos");
}

export function cacheDir(dataDir: string): string {
  return resolve(dataDir, "cache");
}

export function projectRepoPath(dataDir: string, projectId: string): string {
  return resolve(reposDir(dataDir), projectId);
}

export async function ensureDataLayout(dataDir: string): Promise<void> {
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(reposDir(dataDir), { recursive: true }),
    mkdir(cacheDir(dataDir), { recursive: true })
  ]);
}

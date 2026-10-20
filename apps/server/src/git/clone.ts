import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { AppError } from "../errors.js";
import { gitEnv } from "./exec.js";

export const DEFAULT_CLONE_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_CLONE_MAX_BYTES = 5 * 1024 * 1024 * 1024;

const SCP_LIKE_URL = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s]+$/;

export interface CloneProgress {
  phase: string;
  percent: number | null;
  message: string;
}

export interface CloneOptions {
  url: string;
  destination: string;
  onProgress?: (progress: CloneProgress) => void;
  timeoutMs?: number;
  maxBytes?: number;
  allowedProtocols?: string[];
}

export function validateGitUrl(
  rawUrl: string,
  allowedProtocols: string[] = ["https:", "ssh:"]
): string {
  const input = rawUrl.trim();
  if (!input) {
    throw new AppError("invalid_url", "La URL del repositorio está vacía.", 400);
  }

  if (SCP_LIKE_URL.test(input)) {
    if (!allowedProtocols.includes("ssh:")) {
      throw new AppError(
        "invalid_protocol",
        "Solo se admiten URLs públicas https o ssh para clonar.",
        400
      );
    }
    return input;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("invalid_url", "La URL del repositorio no es válida.", 400, {
      url: input
    });
  }

  if (!url.hostname && url.protocol !== "file:") {
    throw new AppError("invalid_url", "La URL del repositorio no tiene host.", 400);
  }
  if ((url.protocol === "http:" || url.protocol === "https:") && (url.username || url.password)) {
    throw new AppError(
      "credentials_not_allowed",
      "No se admiten credenciales embebidas en la URL. Para repos privados, cloná el repositorio e importá el path local.",
      400
    );
  }
  if (!allowedProtocols.includes(url.protocol)) {
    throw new AppError(
      "invalid_protocol",
      "Solo se admiten URLs públicas https o ssh para clonar.",
      400,
      { protocol: url.protocol }
    );
  }

  return url.toString();
}

export async function cloneBare(options: CloneOptions): Promise<void> {
  const url = validateGitUrl(options.url, options.allowedProtocols);
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLONE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_CLONE_MAX_BYTES;

  await mkdir(dirname(options.destination), { recursive: true });
  await rm(options.destination, { recursive: true, force: true });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let stderr = "";
    let progressBuffer = "";
    let lastPercent: number | null = null;
    let lastPhase = "";
    let killTimer: NodeJS.Timeout | undefined;

    const child = spawn(
      "git",
      [
        "clone",
        "--bare",
        "--no-recurse-submodules",
        "--progress",
        "--",
        url,
        options.destination
      ],
      {
        env: gitEnv(),
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true
      }
    );

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      killTimer.unref();
    }, timeoutMs);
    timer.unref();

    const finish = (action: () => Promise<void>): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      void action().then(resolve, reject);
    };

    const cleanup = async (): Promise<void> => {
      await rm(options.destination, { recursive: true, force: true }).catch(() => undefined);
    };

    const emitProgress = (phase: string, percent: number | null, message: string): void => {
      if (percent === lastPercent && phase === lastPhase) {
        return;
      }
      lastPercent = percent;
      lastPhase = phase;
      options.onProgress?.({ phase, percent, message });
    };

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      if (stderr.length > 20000) {
        stderr = stderr.slice(-20000);
      }

      progressBuffer += text;
      const lines = progressBuffer.split(/\r|\n/);
      progressBuffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }
        const match = /^(.*?):\s+.*?(\d+)%/.exec(line);
        if (match) {
          const phase = match[1]!.replace(/^remote:\s*/, "").trim();
          emitProgress(phase, Number.parseInt(match[2]!, 10), line);
        }
      }
    });

    child.on("error", (error) => {
      finish(async () => {
        await cleanup();
        reject(new AppError("git_unavailable", `No se pudo ejecutar Git: ${error.message}`, 500));
      });
    });

    child.on("close", (code) => {
      finish(async () => {
        if (timedOut) {
          await cleanup();
          reject(
            new AppError(
              "clone_timeout",
              "La clonación excedió el tiempo límite y se canceló.",
              504
            )
          );
          return;
        }

        if (code !== 0) {
          await cleanup();
          reject(
            new AppError(
              "clone_failed",
              `No se pudo clonar el repositorio: ${lastMeaningfulLine(stderr) || `git salió con código ${code}`}`,
              422,
              { exitCode: code }
            )
          );
          return;
        }

        try {
          const size = await directorySize(options.destination);
          if (size > maxBytes) {
            await cleanup();
            reject(
              new AppError(
                "clone_too_large",
                "El repositorio clonado supera el tamaño máximo permitido.",
                413,
                { size, maxBytes }
              )
            );
            return;
          }
        } catch (error) {
          await cleanup();
          reject(error);
          return;
        }

        emitProgress("Completado", 100, "Clonación completada");
        resolve();
      });
    });
  });
}

function lastMeaningfulLine(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("remote: Counting"))
    .at(-1) ?? "";
}

async function directorySize(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const entryPath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      total += await directorySize(entryPath);
    } else {
      const info = await lstat(entryPath);
      total += info.size;
    }
  }
  return total;
}

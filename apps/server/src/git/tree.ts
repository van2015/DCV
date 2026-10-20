import { spawn } from "node:child_process";
import { AppError } from "../errors.js";
import { gitEnv, runGit } from "./exec.js";
import { assertRepositoryReadable } from "./history.js";

export interface TreeEntry {
  path: string;
  mode: string;
  type: "blob";
  sha: string;
  size: number | null;
}

export async function readTree(repoPath: string, ref: string): Promise<Map<string, TreeEntry>> {
  await assertRepositoryReadable(repoPath);
  const result = await runGit(repoPath, ["ls-tree", "-r", "-l", "-z", ref], {
    maxBuffer: 256 * 1024 * 1024,
    timeoutMs: 120000
  });

  const entries = new Map<string, TreeEntry>();
  for (const rawEntry of result.stdout.split("\0")) {
    if (!rawEntry) {
      continue;
    }
    const tabIndex = rawEntry.indexOf("\t");
    if (tabIndex === -1) {
      continue;
    }
    const metadata = rawEntry.slice(0, tabIndex).trim();
    const path = rawEntry.slice(tabIndex + 1);
    const parts = metadata.split(/\s+/);
    if (parts.length < 4) {
      continue;
    }
    const [mode, type, sha, sizeText] = parts;
    if (type !== "blob" || !mode || !sha) {
      continue;
    }
    const size = sizeText === "-" ? null : Number.parseInt(sizeText!, 10);
    entries.set(path, {
      path,
      mode,
      type: "blob",
      sha,
      size: Number.isFinite(size) ? size : null
    });
  }
  return entries;
}

export async function readBlobs(
  repoPath: string,
  blobShas: Iterable<string>
): Promise<Map<string, string>> {
  await assertRepositoryReadable(repoPath);
  const shas = [...new Set(blobShas)];
  if (shas.length === 0) {
    return new Map();
  }

  return new Promise<Map<string, string>>((resolve, reject) => {
    const child = spawn("git", ["-C", repoPath, "cat-file", "--batch"], {
      env: gitEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    const contents = new Map<string, string>();
    let buffer = Buffer.alloc(0);
    let stderr = "";
    let parseError: AppError | null = null;

    const tryParse = (): void => {
      while (!parseError) {
        const newlineIndex = buffer.indexOf(0x0a);
        if (newlineIndex === -1) {
          return;
        }

        const header = buffer.subarray(0, newlineIndex).toString("utf8");
        const headerParts = header.split(" ");
        if (headerParts.length === 2 && headerParts[1] === "missing") {
          parseError = new AppError(
            "blob_missing",
            "No se encontró un blob solicitado en el repositorio.",
            422,
            { sha: headerParts[0] }
          );
          child.kill();
          return;
        }

        const [sha, type, sizeText] = headerParts;
        const size = Number.parseInt(sizeText ?? "", 10);
        if (!sha || type !== "blob" || !Number.isFinite(size) || size < 0) {
          parseError = new AppError(
            "blob_parse_failed",
            "No se pudo interpretar la respuesta de Git al leer blobs.",
            500,
            { header }
          );
          child.kill();
          return;
        }

        const contentStart = newlineIndex + 1;
        const contentEnd = contentStart + size;
        if (buffer.length < contentEnd + 1) {
          return;
        }

        contents.set(sha, buffer.subarray(contentStart, contentEnd).toString("utf8"));
        buffer = buffer.subarray(contentEnd + 1);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      tryParse();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 10000) {
        stderr = stderr.slice(-10000);
      }
    });

    child.on("error", (error) => {
      reject(new AppError("git_unavailable", `No se pudo ejecutar Git: ${error.message}`, 500));
    });

    child.on("close", (code) => {
      if (parseError) {
        reject(parseError);
        return;
      }
      if (code !== 0) {
        reject(
          new AppError(
            "git_failed",
            `Git falló al leer blobs: ${stderr.trim() || `código ${code}`}`,
            422
          )
        );
        return;
      }
      if (buffer.length > 0) {
        reject(
          new AppError(
            "blob_parse_failed",
            "Quedaron datos sin interpretar al leer blobs.",
            500
          )
        );
        return;
      }
      resolve(contents);
    });

    child.stdin.on("error", () => undefined);
    child.stdin.end(`${shas.join("\n")}\n`);
  });
}

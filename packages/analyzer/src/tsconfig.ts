import { posix } from "node:path";
import ts from "typescript";
import type { Diagnostic } from "@dcv/shared";

export interface TsConfigPathsEntry {
  pattern: string;
  targets: string[];
}

export interface TsConfigPaths {
  configPath: string;
  configDir: string;
  baseUrl: string | null;
  paths: TsConfigPathsEntry[];
}

export interface TsConfigResult {
  config: TsConfigPaths | null;
  diagnostics: Diagnostic[];
}

export type ReadTextFile = (path: string) => string | null;

export class TsConfigManager {
  private readonly configCache = new Map<string, TsConfigResult>();

  constructor(private readonly readFile: ReadTextFile) {}

  hasFile(path: string): boolean {
    return this.readFile(path) !== null;
  }

  getForFile(filePath: string): TsConfigResult {
    const configPath = this.findNearestConfigPath(filePath);
    if (!configPath) {
      return { config: null, diagnostics: [] };
    }
    const result = this.resolveConfig(configPath, new Set());
    return {
      config: result.config,
      diagnostics: dedupeDiagnostics(result.diagnostics)
    };
  }

  private findNearestConfigPath(filePath: string): string | null {
    let directory = posix.dirname(filePath);
    for (;;) {
      const candidate = directory === "." ? "tsconfig.json" : posix.join(directory, "tsconfig.json");
      if (this.readFile(candidate) !== null) {
        return candidate;
      }
      const parent = posix.dirname(directory);
      if (parent === directory || directory === ".") {
        return null;
      }
      directory = parent;
    }
  }

  private resolveConfig(configPath: string, visited: Set<string>): TsConfigResult {
    if (visited.has(configPath)) {
      return { config: this.emptyConfig(configPath), diagnostics: [] };
    }
    visited.add(configPath);

    const cached = this.configCache.get(configPath);
    if (cached) {
      return cached;
    }

    const text = this.readFile(configPath);
    if (text === null) {
      const empty: TsConfigResult = { config: null, diagnostics: [] };
      this.configCache.set(configPath, empty);
      return empty;
    }

    const parsed = ts.parseConfigFileTextToJson(configPath, text);
    if (parsed.error) {
      const result: TsConfigResult = {
        config: this.emptyConfig(configPath),
        diagnostics: [
          {
            severity: "warning",
            code: `TS${parsed.error.code}`,
            message: `tsconfig inválido: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, " ")}`,
            path: configPath
          }
        ]
      };
      this.configCache.set(configPath, result);
      return result;
    }

    const raw = (parsed.config ?? {}) as {
      extends?: string | string[];
      compilerOptions?: { baseUrl?: unknown; paths?: unknown };
    };
    const configDir = posix.dirname(configPath);
    const diagnostics: Diagnostic[] = [];
    let baseUrl: string | null = null;
    const paths = new Map<string, string[]>();

    for (const parentSpecifier of extendsList(raw.extends)) {
      const parentPath = this.resolveExtendsPath(parentSpecifier, configDir);
      if (!parentPath) {
        continue;
      }
      const parent = this.resolveConfig(parentPath, visited);
      diagnostics.push(...parent.diagnostics);
      if (parent.config) {
        baseUrl = parent.config.baseUrl;
        for (const entry of parent.config.paths) {
          paths.set(entry.pattern, entry.targets);
        }
      }
    }

    const compilerOptions = raw.compilerOptions ?? {};
    if (typeof compilerOptions.baseUrl === "string") {
      baseUrl = posix.normalize(posix.join(configDir, compilerOptions.baseUrl));
    }
    if (isPathsRecord(compilerOptions.paths)) {
      for (const [pattern, targets] of Object.entries(compilerOptions.paths)) {
        if (Array.isArray(targets) && targets.every((target) => typeof target === "string")) {
          paths.set(pattern, [...targets]);
        }
      }
    }

    const result: TsConfigResult = {
      config: {
        configPath,
        configDir,
        baseUrl,
        paths: [...paths.entries()].map(([pattern, targets]) => ({ pattern, targets }))
      },
      diagnostics
    };
    this.configCache.set(configPath, result);
    return result;
  }

  private emptyConfig(configPath: string): TsConfigPaths {
    return {
      configPath,
      configDir: posix.dirname(configPath),
      baseUrl: null,
      paths: []
    };
  }

  private resolveExtendsPath(specifier: string, fromDir: string): string | null {
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
      return null;
    }
    const candidate = posix.normalize(posix.join(fromDir, specifier));
    const attempts = [candidate, `${candidate}.json`, posix.join(candidate, "tsconfig.json")];
    for (const attempt of attempts) {
      if (this.readFile(attempt) !== null) {
        return attempt;
      }
    }
    return null;
  }
}

function extendsList(value: string | string[] | undefined): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function isPathsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const result: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.path ?? ""}:${diagnostic.code}:${diagnostic.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

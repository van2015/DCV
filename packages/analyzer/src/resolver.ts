import { posix } from "node:path";
import type { TsConfigManager, TsConfigPaths } from "./tsconfig.js";

export interface ResolveImportDetails {
  path: string | null;
  projectSpecifier: boolean;
}

export class ImportResolver {
  constructor(private readonly manager: TsConfigManager) {}

  resolve(importerPath: string, specifier: string, config: TsConfigPaths | null): string | null {
    return this.resolveDetailed(importerPath, specifier, config).path;
  }

  resolveDetailed(
    importerPath: string,
    specifier: string,
    config: TsConfigPaths | null
  ): ResolveImportDetails {
    const cleaned = specifier.trim();
    if (!cleaned) {
      return { path: null, projectSpecifier: false };
    }

    if (cleaned.startsWith(".") || cleaned.startsWith("/")) {
      const base = posix.normalize(posix.join(posix.dirname(importerPath), cleaned));
      return { path: this.resolveFileOrIndex(base), projectSpecifier: true };
    }

    if (config) {
      const viaPaths = this.resolveWithPaths(cleaned, config);
      if (viaPaths.path) {
        return { path: viaPaths.path, projectSpecifier: true };
      }
      if (config.baseUrl) {
        const base = posix.normalize(posix.join(config.baseUrl, cleaned));
        const found = this.resolveFileOrIndex(base);
        if (found) {
          return { path: found, projectSpecifier: true };
        }
      }
      if (viaPaths.matched) {
        return { path: null, projectSpecifier: true };
      }
    }

    return { path: null, projectSpecifier: false };
  }

  private resolveWithPaths(
    specifier: string,
    config: TsConfigPaths
  ): { path: string | null; matched: boolean } {
    const entries = [...config.paths].sort(
      (left, right) => prefixLength(right.pattern) - prefixLength(left.pattern)
    );
    const base = config.baseUrl ?? config.configDir;
    let matched = false;

    for (const entry of entries) {
      const starIndex = entry.pattern.indexOf("*");
      if (starIndex === -1) {
        if (entry.pattern !== specifier) {
          continue;
        }
        matched = true;
        for (const target of entry.targets) {
          const found = this.resolveFileOrIndex(posix.normalize(posix.join(base, target)));
          if (found) {
            return { path: found, matched };
          }
        }
        continue;
      }

      const prefix = entry.pattern.slice(0, starIndex);
      const suffix = entry.pattern.slice(starIndex + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
        continue;
      }
      matched = true;
      const middle = specifier.slice(prefix.length, specifier.length - suffix.length);
      for (const target of entry.targets) {
        const replaced = target.replace("*", middle);
        const found = this.resolveFileOrIndex(posix.normalize(posix.join(base, replaced)));
        if (found) {
          return { path: found, matched };
        }
      }
    }

    return { path: null, matched };
  }

  private resolveFileOrIndex(base: string): string | null {
    const candidates: string[] = [base];

    if (base.endsWith(".js")) {
      candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
    }
    if (base.endsWith(".jsx")) {
      candidates.push(`${base.slice(0, -4)}.tsx`, `${base.slice(0, -4)}.ts`);
    }
    if (!/\.\w+$/.test(base)) {
      candidates.push(`${base}.ts`, `${base}.tsx`);
    }

    for (const candidate of candidates) {
      if (this.manager.hasFile(candidate)) {
        return candidate;
      }
    }

    for (const indexCandidate of [`${base}/index.ts`, `${base}/index.tsx`]) {
      if (this.manager.hasFile(indexCandidate)) {
        return indexCandidate;
      }
    }

    return null;
  }
}

function prefixLength(pattern: string): number {
  const starIndex = pattern.indexOf("*");
  return starIndex === -1 ? pattern.length : starIndex;
}

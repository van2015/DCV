import { describe, expect, it } from "vitest";
import { ImportResolver } from "../src/resolver.js";
import { TsConfigManager } from "../src/tsconfig.js";

function createResolver(files: Record<string, string>): {
  resolver: ImportResolver;
  manager: TsConfigManager;
} {
  const manager = new TsConfigManager((path) => files[path] ?? null);
  return { resolver: new ImportResolver(manager), manager };
}

const BASE_FILES: Record<string, string> = {
  "src/index.ts": "",
  "src/foo.ts": "",
  "src/comp.tsx": "",
  "src/bar/index.ts": "",
  "src/target.ts": "",
  "src/shared/index.ts": "",
  "src/data.json": ""
};

describe("ImportResolver", () => {
  it("resolves relative imports with extensions, index files and .js specifiers", () => {
    const { resolver } = createResolver(BASE_FILES);

    expect(resolver.resolve("src/index.ts", "./foo", null)).toBe("src/foo.ts");
    expect(resolver.resolve("src/index.ts", "./comp", null)).toBe("src/comp.tsx");
    expect(resolver.resolve("src/index.ts", "./bar", null)).toBe("src/bar/index.ts");
    expect(resolver.resolve("src/index.ts", "./target.js", null)).toBe("src/target.ts");
    expect(resolver.resolve("src/index.ts", "./data.json", null)).toBe("src/data.json");
    expect(resolver.resolve("src/index.ts", "../src/foo", null)).toBe("src/foo.ts");
    expect(resolver.resolve("src/index.ts", "./missing", null)).toBeNull();
    expect(resolver.resolve("src/index.ts", "react", null)).toBeNull();
  });

  it("resolves tsconfig paths and baseUrl", () => {
    const files: Record<string, string> = {
      ...BASE_FILES,
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"],
            "@shared": ["src/shared/index.ts"]
          }
        }
      })
    };
    const { resolver, manager } = createResolver(files);
    const { config } = manager.getForFile("src/index.ts");

    expect(resolver.resolve("src/index.ts", "@/foo", config)).toBe("src/foo.ts");
    expect(resolver.resolve("src/index.ts", "@shared", config)).toBe("src/shared/index.ts");
    expect(resolver.resolve("src/index.ts", "src/foo", config)).toBe("src/foo.ts");
    expect(resolver.resolve("src/index.ts", "@missing", config)).toBeNull();
  });

  it("uses the nearest tsconfig for each file", () => {
    const files: Record<string, string> = {
      "tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } }
      }),
      "packages/app/tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "~/*": ["lib/*"] } }
      }),
      "packages/app/lib/util.ts": "",
      "packages/app/main.ts": ""
    };
    const { resolver, manager } = createResolver(files);

    const rootConfig = manager.getForFile("tsconfig.json");
    expect(rootConfig.config?.configPath).toBe("tsconfig.json");

    const appConfig = manager.getForFile("packages/app/main.ts");
    expect(appConfig.config?.configPath).toBe("packages/app/tsconfig.json");
    expect(resolver.resolve("packages/app/main.ts", "~/util", appConfig.config)).toBe(
      "packages/app/lib/util.ts"
    );
    expect(resolver.resolve("packages/app/main.ts", "@/foo", appConfig.config)).toBeNull();
  });

  it("resolves local extends chains", () => {
    const files: Record<string, string> = {
      ...BASE_FILES,
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } }
      }),
      "tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json" })
    };
    const { resolver, manager } = createResolver(files);
    const { config, diagnostics } = manager.getForFile("src/index.ts");

    expect(diagnostics).toEqual([]);
    expect(config?.baseUrl).toBe(".");
    expect(resolver.resolve("src/index.ts", "@/foo", config)).toBe("src/foo.ts");
  });

  it("reports invalid tsconfig files and keeps relative resolution", () => {
    const files: Record<string, string> = {
      ...BASE_FILES,
      "tsconfig.json": "{ invalid json"
    };
    const { resolver, manager } = createResolver(files);
    const { config, diagnostics } = manager.getForFile("src/index.ts");

    expect(config?.configPath).toBe("tsconfig.json");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: "warning",
      path: "tsconfig.json"
    });
    expect(diagnostics[0]!.message).toContain("tsconfig inválido");
    expect(resolver.resolve("src/index.ts", "./foo", config)).toBe("src/foo.ts");
  });

  it("prefers the most specific paths pattern", () => {
    const files: Record<string, string> = {
      ...BASE_FILES,
      "src/specific/thing.ts": "",
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"],
            "@/specific/*": ["src/specific/*"]
          }
        }
      })
    };
    const { resolver, manager } = createResolver(files);
    const { config } = manager.getForFile("src/index.ts");

    expect(resolver.resolve("src/index.ts", "@/specific/thing", config)).toBe(
      "src/specific/thing.ts"
    );
    expect(resolver.resolve("src/index.ts", "@/foo", config)).toBe("src/foo.ts");
  });
});

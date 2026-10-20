import { describe, expect, it } from "vitest";
import { parseFile } from "../src/parser.js";
import { assembleSnapshot, type SnapshotFileInput } from "../src/snapshot.js";

function buildInput(sources: Record<string, string>): {
  files: SnapshotFileInput[];
  readText: (path: string) => string | null;
} {
  const files: SnapshotFileInput[] = Object.entries(sources)
    .filter(([path]) => path.endsWith(".ts") || path.endsWith(".tsx"))
    .map(([path, content]) => ({
      path,
      blobSha: `blob:${path}`,
      model: parseFile({
        path,
        content,
        contentHash: `blob:${path}`,
        scriptKind: path.endsWith(".tsx") ? "tsx" : "ts"
      })
    }));
  return {
    files,
    readText: (path) => sources[path] ?? null
  };
}

const BASE_SOURCES: Record<string, string> = {
  "src/base.ts": "export class Base {}\n",
  "src/person.ts": "export interface Person { id: string }\n",
  "src/user.ts": [
    "import { Base } from './base';",
    "import type { Person } from './person';",
    "import { Missing } from './missing';",
    "export class User extends Base {",
    "  manager: Person | null = null;",
    "}"
  ].join("\n"),
  "src/broken.ts": "export class Broken { run( }\n"
};

describe("assembleSnapshot", () => {
  it("builds files, edges, stats and diagnostics without aborting on broken files", () => {
    const { files, readText } = buildInput(BASE_SOURCES);
    const snapshot = assembleSnapshot({
      commit: "abc123",
      branch: "main",
      analyzerVersion: "1.0.0",
      files,
      readText
    });

    expect(snapshot.files.map((file) => file.path)).toEqual([
      "src/base.ts",
      "src/broken.ts",
      "src/person.ts",
      "src/user.ts"
    ]);
    expect(snapshot.stats).toMatchObject({
      files: 4,
      classes: 3,
      interfaces: 1,
      edges: 4
    });

    const user = snapshot.files.find((file) => file.path === "src/user.ts")!;
    expect(user.imports).toEqual([
      expect.objectContaining({ specifier: "./base", resolvedPath: "src/base.ts" }),
      expect.objectContaining({ specifier: "./person", resolvedPath: "src/person.ts" }),
      expect.objectContaining({ specifier: "./missing", resolvedPath: null })
    ]);

    const edgeKeys = snapshot.edges.map((edge) => `${edge.kind}:${edge.from}->${edge.to}`);
    expect(edgeKeys).toContain("extends:src/user.ts#class:User->src/base.ts#class:Base");
    expect(edgeKeys).toContain(
      "association:src/user.ts#class:User->src/person.ts#interface:Person"
    );

    const unresolved = snapshot.diagnostics.find(
      (diagnostic) => diagnostic.code === "unresolved_import"
    );
    expect(unresolved).toMatchObject({ path: "src/user.ts", severity: "warning" });

    const syntax = snapshot.diagnostics.find((diagnostic) => diagnostic.code.startsWith("TS"));
    expect(syntax).toMatchObject({ path: "src/broken.ts", severity: "error" });

    const broken = snapshot.files.find((file) => file.path === "src/broken.ts")!;
    expect(broken.declarations.length).toBeGreaterThanOrEqual(0);
  });

  it("reports invalid tsconfig diagnostics but keeps resolving relative imports", () => {
    const { files, readText } = buildInput({
      ...BASE_SOURCES,
      "tsconfig.json": "{ invalid json"
    });
    const snapshot = assembleSnapshot({
      commit: "abc123",
      branch: "main",
      analyzerVersion: "1.0.0",
      files,
      readText
    });

    expect(
      snapshot.diagnostics.some(
        (diagnostic) => diagnostic.path === "tsconfig.json" && diagnostic.severity === "warning"
      )
    ).toBe(true);
    const user = snapshot.files.find((file) => file.path === "src/user.ts")!;
    expect(user.imports[0]!.resolvedPath).toBe("src/base.ts");
  });

  it("is deterministic for the same input", () => {
    const first = buildInput(BASE_SOURCES);
    const second = buildInput(BASE_SOURCES);
    const snapshotA = assembleSnapshot({
      commit: "abc123",
      branch: "main",
      analyzerVersion: "1.0.0",
      files: first.files,
      readText: first.readText
    });
    const snapshotB = assembleSnapshot({
      commit: "abc123",
      branch: "main",
      analyzerVersion: "1.0.0",
      files: second.files,
      readText: second.readText
    });

    expect(JSON.parse(JSON.stringify(snapshotA))).toEqual(JSON.parse(JSON.stringify(snapshotB)));
  });

  it("resolves aliases from the nearest tsconfig", () => {
    const { files, readText } = buildInput({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } }
      }),
      "src/base.ts": "export class Base {}\n",
      "src/user.ts": "import { Base } from '@/base';\nexport class User extends Base {}\n"
    });
    const snapshot = assembleSnapshot({
      commit: "abc123",
      branch: "main",
      analyzerVersion: "1.0.0",
      files,
      readText
    });

    const user = snapshot.files.find((file) => file.path === "src/user.ts")!;
    expect(user.imports[0]!.resolvedPath).toBe("src/base.ts");
    expect(snapshot.diagnostics).toEqual([]);
  });
});

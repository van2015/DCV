import { describe, expect, it } from "vitest";
import type {
  DeclarationKind,
  MemberModel,
  ResolvedImportRecord,
  Snapshot,
  SnapshotDeclaration,
  SnapshotEdge,
  SnapshotFile
} from "@dcv/shared";
import {
  buildContainers,
  initialViewFor,
  projectSnapshot
} from "./projection.js";

const RANGE = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };

function declaration(
  path: string,
  kind: DeclarationKind,
  name: string,
  overrides: Partial<SnapshotDeclaration> = {}
): SnapshotDeclaration {
  return {
    id: `${path}#${kind}:${name}`,
    path,
    kind,
    name,
    exported: true,
    defaultExport: false,
    abstract: false,
    declare: false,
    async: false,
    signature: null,
    type: null,
    members: [],
    heritage: [],
    bodyHash: null,
    sourceRange: RANGE,
    ...overrides
  };
}

function member(overrides: Partial<MemberModel> = {}): MemberModel {
  return {
    kind: "method",
    name: "run",
    visibility: "public",
    static: false,
    readonly: false,
    optional: false,
    abstract: false,
    async: false,
    signature: null,
    type: null,
    bodyHash: null,
    sourceRange: RANGE,
    ...overrides
  };
}

function file(
  path: string,
  declarations: SnapshotDeclaration[],
  imports: ResolvedImportRecord[] = []
): SnapshotFile {
  return {
    path,
    contentHash: `hash:${path}`,
    scriptKind: "ts",
    imports,
    declarations,
    diagnostics: []
  };
}

function importRecord(resolvedPath: string, typeOnly = false): ResolvedImportRecord {
  return {
    specifier: `./${resolvedPath.split("/").at(-1)}`,
    typeOnly,
    reExport: false,
    starReExport: false,
    bindings: [],
    resolvedPath
  };
}

function makeSnapshot(files: SnapshotFile[], edges: SnapshotEdge[] = []): Snapshot {
  const declarations = files.flatMap((item) => item.declarations);
  const count = (kind: DeclarationKind) =>
    declarations.filter((item) => item.kind === kind).length;
  return {
    commit: "c1",
    branch: "main",
    analyzerVersion: "1.0.0",
    files,
    edges,
    diagnostics: [],
    stats: {
      files: files.length,
      declarations: declarations.length,
      classes: count("class"),
      interfaces: count("interface"),
      enums: count("enum"),
      types: count("type"),
      functions: count("function"),
      edges: edges.length
    }
  };
}

function edge(
  kind: SnapshotEdge["kind"],
  from: SnapshotDeclaration,
  to: SnapshotDeclaration,
  typeOnly = false
): SnapshotEdge {
  return {
    id: `${kind}:${from.id}->${to.id}`,
    kind,
    from: from.id,
    to: to.id,
    fromPath: from.path,
    toPath: to.path,
    typeOnly
  };
}

describe("proyección de clases", () => {
  it("representa clases, interfaces y enums con estereotipos y relaciones", () => {
    const animal = declaration("src/domain/animal.ts", "interface", "Animal", {
      members: [member({ name: "name", type: "string" })]
    });
    const base = declaration("src/domain/animal.ts", "class", "Base", { abstract: true });
    const dog = declaration("src/domain/animal.ts", "class", "Dog", {
      heritage: [{ kind: "implements", name: "Animal" }]
    });
    const color = declaration("src/domain/animal.ts", "enum", "Color");
    const helper = declaration("src/domain/animal.ts", "function", "helper");
    const snapshot = makeSnapshot(
      [file("src/domain/animal.ts", [animal, base, dog, color, helper])],
      [
        edge("implements", dog, animal),
        edge("association", dog, base),
        edge("extends", dog, helper)
      ]
    );

    const projection = projectSnapshot(snapshot, "classes");

    expect(projection.nodes.map((node) => node.label).sort()).toEqual([
      "Animal",
      "Base",
      "Color",
      "Dog"
    ]);
    const stereotypes = Object.fromEntries(
      projection.nodes.map((node) => [
        node.label,
        (node.data as { stereotype: string }).stereotype
      ])
    );
    expect(stereotypes).toEqual({
      Animal: "interface",
      Base: "abstract class",
      Color: "enum",
      Dog: "class"
    });
    expect(projection.containers).toEqual([]);
    expect(projection.edges.map((item) => item.kind).sort()).toEqual([
      "association",
      "implements"
    ]);
    expect(projection.edges.every((item) => item.source.endsWith("Dog"))).toBe(true);
  });
});

describe("proyección de módulos", () => {
  it("modela archivos, funciones y tipos, con carpetas anidadas e imports", () => {
    const add = declaration("src/util/math.ts", "function", "add", {
      signature: "add(a: number, b: number): number"
    });
    const result = declaration("src/util/math.ts", "type", "Result", { type: "number" });
    const normalize = declaration("src/util/text.ts", "function", "normalize");
    const app = declaration("src/app.ts", "function", "main");
    const math = file("src/util/math.ts", [add, result], [importRecord("src/util/text.ts")]);
    const text = file("src/util/text.ts", [normalize]);
    const entry = file("src/app.ts", [app]);
    const snapshot = makeSnapshot([entry, math, text], [
      {
        id: "imports:module:src/util/math.ts->module:src/util/text.ts",
        kind: "imports",
        from: "module:src/util/math.ts",
        to: "module:src/util/text.ts",
        fromPath: "src/util/math.ts",
        toPath: "src/util/text.ts",
        typeOnly: false
      }
    ]);

    const projection = projectSnapshot(snapshot, "modules");

    expect(projection.nodes.map((node) => node.id).sort()).toEqual([
      "module:src/app.ts",
      "module:src/util/math.ts",
      "module:src/util/text.ts"
    ]);
    const mathNode = projection.nodes.find((node) => node.path === "src/util/math.ts")!;
    const data = mathNode.data as { functions: SnapshotDeclaration[]; types: SnapshotDeclaration[] };
    expect(data.functions.map((item) => item.name)).toEqual(["add"]);
    expect(data.types.map((item) => item.name)).toEqual(["Result"]);
    expect(mathNode.containerId).toBe("folder:src/util");
    expect(projection.containers).toEqual([
      { id: "folder:src", label: "src", path: "src", parentId: null },
      { id: "folder:src/util", label: "util", path: "src/util", parentId: "folder:src" }
    ]);
    expect(projection.edges).toEqual([
      {
        id: "imports:module:src/util/math.ts->module:src/util/text.ts",
        kind: "imports",
        source: "module:src/util/math.ts",
        target: "module:src/util/text.ts",
        typeOnly: false
      }
    ]);
  });

  it("construye contenedores aunque no haya archivos en la raíz", () => {
    expect(buildContainers(["a/b/c.ts", "a/d.ts"])).toEqual([
      { id: "folder:a", label: "a", path: "a", parentId: null },
      { id: "folder:a/b", label: "b", path: "a/b", parentId: "folder:a" }
    ]);
  });
});

describe("proyección de paquetes", () => {
  it("agrega dependencias entre carpetas y descarta las internas", () => {
    const a = declaration("src/a.ts", "function", "a");
    const b = declaration("src/b.ts", "function", "b");
    const c = declaration("src/deep/c.ts", "function", "c");
    const entry = declaration("index.ts", "function", "entry");
    const files = [
      file("index.ts", [entry], [importRecord("src/a.ts")]),
      file("src/a.ts", [a], [importRecord("src/b.ts"), importRecord("src/deep/c.ts", true)]),
      file("src/b.ts", [b], [importRecord("src/deep/c.ts")]),
      file("src/deep/c.ts", [c])
    ];
    const moduleEdge = (
      fromPath: string,
      toPath: string,
      typeOnly = false
    ): SnapshotEdge => ({
      id: `imports:module:${fromPath}->module:${toPath}`,
      kind: "imports",
      from: `module:${fromPath}`,
      to: `module:${toPath}`,
      fromPath,
      toPath,
      typeOnly
    });
    const snapshot = makeSnapshot(files, [
      moduleEdge("index.ts", "src/a.ts"),
      moduleEdge("src/a.ts", "src/b.ts"),
      moduleEdge("src/a.ts", "src/deep/c.ts", true),
      moduleEdge("src/b.ts", "src/deep/c.ts")
    ]);

    const projection = projectSnapshot(snapshot, "packages");

    expect(projection.nodes.map((node) => node.label)).toEqual([
      "(raíz)",
      "src",
      "deep"
    ]);
    expect(projection.nodes.map((node) => (node.data as { moduleCount: number }).moduleCount)).toEqual([
      1,
      2,
      1
    ]);
    expect(projection.edges).toEqual([
      {
        id: "imports:package:->src",
        kind: "imports",
        source: "package:",
        target: "package:src",
        typeOnly: false
      },
      {
        id: "imports:package:src->src/deep",
        kind: "imports",
        source: "package:src",
        target: "package:src/deep",
        typeOnly: false
      }
    ]);
  });
});

describe("vista inicial", () => {
  it("elige clases cuando hay clases o interfaces", () => {
    const item = declaration("src/a.ts", "class", "A");
    expect(initialViewFor(makeSnapshot([file("src/a.ts", [item])]))).toBe("classes");
  });

  it("elige módulos para proyectos funcionales o vacíos con archivos", () => {
    const item = declaration("src/a.ts", "function", "a");
    expect(initialViewFor(makeSnapshot([file("src/a.ts", [item])]))).toBe("modules");
    expect(initialViewFor(makeSnapshot([file("src/empty.ts", [])]))).toBe("modules");
  });

  it("elige clases cuando no hay archivos", () => {
    expect(initialViewFor(makeSnapshot([]))).toBe("classes");
  });
});

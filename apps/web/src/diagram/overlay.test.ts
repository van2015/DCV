import { describe, expect, it } from "vitest";
import type {
  DeclarationModel,
  Snapshot,
  SnapshotDeclaration,
  SnapshotDiff,
  SnapshotEdge,
  SnapshotFile
} from "@dcv/shared";
import {
  buildOverlay,
  filterOverlay,
  overlaySummary,
  DEFAULT_CHANGE_FILTERS
} from "./overlay.js";
import { projectSnapshot } from "./projection.js";

const RANGE = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };

function declaration(
  path: string,
  kind: SnapshotDeclaration["kind"],
  name: string
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
    members: [
      {
        kind: "method",
        name: "run",
        visibility: "public",
        static: false,
        readonly: false,
        optional: false,
        abstract: false,
        async: false,
        signature: "run(): void",
        type: "void",
        bodyHash: "body",
        sourceRange: RANGE
      }
    ],
    heritage: [],
    bodyHash: null,
    sourceRange: RANGE
  };
}

function file(path: string, declarations: SnapshotDeclaration[]): SnapshotFile {
  return {
    path,
    contentHash: `hash:${path}`,
    scriptKind: "ts",
    imports: [],
    declarations,
    diagnostics: []
  };
}

function snapshot(files: SnapshotFile[], edges: SnapshotEdge[] = []): Snapshot {
  const declarations = files.flatMap((item) => item.declarations);
  const count = (kind: SnapshotDeclaration["kind"]) =>
    declarations.filter((item) => item.kind === kind).length;
  return {
    commit: "c2",
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
  id: string,
  kind: SnapshotEdge["kind"],
  from: string,
  to: string,
  typeOnly = false
): SnapshotEdge {
  return {
    id,
    kind,
    from,
    to,
    fromPath: from.replace(/^module:/, "").split("#")[0]!,
    toPath: to.replace(/^module:/, "").split("#")[0]!,
    typeOnly
  };
}

function asModel(item: SnapshotDeclaration): DeclarationModel {
  const { id: _id, path: _path, ...model } = item;
  return model;
}

describe("overlay de clases", () => {
  it("marca añadidos, modificados y fantasmas de eliminados", () => {
    const service = declaration("src/service.ts", "class", "Service");
    const added = declaration("src/new.ts", "class", "New");
    const old = declaration("src/old.ts", "class", "Old");
    const current = snapshot([file("src/service.ts", [service]), file("src/new.ts", [added])]);
    const projection = projectSnapshot(current, "classes");
    const diff: SnapshotDiff = {
      from: "c1",
      to: "c2",
      isEmpty: false,
      files: [
        { status: "modified", path: "src/service.ts", previousPath: null, probable: false },
        { status: "removed", path: "src/old.ts", previousPath: null, probable: false }
      ],
      declarations: [
        {
          status: "modified",
          id: service.id,
          previousId: service.id,
          kind: "class",
          name: "Service",
          path: "src/service.ts",
          previousPath: "src/service.ts",
          probable: false,
          declaration: asModel(service),
          previousDeclaration: asModel(service)
        },
        {
          status: "removed",
          id: old.id,
          previousId: old.id,
          kind: "class",
          name: "Old",
          path: "src/old.ts",
          previousPath: "src/old.ts",
          probable: false,
          declaration: null,
          previousDeclaration: asModel(old)
        },
        {
          status: "added",
          id: added.id,
          previousId: null,
          kind: "class",
          name: "New",
          path: "src/new.ts",
          previousPath: null,
          probable: false,
          declaration: asModel(added),
          previousDeclaration: null
        }
      ],
      members: [
        {
          status: "modified",
          parentId: service.id,
          parentName: "Service",
          parentKind: "class",
          parentPath: "src/service.ts",
          memberKey: "method:run",
          member: service.members[0]!,
          previousMember: { ...service.members[0]!, bodyHash: "before" },
          probable: false
        },
        {
          status: "body-only",
          parentId: service.id,
          parentName: "Service",
          parentKind: "class",
          parentPath: "src/service.ts",
          memberKey: "method:paint",
          member: { ...service.members[0]!, name: "paint" },
          previousMember: { ...service.members[0]!, name: "paint", bodyHash: "old" },
          probable: false
        }
      ],
      edges: []
    };

    const overlay = buildOverlay(projection, diff);

    expect(overlay.nodeStatuses.get(service.id)?.status).toBe("modified");
    expect(overlay.nodeStatuses.get(added.id)?.status).toBe("added");
    expect(overlay.ghosts).toHaveLength(1);
    expect(overlay.ghosts[0]).toMatchObject({
      id: `ghost:${old.id}`,
      kind: "class",
      label: "Old"
    });
    expect(overlaySummary(overlay)).toMatchInlineSnapshot('"+ 1 ~ 1"');
    expect(overlay.memberStatuses.get(service.id)?.get("method:paint")?.status).toBe(
      "body-only"
    );

    const withoutImplementation = filterOverlay(overlay, {
      ...DEFAULT_CHANGE_FILTERS,
      implementation: false
    });
    expect(withoutImplementation.memberStatuses.get(service.id)?.has("method:paint")).toBe(
      false
    );
    expect(withoutImplementation.memberStatuses.get(service.id)?.has("method:run")).toBe(
      true
    );

    const withoutMembers = filterOverlay(overlay, {
      ...DEFAULT_CHANGE_FILTERS,
      members: false
    });
    expect(withoutMembers.memberStatuses.size).toBe(0);
  });

  it("oculta cambios de tipos al desactivar el filtro", () => {
    const service = declaration("src/service.ts", "class", "Service");
    const shape = declaration("src/shape.ts", "interface", "Shape");
    const current = snapshot([file("src/service.ts", [service]), file("src/shape.ts", [shape])]);
    const projection = projectSnapshot(current, "classes");
    const diff: SnapshotDiff = {
      from: "c1",
      to: "c2",
      isEmpty: false,
      files: [],
      declarations: [
        {
          status: "modified",
          id: shape.id,
          previousId: shape.id,
          kind: "interface",
          name: "Shape",
          path: "src/shape.ts",
          previousPath: "src/shape.ts",
          probable: false,
          declaration: asModel(shape),
          previousDeclaration: asModel(shape)
        }
      ],
      members: [],
      edges: []
    };

    const overlay = buildOverlay(projection, diff);
    expect(overlay.nodeStatuses.has(shape.id)).toBe(true);

    const filtered = filterOverlay(overlay, {
      ...DEFAULT_CHANGE_FILTERS,
      types: false
    });
    expect(filtered.nodeStatuses.has(shape.id)).toBe(false);
  });

  it("marca aristas añadidas y conserva eliminadas como fantasmas", () => {
    const a = declaration("src/a.ts", "class", "A");
    const b = declaration("src/b.ts", "class", "B");
    const old = declaration("src/old.ts", "class", "Old");
    const added = edge("edge-added", "extends", a.id, b.id);
    const current = snapshot([file("src/a.ts", [a]), file("src/b.ts", [b])], [added]);
    const projection = projectSnapshot(current, "classes");
    const diff: SnapshotDiff = {
      from: "c1",
      to: "c2",
      isEmpty: false,
      files: [{ status: "removed", path: "src/old.ts", previousPath: null, probable: false }],
      declarations: [
        {
          status: "removed",
          id: old.id,
          previousId: old.id,
          kind: "class",
          name: "Old",
          path: "src/old.ts",
          previousPath: "src/old.ts",
          probable: false,
          declaration: null,
          previousDeclaration: asModel(old)
        }
      ],
      members: [],
      edges: [
        {
          status: "added",
          kind: "extends",
          from: a.id,
          to: b.id,
          fromPath: "src/a.ts",
          toPath: "src/b.ts",
          typeOnly: false
        },
        {
          status: "removed",
          kind: "association",
          from: a.id,
          to: b.id,
          fromPath: "src/a.ts",
          toPath: "src/b.ts",
          typeOnly: false
        },
        {
          status: "removed",
          kind: "association",
          from: b.id,
          to: old.id,
          fromPath: "src/b.ts",
          toPath: "src/old.ts",
          typeOnly: true
        },
        {
          status: "removed",
          kind: "association",
          from: a.id,
          to: "src/missing.ts#class:Missing",
          fromPath: "src/a.ts",
          toPath: "src/missing.ts",
          typeOnly: false
        }
      ]
    };

    const overlay = buildOverlay(projection, diff);

    expect(overlay.edgeStatuses.get(added.id)).toBe("added");
    expect(overlay.ghostEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "association",
          source: a.id,
          target: b.id,
          typeOnly: false
        }),
        expect.objectContaining({
          kind: "association",
          source: b.id,
          target: `ghost:${old.id}`,
          typeOnly: true
        })
      ])
    );
    expect(overlay.ghostEdges).toHaveLength(2);

    const filtered = filterOverlay(overlay, DEFAULT_CHANGE_FILTERS);
    expect(filtered.edgeStatuses.get(added.id)).toBe("added");
    expect(filtered.ghostEdges).toHaveLength(2);
  });
});

describe("overlay de módulos", () => {
  it("marca archivos y construye módulos fantasma de archivos eliminados", () => {
    const kept = declaration("src/kept.ts", "function", "kept");
    const added = declaration("src/new.ts", "function", "added");
    const gone = declaration("src/gone.ts", "function", "gone");
    const current = snapshot([file("src/kept.ts", [kept]), file("src/new.ts", [added])]);
    const projection = projectSnapshot(current, "modules");
    const diff: SnapshotDiff = {
      from: "c1",
      to: "c2",
      isEmpty: false,
      files: [
        { status: "added", path: "src/new.ts", previousPath: null, probable: false },
        { status: "removed", path: "src/gone.ts", previousPath: null, probable: false },
        { status: "modified", path: "src/kept.ts", previousPath: null, probable: false }
      ],
      declarations: [
        {
          status: "removed",
          id: gone.id,
          previousId: gone.id,
          kind: "function",
          name: "gone",
          path: "src/gone.ts",
          previousPath: "src/gone.ts",
          probable: false,
          declaration: null,
          previousDeclaration: asModel(gone)
        }
      ],
      members: [],
      edges: []
    };

    const overlay = buildOverlay(projection, diff);

    expect(overlay.nodeStatuses.get("module:src/new.ts")?.status).toBe("added");
    expect(overlay.nodeStatuses.get("module:src/kept.ts")?.status).toBe("modified");
    expect(overlay.ghosts).toEqual([
      {
        id: "ghost:module:src/gone.ts",
        kind: "module",
        label: "gone.ts",
        path: "src/gone.ts",
        data: {
          kind: "module",
          path: "src/gone.ts",
          functions: [expect.objectContaining({ name: "gone", id: gone.id })],
          types: []
        }
      }
    ]);
  });

  it("colorea aristas entre módulos y crea fantasmas hacia módulos eliminados", () => {
    const kept = declaration("src/kept.ts", "function", "kept");
    const added = declaration("src/new.ts", "function", "added");
    const gone = declaration("src/gone.ts", "function", "gone");
    const addEdge = edge(
      "imports:module:src/kept.ts->module:src/new.ts",
      "imports",
      "module:src/kept.ts",
      "module:src/new.ts"
    );
    const current = snapshot(
      [file("src/kept.ts", [kept]), file("src/new.ts", [added])],
      [addEdge]
    );
    const projection = projectSnapshot(current, "modules");
    const diff: SnapshotDiff = {
      from: "c1",
      to: "c2",
      isEmpty: false,
      files: [
        { status: "added", path: "src/new.ts", previousPath: null, probable: false },
        { status: "removed", path: "src/gone.ts", previousPath: null, probable: false }
      ],
      declarations: [
        {
          status: "removed",
          id: gone.id,
          previousId: gone.id,
          kind: "function",
          name: "gone",
          path: "src/gone.ts",
          previousPath: "src/gone.ts",
          probable: false,
          declaration: null,
          previousDeclaration: asModel(gone)
        }
      ],
      members: [],
      edges: [
        {
          status: "added",
          kind: "imports",
          from: "module:src/kept.ts",
          to: "module:src/new.ts",
          fromPath: "src/kept.ts",
          toPath: "src/new.ts",
          typeOnly: false
        },
        {
          status: "removed",
          kind: "imports",
          from: "module:src/gone.ts",
          to: "module:src/kept.ts",
          fromPath: "src/gone.ts",
          toPath: "src/kept.ts",
          typeOnly: true
        }
      ]
    };

    const overlay = buildOverlay(projection, diff);

    expect(overlay.edgeStatuses.get(addEdge.id)).toBe("added");
    expect(overlay.ghostEdges).toEqual([
      {
        id: "ghost-edge:imports:ghost:module:src/gone.ts->module:src/kept.ts",
        kind: "imports",
        source: "ghost:module:src/gone.ts",
        target: "module:src/kept.ts",
        typeOnly: true
      }
    ]);
  });
});

describe("overlay de paquetes", () => {
  it("colorea aristas agregadas y agrupa importaciones eliminadas", () => {
    const a = declaration("src/a/x.ts", "function", "x");
    const a2 = declaration("src/a/z.ts", "function", "z");
    const b = declaration("src/b/y.ts", "function", "y");
    const c = declaration("src/c/w.ts", "function", "w");
    const added = edge(
      "imports:package:src/a->src/b",
      "imports",
      "module:src/a/x.ts",
      "module:src/b/y.ts"
    );
    const existing = edge(
      "imports:package:src/a->src/c",
      "imports",
      "module:src/a/z.ts",
      "module:src/c/w.ts"
    );
    const current = snapshot(
      [
        file("src/a/x.ts", [a]),
        file("src/a/z.ts", [a2]),
        file("src/b/y.ts", [b]),
        file("src/c/w.ts", [c])
      ],
      [added, existing]
    );
    const projection = projectSnapshot(current, "packages");
    const diff: SnapshotDiff = {
      from: "c1",
      to: "c2",
      isEmpty: false,
      files: [],
      declarations: [],
      members: [],
      edges: [
        {
          status: "added",
          kind: "imports",
          from: "module:src/a/x.ts",
          to: "module:src/b/y.ts",
          fromPath: "src/a/x.ts",
          toPath: "src/b/y.ts",
          typeOnly: false
        },
        {
          status: "removed",
          kind: "imports",
          from: "module:src/c/w.ts",
          to: "module:src/b/y.ts",
          fromPath: "src/c/w.ts",
          toPath: "src/b/y.ts",
          typeOnly: true
        },
        {
          status: "removed",
          kind: "imports",
          from: "module:src/a/z.ts",
          to: "module:src/c/w.ts",
          fromPath: "src/a/z.ts",
          toPath: "src/c/w.ts",
          typeOnly: false
        },
        {
          status: "removed",
          kind: "imports",
          from: "module:src/a/x.ts",
          to: "module:src/missing/q.ts",
          fromPath: "src/a/x.ts",
          toPath: "src/missing/q.ts",
          typeOnly: false
        }
      ]
    };

    const overlay = buildOverlay(projection, diff);

    expect(overlay.edgeStatuses.get(added.id)).toBe("added");
    expect(overlay.edgeStatuses.has(existing.id)).toBe(false);
    expect(overlay.ghostEdges).toEqual([
      {
        id: "ghost-edge:imports|package:src/c|package:src/b",
        kind: "imports",
        source: "package:src/c",
        target: "package:src/b",
        typeOnly: true
      }
    ]);
  });
});

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
});

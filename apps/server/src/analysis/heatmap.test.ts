import type {
  MemberModel,
  Snapshot,
  SnapshotDeclaration,
  SnapshotDiff,
  SnapshotFile
} from "@dcv/shared";
import { describe, expect, it } from "vitest";
import {
  aggregateHeatmap,
  createHeatmapCounts,
  heatmapDelta,
  heatmapEntityCounts,
  type HeatmapDeclarationDelta,
  type HeatmapDelta,
  type HeatmapFileDelta,
  type HeatmapMemberDelta
} from "./heatmap.js";

const RANGE = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };

function member(name: string, bodyHash: string = name): MemberModel {
  return {
    kind: "method",
    name,
    visibility: "public",
    static: false,
    readonly: false,
    optional: false,
    abstract: false,
    async: false,
    signature: `${name}(): void`,
    type: "void",
    bodyHash,
    sourceRange: RANGE
  };
}

function declaration(
  path: string,
  name: string,
  members: MemberModel[] = []
): SnapshotDeclaration {
  return {
    id: `${path}#class:${name}`,
    path,
    kind: "class",
    name,
    exported: true,
    defaultExport: false,
    abstract: false,
    declare: false,
    async: false,
    signature: null,
    type: null,
    members,
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

function snapshot(commit: string, files: SnapshotFile[]): Snapshot {
  const declarations = files.flatMap((item) => item.declarations);
  return {
    commit,
    branch: "main",
    analyzerVersion: "1.0.0",
    files,
    edges: [],
    diagnostics: [],
    stats: {
      files: files.length,
      declarations: declarations.length,
      classes: declarations.filter((item) => item.kind === "class").length,
      interfaces: declarations.filter((item) => item.kind === "interface").length,
      enums: declarations.filter((item) => item.kind === "enum").length,
      types: declarations.filter((item) => item.kind === "type").length,
      functions: declarations.filter((item) => item.kind === "function").length,
      edges: 0
    }
  };
}

function memberDelta(
  key: string,
  status: HeatmapMemberDelta["status"],
  previousMemberKey: string | null = null
): HeatmapMemberDelta {
  return { memberKey: key, previousMemberKey, status };
}

function declarationDelta(
  overrides: Partial<HeatmapDeclarationDelta> & {
    id: string;
    path: string;
  }
): HeatmapDeclarationDelta {
  return {
    previousId: overrides.id,
    status: "modified",
    previousPath: overrides.path,
    members: [],
    ...overrides
  };
}

function delta(
  commit: string,
  declarations: HeatmapDeclarationDelta[],
  files: HeatmapFileDelta[] = []
): HeatmapDelta {
  return { commit, files, declarations };
}

describe("agregación histórica de cambios", () => {
  it("cuenta una sola vez por commit aunque cambien varios miembros", () => {
    const path = "src/domain/a.ts";
    const id = `${path}#class:A`;
    const counts = aggregateHeatmap([
      delta("c2", [
        declarationDelta({
          id,
          path,
          members: [
            memberDelta("method:run", "modified"),
            memberDelta("method:ping", "modified")
          ]
        })
      ])
    ]);

    expect(counts.declarations.get(id)?.size).toBe(1);
    expect(counts.members.get(id)?.get("method:run")?.size).toBe(1);
    expect(counts.members.get(id)?.get("method:ping")?.size).toBe(1);
    expect(counts.modules.get(path)?.size).toBe(1);
    expect(counts.packages.get("src/domain")?.size).toBe(1);
  });

  it("acumula hasta el commit elegido sin adelantar commits posteriores", () => {
    const path = "src/a.ts";
    const id = `${path}#class:A`;
    const second = delta("c2", [declarationDelta({ id, path })]);
    const fourth = delta("c4", [declarationDelta({ id, path })]);

    expect(aggregateHeatmap([second]).declarations.get(id)?.size).toBe(1);
    expect(aggregateHeatmap([second, fourth]).declarations.get(id)?.size).toBe(2);
  });

  it("conserva la identidad en un renombrado y suma el commit del cambio", () => {
    const firstPath = "src/a.ts";
    const firstId = `${firstPath}#class:A`;
    const secondPath = "src/b.ts";
    const secondId = `${secondPath}#class:B`;
    const counts = aggregateHeatmap([
      delta("c2", [declarationDelta({ id: firstId, path: firstPath })]),
      delta("c3", [
        declarationDelta({
          id: secondId,
          previousId: firstId,
          status: "renamed",
          path: secondPath,
          previousPath: firstPath
        })
      ]),
      delta("c4", [declarationDelta({ id: secondId, path: secondPath })])
    ]);

    expect(counts.declarations.get(firstId)).toBeUndefined();
    expect(counts.declarations.get(secondId)?.size).toBe(3);
  });

  it("transfiere módulos y declaraciones al renombrar un archivo", () => {
    const oldPath = "src/old/a.ts";
    const newPath = "src/new/a.ts";
    const oldId = `${oldPath}#class:A`;
    const newId = `${newPath}#class:A`;
    const counts = aggregateHeatmap([
      delta("c2", [declarationDelta({ id: oldId, path: oldPath })]),
      delta(
        "c3",
        [],
        [{ status: "renamed", path: newPath, previousPath: oldPath }]
      )
    ]);

    expect(counts.modules.get(oldPath)).toBeUndefined();
    expect(counts.modules.get(newPath)?.size).toBe(2);
    expect(counts.declarations.get(newId)?.size).toBe(2);
    expect(counts.packages.get("src/old")?.size).toBe(2);
    expect(counts.packages.get("src/new")?.size).toBe(1);
  });

  it("transfiere la identidad de un miembro renombrado", () => {
    const path = "src/a.ts";
    const id = `${path}#class:A`;
    const counts = aggregateHeatmap([
      delta("c2", [
        declarationDelta({
          id,
          path,
          members: [memberDelta("method:run", "modified")]
        })
      ]),
      delta("c3", [
        declarationDelta({
          id,
          path,
          members: [
            memberDelta("method:execute", "renamed", "method:run")
          ]
        })
      ]),
      delta("c4", [
        declarationDelta({
          id,
          path,
          members: [memberDelta("method:execute", "modified")]
        })
      ])
    ]);

    expect(counts.members.get(id)?.get("method:run")).toBeUndefined();
    expect(counts.members.get(id)?.get("method:execute")?.size).toBe(3);
    expect(counts.declarations.get(id)?.size).toBe(3);
  });

  it("descarta una entidad eliminada y reinicia su conteo si reaparece", () => {
    const path = "src/a.ts";
    const id = `${path}#class:A`;
    const counts = aggregateHeatmap([
      delta("c2", [declarationDelta({ id, path })]),
      delta("c3", [
        declarationDelta({
          id,
          previousId: null,
          status: "removed",
          path,
          previousPath: path
        })
      ]),
      delta("c4", [
        declarationDelta({
          id,
          previousId: null,
          status: "added",
          path,
          previousPath: null,
          members: [memberDelta("method:run", "added")]
        })
      ])
    ]);

    expect(counts.declarations.get(id)?.size).toBe(1);
    expect(counts.members.get(id)?.get("method:run")?.size).toBe(1);
    expect(counts.packages.get("src")?.size).toBe(3);
  });

  it("genera entradas en cero para todas las entidades de la vista", () => {
    const path = "src/a.ts";
    const first = declaration(path, "First", [member("run")]);
    const second = declaration(path, "Second");
    const counts = createHeatmapCounts();
    const result = heatmapEntityCounts(counts, snapshot("c1", [file(path, [first, second])]));

    expect(result.nodes).toEqual({
      "module:src/a.ts": 0,
      [`${path}#class:First`]: 0,
      [`${path}#class:Second`]: 0,
      "package:src": 0
    });
    expect(result.members).toEqual({
      [`${path}#class:First`]: { "method:run": 0 }
    });
  });

  it("convierte el diff en deltas estructurales y omite body-only", () => {
    const path = "src/a.ts";
    const id = `${path}#class:A`;
    const current = declaration(path, "A", [member("run")]);
    const diff: SnapshotDiff = {
      from: "c1",
      to: "c2",
      isEmpty: false,
      files: [
        { status: "modified", path, previousPath: null, probable: false },
        { status: "added", path: "src/b.ts", previousPath: null, probable: false }
      ],
      declarations: [
        {
          status: "modified",
          id,
          previousId: id,
          kind: "class",
          name: "A",
          path,
          previousPath: path,
          probable: false,
          declaration: current,
          previousDeclaration: current
        },
        {
          status: "body-only",
          id: `${path}#class:Ignored`,
          previousId: `${path}#class:Ignored`,
          kind: "class",
          name: "Ignored",
          path,
          previousPath: path,
          probable: false,
          declaration: declaration(path, "Ignored"),
          previousDeclaration: declaration(path, "Ignored")
        }
      ],
      members: [
        {
          status: "modified",
          parentId: id,
          parentName: "A",
          parentKind: "class",
          parentPath: path,
          memberKey: "method:run",
          member: member("run"),
          previousMember: member("run", "old"),
          probable: false
        },
        {
          status: "body-only",
          parentId: id,
          parentName: "A",
          parentKind: "class",
          parentPath: path,
          memberKey: "method:ping",
          member: member("ping"),
          previousMember: member("ping", "old"),
          probable: false
        }
      ],
      edges: []
    };

    const result = heatmapDelta("c2", diff);

    expect(result.files).toEqual([
      { status: "added", path: "src/b.ts", previousPath: null }
    ]);
    expect(result.declarations).toEqual([
      {
        id,
        previousId: id,
        status: "modified",
        path,
        previousPath: path,
        members: [
          {
            memberKey: "method:run",
            previousMemberKey: "method:run",
            status: "modified"
          }
        ]
      }
    ]);
  });

  it("incluye los miembros de una declaración añadida", () => {
    const path = "src/a.ts";
    const id = `${path}#class:A`;
    const current = declaration(path, "A", [member("run"), member("stop")]);
    const result = heatmapDelta("c2", {
      from: "c1",
      to: "c2",
      isEmpty: false,
      files: [],
      declarations: [
        {
          status: "added",
          id,
          previousId: null,
          kind: "class",
          name: "A",
          path,
          previousPath: null,
          probable: false,
          declaration: current,
          previousDeclaration: null
        }
      ],
      members: [],
      edges: []
    });

    expect(result.declarations[0]?.members).toEqual([
      { memberKey: "method:run", previousMemberKey: null, status: "added" },
      { memberKey: "method:stop", previousMemberKey: null, status: "added" }
    ]);
  });
});

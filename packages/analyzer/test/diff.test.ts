import {
  declarationNodeId,
  type DeclarationKind,
  type DeclarationModel,
  type MemberKind,
  type MemberModel,
  type Snapshot,
  type SnapshotDeclaration,
  type SnapshotEdge,
  type SnapshotFile
} from "@dcv/shared";
import { describe, expect, it } from "vitest";
import { diffSnapshots } from "../src/diff.js";

const range = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };

function member(
  partial: Partial<MemberModel> & { kind: MemberKind; name: string }
): MemberModel {
  return {
    visibility: "public",
    static: false,
    readonly: false,
    optional: false,
    abstract: false,
    async: false,
    signature: null,
    type: null,
    bodyHash: null,
    sourceRange: range,
    ...partial
  };
}

function declaration(
  partial: Partial<DeclarationModel> & { kind: DeclarationKind; name: string }
): DeclarationModel {
  return {
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
    sourceRange: range,
    ...partial
  };
}

function file(
  path: string,
  contentHash: string,
  declarations: DeclarationModel[]
): SnapshotFile {
  const snapshotDeclarations: SnapshotDeclaration[] = declarations.map((item) => ({
    ...item,
    id: declarationNodeId(path, item.kind, item.name),
    path
  }));
  return {
    path,
    contentHash,
    scriptKind: "ts",
    imports: [],
    declarations: snapshotDeclarations,
    diagnostics: []
  };
}

function snapshot(commit: string, files: SnapshotFile[], edges: SnapshotEdge[] = []): Snapshot {
  const declarations = files.flatMap((item) => item.declarations);
  const count = (kind: DeclarationKind) =>
    declarations.filter((item) => item.kind === kind).length;
  return {
    commit,
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

describe("diffSnapshots", () => {
  it("clasifica añadidos, eliminados, modificados y miembros", () => {
    const previous = snapshot("1111111", [
      file("src/a.ts", "hash-a1", [
        declaration({
          kind: "class",
          name: "Alpha",
          members: [
            member({ kind: "method", name: "run", signature: "(x: number) => void", bodyHash: "run-1" })
          ]
        })
      ]),
      file("src/gone.ts", "hash-g1", [
        declaration({ kind: "function", name: "gone", signature: "() => void", bodyHash: "gone-1" })
      ])
    ]);
    const current = snapshot("2222222", [
      file("src/a.ts", "hash-a2", [
        declaration({
          kind: "class",
          name: "Alpha",
          members: [
            member({ kind: "method", name: "run", signature: "(x: string) => void", bodyHash: "run-2" }),
            member({ kind: "method", name: "stop", signature: "() => void", bodyHash: "stop-1" })
          ]
        })
      ]),
      file("src/new.ts", "hash-n1", [
        declaration({ kind: "class", name: "New" })
      ])
    ]);

    const diff = diffSnapshots(previous, current);

    expect(diff.from).toBe("1111111");
    expect(diff.to).toBe("2222222");
    expect(diff.isEmpty).toBe(false);
    expect(diff.files.map((change) => [change.status, change.path])).toEqual([
      ["modified", "src/a.ts"],
      ["removed", "src/gone.ts"],
      ["added", "src/new.ts"]
    ]);

    const byId = new Map(diff.declarations.map((change) => [change.id, change]));
    expect(byId.get("src/a.ts#class:Alpha")).toMatchObject({
      status: "modified",
      previousId: "src/a.ts#class:Alpha",
      probable: false
    });
    expect(byId.get("src/gone.ts#function:gone")).toMatchObject({
      status: "removed",
      declaration: null
    });
    expect(byId.get("src/new.ts#class:New")).toMatchObject({
      status: "added",
      previousDeclaration: null
    });

    const memberChanges = diff.members
      .filter((change) => change.parentId === "src/a.ts#class:Alpha")
      .map((change) => [change.memberKey, change.status]);
    expect(memberChanges).toEqual([
      ["method:run", "modified"],
      ["method:stop", "added"]
    ]);

    expect(diff).toMatchSnapshot();
  });

  it("distingue firma modificada de solo cuerpo modificado", () => {
    const previous = snapshot("1", [
      file("src/f.ts", "c1", [
        declaration({
          kind: "function",
          name: "compute",
          signature: "(x: number) => number",
          bodyHash: "body-1"
        })
      ]),
      file("src/c.ts", "c2", [
        declaration({
          kind: "class",
          name: "Service",
          members: [
            member({ kind: "method", name: "load", signature: "() => void", bodyHash: "load-1" })
          ]
        })
      ])
    ]);

    const bodyOnly = diffSnapshots(
      previous,
      snapshot("2", [
        file("src/f.ts", "c1b", [
          declaration({
            kind: "function",
            name: "compute",
            signature: "(x: number) => number",
            bodyHash: "body-2"
          })
        ]),
        file("src/c.ts", "c2b", [
          declaration({
            kind: "class",
            name: "Service",
            members: [
              member({ kind: "method", name: "load", signature: "() => void", bodyHash: "load-2" })
            ]
          })
        ])
      ])
    );

    const compute = bodyOnly.declarations.find((change) => change.name === "compute")!;
    expect(compute.status).toBe("body-only");
    const service = bodyOnly.declarations.find((change) => change.name === "Service")!;
    expect(service.status).toBe("body-only");
    expect(bodyOnly.members).toHaveLength(1);
    expect(bodyOnly.members[0]).toMatchObject({ memberKey: "method:load", status: "body-only" });

    const signatureChange = diffSnapshots(
      previous,
      snapshot("3", [
        file("src/f.ts", "c1c", [
          declaration({
            kind: "function",
            name: "compute",
            signature: "(x: string) => number",
            bodyHash: "body-3"
          })
        ]),
        file("src/c.ts", "c2c", [
          declaration({
            kind: "class",
            name: "Service",
            members: [
              member({
                kind: "method",
                name: "load",
                signature: "(force: boolean) => void",
                bodyHash: "load-3"
              })
            ]
          })
        ])
      ])
    );

    expect(signatureChange.declarations.map((change) => change.status)).toEqual([
      "modified",
      "modified"
    ]);
    expect(signatureChange.members[0]!.status).toBe("modified");
  });

  it("no marca cambios cuando solo cambian formato o comentarios", () => {
    const previous = snapshot("1", [
      file("src/f.ts", "c1", [
        declaration({
          kind: "function",
          name: "compute",
          signature: "(x: number) => number",
          bodyHash: "body-1"
        })
      ])
    ]);
    const current = snapshot("2", [
      file("src/f.ts", "c2", [
        declaration({
          kind: "function",
          name: "compute",
          signature: "(x: number) => number",
          bodyHash: "body-1"
        })
      ])
    ]);

    const diff = diffSnapshots(previous, current);

    expect(diff.isEmpty).toBe(true);
    expect(diff.files).toEqual([]);
    expect(diff.declarations).toEqual([]);
  });

  it("presenta movimientos y renombrados probables conservando la identidad", () => {
    const previous = snapshot("1", [
      file("src/old.ts", "c1", [
        declaration({
          kind: "function",
          name: "helper",
          signature: "() => number",
          bodyHash: "helper-body"
        })
      ])
    ]);
    const moved = snapshot("2", [
      file("src/util/helpers.ts", "c2", [
        declaration({
          kind: "function",
          name: "helper",
          signature: "() => number",
          bodyHash: "helper-body"
        })
      ])
    ]);

    const moveDiff = diffSnapshots(previous, moved);
    expect(moveDiff.declarations).toHaveLength(1);
    expect(moveDiff.declarations[0]).toMatchObject({
      status: "moved",
      probable: true,
      previousId: "src/old.ts#function:helper",
      previousPath: "src/old.ts"
    });
    expect(moveDiff.files.map((change) => change.status).sort()).toEqual(["added", "removed"]);

    const renamed = snapshot("3", [
      file("src/old.ts", "c3", [
        declaration({
          kind: "function",
          name: "compute",
          signature: "() => number",
          bodyHash: "helper-body"
        })
      ])
    ]);
    const renameDiff = diffSnapshots(previous, renamed);
    expect(renameDiff.declarations[0]).toMatchObject({
      status: "renamed",
      probable: true,
      name: "compute",
      previousDeclaration: { name: "helper" }
    });
  });

  it("no fusiona declaraciones duplicadas ambiguas", () => {
    const duplicate = () =>
      declaration({
        kind: "function",
        name: "dup",
        signature: "() => number",
        bodyHash: "same-body"
      });
    const previous = snapshot("1", [
      file("src/one.ts", "c1", [duplicate()]),
      file("src/two.ts", "c2", [duplicate()])
    ]);
    const current = snapshot("2", [file("src/three.ts", "c3", [duplicate()])]);

    const diff = diffSnapshots(previous, current);

    expect(diff.declarations.map((change) => change.status).sort()).toEqual([
      "added",
      "removed",
      "removed"
    ]);
    expect(diff.declarations.some((change) => change.probable)).toBe(false);
  });

  it("conserva la identidad al renombrar un archivo y normaliza sus aristas", () => {
    const baseEdge = (path: string): SnapshotEdge => ({
      id: `${path}#class:User->extends->${path}#class:Base`,
      kind: "extends",
      from: declarationNodeId(path, "class", "User"),
      to: declarationNodeId(path, "class", "Base"),
      fromPath: path,
      toPath: path,
      typeOnly: false
    });
    const models = () => [
      declaration({ kind: "class", name: "Base" }),
      declaration({ kind: "class", name: "User", heritage: [{ kind: "extends", name: "Base" }] })
    ];
    const previous = snapshot("1", [file("src/old.ts", "same", models())], [
      baseEdge("src/old.ts")
    ]);
    const current = snapshot("2", [file("src/new.ts", "same", models())], [
      baseEdge("src/new.ts")
    ]);

    const diff = diffSnapshots(previous, current, {
      fileRenames: new Map([["src/old.ts", "src/new.ts"]])
    });

    expect(diff.files).toEqual([
      { status: "renamed", path: "src/new.ts", previousPath: "src/old.ts", probable: false }
    ]);
    expect(diff.declarations).toEqual([]);
    expect(diff.edges).toEqual([]);
    expect(diff.isEmpty).toBe(false);
  });

  it("detecta cambios de miembros dentro de un archivo renombrado por git", () => {
    const model = (bodyHash: string): DeclarationModel[] => [
      declaration({
        kind: "class",
        name: "Service",
        members: [member({ kind: "method", name: "run", signature: "run(): void", bodyHash })]
      })
    ];
    const previous = snapshot("1", [file("src/old.ts", "c1", model("run-a"))]);
    const current = snapshot("2", [file("src/new.ts", "c2", model("run-b"))]);

    const diff = diffSnapshots(previous, current, {
      fileRenames: new Map([["src/old.ts", "src/new.ts"]])
    });

    expect(diff.declarations).toHaveLength(1);
    expect(diff.declarations[0]).toMatchObject({
      status: "body-only",
      name: "Service",
      path: "src/new.ts",
      previousPath: "src/old.ts",
      probable: false
    });
    expect(diff.members).toHaveLength(1);
    expect(diff.members[0]).toMatchObject({
      status: "body-only",
      parentName: "Service",
      memberKey: "method:run",
      probable: false
    });

    const untouched = diffSnapshots(previous, snapshot("3", [file("src/new.ts", "c1", model("run-a"))]), {
      fileRenames: new Map([["src/old.ts", "src/new.ts"]])
    });
    expect(untouched.declarations).toEqual([]);
    expect(untouched.members).toEqual([]);
  });

  it("clasifica aristas añadidas y eliminadas", () => {
    const edge = (from: string, to: string): SnapshotEdge => ({
      id: `${from}->association->${to}`,
      kind: "association",
      from,
      to,
      fromPath: "src/a.ts",
      toPath: "src/b.ts",
      typeOnly: false
    });
    const classes = (withEdge: boolean): SnapshotEdge[] =>
      withEdge ? [edge("src/a.ts#class:A", "src/b.ts#class:B")] : [];
    const previous = snapshot("1", [
      file("src/a.ts", "a1", [declaration({ kind: "class", name: "A" })]),
      file("src/b.ts", "b1", [declaration({ kind: "class", name: "B" })])
    ], classes(true));
    const current = snapshot("2", [
      file("src/a.ts", "a2", [declaration({ kind: "class", name: "A" })]),
      file("src/b.ts", "b2", [declaration({ kind: "class", name: "B" })])
    ], classes(false));

    const diff = diffSnapshots(previous, current);

    expect(diff.edges).toEqual([
      {
        status: "removed",
        kind: "association",
        from: "src/a.ts#class:A",
        to: "src/b.ts#class:B",
        fromPath: "src/a.ts",
        toPath: "src/b.ts"
      }
    ]);
    expect(diff.files).toHaveLength(2);
    expect(diff.files.every((change) => change.status === "modified")).toBe(true);
  });

  it("trata el primer commit como línea base sin cambios", () => {
    const current = snapshot("1", [
      file("src/a.ts", "a1", [declaration({ kind: "class", name: "A" })])
    ]);

    const baseline = diffSnapshots(null, current);
    expect(baseline).toEqual({
      from: null,
      to: "1",
      isEmpty: true,
      files: [],
      declarations: [],
      members: [],
      edges: []
    });

    const sameCommit = diffSnapshots(current, current);
    expect(sameCommit.isEmpty).toBe(true);
    expect(sameCommit.from).toBe("1");
  });
});

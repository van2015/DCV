import { describe, expect, it } from "vitest";
import type {
  DeclarationKind,
  ImportBinding,
  MemberModel,
  ResolvedImportRecord,
  SnapshotDeclaration,
  SnapshotFile
} from "@dcv/shared";
import { buildSnapshotEdges, collectTypeReferences } from "../src/edges.js";
import { findDeclaration } from "../src/symbols.js";

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
    sourceRange: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
    ...overrides
  };
}

function property(name: string, type: string): MemberModel {
  return {
    kind: "property",
    name,
    visibility: "public",
    static: false,
    readonly: false,
    optional: false,
    abstract: false,
    async: false,
    signature: null,
    type,
    bodyHash: null,
    sourceRange: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 }
  };
}

function importRecord(
  specifier: string,
  resolvedPath: string,
  bindings: ImportBinding[],
  overrides: Partial<ResolvedImportRecord> = {}
): ResolvedImportRecord {
  return {
    specifier,
    resolvedPath,
    bindings,
    typeOnly: false,
    reExport: false,
    starReExport: false,
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
    scriptKind: path.endsWith(".tsx") ? "tsx" : "ts",
    imports,
    declarations,
    diagnostics: []
  };
}

describe("buildSnapshotEdges", () => {
  it("builds extends, implements, association and import edges", () => {
    const files = [
      file("src/base.ts", [declaration("src/base.ts", "class", "Base")]),
      file("src/person.ts", [declaration("src/person.ts", "interface", "Person")]),
      file(
        "src/user.ts",
        [
          declaration("src/user.ts", "class", "User", {
            heritage: [
              { kind: "extends", name: "Base" },
              { kind: "implements", name: "Person" }
            ],
            members: [property("manager", "Person"), property("tags", "string[]")]
          })
        ],
        [
          importRecord("./base", "src/base.ts", [{ imported: "Base", local: "Base" }]),
          importRecord("./person", "src/person.ts", [{ imported: "Person", local: "Person" }])
        ]
      ),
      file(
        "src/order.ts",
        [
          declaration("src/order.ts", "class", "Item"),
          declaration("src/order.ts", "class", "Order", {
            members: [property("user", "User"), property("items", "Item[]")]
          })
        ],
        [importRecord("./user", "src/user.ts", [{ imported: "User", local: "User" }])]
      )
    ];

    const edges = buildSnapshotEdges(files);
    const keys = edges.map((edge) => `${edge.kind}:${edge.from}->${edge.to}`);

    expect(keys).toContain("extends:src/user.ts#class:User->src/base.ts#class:Base");
    expect(keys).toContain("implements:src/user.ts#class:User->src/person.ts#interface:Person");
    expect(keys).toContain(
      "association:src/user.ts#class:User->src/person.ts#interface:Person"
    );
    expect(keys).toContain("association:src/order.ts#class:Order->src/user.ts#class:User");
    expect(keys).toContain("association:src/order.ts#class:Order->src/order.ts#class:Item");
    expect(keys).toContain("imports:module:src/user.ts->module:src/base.ts");
    expect(keys).toContain("imports:module:src/order.ts->module:src/user.ts");
    expect(keys.some((key) => key.includes("string"))).toBe(false);
  });

  it("resolves associations through re-export barrels and detects cycles", () => {
    const files = [
      file("src/base.ts", [declaration("src/base.ts", "class", "Base")]),
      file(
        "src/user.ts",
        [
          declaration("src/user.ts", "class", "User", {
            heritage: [{ kind: "extends", name: "Base" }]
          })
        ],
        [importRecord("./base", "src/base.ts", [{ imported: "Base", local: "Base" }])]
      ),
      file(
        "src/index.ts",
        [],
        [
          importRecord("./user", "src/user.ts", [], {
            reExport: true,
            starReExport: true
          })
        ]
      ),
      file(
        "src/app.ts",
        [
          declaration("src/app.ts", "class", "App", {
            members: [property("user", "User")]
          })
        ],
        [importRecord("./index", "src/index.ts", [{ imported: "User", local: "User" }])]
      )
    ];

    const edges = buildSnapshotEdges(files);
    expect(edges.map((edge) => `${edge.kind}:${edge.from}->${edge.to}`)).toContain(
      "association:src/app.ts#class:App->src/user.ts#class:User"
    );

    const cyclic = [
      file("a.ts", [], [importRecord("./b", "b.ts", [], { reExport: true, starReExport: true })]),
      file("b.ts", [], [importRecord("./a", "a.ts", [], { reExport: true, starReExport: true })])
    ];
    const byPath = new Map(cyclic.map((entry) => [entry.path, entry]));
    expect(findDeclaration(byPath, "a.ts", "Missing")).toBeNull();
  });

  it("follows named re-export aliases", () => {
    const files = [
      file("base.ts", [declaration("base.ts", "class", "Base")]),
      file(
        "index.ts",
        [],
        [
          importRecord("./base", "base.ts", [{ imported: "Base", local: "BaseAlias" }], {
            reExport: true
          })
        ]
      ),
      file(
        "app.ts",
        [
          declaration("app.ts", "class", "App", {
            heritage: [{ kind: "extends", name: "BaseAlias" }]
          })
        ],
        [importRecord("./index", "index.ts", [{ imported: "BaseAlias", local: "BaseAlias" }])]
      )
    ];

    const edges = buildSnapshotEdges(files);
    expect(edges.map((edge) => `${edge.kind}:${edge.from}->${edge.to}`)).toContain(
      "extends:app.ts#class:App->base.ts#class:Base"
    );
  });

  it("merges type-only imports into a single edge", () => {
    const files = [
      file("foo.ts", [
        declaration("foo.ts", "class", "Foo"),
        declaration("foo.ts", "class", "Bar")
      ]),
      file(
        "a.ts",
        [],
        [
          importRecord("./foo", "foo.ts", [{ imported: "Foo", local: "Foo" }], {
            typeOnly: true
          }),
          importRecord("./foo", "foo.ts", [{ imported: "Bar", local: "Bar" }])
        ]
      ),
      file(
        "b.ts",
        [],
        [importRecord("./foo", "foo.ts", [{ imported: "Foo", local: "Foo" }], { typeOnly: true })]
      )
    ];

    const edges = buildSnapshotEdges(files);
    const fromA = edges.find((edge) => edge.from === "module:a.ts");
    const fromB = edges.find((edge) => edge.from === "module:b.ts");
    expect(fromA?.typeOnly).toBe(false);
    expect(fromB?.typeOnly).toBe(true);
  });
});

describe("collectTypeReferences", () => {
  it("extracts named type references from arrays, unions and generics", () => {
    expect(collectTypeReferences("Item[] | null")).toEqual(["Item"]);
    expect(collectTypeReferences("Map<string, Foo>")).toEqual(["Map", "Foo"]);
    expect(collectTypeReferences("(item: Item) => void")).toEqual(["Item"]);
    expect(collectTypeReferences("{ value: Item }")).toEqual(["Item"]);
    expect(collectTypeReferences("typeof Foo")).toEqual([]);
    expect(collectTypeReferences("Foo.Bar")).toEqual([]);
  });
});

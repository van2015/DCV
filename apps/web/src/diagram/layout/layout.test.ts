import { describe, expect, it } from "vitest";
import type { DiagramNode } from "../projection.js";
import type { OverlayStatus } from "../overlay.js";
import { buildLayoutGraph } from "./graph.js";
import { reconcileLayout } from "./reconcile.js";
import { focusActive, focusNeighborhood } from "./focus.js";

function moduleNode(path: string): DiagramNode {
  const slash = path.lastIndexOf("/");
  const directory = slash === -1 ? "" : path.slice(0, slash);
  return {
    id: `module:${path}`,
    kind: "module",
    label: path.split("/").at(-1)!,
    path,
    containerId: directory ? `folder:${directory}` : null,
    data: { kind: "module", path, functions: [], types: [] }
  };
}

function classNode(path: string, name: string): DiagramNode {
  return {
    id: `${path}#class:${name}`,
    kind: "class",
    label: name,
    path,
    containerId: null,
    data: {
      kind: "class",
      stereotype: "class",
      declaration: {
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
        members: [],
        heritage: [],
        bodyHash: null,
        sourceRange: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 }
      }
    }
  };
}

describe("buildLayoutGraph", () => {
  it("anida carpetas y conserva aristas entre módulos visibles", () => {
    const nodes = [moduleNode("src/a.ts"), moduleNode("src/util/b.ts"), classNode("src/c.ts", "C")];
    const graph = buildLayoutGraph({
      nodes,
      edges: [
        { id: "e1", source: "module:src/util/b.ts", target: "module:src/a.ts" }
      ],
      collapsedFolders: []
    });

    const rootIds = graph.children.map((child) => child.id);
    expect(rootIds).toContain("src/c.ts#class:C");
    const src = graph.children.find((child) => child.id === "folder:src")!;
    expect(src.children?.map((child) => child.id).sort()).toEqual([
      "folder:src/util",
      "module:src/a.ts"
    ]);
    const util = src.children!.find((child) => child.id === "folder:src/util")!;
    expect(util.children?.map((child) => child.id)).toEqual(["module:src/util/b.ts"]);
    expect(graph.edges).toEqual([
      { id: "e1", sources: ["module:src/util/b.ts"], targets: ["module:src/a.ts"] }
    ]);
  });

  it("colapsa carpetas ocultando descendientes y sus aristas", () => {
    const nodes = [moduleNode("src/a.ts"), moduleNode("src/util/b.ts")];
    const graph = buildLayoutGraph({
      nodes,
      edges: [{ id: "e1", source: "module:src/util/b.ts", target: "module:src/a.ts" }],
      collapsedFolders: ["src/util"]
    });

    const src = graph.children.find((child) => child.id === "folder:src")!;
    const util = src.children!.find((child) => child.id === "folder:src/util")!;
    expect(util.children).toBeUndefined();
    expect(util.height).toBe(60);
    expect(graph.edges).toEqual([]);

    const collapsedRoot = buildLayoutGraph({
      nodes,
      edges: [{ id: "e1", source: "module:src/util/b.ts", target: "module:src/a.ts" }],
      collapsedFolders: ["src"]
    });
    const rootFolder = collapsedRoot.children.find((child) => child.id === "folder:src")!;
    expect(rootFolder.children).toBeUndefined();
    expect(collapsedRoot.edges).toEqual([]);
  });
});

describe("reconcileLayout", () => {
  const a = moduleNode("src/a.ts");
  const b = moduleNode("src/b.ts");
  const edges = [{ id: "e", source: a.id, target: b.id }];

  it("reutiliza posiciones conocidas y coloca nodos nuevos junto a sus vecinos", () => {
    const result = reconcileLayout({
      previous: { [a.id]: { x: 0, y: 0, width: 260, height: 200 } },
      nodes: [a, b],
      edges,
      layout: { [a.id]: { x: 0, y: 0, width: 260, height: 200 }, [b.id]: { x: 900, y: 900, width: 260, height: 200 } }
    });

    expect(result.reused).toBe(1);
    expect(result.positions[a.id]).toMatchObject({ x: 0, y: 0 });
    expect(result.placed).toEqual([b.id]);
    expect(result.positions[b.id]!.x).toBeLessThan(500);
    expect(result.positions[b.id]!.y).toBeLessThan(500);
  });

  it("separa solapamientos entre nodos", () => {
    const result = reconcileLayout({
      previous: {},
      nodes: [a, b],
      edges: [],
      layout: {
        [a.id]: { x: 0, y: 0, width: 260, height: 200 },
        [b.id]: { x: 10, y: 10, width: 260, height: 200 }
      }
    });

    const left = result.positions[a.id]!;
    const right = result.positions[b.id]!;
    const overlapX = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
    const overlapY = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
    expect(overlapX > -24 && overlapY > -24).toBe(false);
  });

  it("reutiliza la posición del nodo original para los fantasmas", () => {
    const ghost: DiagramNode = { ...moduleNode("src/gone.ts"), id: "ghost:module:src/gone.ts", containerId: null };
    const result = reconcileLayout({
      previous: { "module:src/gone.ts": { x: 30, y: 40, width: 260, height: 200 } },
      nodes: [ghost],
      edges: [],
      layout: { [ghost.id]: { x: 999, y: 999, width: 260, height: 200 } }
    });

    expect(result.positions[ghost.id]).toMatchObject({ x: 30, y: 40 });
    expect(result.reused).toBe(1);
  });

  it("mantiene posiciones en una secuencia de commits y ubica solo lo nuevo", () => {
    const c = moduleNode("src/c.ts");
    const first = reconcileLayout({
      previous: {},
      nodes: [a, b],
      edges,
      layout: {
        [a.id]: { x: 0, y: 0, width: 260, height: 200 },
        [b.id]: { x: 400, y: 0, width: 260, height: 200 }
      }
    }).positions;

    const second = reconcileLayout({
      previous: first,
      nodes: [a, b, c],
      edges: [...edges, { id: "e2", source: a.id, target: c.id }],
      layout: {
        [a.id]: { x: 0, y: 0, width: 260, height: 200 },
        [b.id]: { x: 400, y: 0, width: 260, height: 200 },
        [c.id]: { x: 5000, y: 5000, width: 260, height: 200 }
      }
    });

    expect(second.positions[a.id]).toEqual(first[a.id]);
    expect(second.positions[b.id]).toEqual(first[b.id]);
    expect(second.positions[c.id]!.x).toBeLessThan(1000);
    expect(second.positions[c.id]!.y).toBeLessThan(1000);
    expect(second.placed).toEqual([c.id]);
  });
});

describe("modo foco", () => {
  const statuses = new Map<string, OverlayStatus>([
    ["A", { status: "modified", probable: false, kind: "class" }]
  ]);
  const edges = [
    { source: "A", target: "B" },
    { source: "B", target: "C" },
    { source: "C", target: "D" }
  ];

  it("incluye vecinos según la profundidad", () => {
    expect(
      [...focusNeighborhood({ nodeStatuses: statuses, ghostIds: [], focusedNodeId: null, edges, depth: 1 })].sort()
    ).toEqual(["A", "B"]);
    expect(
      [...focusNeighborhood({ nodeStatuses: statuses, ghostIds: [], focusedNodeId: null, edges, depth: 2 })].sort()
    ).toEqual(["A", "B", "C"]);
  });

  it("considera fantasmas y nodo enfocado como semillas", () => {
    const visible = focusNeighborhood({
      nodeStatuses: new Map(),
      ghostIds: ["X"],
      focusedNodeId: "A",
      edges,
      depth: 1
    });
    expect([...visible].sort()).toEqual(["A", "B", "X"]);
  });

  it("se activa solo con el umbral de nodos y el control encendido", () => {
    expect(focusActive(20, { focusEnabled: true })).toBe(false);
    expect(focusActive(120, { focusEnabled: true })).toBe(true);
    expect(focusActive(120, { focusEnabled: false })).toBe(false);
  });
});

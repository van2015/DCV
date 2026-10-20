import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  CommitInfo,
  Snapshot,
  SnapshotDeclaration,
  SnapshotDiff,
  SnapshotEdge,
  SnapshotFile
} from "@dcv/shared";
import { DiagramCanvas, type CanvasLayoutInfo } from "./DiagramCanvas.js";
import { buildOverlay } from "./overlay.js";
import { projectSnapshot } from "./projection.js";
import type { LayoutGraph, LayoutGraphNode } from "./layout/graph.js";
import type { LayoutPositions } from "./layout/types.js";
import { VisualStateStore, DEFAULT_VISUAL_CONTROLS, type VisualControls } from "./layout/persistence.js";
import type { LayoutRunner } from "./layout/service.js";
import { makeCommit, MemoryStorage } from "../test/fakes.js";

const RANGE = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };
const NO_COMMITS: CommitInfo[] = [];

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
    members: [],
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

function gridLayout(graph: LayoutGraph): LayoutPositions {
  const positions: LayoutPositions = {};
  let index = 0;
  const visit = (node: LayoutGraphNode): void => {
    positions[node.id] = {
      x: index * 400,
      y: index * 10,
      width: node.width ?? 260,
      height: node.height ?? 200
    };
    index += 1;
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  for (const child of graph.children) {
    visit(child);
  }
  return positions;
}

function fakeRunner(): { runner: LayoutRunner; runs: LayoutGraph[] } {
  const runs: LayoutGraph[] = [];
  const runner: LayoutRunner = {
    run: async (graph) => {
      runs.push(graph);
      return gridLayout(graph);
    }
  };
  return { runner, runs };
}

function overlapFree(info: CanvasLayoutInfo, ids: string[]): boolean {
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = info.positions[ids[i]!];
      const b = info.positions[ids[j]!];
      if (!a || !b) {
        continue;
      }
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapX > -24 && overlapY > -24) {
        return false;
      }
    }
  }
  return true;
}

function renderCanvas(options: {
  projection: ReturnType<typeof projectSnapshot>;
  overlay?: ReturnType<typeof buildOverlay> | null;
  controls?: VisualControls;
  relayoutToken?: number;
  runner?: LayoutRunner;
  visualStore?: VisualStateStore;
  selectedSha?: string | null;
  commits?: CommitInfo[];
  onLayout?: (info: CanvasLayoutInfo) => void;
  ghosts?: ReturnType<typeof buildOverlay>["ghosts"];
}) {
  const visualStore =
    options.visualStore ?? new VisualStateStore(new MemoryStorage(), "p1");
  const view = render(
    <DiagramCanvas
      visualStore={visualStore}
      view={options.projection.view}
      projection={options.projection}
      selectedSha={options.selectedSha ?? null}
      commits={options.commits ?? NO_COMMITS}
      ghosts={options.ghosts ?? options.overlay?.ghosts ?? []}
      overlay={options.overlay ?? null}
      focusedNodeId={null}
      controls={options.controls ?? DEFAULT_VISUAL_CONTROLS}
      relayoutToken={options.relayoutToken ?? 0}
      onToggleFolder={() => {}}
      onOpenClass={() => {}}
      onLayout={options.onLayout}
      layoutRunner={options.runner ?? fakeRunner().runner}
    />
  );
  return { view, visualStore };
}

describe("DiagramCanvas", () => {
  it("calcula posiciones válidas y sin solapes graves (fixture OO)", async () => {
    const left = declaration("src/left.ts", "class", "Left");
    const right = declaration("src/right.ts", "class", "Right");
    const model = snapshot([file("src/left.ts", [left]), file("src/right.ts", [right])]);
    const projection = projectSnapshot(model, "classes");
    const onLayout = vi.fn();
    const { runner } = fakeRunner();
    renderCanvas({ projection, runner, onLayout });

    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    const info = onLayout.mock.calls[0]![0] as CanvasLayoutInfo;
    const ids = projection.nodes.map((node) => node.id);
    expect(ids.every((id) => Number.isFinite(info.positions[id]?.x))).toBe(true);
    expect(overlapFree(info, ids)).toBe(true);
    expect(info.reused).toBe(0);
  });

  it("calcula posiciones para la vista de paquetes (fixture mixto)", async () => {
    const root = declaration("index.ts", "function", "entry");
    const inner = declaration("src/a.ts", "function", "a");
    const model = snapshot(
      [file("index.ts", [root]), file("src/a.ts", [inner])],
      [
        {
          id: "imports:module:index.ts->module:src/a.ts",
          kind: "imports",
          from: "module:index.ts",
          to: "module:src/a.ts",
          fromPath: "index.ts",
          toPath: "src/a.ts",
          typeOnly: false
        }
      ]
    );
    const projection = projectSnapshot(model, "packages");
    const onLayout = vi.fn();
    renderCanvas({ projection, onLayout });

    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    const info = onLayout.mock.calls[0]![0] as CanvasLayoutInfo;
    expect(Object.keys(info.positions).sort()).toEqual([
      "package:",
      "package:src"
    ]);
    expect(overlapFree(info, projection.nodes.map((node) => node.id))).toBe(true);
  });

  it("conserva y restaura posiciones entre montajes (fixture funcional)", async () => {
    const add = declaration("src/math.ts", "function", "add");
    const model = snapshot([file("src/math.ts", [add])]);
    const projection = projectSnapshot(model, "modules");
    const store = new VisualStateStore(new MemoryStorage(), "p1");
    const first = vi.fn();
    const { runner } = fakeRunner();
    const { view } = renderCanvas({ projection, runner, onLayout: first, visualStore: store });
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    const firstInfo = first.mock.calls[0]![0] as CanvasLayoutInfo;
    view.unmount();

    const second = vi.fn();
    const far: LayoutRunner = {
      run: async (graph) => {
        const positions = gridLayout(graph);
        for (const id of Object.keys(positions)) {
          positions[id] = { ...positions[id]!, x: positions[id]!.x + 5000 };
        }
        return positions;
      }
    };
    renderCanvas({ projection, runner: far, onLayout: second, visualStore: store });
    await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    const secondInfo = second.mock.calls[0]![0] as CanvasLayoutInfo;

    expect(secondInfo.reused).toBe(projection.nodes.length);
    expect(secondInfo.positions["module:src/math.ts"]).toEqual(
      firstInfo.positions["module:src/math.ts"]
    );
  });

  it("solo recalcula el layout al pulsar re-layout", async () => {
    const item = declaration("src/a.ts", "class", "A");
    const projection = projectSnapshot(snapshot([file("src/a.ts", [item])]), "classes");
    const onLayout = vi.fn();
    const { runner, runs } = fakeRunner();
    const { view } = renderCanvas({ projection, runner, onLayout });
    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));

    view.rerender(
      <DiagramCanvas
        visualStore={new VisualStateStore(new MemoryStorage(), "p1")}
        view="classes"
        projection={projection}
        selectedSha={null}
        commits={NO_COMMITS}
        ghosts={[]}
        overlay={null}
        focusedNodeId={null}
        controls={DEFAULT_VISUAL_CONTROLS}
        relayoutToken={1}
        onToggleFolder={() => {}}
        onOpenClass={() => {}}
        onLayout={onLayout}
        layoutRunner={runner}
      />
    );

    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(2));
    const info = onLayout.mock.calls[1]![0] as CanvasLayoutInfo;
    expect(runs).toHaveLength(2);
    expect(info.reused).toBe(0);
  });

  it("aplica el modo foco por profundidad y oculta el resto si se pide", async () => {
    const files: SnapshotFile[] = [];
    const edges: SnapshotEdge[] = [];
    for (let index = 0; index < 45; index += 1) {
      const item = declaration(`src/m${index}.ts`, "function", `f${index}`);
      files.push(file(`src/m${index}.ts`, [item]));
      if (index > 0) {
        edges.push({
          id: `imports:module:src/m${index}.ts->module:src/m${index - 1}.ts`,
          kind: "imports",
          from: `module:src/m${index}.ts`,
          to: `module:src/m${index - 1}.ts`,
          fromPath: `src/m${index}.ts`,
          toPath: `src/m${index - 1}.ts`,
          typeOnly: false
        });
      }
    }
    const model = snapshot(files, edges);
    const projection = projectSnapshot(model, "modules");
    const diff: SnapshotDiff = {
      from: "c0",
      to: "c1",
      isEmpty: false,
      files: [
        { status: "modified", path: "src/m0.ts", previousPath: null, probable: false }
      ],
      declarations: [
        {
          status: "modified",
          id: files[0]!.declarations[0]!.id,
          previousId: null,
          kind: "function",
          name: "f0",
          path: "src/m0.ts",
          previousPath: null,
          probable: false,
          declaration: null,
          previousDeclaration: null
        }
      ],
      members: [],
      edges: []
    };
    const overlay = buildOverlay(projection, diff);
    const onLayout = vi.fn();
    const controls: VisualControls = {
      ...DEFAULT_VISUAL_CONTROLS,
      focusEnabled: true,
      focusDepth: 1
    };
    const { view } = renderCanvas({ projection, overlay, controls, onLayout });
    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    const first = onLayout.mock.calls[0]![0] as CanvasLayoutInfo;
    expect(first.hiddenIds).not.toContain("module:src/m0.ts");
    expect(first.hiddenIds).not.toContain("module:src/m1.ts");
    expect(first.hiddenIds).toContain("module:src/m40.ts");

    const depth2: VisualControls = { ...controls, focusDepth: 2 };
    view.rerender(
      <DiagramCanvas
        visualStore={new VisualStateStore(new MemoryStorage(), "p1")}
        view="modules"
        projection={projection}
        selectedSha={null}
        commits={NO_COMMITS}
        ghosts={[]}
        overlay={overlay}
        focusedNodeId={null}
        controls={depth2}
        relayoutToken={0}
        onToggleFolder={() => {}}
        onOpenClass={() => {}}
        onLayout={onLayout}
        layoutRunner={fakeRunner().runner}
      />
    );
    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(2));
    const second = onLayout.mock.calls[1]![0] as CanvasLayoutInfo;
    expect(second.hiddenIds).not.toContain("module:src/m2.ts");
    expect(second.hiddenIds.length).toBeLessThan(first.hiddenIds.length);

    onLayout.mockClear();
    const focusHide: VisualControls = { ...depth2, focusHide: true };
    view.rerender(
      <DiagramCanvas
        visualStore={new VisualStateStore(new MemoryStorage(), "p1")}
        view="modules"
        projection={projection}
        selectedSha={null}
        commits={NO_COMMITS}
        ghosts={[]}
        overlay={overlay}
        focusedNodeId={null}
        controls={focusHide}
        relayoutToken={0}
        onToggleFolder={() => {}}
        onOpenClass={() => {}}
        onLayout={onLayout}
        layoutRunner={fakeRunner().runner}
      />
    );
    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    const third = onLayout.mock.calls[0]![0] as CanvasLayoutInfo;
    expect(third.hiddenIds).toContain("module:src/m40.ts");
    expect(third.visibleIds).not.toContain("module:src/m40.ts");
  });

  it("colapsa carpetas excluyendo sus módulos del layout", async () => {
    const item = declaration("src/util/a.ts", "function", "a");
    const projection = projectSnapshot(snapshot([file("src/util/a.ts", [item])]), "modules");
    const onLayout = vi.fn();
    const controls: VisualControls = {
      ...DEFAULT_VISUAL_CONTROLS,
      collapsedFolders: ["src/util"]
    };
    renderCanvas({ projection, controls, onLayout });

    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    const info = onLayout.mock.calls[0]![0] as CanvasLayoutInfo;
    expect(info.positions["module:src/util/a.ts"]).toBeUndefined();
    expect(info.positions["folder:src/util"]?.height).toBe(60);
  });

  it("restaura las posiciones propias de cada commit al alternar", async () => {
    const item = declaration("src/a.ts", "class", "A");
    const projection = projectSnapshot(snapshot([file("src/a.ts", [item])]), "classes");
    const id = projection.nodes[0]!.id;
    const commits = [makeCommit("c1", "uno"), makeCommit("c2", "dos")];
    const store = new VisualStateStore(new MemoryStorage(), "p1");
    store.saveCommitPositions("classes", "c1", {
      [id]: { x: 120, y: 40, width: 260, height: 200 }
    });
    store.saveCommitPositions("classes", "c2", {
      [id]: { x: 640, y: 380, width: 260, height: 200 }
    });
    const onLayout = vi.fn();
    const runner = fakeRunner().runner;
    const { view } = renderCanvas({
      projection,
      selectedSha: "c1",
      commits,
      visualStore: store,
      runner,
      onLayout
    });
    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    expect(
      (onLayout.mock.calls[0]![0] as CanvasLayoutInfo).positions[id]
    ).toMatchObject({ x: 120, y: 40 });

    view.rerender(
      <DiagramCanvas
        visualStore={store}
        view="classes"
        projection={projection}
        selectedSha="c2"
        commits={commits}
        ghosts={[]}
        overlay={null}
        focusedNodeId={null}
        controls={DEFAULT_VISUAL_CONTROLS}
        relayoutToken={0}
        onToggleFolder={() => {}}
        onOpenClass={() => {}}
        onLayout={onLayout}
        layoutRunner={runner}
      />
    );
    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(2));
    expect(
      (onLayout.mock.calls[1]![0] as CanvasLayoutInfo).positions[id]
    ).toMatchObject({ x: 640, y: 380 });

    view.rerender(
      <DiagramCanvas
        visualStore={store}
        view="classes"
        projection={projection}
        selectedSha="c1"
        commits={commits}
        ghosts={[]}
        overlay={null}
        focusedNodeId={null}
        controls={DEFAULT_VISUAL_CONTROLS}
        relayoutToken={0}
        onToggleFolder={() => {}}
        onOpenClass={() => {}}
        onLayout={onLayout}
        layoutRunner={runner}
      />
    );
    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(3));
    expect(
      (onLayout.mock.calls[2]![0] as CanvasLayoutInfo).positions[id]
    ).toMatchObject({ x: 120, y: 40 });
  });

  it("hereda del commit más cercano y guarda el resultado para el commit visitado", async () => {
    const item = declaration("src/a.ts", "class", "A");
    const projection = projectSnapshot(snapshot([file("src/a.ts", [item])]), "classes");
    const id = projection.nodes[0]!.id;
    const commits = [makeCommit("c1", "uno"), makeCommit("c2", "dos")];
    const store = new VisualStateStore(new MemoryStorage(), "p1");
    store.saveCommitPositions("classes", "c1", {
      [id]: { x: 75, y: 125, width: 260, height: 200 }
    });
    const legacy = { [id]: { x: 1, y: 2, width: 260, height: 200 } };
    store.savePositions("classes", legacy);
    const onLayout = vi.fn();

    renderCanvas({
      projection,
      selectedSha: "c2",
      commits,
      visualStore: store,
      onLayout
    });
    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    expect(
      (onLayout.mock.calls[0]![0] as CanvasLayoutInfo).positions[id]
    ).toMatchObject({ x: 75, y: 125 });
    expect(store.hasCommitPositions("classes", "c2")).toBe(true);
    expect(store.loadCommitPositions("classes", "c2")?.[id]).toMatchObject({
      x: 75,
      y: 125
    });
    expect(store.loadPositions("classes")).toEqual(legacy);
  });

  it("re-layout reemplaza solo las posiciones del commit actual", async () => {
    const item = declaration("src/a.ts", "class", "A");
    const projection = projectSnapshot(snapshot([file("src/a.ts", [item])]), "classes");
    const id = projection.nodes[0]!.id;
    const commits = [makeCommit("c1", "uno"), makeCommit("c2", "dos")];
    const store = new VisualStateStore(new MemoryStorage(), "p1");
    store.saveCommitPositions("classes", "c1", {
      [id]: { x: 10, y: 20, width: 260, height: 200 }
    });
    store.saveCommitPositions("classes", "c2", {
      [id]: { x: 500, y: 600, width: 260, height: 200 }
    });
    const onLayout = vi.fn();
    const runner = fakeRunner().runner;
    const { view } = renderCanvas({
      projection,
      selectedSha: "c1",
      commits,
      visualStore: store,
      runner,
      onLayout
    });
    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    expect(store.loadCommitPositions("classes", "c1")?.[id]).toMatchObject({
      x: 10,
      y: 20
    });

    view.rerender(
      <DiagramCanvas
        visualStore={store}
        view="classes"
        projection={projection}
        selectedSha="c1"
        commits={commits}
        ghosts={[]}
        overlay={null}
        focusedNodeId={null}
        controls={DEFAULT_VISUAL_CONTROLS}
        relayoutToken={1}
        onToggleFolder={() => {}}
        onOpenClass={() => {}}
        onLayout={onLayout}
        layoutRunner={runner}
      />
    );
    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(2));
    const info = onLayout.mock.calls[1]![0] as CanvasLayoutInfo;
    expect(info.reused).toBe(0);
    expect(store.loadCommitPositions("classes", "c1")?.[id]?.x).not.toBe(10);
    expect(store.loadCommitPositions("classes", "c2")?.[id]).toMatchObject({
      x: 500,
      y: 600
    });
  });
});

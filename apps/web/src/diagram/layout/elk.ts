import ELK from "elkjs/lib/elk.bundled.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import type { LayoutGraph, LayoutGraphNode } from "./graph.js";
import type { LayoutPositions } from "./types.js";

function createElk() {
  if (typeof Worker !== "undefined") {
    return new ELK({
      workerFactory: () => new Worker(elkWorkerUrl, { type: "classic" }) as unknown as Worker
    });
  }
  return new ELK();
}

export async function runElkLayout(graph: LayoutGraph): Promise<LayoutPositions> {
  const elk = createElk();
  const result = await elk.layout(graph);
  const positions: LayoutPositions = {};

  const visit = (node: LayoutGraphNode & { x?: number; y?: number }): void => {
    if (typeof node.x === "number" && typeof node.y === "number") {
      positions[node.id] = {
        x: node.x,
        y: node.y,
        width: node.width ?? 0,
        height: node.height ?? 0
      };
    }
    for (const child of node.children ?? []) {
      visit(child as LayoutGraphNode & { x?: number; y?: number });
    }
  };

  for (const child of result.children ?? []) {
    visit(child as LayoutGraphNode & { x?: number; y?: number });
  }
  return positions;
}

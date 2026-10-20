import type { DiagramNode } from "../projection.js";
import { NODE_SIZES } from "./graph.js";
import type { LayoutPositions, LayoutRect } from "./types.js";

export interface ReconcileInput {
  previous: LayoutPositions;
  nodes: DiagramNode[];
  edges: { id: string; source: string; target: string }[];
  layout: LayoutPositions;
  force?: boolean;
}

export interface ReconcileResult {
  positions: LayoutPositions;
  reused: number;
  placed: string[];
}

const DEFAULT_SIZE = { width: 220, height: 140 };
const MIN_GAP = 24;

export function reconcileLayout(input: ReconcileInput): ReconcileResult {
  const positions: LayoutPositions = {};
  const placed: string[] = [];
  const unknown: DiagramNode[] = [];
  let reused = 0;

  for (const node of input.nodes) {
    if (!input.force) {
      const known = input.previous[node.id];
      if (known) {
        positions[node.id] = known;
        reused += 1;
        continue;
      }
      if (node.id.startsWith("ghost:")) {
        const original = input.previous[node.id.slice("ghost:".length)];
        if (original) {
          positions[node.id] = original;
          reused += 1;
          continue;
        }
      }
    }
    unknown.push(node);
  }

  const adjacency = buildAdjacency(input.edges);
  for (const node of unknown) {
    const neighbors = (adjacency.get(node.id) ?? [])
      .map((id) => positions[id] ?? input.layout[id])
      .filter((rect): rect is LayoutRect => rect !== undefined);
    if (neighbors.length > 0 && !input.force) {
      const x =
        neighbors.reduce((total, rect) => total + rect.x, 0) / neighbors.length;
      const y =
        neighbors.reduce((total, rect) => total + rect.y, 0) / neighbors.length;
      positions[node.id] = { ...sizeOf(node), x: x + 40, y: y + 40 };
    } else {
      const rect = input.layout[node.id];
      positions[node.id] = rect
        ? { ...rect }
        : { ...sizeOf(node), x: placed.length * 40, y: placed.length * 40 };
    }
    placed.push(node.id);
  }

  separateOverlaps(positions, input.nodes, new Set(placed));

  return { positions, reused, placed };
}

function buildAdjacency(
  edges: { source: string; target: string }[]
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const add = (from: string, to: string): void => {
    const list = adjacency.get(from) ?? [];
    list.push(to);
    adjacency.set(from, list);
  };
  for (const edge of edges) {
    add(edge.source, edge.target);
    add(edge.target, edge.source);
  }
  return adjacency;
}

function sizeOf(node: DiagramNode): { width: number; height: number } {
  return NODE_SIZES[node.kind] ?? DEFAULT_SIZE;
}

export function separateOverlaps(
  positions: LayoutPositions,
  nodes: DiagramNode[],
  movable: Set<string> = new Set(nodes.map((node) => node.id)),
  iterations = 60
): void {
  const ids = nodes.map((node) => node.id).filter((id) => positions[id]);
  const sizes = new Map(nodes.map((node) => [node.id, sizeOf(node)]));

  for (let round = 0; round < iterations; round += 1) {
    let moved = false;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const left = ids[i]!;
        const right = ids[j]!;
        const a = positions[left]!;
        const b = positions[right]!;
        const sizeA = sizes.get(left)!;
        const sizeB = sizes.get(right)!;
        const overlapX =
          Math.min(a.x + sizeA.width, b.x + sizeB.width) - Math.max(a.x, b.x);
        const overlapY =
          Math.min(a.y + sizeA.height, b.y + sizeB.height) - Math.max(a.y, b.y);
        if (overlapX <= -MIN_GAP || overlapY <= -MIN_GAP) {
          continue;
        }
        moved = true;
        const canMoveA = movable.has(left);
        const canMoveB = movable.has(right);
        if (!canMoveA && !canMoveB) {
          continue;
        }
        if (overlapX < overlapY) {
          const shift =
            canMoveA && canMoveB ? (overlapX + MIN_GAP) / 2 : overlapX + MIN_GAP;
          if (a.x <= b.x) {
            if (canMoveA) {
              a.x -= shift;
            }
            if (canMoveB) {
              b.x += shift;
            }
          } else {
            if (canMoveA) {
              a.x += shift;
            }
            if (canMoveB) {
              b.x -= shift;
            }
          }
        } else {
          const shift =
            canMoveA && canMoveB ? (overlapY + MIN_GAP) / 2 : overlapY + MIN_GAP;
          if (a.y <= b.y) {
            if (canMoveA) {
              a.y -= shift;
            }
            if (canMoveB) {
              b.y += shift;
            }
          } else {
            if (canMoveA) {
              a.y += shift;
            }
            if (canMoveB) {
              b.y -= shift;
            }
          }
        }
      }
    }
    if (!moved) {
      break;
    }
  }
}

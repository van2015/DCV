import type { OverlayStatus } from "../overlay.js";
import type { VisualControls } from "./persistence.js";

export const FOCUS_THRESHOLD = 40;

export interface FocusInput {
  nodeStatuses: Map<string, OverlayStatus>;
  ghostIds: string[];
  focusedNodeId: string | null;
  edges: { source: string; target: string }[];
  depth: number;
}

export function focusSeeds(input: FocusInput): string[] {
  const seeds = new Set<string>(input.ghostIds);
  for (const id of input.nodeStatuses.keys()) {
    seeds.add(id);
  }
  if (input.focusedNodeId) {
    seeds.add(input.focusedNodeId);
  }
  return [...seeds];
}

export function focusNeighborhood(input: FocusInput): Set<string> {
  const seeds = focusSeeds(input);
  const visible = new Set(seeds);
  const adjacency = new Map<string, string[]>();
  const add = (from: string, to: string): void => {
    const list = adjacency.get(from) ?? [];
    list.push(to);
    adjacency.set(from, list);
  };
  for (const edge of input.edges) {
    add(edge.source, edge.target);
    add(edge.target, edge.source);
  }

  let frontier = seeds;
  for (let hop = 0; hop < Math.max(0, input.depth); hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visible.has(neighbor)) {
          visible.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return visible;
}

export function focusActive(
  nodeCount: number,
  controls: Pick<VisualControls, "focusEnabled">
): boolean {
  return controls.focusEnabled && nodeCount >= FOCUS_THRESHOLD;
}

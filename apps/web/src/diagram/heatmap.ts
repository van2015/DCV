import type { HeatmapResponse } from "@dcv/shared";

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapMaxima {
  nodes: number;
  members: number;
}

export const EMPTY_HEATMAP_MAXIMA: HeatmapMaxima = { nodes: 0, members: 0 };

export function heatmapMaxima(
  heatmap: HeatmapResponse | null,
  nodeIds?: Iterable<string>
): HeatmapMaxima {
  if (!heatmap) {
    return EMPTY_HEATMAP_MAXIMA;
  }
  const visible = nodeIds ? new Set(nodeIds) : null;
  let nodes = 0;
  let members = 0;
  for (const [id, count] of Object.entries(heatmap.nodes)) {
    if ((!visible || visible.has(id)) && count > nodes) {
      nodes = count;
    }
  }
  for (const [id, byMember] of Object.entries(heatmap.members)) {
    if (visible && !visible.has(id)) {
      continue;
    }
    for (const count of Object.values(byMember)) {
      if (count > members) {
        members = count;
      }
    }
  }
  return { nodes, members };
}

export function heatLevel(count: number | undefined, max: number): HeatLevel {
  if (count === undefined || count <= 0 || max <= 0) {
    return 0;
  }
  const ratio = count / max;
  if (ratio <= 0.25) {
    return 1;
  }
  if (ratio <= 0.5) {
    return 2;
  }
  if (ratio <= 0.75) {
    return 3;
  }
  return 4;
}

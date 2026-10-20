import type { EdgeKind } from "@dcv/shared";

export type EdgeStatus = "added" | "removed";
export type EdgeLinePattern = "solid" | "6 4" | "4 4";
export type EdgeMarkerShape = "hollow-triangle" | "filled-triangle";

export interface EdgeAppearance {
  status: EdgeStatus | null;
  statusClass: "edge-added" | "edge-removed" | null;
  color: string;
  linePattern: EdgeLinePattern;
  markerShape: EdgeMarkerShape;
}

export const EDGE_BASE_COLOR = "#111111";

export const EDGE_STATUS_COLORS: Record<EdgeStatus, string> = {
  added: "#15803d",
  removed: "#b91c1c"
};

export function edgeAppearance(
  kind: EdgeKind,
  status: EdgeStatus | null,
  typeOnly: boolean
): EdgeAppearance {
  return {
    status,
    statusClass: status === null ? null : `edge-${status}`,
    color: status === null ? EDGE_BASE_COLOR : EDGE_STATUS_COLORS[status],
    linePattern: linePattern(kind, typeOnly),
    markerShape:
      kind === "extends" || kind === "implements"
        ? "hollow-triangle"
        : "filled-triangle"
  };
}

function linePattern(kind: EdgeKind, typeOnly: boolean): EdgeLinePattern {
  if (typeOnly) {
    return "4 4";
  }
  return kind === "implements" ? "6 4" : "solid";
}

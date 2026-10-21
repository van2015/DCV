import type { Node, NodeProps } from "@xyflow/react";
import type { PackageNodeData } from "../projection.js";
import type { OverlayStatus } from "../overlay.js";
import { ChangeBadge } from "../ChangeBadge.js";
import type { HeatLevel } from "../heatmap.js";

export type PackageFlowNode = Node<PackageNodeData, "package">;

export function PackageNode({ data }: NodeProps<PackageFlowNode>) {
  return <PackageNodeCard data={data} />;
}

export interface PackageNodeCardProps {
  data: PackageNodeData;
  change?: OverlayStatus | null;
  ghost?: boolean;
  heatCount?: number;
  heatLevel?: HeatLevel;
}

export function PackageNodeCard({
  data,
  change,
  ghost = false,
  heatCount = 0,
  heatLevel = 0
}: PackageNodeCardProps) {
  const label = data.directory === "" ? "(raíz)" : data.directory;
  const classes = [
    "uml-node",
    "uml-package",
    change ? `change-${change.status}` : "",
    !ghost && heatLevel > 0 ? `heat-${heatLevel}` : "",
    ghost ? "ghost" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={classes}
      aria-label={`paquete ${label}${ghost ? " (eliminado)" : ""}`}
      data-heat-count={heatCount}
      data-heat-level={heatLevel}
    >
      <header className="uml-node-header">
        <span className="uml-stereotype">«package»</span>
        <strong>
          {data.directory === "" ? "(raíz)" : data.directory.split("/").at(-1)}
          {change && <ChangeBadge status={change} />}
        </strong>
      </header>
      <div className="uml-compartment">
        <span className="uml-member">
          <span className="uml-visibility">#</span>
          <span>
            {data.moduleCount} módulo{data.moduleCount === 1 ? "" : "s"}
          </span>
        </span>
      </div>
      <footer className="uml-node-footer">{label}</footer>
    </article>
  );
}

import type { ClassNodeData, DiagramNode, DiagramProjection } from "./projection.js";
import type { DiagramOverlay, OverlayStatus } from "./overlay.js";
import { ghostNode } from "./overlay.js";
import { ClassNodeCard } from "./nodes/ClassNode.js";
import { ModuleNodeCard } from "./nodes/ModuleNode.js";
import { PackageNodeCard } from "./nodes/PackageNode.js";

export interface DiagramPreviewProps {
  projection: DiagramProjection;
  overlay?: DiagramOverlay | null;
  focusedNodeId?: string | null;
  onOpenClass?: (declarationId: string) => void;
}

export function DiagramPreview({
  projection,
  overlay,
  focusedNodeId,
  onOpenClass
}: DiagramPreviewProps) {
  const ghosts = (overlay?.ghosts ?? []).map(ghostNode);
  return (
    <div
      className={`diagram-preview view-${projection.view}`}
      aria-label={`Diagrama de ${viewLabel(projection.view)}`}
    >
      {[...projection.nodes, ...ghosts].map((node) => (
        <NodeCard
          key={node.id}
          node={node}
          view={projection.view}
          overlay={overlay ?? null}
          focused={node.id === focusedNodeId}
          onOpenClass={onOpenClass}
        />
      ))}
    </div>
  );
}

function NodeCard({
  node,
  view,
  overlay,
  focused,
  onOpenClass
}: {
  node: DiagramNode;
  view: DiagramProjection["view"];
  overlay: DiagramOverlay | null;
  focused: boolean;
  onOpenClass?: (declarationId: string) => void;
}) {
  const wrapperClass = focused ? "diagram-node focused" : "diagram-node";
  const change = overlay?.nodeStatuses.get(node.id) ?? null;
  const isGhost = node.id.startsWith("ghost:");
  const ghostChange = (kind: OverlayStatus["kind"]): OverlayStatus => ({
    status: "removed",
    probable: false,
    kind
  });

  return (
    <div className={wrapperClass} data-node-id={node.id}>
      {view === "classes" ? (
        <ClassNodeCard
          data={node.data as ClassNodeData}
          change={change ?? (isGhost ? ghostChange("class") : null)}
          memberChanges={overlay?.memberStatuses.get(node.id)}
          ghost={isGhost}
        />
      ) : view === "modules" ? (
        <ModuleNodeCard
          data={node.data as Parameters<typeof ModuleNodeCard>[0]["data"]}
          onOpenClass={onOpenClass}
          change={change ?? (isGhost ? ghostChange("function") : null)}
          declarationChanges={overlay?.declarationStatuses}
          ghost={isGhost}
        />
      ) : (
        <PackageNodeCard
          data={node.data as Parameters<typeof PackageNodeCard>[0]["data"]}
          change={change ?? (isGhost ? ghostChange("class") : null)}
          ghost={isGhost}
        />
      )}
    </div>
  );
}

function viewLabel(view: DiagramProjection["view"]): string {
  switch (view) {
    case "classes":
      return "clases";
    case "modules":
      return "módulos";
    case "packages":
      return "paquetes";
  }
}

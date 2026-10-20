import type { SnapshotDeclaration } from "@dcv/shared";
import type { Node, NodeProps } from "@xyflow/react";
import type { ModuleNodeData } from "../projection.js";
import type { OverlayStatus } from "../overlay.js";
import { ChangeBadge } from "../ChangeBadge.js";

export type ModuleFlowNode = Node<ModuleNodeData, "module">;

export function ModuleNode({ data }: NodeProps<ModuleFlowNode>) {
  return <ModuleNodeCard data={data} />;
}

export interface ModuleNodeCardProps {
  data: ModuleNodeData;
  onOpenClass?: (declarationId: string) => void;
  change?: OverlayStatus | null;
  declarationChanges?: Map<string, OverlayStatus>;
  ghost?: boolean;
  showMembers?: boolean;
}

const CLASS_LIKE = new Set(["class", "interface", "enum"]);

export function ModuleNodeCard({
  data,
  onOpenClass,
  change,
  declarationChanges,
  ghost = false,
  showMembers = true
}: ModuleNodeCardProps) {
  const classes = [
    "uml-node",
    "uml-module",
    change ? `change-${change.status}` : "",
    ghost ? "ghost" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const label = ghost ? `módulo ${data.path} (eliminado)` : `módulo ${data.path}`;

  return (
    <article className={classes} aria-label={label}>
      <header className="uml-node-header">
        <span className="uml-stereotype">«module»</span>
        <strong>
          {data.path.split("/").at(-1)}
          {change && <ChangeBadge status={change} />}
        </strong>
      </header>
      {showMembers && <div className="uml-compartment">
        <span className="uml-compartment-title">Funciones</span>
        {data.functions.length === 0 ? (
          <span className="uml-empty">Sin funciones exportadas</span>
        ) : (
          data.functions.map((declaration) => (
            <DeclarationLine
              key={declaration.id}
              declaration={declaration}
              status={declarationChanges?.get(declaration.id)}
              onOpenClass={onOpenClass}
            />
          ))
        )}
      </div>}
      {showMembers && <div className="uml-compartment">
        <span className="uml-compartment-title">Tipos</span>
        {data.types.length === 0 ? (
          <span className="uml-empty">Sin tipos exportados</span>
        ) : (
          data.types.map((declaration) => (
            <DeclarationLine
              key={declaration.id}
              declaration={declaration}
              status={declarationChanges?.get(declaration.id)}
              onOpenClass={onOpenClass}
            />
          ))
        )}
      </div>}
      <footer className="uml-node-footer">{data.path}</footer>
    </article>
  );
}

function DeclarationLine({
  declaration,
  status,
  onOpenClass
}: {
  declaration: SnapshotDeclaration;
  status?: OverlayStatus;
  onOpenClass?: (declarationId: string) => void;
}) {
  const content =
    declaration.signature ?? `${declaration.name}: ${declaration.type ?? declaration.kind}`;
  if (onOpenClass && CLASS_LIKE.has(declaration.kind)) {
    return (
      <button
        type="button"
        className="uml-member uml-link"
        title={`Abrir ${declaration.kind} ${declaration.name} en la vista de clases`}
        onClick={() => onOpenClass(declaration.id)}
      >
        <span className="uml-visibility">+</span>
        <span>{content}</span>
        {status && <ChangeBadge status={status} />}
      </button>
    );
  }
  return (
    <span className="uml-member" title={declaration.kind}>
      <span className="uml-visibility">+</span>
      <span>{content}</span>
      {status && <ChangeBadge status={status} />}
    </span>
  );
}

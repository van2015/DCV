import type { Node, NodeProps } from "@xyflow/react";

export interface FolderNodeData {
  path: string;
  label: string;
  collapsed: boolean;
  nodeCount: number;
  onToggleFolder: (path: string) => void;
  [key: string]: unknown;
}

export type FolderFlowNode = Node<FolderNodeData, "folder">;

export function FolderNode({ data }: NodeProps<FolderFlowNode>) {
  return <FolderNodeCard data={data} />;
}

export function FolderNodeCard({ data }: { data: FolderNodeData }) {
  return (
    <div className="uml-folder" aria-label={`carpeta ${data.path}`}>
      <button
        type="button"
        className="uml-folder-toggle"
        aria-expanded={!data.collapsed}
        onClick={() => data.onToggleFolder(data.path)}
        title={data.collapsed ? "Expandir carpeta" : "Colapsar carpeta"}
      >
        <span className="uml-folder-icon">{data.collapsed ? "▸" : "▾"}</span>
        <span>{data.label}</span>
      </button>
      <span className="uml-folder-count">
        {data.nodeCount} módulo{data.nodeCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls as FlowControls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps
} from "@xyflow/react";
import type { DiagramGhost, DiagramOverlay, OverlayStatus } from "./overlay.js";
import type { DiagramNode, DiagramProjection } from "./projection.js";
import type { ClassNodeData, ModuleNodeData, PackageNodeData } from "./projection.js";
import { ClassNodeCard } from "./nodes/ClassNode.js";
import { FolderNodeCard, type FolderNodeData } from "./nodes/FolderNode.js";
import { ModuleNodeCard } from "./nodes/ModuleNode.js";
import { PackageNodeCard } from "./nodes/PackageNode.js";
import { buildLayoutGraph, ghostToLayoutNode, type LayoutGraph, type LayoutGraphNode } from "./layout/graph.js";
import { focusActive, focusNeighborhood } from "./layout/focus.js";
import { defaultLayoutRunner, type LayoutRunner } from "./layout/service.js";
import { reconcileLayout } from "./layout/reconcile.js";
import { VisualStateStore, type VisualControls } from "./layout/persistence.js";
import type { LayoutPositions } from "./layout/types.js";

export interface CanvasLeafData {
  node: DiagramNode;
  change: OverlayStatus | null;
  memberChanges: Map<string, OverlayStatus>;
  declarationChanges: Map<string, OverlayStatus>;
  showMembers: boolean;
  ghost: boolean;
  onOpenClass?: (declarationId: string) => void;
  [key: string]: unknown;
}

export interface CanvasLayoutInfo {
  positions: LayoutPositions;
  reused: number;
  placed: string[];
  visibleIds: string[];
  hiddenIds: string[];
}

export interface DiagramCanvasProps {
  visualStore: VisualStateStore;
  view: DiagramProjection["view"];
  projection: DiagramProjection;
  ghosts: DiagramGhost[];
  overlay: DiagramOverlay | null;
  focusedNodeId: string | null;
  controls: VisualControls;
  relayoutToken: number;
  onToggleFolder: (path: string) => void;
  onOpenClass: (declarationId: string) => void;
  onLayout?: (info: CanvasLayoutInfo) => void;
  layoutRunner?: LayoutRunner;
}

export function DiagramCanvas({
  visualStore,
  view,
  projection,
  ghosts,
  overlay,
  focusedNodeId,
  controls,
  relayoutToken,
  onToggleFolder,
  onOpenClass,
  onLayout,
  layoutRunner
}: DiagramCanvasProps) {
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const previousToken = useRef(relayoutToken);
  const positionsRef = useRef<LayoutPositions>({});
  const runner = layoutRunner ?? defaultLayoutRunner();
  const savedCamera = useMemo(() => visualStore.loadCamera(view), [visualStore, view]);
  const callbacks = useRef({ onLayout, onToggleFolder, onOpenClass });
  callbacks.current = { onLayout, onToggleFolder, onOpenClass };

  useEffect(() => {
    let cancelled = false;
    const force = previousToken.current !== relayoutToken;
    previousToken.current = relayoutToken;
    if (force) {
      visualStore.clearPositions(view);
    }
    const stored = force ? {} : visualStore.loadPositions(view);
    const allNodes = [...projection.nodes, ...ghosts.map(ghostToLayoutNode)];
    const layoutEdges = projection.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target
    }));
    const graph = buildLayoutGraph({
      nodes: allNodes,
      edges: layoutEdges,
      collapsedFolders: controls.collapsedFolders
    });
    const visibleNodes = allNodes.filter((node) => graphLeafIds(graph).has(node.id));

    void runner.run(graph).then((layout) => {
      if (cancelled) {
        return;
      }
      const result = reconcileLayout({
        previous: stored,
        nodes: visibleNodes,
        edges: layoutEdges,
        layout,
        force
      });
      for (const folderId of graphFolderIds(graph)) {
        const rect = layout[folderId];
        if (rect && !result.positions[folderId]) {
          result.positions[folderId] = rect;
        }
      }
      positionsRef.current = result.positions;
      visualStore.savePositions(view, result.positions);

      const visibleIds = visibilitySet({
        overlay,
        ghosts,
        focusedNodeId,
        edges: layoutEdges,
        controls,
        nodeCount: allNodes.length
      });
      const built = buildFlow(
        graph,
        result.positions,
        allNodes,
        projection,
        overlay,
        visibleIds,
        controls,
        focusedNodeId,
        callbacks.current.onToggleFolder,
        callbacks.current.onOpenClass
      );
      setNodes(built.nodes);
      setEdges(built.edges);
      callbacks.current.onLayout?.({
        positions: result.positions,
        reused: result.reused,
        placed: result.placed,
        visibleIds: built.visibleIds,
        hiddenIds: built.hiddenIds
      });
    }, () => undefined);

    return () => {
      cancelled = true;
    };
  }, [projection, ghosts, overlay, focusedNodeId, controls, relayoutToken, view, visualStore, runner]);

  return (
    <div className="diagram-canvas-flow" aria-label={`Diagrama de ${view}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView={!savedCamera}
        defaultViewport={savedCamera ?? undefined}
        minZoom={0.1}
        maxZoom={2.5}
        nodesConnectable={false}
        edgesFocusable={false}
        onMoveEnd={(_event, viewport) => visualStore.saveCamera(view, viewport)}
        onNodeDragStop={(_event, node) => {
          positionsRef.current = {
            ...positionsRef.current,
            [node.id]: {
              ...(positionsRef.current[node.id] ?? { width: 0, height: 0 }),
              x: node.position.x,
              y: node.position.y
            }
          };
          visualStore.savePositions(view, positionsRef.current);
          setNodes((current) =>
            current.map((item) =>
              item.id === node.id ? { ...item, position: node.position } : item
            )
          );
        }}
      >
        <Background gap={24} />
        <FlowControls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function ghostChange(value: CanvasLeafData): OverlayStatus | null {
  return value.change ?? (value.ghost ? { status: "removed", probable: false, kind: "class" } : null);
}

function ClassFlowView({ data }: NodeProps) {
  const value = data as unknown as CanvasLeafData;
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <ClassNodeCard
        data={value.node.data as ClassNodeData}
        change={ghostChange(value)}
        memberChanges={value.memberChanges}
        ghost={value.ghost}
        showMembers={value.showMembers}
      />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

function ModuleFlowView({ data }: NodeProps) {
  const value = data as unknown as CanvasLeafData;
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <ModuleNodeCard
        data={value.node.data as ModuleNodeData}
        change={ghostChange(value)}
        declarationChanges={value.declarationChanges}
        ghost={value.ghost}
        showMembers={value.showMembers}
        onOpenClass={value.onOpenClass}
      />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

function PackageFlowView({ data }: NodeProps) {
  const value = data as unknown as CanvasLeafData;
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <PackageNodeCard
        data={value.node.data as PackageNodeData}
        change={ghostChange(value)}
        ghost={value.ghost}
      />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

function FolderFlowView({ data }: NodeProps) {
  return <FolderNodeCard data={data as unknown as FolderNodeData} />;
}

const NODE_TYPES = {
  class: ClassFlowView,
  module: ModuleFlowView,
  package: PackageFlowView,
  folder: FolderFlowView
};

interface VisibilityInput {
  overlay: DiagramOverlay | null;
  ghosts: DiagramGhost[];
  focusedNodeId: string | null;
  edges: { id: string; source: string; target: string }[];
  controls: VisualControls;
  nodeCount: number;
}

function visibilitySet(input: VisibilityInput): Set<string> | null {
  if (!input.overlay || !focusActive(input.nodeCount, input.controls)) {
    return null;
  }
  const hasSeeds =
    input.overlay.nodeStatuses.size > 0 ||
    input.ghosts.length > 0 ||
    input.focusedNodeId !== null;
  if (!hasSeeds) {
    return null;
  }
  return focusNeighborhood({
    nodeStatuses: input.overlay.nodeStatuses,
    ghostIds: input.ghosts.map((ghost) => ghost.id),
    focusedNodeId: input.focusedNodeId,
    edges: input.edges,
    depth: input.controls.focusDepth
  });
}

function buildFlow(
  graph: LayoutGraph,
  positions: LayoutPositions,
  allNodes: DiagramNode[],
  projection: DiagramProjection,
  overlay: DiagramOverlay | null,
  visible: Set<string> | null,
  controls: VisualControls,
  focusedNodeId: string | null,
  onToggleFolder: (path: string) => void,
  onOpenClass: (declarationId: string) => void
): { nodes: FlowNode[]; edges: FlowEdge[]; visibleIds: string[]; hiddenIds: string[] } {
  const nodeIndex = new Map(allNodes.map((node) => [node.id, node]));
  const nodes: FlowNode[] = [];
  const visibleIds: string[] = [];
  const hiddenIds: string[] = [];
  const collapsed = new Set(controls.collapsedFolders);

  const walk = (graphNode: LayoutGraphNode, parentId: string | null): void => {
    const position = positions[graphNode.id] ?? { x: 0, y: 0 };
    if (graphNode.id.startsWith("folder:")) {
      const path = graphNode.id.slice("folder:".length);
      const data: FolderNodeData = {
        path,
        label: path.split("/").at(-1)!,
        collapsed: collapsed.has(path),
        nodeCount: countLeaves(graphNode),
        onToggleFolder
      };
      nodes.push({
        id: graphNode.id,
        type: "folder",
        position: { x: position.x, y: position.y },
        data: data as unknown as Record<string, unknown>,
        draggable: false,
        selectable: false,
        style: { width: position.width || 320, height: position.height || 260 },
        ...(parentId ? { parentId, extent: "parent" as const } : {})
      });
      visibleIds.push(graphNode.id);
    } else {
      const node = nodeIndex.get(graphNode.id);
      if (node) {
        const dimmed = visible !== null && !visible.has(node.id);
        if (dimmed && controls.focusHide) {
          hiddenIds.push(node.id);
          return;
        }
        if (dimmed) {
          hiddenIds.push(node.id);
        }
        const data: CanvasLeafData = {
          node,
          change: overlay?.nodeStatuses.get(node.id) ?? null,
          memberChanges: overlay?.memberStatuses.get(node.id) ?? new Map(),
          declarationChanges: overlay?.declarationStatuses ?? new Map(),
          showMembers: controls.showMembers,
          ghost: node.id.startsWith("ghost:"),
          onOpenClass
        };
        nodes.push({
          id: node.id,
          type: node.kind,
          position: { x: position.x, y: position.y },
          data: data as unknown as Record<string, unknown>,
          className: dimmed
            ? "dimmed"
            : node.id === focusedNodeId
              ? "focused"
              : undefined,
          ...(parentId ? { parentId, extent: "parent" as const } : {})
        });
        visibleIds.push(node.id);
      }
    }
    for (const child of graphNode.children ?? []) {
      walk(child, graphNode.id.startsWith("folder:") ? graphNode.id : parentId);
    }
  };

  for (const child of graph.children) {
    walk(child, null);
  }

  const included = new Set(nodes.map((node) => node.id));
  const edges: FlowEdge[] = projection.edges
    .filter((edge) => included.has(edge.source) && included.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      className: `edge-${edge.kind}${edge.typeOnly ? " type-only" : ""}`
    }));

  return { nodes, edges, visibleIds, hiddenIds };
}

function graphFolderIds(graph: LayoutGraph): string[] {
  const ids: string[] = [];
  const visit = (node: LayoutGraphNode): void => {
    if (node.id.startsWith("folder:")) {
      ids.push(node.id);
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  for (const child of graph.children) {
    visit(child);
  }
  return ids;
}

function graphLeafIds(graph: LayoutGraph): Set<string> {
  const ids = new Set<string>();
  const visit = (node: LayoutGraphNode): void => {
    if (node.id.startsWith("folder:")) {
      for (const child of node.children ?? []) {
        visit(child);
      }
    } else {
      ids.add(node.id);
    }
  };
  for (const child of graph.children) {
    visit(child);
  }
  return ids;
}

function countLeaves(node: LayoutGraphNode): number {
  if (!node.children || node.children.length === 0) {
    return 0;
  }
  let count = 0;
  for (const child of node.children) {
    if (child.id.startsWith("folder:")) {
      count += countLeaves(child);
    } else {
      count += 1;
    }
  }
  return count;
}

import type { DiagramNode } from "../projection.js";
import type { DiagramGhost } from "../overlay.js";

export interface NodeSize {
  width: number;
  height: number;
}

export const NODE_SIZES: Record<DiagramNode["kind"], NodeSize> = {
  class: { width: 240, height: 180 },
  module: { width: 260, height: 200 },
  package: { width: 220, height: 120 }
};

export const FOLDER_SIZE: NodeSize = { width: 320, height: 260 };

export interface LayoutGraphNode {
  id: string;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  children?: LayoutGraphNode[];
}

export interface LayoutGraphEdge {
  id: string;
  sources: string[];
  targets: string[];
}

export interface LayoutGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: LayoutGraphNode[];
  edges: LayoutGraphEdge[];
}

export interface LayoutRequest {
  nodes: DiagramNode[];
  edges: { id: string; source: string; target: string }[];
  collapsedFolders: string[];
}

interface FolderNode {
  path: string;
  children: FolderNode[];
  nodes: DiagramNode[];
}

export function buildLayoutGraph(request: LayoutRequest): LayoutGraph {
  const collapsed = new Set(request.collapsedFolders);
  const visible = new Set<string>();
  const moduleNodes = request.nodes.filter(
    (node) => node.kind === "module" && node.containerId
  );
  const rootNodes = request.nodes.filter(
    (node) => !(node.kind === "module" && node.containerId)
  );

  for (const node of rootNodes) {
    visible.add(node.id);
  }

  const tree = buildFolderTree(moduleNodes);
  const children: LayoutGraphNode[] = rootNodes.map(leafNode);

  for (const folder of tree) {
    const emitted = emitFolder(folder, collapsed, visible);
    if (emitted) {
      children.push(emitted);
    }
  }

  const edges: LayoutGraphEdge[] = [];
  for (const edge of request.edges) {
    if (visible.has(edge.source) && visible.has(edge.target)) {
      edges.push({ id: edge.id, sources: [edge.source], targets: [edge.target] });
    }
  }

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "36",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60"
    },
    children,
    edges
  };
}

function buildFolderTree(nodes: DiagramNode[]): FolderNode[] {
  const roots: FolderNode[] = [];
  const index = new Map<string, FolderNode>();

  const ensure = (path: string): FolderNode => {
    const existing = index.get(path);
    if (existing) {
      return existing;
    }
    const node: FolderNode = { path, children: [], nodes: [] };
    index.set(path, node);
    const slash = path.lastIndexOf("/");
    if (slash === -1) {
      roots.push(node);
    } else {
      ensure(path.slice(0, slash)).children.push(node);
    }
    return node;
  };

  for (const node of nodes) {
    const directory = node.containerId!.slice("folder:".length);
    ensure(directory).nodes.push(node);
  }

  const sort = (folder: FolderNode): void => {
    folder.children.sort((left, right) => left.path.localeCompare(right.path));
    folder.nodes.sort((left, right) => left.path.localeCompare(right.path));
    folder.children.forEach(sort);
  };
  roots.sort((left, right) => left.path.localeCompare(right.path));
  roots.forEach(sort);

  return roots;
}

function emitFolder(
  folder: FolderNode,
  collapsed: Set<string>,
  visible: Set<string>
): LayoutGraphNode | null {
  const id = `folder:${folder.path}`;

  if (collapsed.has(folder.path)) {
    return {
      id,
      width: FOLDER_SIZE.width,
      height: 60,
      layoutOptions: { "elk.padding": "[top=40,left=16,bottom=16,right=16]" }
    };
  }

  const children: LayoutGraphNode[] = folder.nodes.map((node) => {
    visible.add(node.id);
    return leafNode(node);
  });
  for (const child of folder.children) {
    const emitted = emitFolder(child, collapsed, visible);
    if (emitted) {
      children.push(emitted);
    }
  }

  if (children.length === 0) {
    return null;
  }

  return {
    id,
    layoutOptions: { "elk.padding": "[top=40,left=16,bottom=16,right=16]" },
    children
  };
}

function leafNode(node: DiagramNode): LayoutGraphNode {
  const size = NODE_SIZES[node.kind];
  return { id: node.id, width: size.width, height: size.height };
}

export function ghostToLayoutNode(ghost: DiagramGhost): DiagramNode {
  return {
    id: ghost.id,
    kind: ghost.kind,
    label: ghost.label,
    path: ghost.path,
    containerId: null,
    data: ghost.data
  };
}

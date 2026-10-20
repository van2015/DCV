import type {
  ChangeStatus,
  DeclarationChange,
  DeclarationKind,
  EdgeChange,
  EdgeKind,
  MemberChange,
  SnapshotDiff
} from "@dcv/shared";
import type {
  ClassNodeData,
  DiagramNode,
  DiagramProjection,
  ModuleNodeData,
  PackageNodeData
} from "./projection.js";

export interface ChangeMarker {
  status: ChangeStatus;
  symbol: string;
  label: string;
}

export const CHANGE_MARKERS: Record<ChangeStatus, ChangeMarker> = {
  added: { status: "added", symbol: "+", label: "Añadido" },
  removed: { status: "removed", symbol: "−", label: "Eliminado" },
  modified: { status: "modified", symbol: "~", label: "Modificado" },
  "body-only": { status: "body-only", symbol: "≈", label: "Solo cuerpo" },
  moved: { status: "moved", symbol: "→", label: "Movido" },
  renamed: { status: "renamed", symbol: "↻", label: "Renombrado" }
};

export interface OverlayStatus {
  status: ChangeStatus;
  probable: boolean;
  kind: DeclarationKind;
}

export interface DiagramGhost {
  id: string;
  kind: "class" | "module" | "package";
  label: string;
  path: string;
  declarationKind?: DeclarationKind;
  data: ClassNodeData | ModuleNodeData | PackageNodeData;
}

export type EdgeChangeStatus = "added" | "removed";

export interface DiagramGhostEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  target: string;
  typeOnly: boolean;
}

export interface DiagramOverlay {
  nodeStatuses: Map<string, OverlayStatus>;
  declarationStatuses: Map<string, OverlayStatus>;
  memberStatuses: Map<string, Map<string, OverlayStatus>>;
  edgeStatuses: Map<string, EdgeChangeStatus>;
  ghosts: DiagramGhost[];
  ghostEdges: DiagramGhostEdge[];
}

export interface ChangeFilters {
  implementation: boolean;
  members: boolean;
  types: boolean;
}

export const DEFAULT_CHANGE_FILTERS: ChangeFilters = {
  implementation: true,
  members: true,
  types: true
};

const CLASS_LIKE: DeclarationKind[] = ["class", "interface", "enum"];

export function changeMarker(status: ChangeStatus): ChangeMarker {
  return CHANGE_MARKERS[status];
}

export function isTypeKind(kind: DeclarationKind): boolean {
  return kind === "type" || kind === "interface" || kind === "enum";
}

export function buildOverlay(
  projection: DiagramProjection,
  diff: SnapshotDiff
): DiagramOverlay {
  const overlay: DiagramOverlay = {
    nodeStatuses: new Map(),
    declarationStatuses: new Map(),
    memberStatuses: new Map(),
    edgeStatuses: new Map(),
    ghosts: [],
    ghostEdges: []
  };

  for (const change of diff.declarations) {
    const status: OverlayStatus = {
      status: change.status,
      probable: change.probable,
      kind: change.kind
    };
    overlay.declarationStatuses.set(change.id, status);
    if (change.status !== "removed") {
      overlay.nodeStatuses.set(change.id, status);
    }
  }

  for (const change of diff.members) {
    const status: OverlayStatus = {
      status: change.status,
      probable: change.probable,
      kind: change.parentKind
    };
    const members = overlay.memberStatuses.get(change.parentId) ?? new Map();
    members.set(change.memberKey, status);
    overlay.memberStatuses.set(change.parentId, members);
  }

  if (projection.view === "classes") {
    overlay.ghosts.push(...classGhosts(diff));
  } else if (projection.view === "modules") {
    applyModuleFileStatuses(overlay, projection, diff);
    overlay.ghosts.push(...moduleGhosts(diff));
  } else {
    applyPackageFileStatuses(overlay, projection, diff);
  }

  applyEdgeChanges(overlay, projection, diff);

  return overlay;
}

export function filterOverlay(
  overlay: DiagramOverlay,
  filters: ChangeFilters
): DiagramOverlay {
  const visible = (status: OverlayStatus): boolean => {
    if (!filters.implementation && status.status === "body-only") {
      return false;
    }
    if (!filters.types && isTypeKind(status.kind)) {
      return false;
    }
    return true;
  };

  const nodeStatuses = new Map(
    [...overlay.nodeStatuses].filter(([, status]) => visible(status))
  );
  const declarationStatuses = new Map(
    [...overlay.declarationStatuses].filter(([, status]) => visible(status))
  );

  const memberStatuses = new Map<string, Map<string, OverlayStatus>>();
  if (filters.members) {
    for (const [parentId, members] of overlay.memberStatuses) {
      const kept = new Map(
        [...members].filter(([, status]) => visible(status))
      );
      if (kept.size > 0) {
        memberStatuses.set(parentId, kept);
      }
    }
  }

  const ghosts = overlay.ghosts.filter(
    (ghost) =>
      !(
        !filters.types &&
        ghost.declarationKind !== undefined &&
        isTypeKind(ghost.declarationKind)
      )
  );

  return {
    nodeStatuses,
    declarationStatuses,
    memberStatuses,
    edgeStatuses: overlay.edgeStatuses,
    ghosts,
    ghostEdges: overlay.ghostEdges
  };
}

function applyEdgeChanges(
  overlay: DiagramOverlay,
  projection: DiagramProjection,
  diff: SnapshotDiff
): void {
  const visibleNodes = new Set(projection.nodes.map((node) => node.id));
  const ghostNodes = new Set(overlay.ghosts.map((ghost) => ghost.id));
  const resolve = (id: string): string | null => {
    if (visibleNodes.has(id)) {
      return id;
    }
    const ghostId = `ghost:${id}`;
    return ghostNodes.has(ghostId) ? ghostId : null;
  };

  if (projection.view === "packages") {
    applyPackageEdgeChanges(overlay, projection, diff, resolve);
    return;
  }

  const projectionEdges = new Map(
    projection.edges.map((edge) => [edgeKey(edge.kind, edge.source, edge.target), edge])
  );

  for (const change of diff.edges) {
    if (change.status === "added") {
      const edge = projectionEdges.get(edgeKey(change.kind, change.from, change.to));
      if (edge !== undefined) {
        overlay.edgeStatuses.set(edge.id, "added");
      }
      continue;
    }

    if (projection.view === "classes" && change.kind === "imports") {
      continue;
    }

    const source = resolve(change.from);
    const target = resolve(change.to);
    if (source === null || target === null) {
      continue;
    }
    overlay.ghostEdges.push({
      id: `ghost-edge:${change.kind}:${source}->${target}`,
      kind: change.kind,
      source,
      target,
      typeOnly: change.typeOnly
    });
  }
}

function applyPackageEdgeChanges(
  overlay: DiagramOverlay,
  projection: DiagramProjection,
  diff: SnapshotDiff,
  resolve: (id: string) => string | null
): void {
  const projectionEdges = new Map(
    projection.edges.map((edge) => [edgeKey(edge.kind, edge.source, edge.target), edge])
  );
  const removedByPair = new Map<string, EdgeChange[]>();

  for (const change of diff.edges) {
    if (change.kind !== "imports") {
      continue;
    }
    const fromDir = directoryOf(change.fromPath);
    const toDir = directoryOf(change.toPath);
    if (fromDir === toDir) {
      continue;
    }
    const key = edgeKey(change.kind, `package:${fromDir}`, `package:${toDir}`);

    if (change.status === "added") {
      const edge = projectionEdges.get(key);
      if (edge !== undefined) {
        overlay.edgeStatuses.set(edge.id, "added");
      }
      continue;
    }

    const changes = removedByPair.get(key) ?? [];
    changes.push(change);
    removedByPair.set(key, changes);
  }

  for (const [key, changes] of removedByPair) {
    if (projectionEdges.has(key)) {
      continue;
    }
    const [kind, rawSource, rawTarget] = parseEdgeKey(key);
    const source = resolve(rawSource);
    const target = resolve(rawTarget);
    if (source === null || target === null) {
      continue;
    }
    overlay.ghostEdges.push({
      id: `ghost-edge:${key}`,
      kind,
      source,
      target,
      typeOnly: changes.every((change) => change.typeOnly)
    });
  }
}

function edgeKey(kind: EdgeKind, source: string, target: string): string {
  return `${kind}|${source}|${target}`;
}

function parseEdgeKey(key: string): [EdgeKind, string, string] {
  const [kind, source, target] = key.split("|");
  return [kind as EdgeKind, source!, target!];
}

function classGhosts(diff: SnapshotDiff): DiagramGhost[] {
  return diff.declarations
    .filter(
      (change) =>
        change.status === "removed" &&
        change.previousDeclaration !== null &&
        CLASS_LIKE.includes(change.kind)
    )
    .map((change) => {
      const previous = change.previousDeclaration!;
      const path = change.previousPath ?? change.path;
      return {
        id: `ghost:${change.previousId ?? change.id}`,
        kind: "class" as const,
        label: change.name,
        path,
        declarationKind: change.kind,
        data: {
          kind: "class" as const,
          stereotype: stereotypeOf(change.kind, previous.abstract),
          declaration: {
            ...previous,
            id: change.previousId ?? change.id,
            path
          }
        }
      };
    });
}

function applyModuleFileStatuses(
  overlay: DiagramOverlay,
  projection: DiagramProjection,
  diff: SnapshotDiff
): void {
  const moduleIds = new Set(projection.nodes.map((node) => node.id));
  for (const file of diff.files) {
    const id = `module:${file.path}`;
    if (file.status === "removed" || !moduleIds.has(id)) {
      continue;
    }
    overlay.nodeStatuses.set(id, {
      status: file.status,
      probable: file.probable,
      kind: "class"
    });
  }
}

function moduleGhosts(diff: SnapshotDiff): DiagramGhost[] {
  const byPath = new Map<string, DeclarationChange[]>();
  for (const change of diff.declarations) {
    if (change.status !== "removed" || change.previousDeclaration === null) {
      continue;
    }
    const path = change.previousPath ?? change.path;
    const list = byPath.get(path) ?? [];
    list.push(change);
    byPath.set(path, list);
  }

  for (const file of diff.files) {
    if (file.status === "removed" && !byPath.has(file.path)) {
      byPath.set(file.path, []);
    }
  }

  return [...byPath.entries()].map(([path, changes]) => {
    const declarations = changes
      .filter((change) => change.previousDeclaration !== null)
      .map((change) => ({
        ...change.previousDeclaration!,
        id: change.previousId ?? change.id,
        path
      }));
    const data: ModuleNodeData = {
      kind: "module",
      path,
      functions: declarations.filter((declaration) => declaration.kind === "function"),
      types: declarations.filter((declaration) => declaration.kind !== "function")
    };
    return {
      id: `ghost:module:${path}`,
      kind: "module" as const,
      label: path.split("/").at(-1)!,
      path,
      data
    };
  });
}

function applyPackageFileStatuses(
  overlay: DiagramOverlay,
  projection: DiagramProjection,
  diff: SnapshotDiff
): void {
  const packages = new Map(
    projection.nodes.map((node) => [
      (node.data as PackageNodeData).directory,
      node
    ])
  );
  const touched = new Map<string, ChangeStatus>();
  const removedDirectories = new Set<string>();

  for (const file of diff.files) {
    const directory = directoryOf(file.path);
    if (file.status === "removed") {
      if (!packages.has(directory)) {
        removedDirectories.add(directory);
      } else if (touched.get(directory) !== "modified") {
        touched.set(directory, "modified");
      }
      continue;
    }
    touched.set(directory, file.status === "added" ? touched.get(directory) ?? "added" : "modified");
  }

  for (const [directory, status] of touched) {
    const node = packages.get(directory);
    if (!node) {
      continue;
    }
    overlay.nodeStatuses.set(node.id, {
      status: status === "added" ? "added" : "modified",
      probable: false,
      kind: "class"
    });
  }

  const removedFiles = diff.files.filter((file) => file.status === "removed");
  for (const directory of removedDirectories) {
    const files = removedFiles.filter((file) => directoryOf(file.path) === directory);
    const data: PackageNodeData = {
      kind: "package",
      directory,
      moduleCount: files.length
    };
    overlay.ghosts.push({
      id: `ghost:package:${directory}`,
      kind: "package",
      label: directory === "" ? "(raíz)" : directory.split("/").at(-1)!,
      path: directory,
      data
    });
  }
}

function stereotypeOf(
  kind: DeclarationKind,
  abstract: boolean
): ClassNodeData["stereotype"] {
  if (kind === "interface") {
    return "interface";
  }
  if (kind === "enum") {
    return "enum";
  }
  return abstract ? "abstract class" : "class";
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function ghostNode(ghost: DiagramGhost): DiagramNode {
  return {
    id: ghost.id,
    kind: ghost.kind,
    label: ghost.label,
    path: ghost.path,
    containerId: null,
    data: ghost.data
  };
}

export function memberChangesFor(
  overlay: DiagramOverlay,
  parentId: string
): Map<string, OverlayStatus> {
  return overlay.memberStatuses.get(parentId) ?? new Map();
}

export function overlaySummary(overlay: DiagramOverlay): string {
  const counts = new Map<ChangeStatus, number>();
  for (const status of overlay.nodeStatuses.values()) {
    counts.set(status.status, (counts.get(status.status) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${changeMarker(status).symbol} ${count}`)
    .join(" ");
}

export function memberChangeEntry(
  change: MemberChange
): OverlayStatus {
  return {
    status: change.status,
    probable: change.probable,
    kind: change.parentKind
  };
}

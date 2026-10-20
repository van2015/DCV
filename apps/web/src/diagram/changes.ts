import type { ChangeStatus, DeclarationKind, SnapshotDiff } from "@dcv/shared";
import type { DiagramView } from "@dcv/shared";
import { changeMarker, isTypeKind, type ChangeFilters } from "./overlay.js";

export interface PanelChange {
  key: string;
  status: ChangeStatus;
  title: string;
  detail: string;
  view: DiagramView;
  targetId: string;
}

export const STATUS_ORDER: ChangeStatus[] = [
  "added",
  "removed",
  "modified",
  "body-only",
  "moved",
  "renamed"
];

export const STATUS_LABELS: Record<ChangeStatus, string> = {
  added: "Añadidos",
  removed: "Eliminados",
  modified: "Modificados",
  "body-only": "Solo cuerpo",
  moved: "Movidos",
  renamed: "Renombrados"
};

const CLASS_LIKE: DeclarationKind[] = ["class", "interface", "enum"];

export function collectPanelChanges(
  diff: SnapshotDiff,
  filters: ChangeFilters
): PanelChange[] {
  const changes: PanelChange[] = [];

  for (const change of diff.declarations) {
    if (!filters.implementation && change.status === "body-only") {
      continue;
    }
    if (!filters.types && isTypeKind(change.kind)) {
      continue;
    }
    const classLike = CLASS_LIKE.includes(change.kind);
    const view: DiagramView = classLike ? "classes" : "modules";
    const targetId =
      change.status === "removed"
        ? classLike
          ? `ghost:${change.previousId ?? change.id}`
          : `ghost:module:${change.previousPath ?? change.path}`
        : classLike
          ? change.id
          : `module:${change.path}`;
    changes.push({
      key: `decl:${change.status}:${change.id}`,
      status: change.status,
      title: `${kindLabel(change.kind)} ${change.name}`,
      detail: change.previousPath && change.previousPath !== change.path
        ? `${change.previousPath} → ${change.path}`
        : change.path,
      view,
      targetId
    });
  }

  if (filters.members) {
    for (const change of diff.members) {
      if (!filters.implementation && change.status === "body-only") {
        continue;
      }
      if (!filters.types && isTypeKind(change.parentKind)) {
        continue;
      }
      changes.push({
        key: `member:${change.status}:${change.parentId}:${change.memberKey}`,
        status: change.status,
        title: `${kindLabel(change.parentKind)} ${change.parentName}.${change.member.name}`,
        detail: memberDetail(change.member.kind, change.parentPath),
        view: "classes",
        targetId: change.parentId
      });
    }
  }

  for (const change of diff.edges) {
    if (change.kind === "imports") {
      changes.push({
        key: `edge:${change.status}:${change.kind}:${change.from}->${change.to}`,
        status: change.status,
        title: `Importación ${shortName(change.from)} → ${shortName(change.to)}`,
        detail: `${change.fromPath} → ${change.toPath}`,
        view: "modules",
        targetId: `module:${change.fromPath}`
      });
    } else {
      changes.push({
        key: `edge:${change.status}:${change.kind}:${change.from}->${change.to}`,
        status: change.status,
        title: `${edgeLabel(change.kind)} ${shortName(change.from)} → ${shortName(change.to)}`,
        detail: `${change.fromPath} → ${change.toPath}`,
        view: "classes",
        targetId: change.from
      });
    }
  }

  return changes.sort(
    (left, right) =>
      STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status) ||
      left.title.localeCompare(right.title)
  );
}

export function groupPanelChanges(
  changes: PanelChange[]
): { status: ChangeStatus; label: string; items: PanelChange[] }[] {
  return STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    items: changes.filter((change) => change.status === status)
  })).filter((group) => group.items.length > 0);
}

export function markerLabel(status: ChangeStatus): string {
  const marker = changeMarker(status);
  return `${marker.symbol} ${marker.label}`;
}

function kindLabel(kind: DeclarationKind): string {
  switch (kind) {
    case "class":
      return "Clase";
    case "interface":
      return "Interfaz";
    case "enum":
      return "Enum";
    case "type":
      return "Tipo";
    case "function":
      return "Función";
  }
}

function edgeLabel(kind: string): string {
  switch (kind) {
    case "extends":
      return "Herencia";
    case "implements":
      return "Implementación";
    case "association":
      return "Asociación";
    default:
      return "Dependencia";
  }
}

function memberDetail(kind: string, path: string): string {
  return `${kind} en ${path}`;
}

function shortName(id: string): string {
  const hash = id.indexOf("#");
  const source = hash === -1 ? id : id.slice(hash + 1);
  const colon = source.lastIndexOf(":");
  return colon === -1 ? source : source.slice(colon + 1);
}

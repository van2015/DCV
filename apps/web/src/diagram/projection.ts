import type {
  DeclarationKind,
  DiagramView,
  EdgeKind,
  Snapshot,
  SnapshotDeclaration
} from "@dcv/shared";

export type ClassStereotype = "class" | "abstract class" | "interface" | "enum";

export interface ClassNodeData {
  kind: "class";
  declaration: SnapshotDeclaration;
  stereotype: ClassStereotype;
  [key: string]: unknown;
}

export interface ModuleNodeData {
  kind: "module";
  path: string;
  functions: SnapshotDeclaration[];
  types: SnapshotDeclaration[];
  [key: string]: unknown;
}

export interface PackageNodeData {
  kind: "package";
  directory: string;
  moduleCount: number;
  [key: string]: unknown;
}

export type DiagramNodeData = ClassNodeData | ModuleNodeData | PackageNodeData;

export interface DiagramNode {
  id: string;
  kind: "class" | "module" | "package";
  label: string;
  path: string;
  containerId: string | null;
  data: DiagramNodeData;
}

export interface DiagramContainer {
  id: string;
  label: string;
  path: string;
  parentId: string | null;
}

export interface DiagramEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  target: string;
  typeOnly: boolean;
}

export interface DiagramProjection {
  view: DiagramView;
  nodes: DiagramNode[];
  containers: DiagramContainer[];
  edges: DiagramEdge[];
}

const CLASS_LIKE: DeclarationKind[] = ["class", "interface", "enum"];

export function projectSnapshot(snapshot: Snapshot, view: DiagramView): DiagramProjection {
  switch (view) {
    case "classes":
      return projectClasses(snapshot);
    case "modules":
      return projectModules(snapshot);
    case "packages":
      return projectPackages(snapshot);
  }
}

export function initialViewFor(snapshot: Snapshot): DiagramView {
  const { classes, interfaces, functions, types, enums } = snapshot.stats;
  if (classes > 0 || interfaces > 0) {
    return "classes";
  }
  if (functions > 0 || types > 0 || enums > 0) {
    return "modules";
  }
  return snapshot.files.length > 0 ? "modules" : "classes";
}

function projectClasses(snapshot: Snapshot): DiagramProjection {
  const declarations = snapshot.files.flatMap((file) =>
    file.declarations.filter((declaration) => CLASS_LIKE.includes(declaration.kind))
  );
  const ids = new Set(declarations.map((declaration) => declaration.id));

  return {
    view: "classes",
    nodes: declarations.map((declaration) => ({
      id: declaration.id,
      kind: "class",
      label: declaration.name,
      path: declaration.path,
      containerId: null,
      data: {
        kind: "class",
        declaration,
        stereotype: stereotypeOf(declaration)
      }
    })),
    containers: [],
    edges: snapshot.edges
      .filter(
        (edge) =>
          edge.kind !== "imports" && ids.has(edge.from) && ids.has(edge.to)
      )
      .map((edge) => ({
        id: edge.id,
        kind: edge.kind,
        source: edge.from,
        target: edge.to,
        typeOnly: edge.typeOnly
      }))
  };
}

function projectModules(snapshot: Snapshot): DiagramProjection {
  const containers = buildContainers(snapshot.files.map((file) => file.path));
  const nodes: DiagramNode[] = snapshot.files.map((file) => {
    const directory = directoryOf(file.path);
    return {
      id: `module:${file.path}`,
      kind: "module",
      label: fileNameOf(file.path),
      path: file.path,
      containerId: directory ? `folder:${directory}` : null,
      data: {
        kind: "module",
        path: file.path,
        functions: file.declarations.filter(
          (declaration) => declaration.kind === "function" && declaration.exported
        ),
        types: file.declarations.filter(
          (declaration) => declaration.kind !== "function" && declaration.exported
        )
      }
    };
  });
  const ids = new Set(nodes.map((node) => node.id));

  return {
    view: "modules",
    nodes,
    containers,
    edges: snapshot.edges
      .filter((edge) => edge.kind === "imports")
      .map((edge) => ({
        id: edge.id,
        kind: edge.kind,
        source: `module:${edge.fromPath}`,
        target: `module:${edge.toPath}`,
        typeOnly: edge.typeOnly
      }))
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
  };
}

function projectPackages(snapshot: Snapshot): DiagramProjection {
  const filesByDirectory = new Map<string, number>();
  for (const file of snapshot.files) {
    const directory = directoryOf(file.path);
    filesByDirectory.set(directory, (filesByDirectory.get(directory) ?? 0) + 1);
  }

  const nodes: DiagramNode[] = [...filesByDirectory.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([directory, moduleCount]) => ({
      id: `package:${directory}`,
      kind: "package",
      label: directory === "" ? "(raíz)" : directory.split("/").at(-1)!,
      path: directory,
      containerId: null,
      data: { kind: "package", directory, moduleCount }
    }));

  const edges = new Map<string, DiagramEdge>();
  for (const edge of snapshot.edges) {
    if (edge.kind !== "imports") {
      continue;
    }
    const sourceDirectory = directoryOf(edge.fromPath);
    const targetDirectory = directoryOf(edge.toPath);
    if (sourceDirectory === targetDirectory) {
      continue;
    }
    const key = `${sourceDirectory}->${targetDirectory}`;
    const existing = edges.get(key);
    if (existing) {
      existing.typeOnly = existing.typeOnly && edge.typeOnly;
      continue;
    }
    edges.set(key, {
      id: `imports:package:${key}`,
      kind: "imports",
      source: `package:${sourceDirectory}`,
      target: `package:${targetDirectory}`,
      typeOnly: edge.typeOnly
    });
  }

  return {
    view: "packages",
    nodes,
    containers: [],
    edges: [...edges.values()].sort(
      (left, right) =>
        left.source.localeCompare(right.source) || left.target.localeCompare(right.target)
    )
  };
}

function stereotypeOf(declaration: SnapshotDeclaration): ClassStereotype {
  if (declaration.kind === "interface") {
    return "interface";
  }
  if (declaration.kind === "enum") {
    return "enum";
  }
  return declaration.abstract ? "abstract class" : "class";
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function buildContainers(paths: string[]): DiagramContainer[] {
  const directories = new Set<string>();
  for (const path of paths) {
    let directory = directoryOf(path);
    while (directory !== "" && !directories.has(directory)) {
      directories.add(directory);
      directory = directoryOf(directory);
    }
  }

  return [...directories]
    .sort((left, right) => left.localeCompare(right))
    .map((directory) => {
      const parent = directoryOf(directory);
      return {
        id: `folder:${directory}`,
        label: directory.split("/").at(-1)!,
        path: directory,
        parentId: parent ? `folder:${parent}` : null
      };
    });
}

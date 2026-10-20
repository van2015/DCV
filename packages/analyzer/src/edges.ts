import ts from "typescript";
import { moduleNodeId, type SnapshotEdge, type SnapshotFile } from "@dcv/shared";
import { findDeclaration } from "./symbols.js";

export function buildSnapshotEdges(files: SnapshotFile[]): SnapshotEdge[] {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const edges = new Map<string, SnapshotEdge>();

  const addEdge = (edge: SnapshotEdge): void => {
    const key = `${edge.kind}:${edge.from}->${edge.to}`;
    const existing = edges.get(key);
    if (existing) {
      existing.typeOnly = existing.typeOnly && edge.typeOnly;
      return;
    }
    edges.set(key, edge);
  };

  for (const file of files) {
    for (const record of file.imports) {
      if (!record.resolvedPath || record.resolvedPath === file.path) {
        continue;
      }
      addEdge({
        id: `${record.typeOnly ? "imports-type" : "imports"}:${moduleNodeId(file.path)}->${moduleNodeId(record.resolvedPath)}`,
        kind: "imports",
        from: moduleNodeId(file.path),
        to: moduleNodeId(record.resolvedPath),
        fromPath: file.path,
        toPath: record.resolvedPath,
        typeOnly: record.typeOnly
      });
    }

    for (const declaration of file.declarations) {
      for (const heritage of declaration.heritage) {
        const target = findDeclaration(filesByPath, file.path, heritage.name);
        if (!target || target.id === declaration.id) {
          continue;
        }
        addEdge({
          id: `${heritage.kind}:${declaration.id}->${target.id}`,
          kind: heritage.kind,
          from: declaration.id,
          to: target.id,
          fromPath: declaration.path,
          toPath: target.path,
          typeOnly: false
        });
      }

      for (const member of declaration.members) {
        if (member.kind !== "property" || !member.type) {
          continue;
        }
        for (const reference of collectTypeReferences(member.type)) {
          const target = findDeclaration(filesByPath, file.path, reference);
          if (!target || target.id === declaration.id) {
            continue;
          }
          if (target.kind !== "class" && target.kind !== "interface" && target.kind !== "enum") {
            continue;
          }
          addEdge({
            id: `association:${declaration.id}->${target.id}`,
            kind: "association",
            from: declaration.id,
            to: target.id,
            fromPath: declaration.path,
            toPath: target.path,
            typeOnly: false
          });
        }
      }
    }
  }

  return [...edges.values()].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to)
  );
}

export function collectTypeReferences(typeText: string): string[] {
  const sourceFile = ts.createSourceFile(
    "__type.ts",
    `type __T = ${typeText};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const names = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      names.add(node.typeName.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return [...names];
}

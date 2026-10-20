import type { SnapshotDeclaration, SnapshotFile } from "@dcv/shared";

export const DEFAULT_REEXPORT_DEPTH = 8;

export function findDeclaration(
  files: Map<string, SnapshotFile>,
  path: string,
  name: string,
  maxDepth = DEFAULT_REEXPORT_DEPTH
): SnapshotDeclaration | null {
  return lookup(files, path, name, maxDepth, 0, new Set<string>());
}

function lookup(
  files: Map<string, SnapshotFile>,
  path: string,
  name: string,
  maxDepth: number,
  depth: number,
  visited: Set<string>
): SnapshotDeclaration | null {
  if (depth > maxDepth) {
    return null;
  }
  const key = `${path}#${name}`;
  if (visited.has(key)) {
    return null;
  }
  visited.add(key);

  const file = files.get(path);
  if (!file) {
    return null;
  }

  const local = localDeclaration(file, name);
  if (local) {
    return local;
  }

  const localName = name === "@default" ? "default" : name;
  for (const record of file.imports) {
    if (!record.resolvedPath) {
      continue;
    }
    for (const binding of record.bindings) {
      if (binding.local !== localName) {
        continue;
      }
      if (binding.imported === "*") {
        continue;
      }
      const targetName = binding.imported === "default" ? "@default" : binding.imported;
      const found = lookup(files, record.resolvedPath, targetName, maxDepth, depth + 1, visited);
      if (found) {
        return found;
      }
    }
    if (record.starReExport) {
      const found = lookup(files, record.resolvedPath, name, maxDepth, depth + 1, visited);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function localDeclaration(file: SnapshotFile, name: string): SnapshotDeclaration | null {
  if (name === "@default") {
    return (
      file.declarations.find((declaration) => declaration.defaultExport) ??
      file.declarations.find((declaration) => declaration.name === "default") ??
      null
    );
  }
  return file.declarations.find((declaration) => declaration.name === name) ?? null;
}

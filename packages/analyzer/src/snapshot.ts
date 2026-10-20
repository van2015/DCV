import {
  declarationNodeId,
  type Diagnostic,
  type FileModel,
  type ResolvedImportRecord,
  type Snapshot,
  type SnapshotDeclaration,
  type SnapshotFile,
  type SnapshotStats
} from "@dcv/shared";
import { isAnalyzableSourcePath } from "./discovery.js";
import { buildSnapshotEdges } from "./edges.js";
import { ImportResolver } from "./resolver.js";
import { TsConfigManager, type ReadTextFile } from "./tsconfig.js";

export interface SnapshotFileInput {
  path: string;
  blobSha: string;
  model: FileModel;
}

export interface AssembleSnapshotInput {
  commit: string;
  branch: string;
  analyzerVersion: string;
  files: SnapshotFileInput[];
  readText: ReadTextFile;
}

export function assembleSnapshot(input: AssembleSnapshotInput): Snapshot {
  const manager = new TsConfigManager(input.readText);
  const resolver = new ImportResolver(manager);
  const files: SnapshotFile[] = [];
  const diagnostics: Diagnostic[] = [];

  const sorted = [...input.files]
    .filter((file) => isAnalyzableSourcePath(file.path))
    .sort((left, right) => left.path.localeCompare(right.path));

  for (const file of sorted) {
    const { config, diagnostics: configDiagnostics } = manager.getForFile(file.path);
    diagnostics.push(...configDiagnostics);

    const imports: ResolvedImportRecord[] = file.model.imports.map((record) => {
      const resolution = resolver.resolveDetailed(file.path, record.specifier, config);
      if (!resolution.path && resolution.projectSpecifier) {
        diagnostics.push({
          severity: "warning",
          code: "unresolved_import",
          message: `No se pudo resolver el import "${record.specifier}".`,
          path: file.path
        });
      }
      return { ...record, resolvedPath: resolution.path };
    });

    const declarations: SnapshotDeclaration[] = file.model.declarations.map((declaration) => ({
      ...declaration,
      id: declarationNodeId(file.path, declaration.kind, declaration.name),
      path: file.path
    }));

    const fileDiagnostics = file.model.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      path: file.path
    }));
    diagnostics.push(...fileDiagnostics);

    files.push({
      path: file.path,
      contentHash: file.blobSha,
      scriptKind: file.model.scriptKind,
      imports,
      declarations,
      diagnostics: fileDiagnostics
    });
  }

  const edges = buildSnapshotEdges(files);
  const stats = computeStats(files);
  stats.edges = edges.length;

  return {
    commit: input.commit,
    branch: input.branch,
    analyzerVersion: input.analyzerVersion,
    files,
    edges,
    diagnostics: sortDiagnostics(dedupeDiagnostics(diagnostics)),
    stats
  };
}

function computeStats(files: SnapshotFile[]): SnapshotStats {
  const stats: SnapshotStats = {
    files: files.length,
    declarations: 0,
    classes: 0,
    interfaces: 0,
    enums: 0,
    types: 0,
    functions: 0,
    edges: 0
  };

  for (const file of files) {
    for (const declaration of file.declarations) {
      stats.declarations += 1;
      switch (declaration.kind) {
        case "class":
          stats.classes += 1;
          break;
        case "interface":
          stats.interfaces += 1;
          break;
        case "enum":
          stats.enums += 1;
          break;
        case "type":
          stats.types += 1;
          break;
        case "function":
          stats.functions += 1;
          break;
      }
    }
  }

  return stats;
}

function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const result: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.path ?? ""}:${diagnostic.line ?? ""}:${diagnostic.code}:${diagnostic.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (left, right) =>
      (left.path ?? "").localeCompare(right.path ?? "") ||
      (left.line ?? 0) - (right.line ?? 0) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message)
  );
}

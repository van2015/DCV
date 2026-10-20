export { isAnalyzableSourcePath } from "./discovery.js";
export { hashNode, normalizeNodeText, sourceRange } from "./ast.js";
export { declarationKindOf, parseFile, type ParseFileInput } from "./parser.js";
export {
  TsConfigManager,
  type TsConfigPaths,
  type TsConfigResult,
  type ReadTextFile
} from "./tsconfig.js";
export { ImportResolver, type ResolveImportDetails } from "./resolver.js";
export { findDeclaration, DEFAULT_REEXPORT_DEPTH } from "./symbols.js";
export { buildSnapshotEdges, collectTypeReferences } from "./edges.js";
export {
  assembleSnapshot,
  type AssembleSnapshotInput,
  type SnapshotFileInput
} from "./snapshot.js";
export { diffSnapshots, type DiffOptions } from "./diff.js";

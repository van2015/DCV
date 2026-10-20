import { z } from "zod";

export const ANALYZER_VERSION = "1.0.0";

export type ProjectSourceType = "local" | "url";

export type DiagramView = "classes" | "modules" | "packages";

export type DeclarationKind = "class" | "interface" | "enum" | "type" | "function";

export type MemberKind =
  | "method"
  | "property"
  | "getter"
  | "setter"
  | "constructor"
  | "enum-member";

export type Visibility = "public" | "protected" | "private";

export type EdgeKind = "extends" | "implements" | "association" | "imports";

export type ChangeStatus = "added" | "removed" | "modified" | "body-only" | "moved" | "renamed";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

export interface ImportBinding {
  imported: string;
  local: string;
}

export interface ImportRecord {
  specifier: string;
  typeOnly: boolean;
  reExport: boolean;
  starReExport: boolean;
  bindings: ImportBinding[];
}

export interface ResolvedImportRecord extends ImportRecord {
  resolvedPath: string | null;
}

export interface HeritageModel {
  kind: "extends" | "implements";
  name: string;
}

export interface MemberModel {
  kind: MemberKind;
  name: string;
  visibility: Visibility;
  static: boolean;
  readonly: boolean;
  optional: boolean;
  abstract: boolean;
  async: boolean;
  signature: string | null;
  type: string | null;
  bodyHash: string | null;
  sourceRange: SourceRange;
}

export interface DeclarationModel {
  kind: DeclarationKind;
  name: string;
  exported: boolean;
  defaultExport: boolean;
  abstract: boolean;
  declare: boolean;
  async: boolean;
  signature: string | null;
  type: string | null;
  members: MemberModel[];
  heritage: HeritageModel[];
  bodyHash: string | null;
  sourceRange: SourceRange;
}

export interface FileModel {
  contentHash: string;
  scriptKind: "ts" | "tsx";
  imports: ImportRecord[];
  declarations: DeclarationModel[];
  diagnostics: Diagnostic[];
}

export interface SnapshotDeclaration extends DeclarationModel {
  id: string;
  path: string;
}

export interface SnapshotFile {
  path: string;
  contentHash: string;
  scriptKind: "ts" | "tsx";
  imports: ResolvedImportRecord[];
  declarations: SnapshotDeclaration[];
  diagnostics: Diagnostic[];
}

export interface SnapshotEdge {
  id: string;
  kind: EdgeKind;
  from: string;
  to: string;
  fromPath: string;
  toPath: string;
  typeOnly: boolean;
}

export interface SnapshotStats {
  files: number;
  declarations: number;
  classes: number;
  interfaces: number;
  enums: number;
  types: number;
  functions: number;
  edges: number;
}

export interface Snapshot {
  commit: string;
  branch: string;
  analyzerVersion: string;
  files: SnapshotFile[];
  edges: SnapshotEdge[];
  diagnostics: Diagnostic[];
  stats: SnapshotStats;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  parents: string[];
  subject: string;
  message: string;
  authorName: string;
  authorEmail: string;
  date: string;
  changedFiles: number;
}

export interface Project {
  id: string;
  name: string;
  sourceType: ProjectSourceType;
  location: string;
  repoPath: string;
  branch: string;
  defaultBranch: string;
  createdAt: string;
  lastOpenedAt: string | null;
  managed: boolean;
  lastCommit: string | null;
}

export interface ProjectWarning {
  code: string;
  message: string;
}

export interface ImportProjectResult {
  project: Project;
  warnings: ProjectWarning[];
}

export interface ProjectImportRequest {
  source: ProjectSourceType;
  location: string;
  branch?: string;
}

export interface ProjectUpdateRequest {
  branch?: string;
  lastCommit?: string;
}

export interface CommitListResponse {
  branch: string;
  commits: CommitInfo[];
}

export interface FileChange {
  status: ChangeStatus;
  path: string;
  previousPath: string | null;
  probable: boolean;
}

export interface DeclarationChange {
  status: ChangeStatus;
  id: string;
  previousId: string | null;
  kind: DeclarationKind;
  name: string;
  path: string;
  previousPath: string | null;
  probable: boolean;
  declaration: DeclarationModel | null;
  previousDeclaration: DeclarationModel | null;
}

export interface MemberChange {
  status: ChangeStatus;
  parentId: string;
  parentName: string;
  parentKind: DeclarationKind;
  parentPath: string;
  memberKey: string;
  member: MemberModel;
  previousMember: MemberModel | null;
  probable: boolean;
}

export interface EdgeChange {
  status: "added" | "removed";
  kind: EdgeKind;
  from: string;
  to: string;
  fromPath: string;
  toPath: string;
  typeOnly: boolean;
}

export interface SnapshotDiff {
  from: string | null;
  to: string;
  isEmpty: boolean;
  files: FileChange[];
  declarations: DeclarationChange[];
  members: MemberChange[];
  edges: EdgeChange[];
}

export interface ModelResponse {
  commit: CommitInfo;
  snapshot: Snapshot;
  diff: SnapshotDiff;
  diagnostics: Diagnostic[];
  warnings: ProjectWarning[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ImportProgressEvent {
  type:
    | "import:start"
    | "import:progress"
    | "import:done"
    | "import:error"
    | "analysis:start"
    | "analysis:progress"
    | "analysis:done"
    | "analysis:error";
  projectId: string | null;
  message: string;
  progress: number | null;
  project?: Project;
  error?: { code: string; message: string };
}

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceType: z.enum(["local", "url"]),
  location: z.string().min(1),
  repoPath: z.string().min(1),
  branch: z.string().min(1),
  defaultBranch: z.string().min(1),
  createdAt: z.string().min(1),
  lastOpenedAt: z.string().min(1).nullable(),
  managed: z.boolean(),
  lastCommit: z.string().min(1).nullable()
});

export const ProjectImportRequestSchema = z.object({
  source: z.enum(["local", "url"]),
  location: z.string().min(1, "location is required"),
  branch: z.string().min(1).optional()
});

export const ProjectUpdateRequestSchema = z
  .object({
    branch: z.string().min(1).optional(),
    lastCommit: z.string().min(1).nullable().optional()
  })
  .refine((value) => value.branch !== undefined || value.lastCommit !== undefined, {
    message: "at least one field is required"
  });

export const ModelQuerySchema = z.object({
  branch: z.string().min(1).optional()
});

export function declarationNodeId(
  path: string,
  kind: DeclarationKind,
  name: string
): string {
  return `${path}#${kind}:${name}`;
}

export function moduleNodeId(path: string): string {
  return `module:${path}`;
}

export function packageNodeId(directory: string): string {
  return `package:${directory}`;
}

export function memberKey(member: Pick<MemberModel, "kind" | "name">): string {
  return `${member.kind}:${member.name}`;
}

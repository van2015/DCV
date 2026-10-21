import {
  memberKey,
  moduleNodeId,
  packageNodeId,
  type FileChange,
  type Snapshot,
  type SnapshotDiff
} from "@dcv/shared";

export type HeatmapChangeStatus = "added" | "removed" | "modified" | "moved" | "renamed";

export interface HeatmapFileDelta {
  status: "added" | "removed" | "renamed";
  path: string;
  previousPath: string | null;
}

export interface HeatmapMemberDelta {
  memberKey: string;
  previousMemberKey: string | null;
  status: HeatmapChangeStatus;
}

export interface HeatmapDeclarationDelta {
  id: string;
  previousId: string | null;
  status: HeatmapChangeStatus;
  path: string;
  previousPath: string | null;
  members: HeatmapMemberDelta[];
}

export interface HeatmapDelta {
  commit: string;
  files: HeatmapFileDelta[];
  declarations: HeatmapDeclarationDelta[];
}

export interface HeatmapCounts {
  declarations: Map<string, Set<string>>;
  members: Map<string, Map<string, Set<string>>>;
  modules: Map<string, Set<string>>;
  packages: Map<string, Set<string>>;
}

export interface HeatmapEntityCounts {
  nodes: Record<string, number>;
  members: Record<string, Record<string, number>>;
}

export function createHeatmapCounts(): HeatmapCounts {
  return {
    declarations: new Map(),
    members: new Map(),
    modules: new Map(),
    packages: new Map()
  };
}

export function heatmapDelta(commit: string, diff: SnapshotDiff): HeatmapDelta {
  const files = diff.files
    .filter(isHeatmapFileChange)
    .map((change) => ({
      status: change.status,
      path: change.path,
      previousPath: change.previousPath
    }));

  const membersByParent = new Map<string, HeatmapMemberDelta[]>();
  for (const change of diff.members) {
    if (change.status === "body-only") {
      continue;
    }
    const list = membersByParent.get(change.parentId) ?? [];
    list.push({
      memberKey: change.memberKey,
      previousMemberKey:
        change.status === "added" || !change.previousMember
          ? null
          : memberKey(change.previousMember),
      status: change.status
    });
    membersByParent.set(change.parentId, list);
  }

  const declarations: HeatmapDeclarationDelta[] = [];
  for (const change of diff.declarations) {
    if (change.status === "body-only") {
      continue;
    }
    const members =
      change.status === "added"
        ? (change.declaration?.members ?? []).map((member) => ({
            memberKey: memberKey(member),
            previousMemberKey: null,
            status: "added" as const
          }))
        : change.status === "removed"
          ? []
          : (membersByParent.get(change.id) ?? []);

    declarations.push({
      id: change.id,
      previousId:
        change.status === "added" ? null : (change.previousId ?? change.id),
      status: change.status,
      path: change.path,
      previousPath: change.previousPath,
      members
    });
  }

  return { commit, files, declarations };
}

export function aggregateHeatmap(deltas: Iterable<HeatmapDelta>): HeatmapCounts {
  const counts = createHeatmapCounts();
  for (const delta of deltas) {
    applyHeatmapDelta(counts, delta);
  }
  return counts;
}

export function applyHeatmapDelta(counts: HeatmapCounts, delta: HeatmapDelta): void {
  const renames = new Map<string, string>();
  for (const file of delta.files) {
    if (file.status === "renamed" && file.previousPath) {
      renames.set(file.previousPath, file.path);
    }
  }

  for (const file of delta.files) {
    if (file.status === "renamed" && file.previousPath) {
      transferModule(counts, file.previousPath, file.path);
      transferDeclarationsAtPath(counts, file.previousPath, file.path, delta.commit);
      addCommit(counts.modules, file.path, delta.commit);
      addCommit(counts.packages, directoryOf(file.path), delta.commit);
      const previousDirectory = directoryOf(file.previousPath);
      const currentDirectory = directoryOf(file.path);
      if (previousDirectory !== currentDirectory) {
        addCommit(counts.packages, previousDirectory, delta.commit);
      }
      continue;
    }
    if (file.status === "removed") {
      counts.modules.delete(file.path);
      addCommit(counts.packages, directoryOf(file.path), delta.commit);
      continue;
    }
    addCommit(counts.modules, file.path, delta.commit);
    addCommit(counts.packages, directoryOf(file.path), delta.commit);
  }

  for (const declaration of delta.declarations) {
    const previousId = declaration.previousId
      ? resolveRenamedId(declaration.previousId, renames)
      : null;

    if (declaration.status === "removed") {
      const id = resolveRenamedId(declaration.id, renames);
      counts.declarations.delete(id);
      counts.members.delete(id);
      addCommit(counts.modules, declaration.path, delta.commit);
      addCommit(counts.packages, directoryOf(declaration.path), delta.commit);
      continue;
    }

    if (previousId && previousId !== declaration.id) {
      transferDeclaration(counts, previousId, declaration.id);
    }

    addCommit(counts.declarations, declaration.id, delta.commit);
    addCommit(counts.modules, declaration.path, delta.commit);
    addCommit(counts.packages, directoryOf(declaration.path), delta.commit);
    if (declaration.previousPath && declaration.previousPath !== declaration.path) {
      addCommit(counts.modules, declaration.previousPath, delta.commit);
      addCommit(
        counts.packages,
        directoryOf(declaration.previousPath),
        delta.commit
      );
    }

    for (const member of declaration.members) {
      if (member.status === "removed") {
        memberSets(counts, declaration.id, false)?.delete(member.memberKey);
      } else if (
        member.previousMemberKey &&
        member.previousMemberKey !== member.memberKey
      ) {
        transferMember(
          counts,
          declaration.id,
          member.previousMemberKey,
          member.memberKey
        );
      }
      if (member.status !== "removed") {
        addCommit(
          memberSets(counts, declaration.id, true)!,
          member.memberKey,
          delta.commit
        );
      }
    }
  }
}

export function heatmapEntityCounts(
  counts: HeatmapCounts,
  snapshot: Snapshot
): HeatmapEntityCounts {
  const nodes: Record<string, number> = {};
  const members: Record<string, Record<string, number>> = {};
  const directories = new Set<string>();

  for (const file of snapshot.files) {
    const directory = directoryOf(file.path);
    directories.add(directory);
    nodes[moduleNodeId(file.path)] = counts.modules.get(file.path)?.size ?? 0;

    for (const declaration of file.declarations) {
      nodes[declaration.id] = counts.declarations.get(declaration.id)?.size ?? 0;
      const declarationMembers = counts.members.get(declaration.id);
      const memberCounts: Record<string, number> = {};
      for (const member of declaration.members) {
        const key = memberKey(member);
        memberCounts[key] = declarationMembers?.get(key)?.size ?? 0;
      }
      if (declaration.members.length > 0) {
        members[declaration.id] = memberCounts;
      }
    }
  }

  for (const directory of directories) {
    nodes[packageNodeId(directory)] = counts.packages.get(directory)?.size ?? 0;
  }

  return { nodes, members };
}

function isHeatmapFileChange(
  change: FileChange
): change is FileChange & { status: HeatmapFileDelta["status"] } {
  return (
    change.status === "added" ||
    change.status === "removed" ||
    change.status === "renamed"
  );
}

function transferModule(counts: HeatmapCounts, from: string, to: string): void {
  const source = counts.modules.get(from);
  if (!source) {
    return;
  }
  mergeSet(counts.modules, to, source);
  counts.modules.delete(from);
}

function transferDeclarationsAtPath(
  counts: HeatmapCounts,
  previousPath: string,
  path: string,
  commit: string
): void {
  const prefix = `${previousPath}#`;
  for (const [id, values] of [...counts.declarations]) {
    if (!id.startsWith(prefix)) {
      continue;
    }
    const target = `${path}#${id.slice(prefix.length)}`;
    mergeSet(counts.declarations, target, values);
    counts.declarations.delete(id);
    addCommit(counts.declarations, target, commit);

    const sourceMembers = counts.members.get(id);
    if (sourceMembers) {
      const targetMembers = memberSets(counts, target, true)!;
      for (const [key, memberValues] of sourceMembers) {
        mergeSet(targetMembers, key, memberValues);
      }
      counts.members.delete(id);
    }
  }
}

function transferDeclaration(
  counts: HeatmapCounts,
  from: string,
  to: string
): void {
  const values = counts.declarations.get(from);
  if (values) {
    mergeSet(counts.declarations, to, values);
    counts.declarations.delete(from);
  }
  const members = counts.members.get(from);
  if (members) {
    const target = memberSets(counts, to, true)!;
    for (const [key, memberValues] of members) {
      mergeSet(target, key, memberValues);
    }
    counts.members.delete(from);
  }
}

function transferMember(
  counts: HeatmapCounts,
  declarationId: string,
  from: string,
  to: string
): void {
  const members = counts.members.get(declarationId);
  const values = members?.get(from);
  if (!values) {
    return;
  }
  mergeSet(memberSets(counts, declarationId, true)!, to, values);
  members!.delete(from);
}

function memberSets(
  counts: HeatmapCounts,
  declarationId: string,
  create: boolean
): Map<string, Set<string>> | undefined {
  let members = counts.members.get(declarationId);
  if (!members && create) {
    members = new Map();
    counts.members.set(declarationId, members);
  }
  return members;
}

function resolveRenamedId(id: string, renames: Map<string, string>): string {
  const separator = id.indexOf("#");
  if (separator === -1) {
    return id;
  }
  const path = id.slice(0, separator);
  const renamed = renames.get(path);
  return renamed ? `${renamed}${id.slice(separator)}` : id;
}

function addCommit(
  target: Map<string, Set<string>>,
  key: string,
  commit: string
): void {
  let values = target.get(key);
  if (!values) {
    values = new Set();
    target.set(key, values);
  }
  values.add(commit);
}

function mergeSet(
  target: Map<string, Set<string>>,
  key: string,
  values: Iterable<string>
): void {
  let current = target.get(key);
  if (!current) {
    current = new Set();
    target.set(key, current);
  }
  for (const value of values) {
    current.add(value);
  }
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

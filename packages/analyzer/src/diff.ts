import {
  declarationNodeId,
  memberKey,
  type ChangeStatus,
  type DeclarationChange,
  type DeclarationModel,
  type EdgeChange,
  type FileChange,
  type HeritageModel,
  type MemberChange,
  type MemberModel,
  type Snapshot,
  type SnapshotDeclaration,
  type SnapshotDiff,
  type SnapshotEdge,
  type SnapshotFile
} from "@dcv/shared";

export interface DiffOptions {
  fileRenames?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
}

interface DeclarationRef {
  file: SnapshotFile;
  declaration: SnapshotDeclaration;
}

export function diffSnapshots(
  previous: Snapshot | null,
  current: Snapshot,
  options: DiffOptions = {}
): SnapshotDiff {
  if (!previous || previous.commit === current.commit) {
    return emptyDiff(previous?.commit ?? null, current.commit);
  }

  const renames = normalizeRenames(options.fileRenames);
  const reverseRenames = new Map<string, string>();
  for (const [oldPath, newPath] of renames) {
    reverseRenames.set(newPath, oldPath);
  }

  const declarations: DeclarationChange[] = [];
  const members: MemberChange[] = [];
  const touchedPaths = new Set<string>();

  diffDeclarations(previous, current, reverseRenames, declarations, members, touchedPaths);

  const edges = diffEdges(previous, current, renames);
  for (const change of edges) {
    touchedPaths.add(change.fromPath);
    touchedPaths.add(change.toPath);
  }

  const files = diffFiles(previous, current, renames, reverseRenames, touchedPaths);

  return {
    from: previous.commit,
    to: current.commit,
    isEmpty:
      files.length === 0 &&
      declarations.length === 0 &&
      members.length === 0 &&
      edges.length === 0,
    files,
    declarations,
    members,
    edges
  };
}

function emptyDiff(from: string | null, to: string): SnapshotDiff {
  return { from, to, isEmpty: true, files: [], declarations: [], members: [], edges: [] };
}

function normalizeRenames(
  renames: DiffOptions["fileRenames"]
): Map<string, string> {
  if (!renames) {
    return new Map();
  }
  return renames instanceof Map ? new Map(renames) : new Map(Object.entries(renames));
}

function diffFiles(
  previous: Snapshot,
  current: Snapshot,
  renames: Map<string, string>,
  reverseRenames: Map<string, string>,
  touchedPaths: Set<string>
): FileChange[] {
  const prevFiles = new Map(previous.files.map((file) => [file.path, file]));
  const currFiles = new Map(current.files.map((file) => [file.path, file]));
  const changes: FileChange[] = [];

  for (const [oldPath, newPath] of renames) {
    if (prevFiles.has(oldPath) && currFiles.has(newPath)) {
      changes.push({ status: "renamed", path: newPath, previousPath: oldPath, probable: false });
    }
  }

  for (const file of current.files) {
    if (!prevFiles.has(file.path) && !reverseRenames.has(file.path)) {
      changes.push({ status: "added", path: file.path, previousPath: null, probable: false });
    }
  }

  for (const file of previous.files) {
    if (!currFiles.has(file.path) && !renames.has(file.path)) {
      changes.push({ status: "removed", path: file.path, previousPath: null, probable: false });
    }
  }

  for (const file of current.files) {
    const previousPath = reverseRenames.get(file.path) ?? file.path;
    const before = prevFiles.get(previousPath);
    if (before && before.contentHash !== file.contentHash && touchedPaths.has(file.path)) {
      changes.push({
        status: "modified",
        path: file.path,
        previousPath: reverseRenames.has(file.path) ? previousPath : null,
        probable: false
      });
    }
  }

  return changes.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      (left.previousPath ?? "").localeCompare(right.previousPath ?? "")
  );
}

function diffDeclarations(
  previous: Snapshot,
  current: Snapshot,
  reverseRenames: Map<string, string>,
  declarations: DeclarationChange[],
  members: MemberChange[],
  touchedPaths: Set<string>
): void {
  const previousDeclarations: DeclarationRef[] = previous.files.flatMap((file) =>
    file.declarations.map((declaration) => ({ file, declaration }))
  );
  const currentDeclarations: DeclarationRef[] = current.files.flatMap((file) =>
    file.declarations.map((declaration) => ({ file, declaration }))
  );

  const exactIndex = new Map<string, DeclarationRef>();
  for (const ref of previousDeclarations) {
    exactIndex.set(identityOf(ref.declaration.path, ref.declaration), ref);
  }

  const matchedPrevious = new Set<DeclarationModel>();
  const matchedCurrent = new Set<DeclarationModel>();
  const pairs: { current: DeclarationRef; previous: DeclarationRef; heuristic: boolean }[] = [];
  const unmatchedCurrent: DeclarationRef[] = [];
  const unmatchedPrevious = [...previousDeclarations];

  for (const ref of currentDeclarations) {
    const previousPath = reverseRenames.get(ref.declaration.path) ?? ref.declaration.path;
    const key = identityOf(previousPath, ref.declaration);
    const candidate = exactIndex.get(key);
    if (candidate && !matchedPrevious.has(candidate.declaration)) {
      matchedPrevious.add(candidate.declaration);
      matchedCurrent.add(ref.declaration);
      pairs.push({ current: ref, previous: candidate, heuristic: false });
    } else {
      unmatchedCurrent.push(ref);
    }
  }

  const heuristicIndex = buildHeuristicIndex(unmatchedPrevious, matchedPrevious);
  for (const ref of [...unmatchedCurrent].sort(compareRefs)) {
    const candidates = heuristicIndex
      .get(heuristicKey(ref.declaration))
      ?.filter((candidate) => !matchedPrevious.has(candidate.declaration));
    if (!candidates || candidates.length !== 1) {
      continue;
    }
    const candidate = candidates[0]!;
    matchedPrevious.add(candidate.declaration);
    matchedCurrent.add(ref.declaration);
    pairs.push({ current: ref, previous: candidate, heuristic: true });
  }

  for (const pair of pairs.sort((left, right) => compareRefs(left.current, right.current))) {
    emitPairChange(pair, reverseRenames, declarations, members, touchedPaths);
  }

  const removed = unmatchedPrevious
    .filter((ref) => !matchedPrevious.has(ref.declaration))
    .sort(compareRefs);
  for (const ref of removed) {
    declarations.push(buildDeclarationChange("removed", ref, null, false));
    touchedPaths.add(ref.declaration.path);
  }

  const added = unmatchedCurrent
    .filter((ref) => !matchedCurrent.has(ref.declaration))
    .sort(compareRefs);
  for (const ref of added) {
    declarations.push(buildDeclarationChange("added", null, ref, false));
    touchedPaths.add(ref.declaration.path);
  }
}

function emitPairChange(
  pair: { current: DeclarationRef; previous: DeclarationRef; heuristic: boolean },
  reverseRenames: Map<string, string>,
  declarations: DeclarationChange[],
  members: MemberChange[],
  touchedPaths: Set<string>
): void {
  const { previous, current, heuristic } = pair;
  const pathChanged = previous.declaration.path !== current.declaration.path;
  const gitRename = pathChanged && reverseRenames.get(current.declaration.path) === previous.declaration.path;

  if (pathChanged && (heuristic || !gitRename)) {
    const sameIdentity =
      previous.declaration.name === current.declaration.name &&
      previous.declaration.kind === current.declaration.kind;
    declarations.push(
      buildDeclarationChange(sameIdentity ? "moved" : "renamed", previous, current, true)
    );
    touchedPaths.add(previous.declaration.path);
    touchedPaths.add(current.declaration.path);
    return;
  }

  if (gitRename && pathChanged) {
    const memberChanges = diffMembers(previous, current);
    const memberSignatureChange = memberChanges.some(
      (change) => change.status === "modified" || change.status === "added" || change.status === "removed"
    );
    const memberBodyChange = memberChanges.some((change) => change.status === "body-only");
    const signatureChanged = !signatureEqual(previous.declaration, current.declaration);
    const declarationBodyChanged = bodyChanged(previous.declaration, current.declaration);

    let status: ChangeStatus | null = null;
    if (signatureChanged || memberSignatureChange) {
      status = "modified";
    } else if (declarationBodyChanged || memberBodyChange) {
      status = "body-only";
    }

    if (status) {
      declarations.push(buildDeclarationChange(status, previous, current, false));
    }
    if (status || memberChanges.length > 0) {
      touchedPaths.add(previous.declaration.path);
      touchedPaths.add(current.declaration.path);
    }
    members.push(...memberChanges);
    return;
  }

  if (previous.declaration.name !== current.declaration.name ||
    previous.declaration.kind !== current.declaration.kind) {
    declarations.push(buildDeclarationChange("renamed", previous, current, true));
    touchedPaths.add(previous.declaration.path);
    touchedPaths.add(current.declaration.path);
    return;
  }

  const memberChanges = diffMembers(previous, current);
  const memberSignatureChange = memberChanges.some(
    (change) => change.status === "modified" || change.status === "added" || change.status === "removed"
  );
  const memberBodyChange = memberChanges.some((change) => change.status === "body-only");

  const signatureChanged = !signatureEqual(previous.declaration, current.declaration);
  const declarationBodyChanged = bodyChanged(previous.declaration, current.declaration);

  let status: ChangeStatus | null = null;
  if (signatureChanged || memberSignatureChange) {
    status = "modified";
  } else if (declarationBodyChanged || memberBodyChange) {
    status = "body-only";
  }

  if (status) {
    declarations.push(buildDeclarationChange(status, previous, current, false));
  }
  if (status || memberChanges.length > 0) {
    touchedPaths.add(current.declaration.path);
    touchedPaths.add(previous.declaration.path);
  }
  members.push(...memberChanges);
}

function diffMembers(previous: DeclarationRef, current: DeclarationRef): MemberChange[] {
  const changes: MemberChange[] = [];
  const previousMembers = new Map<string, MemberModel>();
  for (const member of previous.declaration.members) {
    previousMembers.set(memberKey(member), member);
  }
  const matched = new Set<MemberModel>();
  const previousByIdentity = [...previous.declaration.members];

  const heuristics = new Map<string, MemberModel[]>();
  for (const member of previous.declaration.members) {
    const key = `${member.kind}:${member.bodyHash ?? ""}`;
    const list = heuristics.get(key) ?? [];
    list.push(member);
    heuristics.set(key, list);
  }

  const makeChange = (
    status: ChangeStatus,
    member: MemberModel,
    previousMember: MemberModel | null,
    probable: boolean
  ): MemberChange => ({
    status,
    parentId: declarationNodeId(
      current.declaration.path,
      current.declaration.kind,
      current.declaration.name
    ),
    parentName: current.declaration.name,
    parentKind: current.declaration.kind,
    parentPath: current.declaration.path,
    memberKey: memberKey(member),
    member,
    previousMember,
    probable
  });

  const pending: { member: MemberModel; previousMember: MemberModel | null; status: ChangeStatus; probable: boolean }[] = [];

  for (const member of current.declaration.members) {
    const before = previousMembers.get(memberKey(member));
    if (before && !matched.has(before)) {
      matched.add(before);
      if (memberSignatureChanged(member, before)) {
        pending.push({ member, previousMember: before, status: "modified", probable: false });
      } else if (member.bodyHash !== before.bodyHash) {
        pending.push({ member, previousMember: before, status: "body-only", probable: false });
      }
      continue;
    }

    const candidates = (heuristics.get(`${member.kind}:${member.bodyHash ?? ""}`) ?? []).filter(
      (candidate) => !matched.has(candidate)
    );
    if (member.bodyHash !== null && candidates.length === 1) {
      const candidate = candidates[0]!;
      matched.add(candidate);
      pending.push({
        member,
        previousMember: candidate,
        status: member.name === candidate.name ? "moved" : "renamed",
        probable: true
      });
    } else {
      pending.push({ member, previousMember: null, status: "added", probable: false });
    }
  }

  for (const member of previousByIdentity) {
    if (!matched.has(member)) {
      pending.push({ member, previousMember: member, status: "removed", probable: false });
    }
  }

  for (const item of pending) {
    changes.push(makeChange(item.status, item.member, item.previousMember, item.probable));
  }

  return changes.sort(
    (left, right) =>
      left.memberKey.localeCompare(right.memberKey) || left.status.localeCompare(right.status)
  );
}

function diffEdges(
  previous: Snapshot,
  current: Snapshot,
  renames: Map<string, string>
): EdgeChange[] {
  const currentByKey = new Map<string, SnapshotEdge>();
  for (const edge of current.edges) {
    currentByKey.set(edgeKey(edge.kind, edge.from, edge.to), edge);
  }

  const previousByKey = new Map<string, SnapshotEdge>();
  const normalizedPrevious = new Map<string, SnapshotEdge>();
  for (const edge of previous.edges) {
    const normalized = normalizeEdge(edge, renames);
    const key = edgeKey(edge.kind, normalized.from, normalized.to);
    previousByKey.set(key, edge);
    normalizedPrevious.set(key, normalized);
  }

  const changes: EdgeChange[] = [];

  for (const [key, edge] of currentByKey) {
    if (!previousByKey.has(key)) {
      changes.push({
        status: "added",
        kind: edge.kind,
        from: edge.from,
        to: edge.to,
        fromPath: edge.fromPath,
        toPath: edge.toPath,
        typeOnly: edge.typeOnly
      });
    }
  }

  for (const [key, edge] of normalizedPrevious) {
    if (!currentByKey.has(key)) {
      changes.push({
        status: "removed",
        kind: edge.kind,
        from: edge.from,
        to: edge.to,
        fromPath: edge.fromPath,
        toPath: edge.toPath,
        typeOnly: edge.typeOnly
      });
    }
  }

  return changes.sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to) ||
      left.status.localeCompare(right.status)
  );
}

function normalizeEdge(edge: SnapshotEdge, renames: Map<string, string>): SnapshotEdge {
  if (renames.size === 0) {
    return edge;
  }
  return {
    ...edge,
    from: mapNodeId(edge.from, renames),
    to: mapNodeId(edge.to, renames),
    fromPath: renames.get(edge.fromPath) ?? edge.fromPath,
    toPath: renames.get(edge.toPath) ?? edge.toPath
  };
}

function mapNodeId(id: string, renames: Map<string, string>): string {
  if (id.startsWith("module:")) {
    const path = id.slice("module:".length);
    const renamed = renames.get(path);
    return renamed ? `module:${renamed}` : id;
  }
  const separator = id.indexOf("#");
  if (separator === -1) {
    return id;
  }
  const path = id.slice(0, separator);
  const renamed = renames.get(path);
  return renamed ? `${renamed}${id.slice(separator)}` : id;
}

function edgeKey(kind: string, from: string, to: string): string {
  return `${kind}|${from}|${to}`;
}

function identityOf(path: string, declaration: DeclarationModel): string {
  return `${path}#${declaration.kind}:${declaration.name}`;
}

function buildHeuristicIndex(
  refs: DeclarationRef[],
  matched: Set<DeclarationModel>
): Map<string, DeclarationRef[]> {
  const index = new Map<string, DeclarationRef[]>();
  for (const ref of refs) {
    if (matched.has(ref.declaration)) {
      continue;
    }
    const key = heuristicKey(ref.declaration);
    const list = index.get(key) ?? [];
    list.push(ref);
    index.set(key, list);
  }
  return index;
}

function heuristicKey(declaration: DeclarationModel): string {
  const body = declaration.bodyHash ?? structuralKey(declaration);
  return `${declaration.kind}:${body}`;
}

function structuralKey(declaration: DeclarationModel): string {
  const heritage = [...declaration.heritage]
    .map((item) => `${item.kind}:${item.name}`)
    .sort();
  const members = declaration.members
    .map(
      (member) =>
        `${member.kind}:${member.name}:${member.signature ?? ""}:${member.type ?? ""}:${
          member.optional ? 1 : 0
        }:${member.static ? 1 : 0}:${member.readonly ? 1 : 0}:${member.visibility}`
    )
    .sort();
  return JSON.stringify({ type: declaration.type, heritage, members });
}

function signatureEqual(left: DeclarationModel, right: DeclarationModel): boolean {
  return (
    left.signature === right.signature &&
    left.type === right.type &&
    left.exported === right.exported &&
    left.defaultExport === right.defaultExport &&
    left.abstract === right.abstract &&
    left.declare === right.declare &&
    left.async === right.async &&
    heritageEqual(left.heritage, right.heritage)
  );
}

function heritageEqual(left: HeritageModel[], right: HeritageModel[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const normalize = (items: HeritageModel[]) =>
    items.map((item) => `${item.kind}:${item.name}`).sort();
  const leftNormalized = normalize(left);
  const rightNormalized = normalize(right);
  return leftNormalized.every((value, index) => value === rightNormalized[index]);
}

function bodyChanged(left: DeclarationModel, right: DeclarationModel): boolean {
  return left.bodyHash !== right.bodyHash;
}

function memberSignatureChanged(left: MemberModel, right: MemberModel): boolean {
  return (
    left.signature !== right.signature ||
    left.type !== right.type ||
    left.visibility !== right.visibility ||
    left.static !== right.static ||
    left.readonly !== right.readonly ||
    left.optional !== right.optional ||
    left.abstract !== right.abstract ||
    left.async !== right.async
  );
}

function buildDeclarationChange(
  status: ChangeStatus,
  previous: DeclarationRef | null,
  current: DeclarationRef | null,
  probable: boolean
): DeclarationChange {
  const source = current ?? previous!;
  const declaration = source.declaration;
  return {
    status,
    id: declarationNodeId(declaration.path, declaration.kind, declaration.name),
    previousId: previous
      ? declarationNodeId(previous.declaration.path, previous.declaration.kind, previous.declaration.name)
      : null,
    kind: declaration.kind,
    name: declaration.name,
    path: declaration.path,
    previousPath: previous?.declaration.path ?? null,
    probable,
    declaration: current?.declaration ?? null,
    previousDeclaration: previous?.declaration ?? null
  };
}

function compareRefs(left: DeclarationRef, right: DeclarationRef): number {
  return (
    left.declaration.path.localeCompare(right.declaration.path) ||
    left.declaration.kind.localeCompare(right.declaration.kind) ||
    left.declaration.name.localeCompare(right.declaration.name)
  );
}

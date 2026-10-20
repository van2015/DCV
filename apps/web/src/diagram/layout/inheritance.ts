import type { LayoutPositions } from "./types.js";

export interface CommitPositionsSource {
  hasCommitPositions(view: string, sha: string): boolean;
  loadCommitPositions(view: string, sha: string): LayoutPositions | null;
  hasCommitEntries(view: string): boolean;
  loadPositions(view: string): LayoutPositions;
}

export function nearestCommitWithPositions(
  commits: readonly string[],
  selectedSha: string,
  hasPositions: (sha: string) => boolean
): string | null {
  const index = commits.indexOf(selectedSha);
  if (index === -1) {
    return null;
  }
  for (let distance = 1; distance < commits.length; distance += 1) {
    const previous = commits[index - distance];
    if (previous !== undefined && hasPositions(previous)) {
      return previous;
    }
    const next = commits[index + distance];
    if (next !== undefined && hasPositions(next)) {
      return next;
    }
  }
  return null;
}

export function resolveCommitPositions(
  source: CommitPositionsSource,
  view: string,
  selectedSha: string | null,
  commits: readonly string[]
): LayoutPositions {
  if (selectedSha && source.hasCommitPositions(view, selectedSha)) {
    return source.loadCommitPositions(view, selectedSha) ?? {};
  }
  if (selectedSha) {
    const donor = nearestCommitWithPositions(commits, selectedSha, (sha) =>
      source.hasCommitPositions(view, sha)
    );
    if (donor) {
      return source.loadCommitPositions(view, donor) ?? {};
    }
  }
  if (!source.hasCommitEntries(view)) {
    return source.loadPositions(view);
  }
  return {};
}

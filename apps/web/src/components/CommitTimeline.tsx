import type { CommitInfo } from "@dcv/shared";

export interface CommitTimelineProps {
  commits: CommitInfo[];
  selectedSha: string | null;
  onSelect: (sha: string) => void;
}

export function CommitTimeline({ commits, selectedSha, onSelect }: CommitTimelineProps) {
  return (
    <ol className="commit-timeline" aria-label="Histórico de commits">
      {commits.map((commit, index) => {
        const selected = commit.sha === selectedSha;
        return (
          <li key={commit.sha}>
            <button
              type="button"
              className={selected ? "commit-item selected" : "commit-item"}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(commit.sha)}
              title={commit.sha}
            >
              <span className="commit-index">{index + 1}</span>
              <span className="commit-summary">
                <span className="commit-subject">{commit.subject}</span>
                <span className="commit-meta">
                  {commit.shortSha} · {commit.authorName} · {commit.changedFiles} archivo
                  {commit.changedFiles === 1 ? "" : "s"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

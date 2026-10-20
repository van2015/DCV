import { useAppState, useAppStore } from "../state/StoreProvider.js";

export function CommitPlayer() {
  const store = useAppStore();
  const state = useAppState();
  const commits = state.commits;
  const index =
    state.selectedSha === null
      ? -1
      : commits.findIndex((commit) => commit.sha === state.selectedSha);
  const commit = index >= 0 ? commits[index]! : state.model?.commit ?? null;

  if (!commit) {
    return (
      <p className="placeholder" role="status">
        Seleccioná un commit del histórico.
      </p>
    );
  }

  const baseline = commit.parents.length === 0;
  const model = state.modelStatus === "ready" ? state.model : null;
  const noStructuralChange = model !== null && model.diff.isEmpty && !baseline;
  const previousSha = index > 0 ? commits[index - 1]?.sha : undefined;
  const nextSha = index >= 0 ? commits[index + 1]?.sha : undefined;

  return (
    <section className="commit-player">
      <div className="commit-metadata">
        <div className="commit-heading">
          <span className="badge">{commit.shortSha}</span>
          <h3>{commit.subject}</h3>
        </div>
        <dl className="commit-facts">
          <div>
            <dt>Autor</dt>
            <dd>{commit.authorName}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>{formatDate(commit.date)}</dd>
          </div>
          <div>
            <dt>Archivos</dt>
            <dd>{commit.changedFiles}</dd>
          </div>
        </dl>

        {baseline && <p className="notice">Línea base del histórico.</p>}
        {noStructuralChange && (
          <p className="notice">Sin cambios estructurales de TypeScript en este commit.</p>
        )}

        {state.modelStatus === "loading" && (
          <p className="placeholder-small" role="status">
            Analizando commit…
          </p>
        )}

        {state.modelStatus === "error" && (
          <div className="error-panel" role="alert">
            <p>{state.modelError}</p>
            <button
              type="button"
              onClick={() => state.selectedSha && void store.loadModel(state.selectedSha)}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      <div className="player-controls">
        <button
          type="button"
          disabled={!previousSha}
          onClick={() => previousSha && store.selectCommit(previousSha)}
        >
          ← Anterior
        </button>
        <span className="player-position" aria-live="polite">
          {index >= 0 ? `${index + 1} / ${commits.length}` : `${commits.length} commits`}
        </span>
        <button
          type="button"
          disabled={!nextSha}
          onClick={() => nextSha && store.selectCommit(nextSha)}
        >
          Siguiente →
        </button>
      </div>
    </section>
  );
}

const dateFormatter = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

import { useCallback, useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import type { DiagramView } from "@dcv/shared";
import { ChangeFiltersBar } from "../components/ChangeFiltersBar.js";
import { ChangesPanel } from "../components/ChangesPanel.js";
import { CommitPlayer } from "../components/CommitPlayer.js";
import { CommitTimeline } from "../components/CommitTimeline.js";
import { DiagramEmptyState } from "../components/DiagramEmptyState.js";
import { DiagramCanvas } from "../diagram/DiagramCanvas.js";
import { buildOverlay, filterOverlay } from "../diagram/overlay.js";
import { projectSnapshot } from "../diagram/projection.js";
import { useAppState, useAppStore } from "../state/StoreProvider.js";

const VIEW_LABELS: { value: DiagramView; label: string }[] = [
  { value: "classes", label: "Clases" },
  { value: "modules", label: "Módulos" },
  { value: "packages", label: "Paquetes" }
];

const FOCUS_DEPTHS = [1, 2, 3];

export function ProjectViewerPage() {
  const { projectId } = useParams();
  const store = useAppStore();
  const state = useAppState();

  useEffect(() => {
    if (projectId) {
      void store.openProject(projectId);
    }
  }, [store, projectId]);

  const model = state.modelStatus === "ready" ? state.model : null;
  const projection = useMemo(
    () => (model ? projectSnapshot(model.snapshot, state.view) : null),
    [model, state.view]
  );
  const rawOverlay = useMemo(
    () => (model && projection ? buildOverlay(projection, model.diff) : null),
    [model, projection]
  );
  const overlay = useMemo(
    () => (rawOverlay ? filterOverlay(rawOverlay, state.changeFilters) : null),
    [rawOverlay, state.changeFilters]
  );
  const ghosts = useMemo(() => overlay?.ghosts ?? [], [overlay]);
  const visualStore = store.getVisualStore();

  const handleOpenClass = useCallback(
    (declarationId: string) => {
      store.setView("classes");
      store.focusNode(declarationId);
    },
    [store]
  );
  const handleToggleFolder = useCallback(
    (path: string) => store.toggleFolder(path),
    [store]
  );

  if (state.projectStatus === "error") {
    return (
      <section className="error-panel" role="alert">
        <p>{state.projectError}</p>
        <div className="dialog-actions">
          <Link className="button-link" to="/" onClick={() => store.closeProject()}>
            Volver a la biblioteca
          </Link>
          <button type="button" onClick={() => projectId && void store.openProject(projectId)}>
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  if (state.projectStatus !== "ready" || !state.activeProject) {
    return (
      <p className="placeholder" role="status">
        Cargando proyecto…
      </p>
    );
  }

  const project = state.activeProject;
  const branches = state.branches.length > 0 ? state.branches : [project.branch];
  const brokenFiles = new Set(
    (model?.diagnostics ?? [])
      .filter((diagnostic) => diagnostic.severity === "error" && diagnostic.path)
      .map((diagnostic) => diagnostic.path)
  );
  const isEmpty =
    projection !== null && projection.nodes.length === 0 && ghosts.length === 0;

  return (
    <section className="viewer">
      <div className="viewer-toolbar">
        <Link className="link-back" to="/" onClick={() => store.closeProject()}>
          ← Biblioteca
        </Link>
        <h2>{project.name}</h2>
        <label className="view-selector">
          Rama
          <select
            value={project.branch}
            onChange={(event) => void store.switchBranch(event.target.value)}
            disabled={state.historyStatus === "loading"}
          >
            {branches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </label>
        <label className="view-selector">
          Vista
          <select
            value={state.view}
            onChange={(event) => store.setView(event.target.value as DiagramView)}
          >
            {VIEW_LABELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.historyStatus === "error" && (
        <div className="error-panel" role="alert">
          <p>{state.historyError}</p>
          <button type="button" onClick={() => void store.refreshHistory()}>
            Reintentar
          </button>
        </div>
      )}

      {state.historyStatus === "ready" && (
        <div className="viewer-body">
          {state.historyNotice && <p className="notice">{state.historyNotice}</p>}
          <div className="workspace">
            <aside className="history-panel">
              <div className="history-header">
                <h3>Histórico</h3>
                <button type="button" onClick={() => void store.refreshHistory()}>
                  Actualizar
                </button>
              </div>
              <CommitTimeline
                commits={state.commits}
                selectedSha={state.selectedSha}
                onSelect={(sha) => store.selectCommit(sha)}
              />
            </aside>
            <div className="diagram-panel">
              <CommitPlayer />
              {brokenFiles.size > 0 && (
                <p className="warning-panel" role="status">
                  Modelo incompleto: {brokenFiles.size} archivo
                  {brokenFiles.size === 1 ? "" : "s"} con errores de sintaxis. Pueden
                  faltar elementos en el diagrama.
                </p>
              )}
              {model && (
                <div className="diagram-controls">
                  <button type="button" onClick={() => store.requestRelayout()}>
                    Re-layout
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={state.visualControls.showMembers}
                      onChange={() => store.toggleMembers()}
                    />
                    Miembros
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={state.visualControls.focusEnabled}
                      onChange={(event) => store.setFocusEnabled(event.target.checked)}
                    />
                    Modo foco
                  </label>
                  {state.visualControls.focusEnabled && (
                    <>
                      <label>
                        Profundidad
                        <select
                          aria-label="Profundidad de foco"
                          value={state.visualControls.focusDepth}
                          onChange={(event) => store.setFocusDepth(Number(event.target.value))}
                        >
                          {FOCUS_DEPTHS.map((depth) => (
                            <option key={depth} value={depth}>
                              {depth}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={state.visualControls.focusHide}
                          onChange={() => store.toggleFocusHide()}
                        />
                        Ocultar el resto
                      </label>
                    </>
                  )}
                  <ChangeFiltersBar
                    filters={state.changeFilters}
                    onToggle={(key) => store.toggleChangeFilter(key)}
                  />
                </div>
              )}
              <div className="diagram-body">
                <div className="diagram-canvas">
                  {isEmpty ? (
                    <DiagramEmptyState />
                  ) : projection && visualStore ? (
                    <DiagramCanvas
                      visualStore={visualStore}
                      view={state.view}
                      projection={projection}
                      selectedSha={state.selectedSha}
                      commits={state.commits}
                      ghosts={ghosts}
                      overlay={overlay}
                      focusedNodeId={state.focusedNodeId}
                      controls={state.visualControls}
                      relayoutToken={state.relayoutToken}
                      onToggleFolder={handleToggleFolder}
                      onOpenClass={handleOpenClass}
                    />
                  ) : null}
                </div>
                {model && (
                  <ChangesPanel
                    diff={model.diff}
                    filters={state.changeFilters}
                    onFocus={(change) => {
                      store.setView(change.view);
                      store.focusNode(change.targetId);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

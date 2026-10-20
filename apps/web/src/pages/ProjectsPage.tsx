import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAppState, useAppStore } from "../state/StoreProvider.js";

export function ProjectsPage() {
  const store = useAppStore();
  const state = useAppState();

  useEffect(() => {
    void store.loadProjects();
  }, [store]);

  return (
    <section className="library">
      <div className="library-header">
        <h2>Biblioteca de proyectos</h2>
        <button type="button" onClick={() => store.setImportOpen(true)}>
          Importar proyecto
        </button>
      </div>

      {state.libraryStatus === "loading" && (
        <p className="placeholder" role="status">
          Cargando proyectos…
        </p>
      )}

      {state.libraryStatus === "error" && (
        <div className="error-panel" role="alert">
          <p>{state.libraryError}</p>
          <button type="button" onClick={() => void store.loadProjects()}>
            Reintentar
          </button>
        </div>
      )}

      {state.libraryStatus === "ready" && state.projects.length === 0 && (
        <p className="placeholder">
          No hay proyectos todavía. Importá uno desde una ruta local o una URL pública.
        </p>
      )}

      {state.projects.length > 0 && (
        <ul className="project-list">
          {state.projects.map((project) => (
            <li key={project.id} className="project-card">
              <div className="project-info">
                <h3>{project.name}</h3>
                <p className="project-location">{project.location}</p>
                <p className="project-meta">
                  <span className="badge">{project.branch}</span>
                  <span className="badge">
                    {project.sourceType === "local" ? "local" : "remoto"}
                  </span>
                </p>
              </div>
              <div className="project-actions">
                <Link className="button-link" to={`/projects/${project.id}`}>
                  Abrir
                </Link>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    if (
                      typeof window.confirm === "function" &&
                      !window.confirm(`¿Eliminar el proyecto "${project.name}"?`)
                    ) {
                      return;
                    }
                    void store.deleteProject(project.id);
                  }}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

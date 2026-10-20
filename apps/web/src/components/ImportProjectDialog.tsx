import { useState, type FormEvent } from "react";
import { useAppState, useAppStore } from "../state/StoreProvider.js";
import type { ProjectSourceType } from "@dcv/shared";

export function ImportProjectDialog() {
  const store = useAppStore();
  const { importState } = useAppState();
  const [source, setSource] = useState<ProjectSourceType>("local");
  const [location, setLocation] = useState("");
  const [branch, setBranch] = useState("");

  if (!importState.open) {
    return null;
  }

  const loading = importState.status === "loading";
  const percent =
    importState.progress === null ? null : Math.round(importState.progress * 100);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = location.trim();
    if (!trimmed || loading) {
      return;
    }
    void store.importProject({
      source,
      location: trimmed,
      ...(branch.trim() ? { branch: branch.trim() } : {})
    });
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="dialog">
        <h2 id="import-title">Importar proyecto</h2>
        <form onSubmit={submit}>
          <label className="field">
            Origen
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as ProjectSourceType)}
              disabled={loading}
            >
              <option value="local">Ruta local</option>
              <option value="url">URL pública</option>
            </select>
          </label>

          <label className="field">
            Ubicación
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder={
                source === "local" ? "/ruta/al/repositorio" : "https://host/repositorio.git"
              }
              disabled={loading}
              autoFocus
            />
          </label>

          <label className="field">
            Rama (opcional)
            <input
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="main"
              disabled={loading}
            />
          </label>

          {loading && (
            <div className="import-progress" role="status">
              <progress max={100} value={percent ?? undefined} />
              <span>
                {importState.message ?? "Importando…"}
                {percent === null ? "" : ` (${percent}%)`}
              </span>
            </div>
          )}

          {importState.status === "error" && (
            <p className="error-text" role="alert">
              {importState.error}
            </p>
          )}

          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => store.setImportOpen(false)}
              disabled={loading}
            >
              Cancelar
            </button>
            <button type="submit" disabled={loading || location.trim().length === 0}>
              Importar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

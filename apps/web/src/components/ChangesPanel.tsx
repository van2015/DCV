import type { SnapshotDiff } from "@dcv/shared";
import {
  collectPanelChanges,
  groupPanelChanges,
  markerLabel,
  type PanelChange
} from "../diagram/changes.js";
import type { ChangeFilters } from "../diagram/overlay.js";

export interface ChangesPanelProps {
  diff: SnapshotDiff;
  filters: ChangeFilters;
  onFocus: (change: PanelChange) => void;
}

export function ChangesPanel({ diff, filters, onFocus }: ChangesPanelProps) {
  const groups = groupPanelChanges(collectPanelChanges(diff, filters));

  return (
    <aside className="changes-panel" aria-label="Panel de cambios">
      <h3>Cambios del commit</h3>
      {diff.isEmpty ? (
        <p className="placeholder-small" role="status">
          Sin cambios estructurales de TypeScript en este commit.
        </p>
      ) : groups.length === 0 ? (
        <p className="placeholder-small" role="status">
          Ningún cambio coincide con los filtros activos.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.status} className="changes-group">
            <h4>
              {group.label} <span className="changes-count">{group.items.length}</span>
            </h4>
            <ul>
              {group.items.map((change) => (
                <li key={change.key}>
                  <button type="button" onClick={() => onFocus(change)}>
                    <span className="change-badge" title={markerLabel(change.status)}>
                      {markerLabel(change.status)}
                    </span>
                    <span className="change-title">{change.title}</span>
                    <span className="change-detail">{change.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </aside>
  );
}

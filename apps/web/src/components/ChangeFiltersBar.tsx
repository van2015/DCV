import type { ChangeFilters } from "../diagram/overlay.js";

export interface ChangeFiltersBarProps {
  filters: ChangeFilters;
  onToggle: (key: keyof ChangeFilters) => void;
}

const OPTIONS: { key: keyof ChangeFilters; label: string }[] = [
  { key: "implementation", label: "Cambios de implementación" },
  { key: "members", label: "Cambios de miembros" },
  { key: "types", label: "Cambios de tipos" }
];

export function ChangeFiltersBar({ filters, onToggle }: ChangeFiltersBarProps) {
  return (
    <div className="change-filters" role="group" aria-label="Filtros de cambios">
      {OPTIONS.map((option) => (
        <label key={option.key}>
          <input
            type="checkbox"
            checked={filters[option.key]}
            onChange={() => onToggle(option.key)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

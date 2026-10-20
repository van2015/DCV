import { changeMarker, type OverlayStatus } from "./overlay.js";

export function ChangeBadge({ status }: { status: OverlayStatus }) {
  const marker = changeMarker(status.status);
  const label = status.probable ? `${marker.label} (probable)` : marker.label;
  return (
    <span
      className={`change-badge status-${status.status}${status.probable ? " probable" : ""}`}
      title={label}
      aria-label={label}
    >
      {marker.symbol}
    </span>
  );
}

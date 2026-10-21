import type { StorageLike } from "../../state/store.js";
import type { LayoutPositions } from "./types.js";

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface VisualControls {
  showMembers: boolean;
  focusEnabled: boolean;
  focusDepth: number;
  focusHide: boolean;
  heatmapEnabled: boolean;
  collapsedFolders: string[];
}

export const DEFAULT_VISUAL_CONTROLS: VisualControls = {
  showMembers: true,
  focusEnabled: false,
  focusDepth: 1,
  focusHide: false,
  heatmapEnabled: false,
  collapsedFolders: []
};

export const MAX_COMMITS_PER_VIEW = 50;

export class VisualStateStore {
  constructor(
    private readonly storage: StorageLike | undefined,
    private readonly projectId: string
  ) {}

  loadPositions(view: string): LayoutPositions {
    return sanitizePositions(this.read<unknown>(`${view}:positions`));
  }

  savePositions(view: string, positions: LayoutPositions): void {
    this.tryWrite(`${view}:positions`, positions);
  }

  hasCommitEntries(view: string): boolean {
    return this.readCommitOrder(view).length > 0;
  }

  hasCommitPositions(view: string, sha: string): boolean {
    return this.read<unknown>(commitSuffix(view, sha)) !== null;
  }

  loadCommitPositions(view: string, sha: string): LayoutPositions | null {
    const value = this.read<unknown>(commitSuffix(view, sha));
    if (!value || typeof value !== "object") {
      return null;
    }
    this.touchCommit(view, sha);
    return sanitizePositions(value);
  }

  saveCommitPositions(view: string, sha: string, positions: LayoutPositions): void {
    const suffix = commitSuffix(view, sha);
    const compact = roundPositions(positions);
    const current = this.readCommitOrder(view).filter((item) => item !== sha);
    const order = [sha, ...current.slice(0, MAX_COMMITS_PER_VIEW - 1)];
    for (const evicted of current.slice(MAX_COMMITS_PER_VIEW - 1)) {
      this.removeCommit(view, evicted);
    }

    let written = this.tryWrite(suffix, compact);
    while (!written && order.length > 1) {
      const dropped = order.pop()!;
      this.removeCommit(view, dropped);
      written = this.tryWrite(suffix, compact);
    }
    this.writeCommitOrder(
      view,
      written ? order : order.filter((item) => item !== sha)
    );
  }

  clearCommitPositions(view: string, sha: string): void {
    this.removeCommit(view, sha);
    this.writeCommitOrder(
      view,
      this.readCommitOrder(view).filter((item) => item !== sha)
    );
  }

  loadCamera(view: string): CameraState | null {
    const value = this.read<CameraState>(`${view}:camera`);
    if (
      value &&
      typeof value.x === "number" &&
      typeof value.y === "number" &&
      typeof value.zoom === "number"
    ) {
      return value;
    }
    return null;
  }

  saveCamera(view: string, camera: CameraState): void {
    this.tryWrite(`${view}:camera`, camera);
  }

  loadControls(): VisualControls {
    const value = this.read<Partial<VisualControls>>("controls");
    if (!value || typeof value !== "object") {
      return { ...DEFAULT_VISUAL_CONTROLS };
    }
    return {
      showMembers:
        typeof value.showMembers === "boolean"
          ? value.showMembers
          : DEFAULT_VISUAL_CONTROLS.showMembers,
      focusEnabled:
        typeof value.focusEnabled === "boolean"
          ? value.focusEnabled
          : DEFAULT_VISUAL_CONTROLS.focusEnabled,
      focusDepth:
        typeof value.focusDepth === "number" &&
        value.focusDepth >= 1 &&
        value.focusDepth <= 3
          ? value.focusDepth
          : DEFAULT_VISUAL_CONTROLS.focusDepth,
      focusHide:
        typeof value.focusHide === "boolean"
          ? value.focusHide
          : DEFAULT_VISUAL_CONTROLS.focusHide,
      heatmapEnabled:
        typeof value.heatmapEnabled === "boolean"
          ? value.heatmapEnabled
          : DEFAULT_VISUAL_CONTROLS.heatmapEnabled,
      collapsedFolders: Array.isArray(value.collapsedFolders)
        ? value.collapsedFolders.filter((item): item is string => typeof item === "string")
        : []
    };
  }

  saveControls(controls: VisualControls): void {
    this.tryWrite("controls", controls);
  }

  clearPositions(view: string): void {
    this.tryWrite(`${view}:positions`, {});
  }

  private touchCommit(view: string, sha: string): void {
    const order = this.readCommitOrder(view);
    if (order[0] === sha) {
      return;
    }
    const kept = [sha, ...order.filter((item) => item !== sha)].slice(
      0,
      MAX_COMMITS_PER_VIEW
    );
    const keptSet = new Set(kept);
    for (const evicted of order) {
      if (!keptSet.has(evicted)) {
        this.removeCommit(view, evicted);
      }
    }
    this.writeCommitOrder(view, kept);
  }

  private readCommitOrder(view: string): string[] {
    const value = this.read<{ order?: unknown }>(`${view}:commits`);
    if (!value || !Array.isArray(value.order)) {
      return [];
    }
    return value.order.filter((item): item is string => typeof item === "string");
  }

  private writeCommitOrder(view: string, order: string[]): void {
    this.tryWrite(`${view}:commits`, { order });
  }

  private removeCommit(view: string, sha: string): void {
    this.remove(commitSuffix(view, sha));
  }

  private read<T>(suffix: string): T | null {
    try {
      const raw = this.storage?.getItem(this.key(suffix));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private tryWrite(suffix: string, value: unknown): boolean {
    try {
      this.storage?.setItem(this.key(suffix), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  private remove(suffix: string): void {
    try {
      this.storage?.removeItem(this.key(suffix));
    } catch {
      // Almacenamiento no disponible: la vista funciona sin persistencia.
    }
  }

  private key(suffix: string): string {
    return `dcv.layout:${this.projectId}:${suffix}`;
  }
}

function commitSuffix(view: string, sha: string): string {
  return `${view}:commit:${sha}`;
}

function sanitizePositions(value: unknown): LayoutPositions {
  if (!value || typeof value !== "object") {
    return {};
  }
  const positions: LayoutPositions = {};
  for (const [id, rect] of Object.entries(value as Record<string, unknown>)) {
    if (
      rect &&
      typeof rect === "object" &&
      typeof (rect as LayoutPositions[string]).x === "number" &&
      typeof (rect as LayoutPositions[string]).y === "number"
    ) {
      positions[id] = { ...(rect as LayoutPositions[string]) };
    }
  }
  return positions;
}

function roundPositions(positions: LayoutPositions): LayoutPositions {
  const rounded: LayoutPositions = {};
  for (const [id, rect] of Object.entries(positions)) {
    rounded[id] = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }
  return rounded;
}

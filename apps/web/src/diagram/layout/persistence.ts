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
  collapsedFolders: string[];
}

export const DEFAULT_VISUAL_CONTROLS: VisualControls = {
  showMembers: true,
  focusEnabled: false,
  focusDepth: 1,
  focusHide: false,
  collapsedFolders: []
};

export class VisualStateStore {
  constructor(
    private readonly storage: StorageLike | undefined,
    private readonly projectId: string
  ) {}

  loadPositions(view: string): LayoutPositions {
    const value = this.read<unknown>(`${view}:positions`);
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

  savePositions(view: string, positions: LayoutPositions): void {
    this.write(`${view}:positions`, positions);
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
    this.write(`${view}:camera`, camera);
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
      collapsedFolders: Array.isArray(value.collapsedFolders)
        ? value.collapsedFolders.filter((item): item is string => typeof item === "string")
        : []
    };
  }

  saveControls(controls: VisualControls): void {
    this.write("controls", controls);
  }

  clearPositions(view: string): void {
    this.write(`${view}:positions`, {});
  }

  private read<T>(suffix: string): T | null {
    try {
      const raw = this.storage?.getItem(this.key(suffix));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private write(suffix: string, value: unknown): void {
    try {
      this.storage?.setItem(this.key(suffix), JSON.stringify(value));
    } catch {
      // Almacenamiento no disponible: la vista funciona sin persistencia.
    }
  }

  private key(suffix: string): string {
    return `dcv.layout:${this.projectId}:${suffix}`;
  }
}

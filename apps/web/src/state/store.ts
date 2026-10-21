import type {
  CommitInfo,
  CommitListResponse,
  DiagramView,
  HeatmapResponse,
  ImportProgressEvent,
  ImportProjectResult,
  ModelResponse,
  Project,
  ProjectImportRequest,
  ProjectUpdateRequest
} from "@dcv/shared";
import { ApiError, type EventHandlers } from "../api/client.js";
import { initialViewFor } from "../diagram/projection.js";
import { DEFAULT_CHANGE_FILTERS, type ChangeFilters } from "../diagram/overlay.js";
import {
  DEFAULT_VISUAL_CONTROLS,
  VisualStateStore,
  type VisualControls
} from "../diagram/layout/persistence.js";

export interface ClientLike {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project>;
  importProject(request: ProjectImportRequest): Promise<ImportProjectResult>;
  updateProject(id: string, patch: ProjectUpdateRequest): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  refreshProject(id: string): Promise<Project>;
  listBranches(id: string): Promise<string[]>;
  listCommits(id: string, branch?: string): Promise<CommitListResponse>;
  getModel(id: string, sha: string, branch?: string): Promise<ModelResponse>;
  getHeatmap(id: string, sha: string, branch?: string): Promise<HeatmapResponse>;
  subscribeEvents(handlers: EventHandlers, options?: { projectId?: string }): () => void;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadStatus = "idle" | "loading" | "error" | "ready";

export interface ImportState {
  open: boolean;
  status: "idle" | "loading" | "error" | "done";
  error: string | null;
  progress: number | null;
  message: string | null;
}

export interface AppState {
  projects: Project[];
  libraryStatus: LoadStatus;
  libraryError: string | null;
  activeProject: Project | null;
  projectStatus: LoadStatus;
  projectError: string | null;
  view: DiagramView;
  focusedNodeId: string | null;
  changeFilters: ChangeFilters;
  visualControls: VisualControls;
  relayoutToken: number;
  branches: string[];
  commits: CommitInfo[];
  historyStatus: LoadStatus;
  historyError: string | null;
  historyNotice: string | null;
  selectedSha: string | null;
  model: ModelResponse | null;
  modelStatus: LoadStatus;
  modelError: string | null;
  heatmap: HeatmapResponse | null;
  heatmapStatus: LoadStatus;
  heatmapError: string | null;
  importState: ImportState;
}

const VIEW_KEY_PREFIX = "dcv.view:";
const VIEWS: DiagramView[] = ["classes", "modules", "packages"];

const INITIAL_STATE: AppState = {
  projects: [],
  libraryStatus: "idle",
  libraryError: null,
  activeProject: null,
  projectStatus: "idle",
  projectError: null,
  view: "classes",
  focusedNodeId: null,
  changeFilters: DEFAULT_CHANGE_FILTERS,
  visualControls: DEFAULT_VISUAL_CONTROLS,
  relayoutToken: 0,
  branches: [],
  commits: [],
  historyStatus: "idle",
  historyError: null,
  historyNotice: null,
  selectedSha: null,
  model: null,
  modelStatus: "idle",
  modelError: null,
  heatmap: null,
  heatmapStatus: "idle",
  heatmapError: null,
  importState: { open: false, status: "idle", error: null, progress: null, message: null }
};

export interface AppStoreOptions {
  storage?: StorageLike;
}

export class AppStore {
  private state: AppState;
  private readonly listeners = new Set<() => void>();
  private readonly client: ClientLike;
  private readonly storage: StorageLike | undefined;
  private importUnsubscribe: (() => void) | null = null;
  private modelRequest = 0;
  private heatmapRequest = 0;
  private visualStore: VisualStateStore | null = null;

  constructor(client: ClientLike, options: AppStoreOptions = {}) {
    this.client = client;
    this.storage = options.storage ?? safeLocalStorage();
    this.state = { ...INITIAL_STATE };
  }

  getState = (): AppState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  focusNode(id: string): void {
    this.set({ focusedNodeId: id });
  }

  clearFocus(): void {
    this.set({ focusedNodeId: null });
  }

  getVisualStore(): VisualStateStore | null {
    return this.visualStore;
  }

  toggleMembers(): void {
    this.updateVisualControls({
      showMembers: !this.state.visualControls.showMembers
    });
  }

  setFocusEnabled(enabled: boolean): void {
    this.updateVisualControls({ focusEnabled: enabled });
  }

  setFocusDepth(depth: number): void {
    const clamped = Math.min(3, Math.max(1, Math.round(depth)));
    this.updateVisualControls({ focusDepth: clamped });
  }

  toggleFocusHide(): void {
    this.updateVisualControls({ focusHide: !this.state.visualControls.focusHide });
  }

  toggleHeatmap(): void {
    const enabled = !this.state.visualControls.heatmapEnabled;
    this.updateVisualControls({ heatmapEnabled: enabled });
    if (enabled) {
      void this.loadHeatmap();
    } else {
      this.clearHeatmap();
    }
  }

  toggleFolder(path: string): void {
    const collapsed = this.state.visualControls.collapsedFolders;
    this.updateVisualControls({
      collapsedFolders: collapsed.includes(path)
        ? collapsed.filter((item) => item !== path)
        : [...collapsed, path]
    });
  }

  requestRelayout(): void {
    this.set({ relayoutToken: this.state.relayoutToken + 1 });
  }

  private updateVisualControls(patch: Partial<VisualControls>): void {
    const next = { ...this.state.visualControls, ...patch };
    this.visualStore?.saveControls(next);
    this.set({ visualControls: next });
  }

  toggleChangeFilter(key: keyof ChangeFilters): void {
    this.set({
      changeFilters: {
        ...this.state.changeFilters,
        [key]: !this.state.changeFilters[key]
      }
    });
  }

  setView(view: DiagramView): void {
    if (!VIEWS.includes(view)) {
      return;
    }
    const project = this.state.activeProject;
    if (project) {
      this.storage?.setItem(`${VIEW_KEY_PREFIX}${project.id}`, view);
    }
    this.set({ view });
  }

  setImportOpen(open: boolean): void {
    this.set({
      importState: {
        ...this.state.importState,
        open,
        ...(open ? { status: "idle" as const, error: null } : {})
      }
    });
  }

  async loadProjects(): Promise<void> {
    this.set({ libraryStatus: "loading", libraryError: null });
    try {
      const projects = await this.client.listProjects();
      this.set({ projects, libraryStatus: "ready" });
    } catch (error) {
      this.set({ libraryStatus: "error", libraryError: messageFor(error) });
    }
  }

  async importProject(request: ProjectImportRequest): Promise<Project | null> {
    this.set({
      importState: {
        open: true,
        status: "loading",
        error: null,
        progress: null,
        message: "Iniciando importación…"
      }
    });
    this.importUnsubscribe?.();
    this.importUnsubscribe = this.client.subscribeEvents({
      "import:progress": (event) => this.applyImportProgress(event),
      "import:done": (event) => this.applyImportProgress(event),
      "import:error": (event) =>
        this.set({
          importState: {
            ...this.state.importState,
            status: "error",
            error: event.error?.message ?? event.message
          }
        })
    });

    try {
      const result = await this.client.importProject(request);
      await this.loadProjects();
      this.set({
        importState: { open: false, status: "done", error: null, progress: 1, message: null }
      });
      return result.project;
    } catch (error) {
      this.set({
        importState: {
          ...this.state.importState,
          status: "error",
          error: messageFor(error)
        }
      });
      return null;
    } finally {
      this.importUnsubscribe?.();
      this.importUnsubscribe = null;
    }
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await this.client.deleteProject(id);
      if (this.state.activeProject?.id === id) {
        this.resetActiveProject();
      }
      await this.loadProjects();
    } catch (error) {
      this.set({ libraryError: messageFor(error) });
    }
  }

  async openProject(id: string): Promise<void> {
    if (this.state.activeProject?.id === id && this.state.projectStatus === "ready") {
      return;
    }
    this.visualStore = null;
    this.heatmapRequest += 1;
    this.set({
      projectStatus: "loading",
      projectError: null,
      activeProject: null,
      commits: [],
      selectedSha: null,
      focusedNodeId: null,
      model: null,
      modelStatus: "idle",
      modelError: null,
      heatmap: null,
      heatmapStatus: "idle",
      heatmapError: null,
      historyNotice: null
    });
    try {
      const [project, branches] = await Promise.all([
        this.client.getProject(id),
        this.client.listBranches(id).catch(() => [])
      ]);
      const history = await this.client.listCommits(id, project.branch);
      const selectedSha = pickRestoredSha(project.lastCommit, history.commits);
      this.visualStore = this.storage
        ? new VisualStateStore(this.storage, project.id)
        : null;
      const visualControls =
        this.visualStore?.loadControls() ?? DEFAULT_VISUAL_CONTROLS;
      this.set({
        activeProject: project,
        projectStatus: "ready",
        view: this.readStoredView(project.id) ?? "classes",
        visualControls,
        branches,
        commits: history.commits,
        historyStatus: "ready",
        historyError: null,
        selectedSha
      });
      if (selectedSha) {
        void this.loadModel(selectedSha);
        if (visualControls.heatmapEnabled) {
          void this.loadHeatmap();
        }
      }
    } catch (error) {
      this.set({ projectStatus: "error", projectError: messageFor(error) });
    }
  }

  async refreshHistory(): Promise<void> {
    const project = this.state.activeProject;
    if (!project) {
      return;
    }
    this.set({ historyStatus: "loading", historyError: null, historyNotice: null });
    try {
      const history = await this.client.listCommits(project.id, project.branch);
      const current = this.state.selectedSha;
      const stillExists = current !== null && history.commits.some((c) => c.sha === current);
      const selectedSha = stillExists
        ? current
        : history.commits.at(-1)?.sha ?? null;
      this.set({
        commits: history.commits,
        historyStatus: "ready",
        selectedSha,
        ...(stillExists || current === null
          ? {}
          : { historyNotice: "El commit seleccionado ya no existe; se seleccionó el más cercano." })
      });
      if (selectedSha && selectedSha !== current) {
        void this.loadModel(selectedSha);
        if (this.state.visualControls.heatmapEnabled) {
          void this.loadHeatmap();
        }
      }
    } catch (error) {
      this.set({ historyStatus: "error", historyError: messageFor(error) });
    }
  }

  async switchBranch(branch: string): Promise<void> {
    const project = this.state.activeProject;
    if (!project || branch === project.branch) {
      return;
    }
    this.clearHeatmap();
    this.set({ historyStatus: "loading", historyError: null, historyNotice: null });
    try {
      const updated = await this.client.updateProject(project.id, { branch });
      const history = await this.client.listCommits(project.id, branch);
      const selectedSha = history.commits.at(-1)?.sha ?? null;
      this.set({
        activeProject: updated,
        commits: history.commits,
        historyStatus: "ready",
        selectedSha,
        model: null,
        modelStatus: "idle"
      });
      if (selectedSha) {
        void this.loadModel(selectedSha);
        if (this.state.visualControls.heatmapEnabled) {
          void this.loadHeatmap();
        }
      }
    } catch (error) {
      this.set({ historyStatus: "error", historyError: messageFor(error) });
    }
  }

  selectCommit(sha: string): void {
    if (sha === this.state.selectedSha) {
      return;
    }
    this.set({ selectedSha: sha, focusedNodeId: null });
    void this.loadModel(sha);
    if (this.state.visualControls.heatmapEnabled) {
      void this.loadHeatmap();
    }
  }

  async loadHeatmap(): Promise<void> {
    const project = this.state.activeProject;
    const sha = this.state.selectedSha;
    if (
      !project ||
      !sha ||
      !this.state.visualControls.heatmapEnabled
    ) {
      return;
    }
    const request = ++this.heatmapRequest;
    this.set({ heatmapStatus: "loading", heatmapError: null, heatmap: null });
    try {
      const heatmap = await this.client.getHeatmap(
        project.id,
        sha,
        project.branch
      );
      if (request !== this.heatmapRequest) {
        return;
      }
      this.set({ heatmap, heatmapStatus: "ready" });
    } catch (error) {
      if (request !== this.heatmapRequest) {
        return;
      }
      this.set({ heatmapStatus: "error", heatmapError: messageFor(error) });
    }
  }

  private clearHeatmap(): void {
    this.heatmapRequest += 1;
    this.set({ heatmap: null, heatmapStatus: "idle", heatmapError: null });
  }

  async loadModel(sha: string): Promise<void> {
    const project = this.state.activeProject;
    if (!project) {
      return;
    }
    const request = ++this.modelRequest;
    this.set({ modelStatus: "loading", modelError: null });
    try {
      const model = await this.client.getModel(project.id, sha, project.branch);
      if (request !== this.modelRequest) {
        return;
      }
      const storedView = this.readStoredView(project.id);
      this.set({
        model,
        modelStatus: "ready",
        ...(storedView ? {} : { view: initialViewFor(model.snapshot) })
      });
    } catch (error) {
      if (request !== this.modelRequest) {
        return;
      }
      this.set({ modelStatus: "error", modelError: messageFor(error) });
    }
  }

  closeProject(): void {
    this.resetActiveProject();
  }

  private readStoredView(projectId: string): DiagramView | null {
    const value = this.storage?.getItem(`${VIEW_KEY_PREFIX}${projectId}`);
    return VIEWS.includes(value as DiagramView) ? (value as DiagramView) : null;
  }

  private resetActiveProject(): void {
    this.heatmapRequest += 1;
    this.set({
      activeProject: null,
      view: "classes",
      focusedNodeId: null,
      visualControls: DEFAULT_VISUAL_CONTROLS,
      relayoutToken: 0,
      projectStatus: "idle",
      projectError: null,
      branches: [],
      commits: [],
      historyStatus: "idle",
      historyError: null,
      historyNotice: null,
      selectedSha: null,
      model: null,
      modelStatus: "idle",
      modelError: null,
      heatmap: null,
      heatmapStatus: "idle",
      heatmapError: null
    });
  }

  private applyImportProgress(event: ImportProgressEvent): void {
    this.set({
      importState: {
        ...this.state.importState,
        status: "loading",
        message: event.message,
        progress: event.progress
      }
    });
  }

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

function pickRestoredSha(
  lastCommit: string | null,
  commits: CommitInfo[]
): string | null {
  if (lastCommit && commits.some((commit) => commit.sha === lastCommit)) {
    return lastCommit;
  }
  return commits[0]?.sha ?? null;
}

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "project_exists":
        return "Este proyecto ya está registrado en la biblioteca.";
      case "path_not_found":
        return "La ruta indicada no existe.";
      case "not_a_git_repository":
        return "La ruta no es un repositorio Git.";
      case "empty_repository":
        return "El repositorio no tiene commits.";
      case "invalid_protocol":
        return "Solo se admiten URLs https o ssh.";
      case "credentials_not_allowed":
        return "Las URLs con credenciales no están permitidas.";
      case "branch_not_found":
        return "La rama indicada no existe.";
      case "project_not_found":
        return "El proyecto ya no existe.";
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : "Error inesperado";
}

function safeLocalStorage(): StorageLike | undefined {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      return undefined;
    }
    const probe = "__dcv_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return undefined;
  }
}

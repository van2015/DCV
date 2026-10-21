import type {
  CommitInfo,
  CommitListResponse,
  HeatmapResponse,
  ImportProgressEvent,
  ImportProjectResult,
  ModelResponse,
  Project,
  ProjectImportRequest,
  ProjectUpdateRequest
} from "@dcv/shared";
import { ApiError, type EventHandlers } from "../api/client.js";
import type { ClientLike, StorageLike } from "../state/store.js";

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "proyecto",
    sourceType: "local",
    location: "/tmp/proyecto",
    repoPath: "/tmp/proyecto",
    branch: "main",
    defaultBranch: "main",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: null,
    managed: false,
    lastCommit: null,
    ...overrides
  };
}

export function makeCommit(
  sha: string,
  subject: string,
  parents: string[] = []
): CommitInfo {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    subject,
    message: subject,
    authorName: "DCV",
    authorEmail: "dcv@example.com",
    date: "2026-01-01T00:00:00Z",
    changedFiles: 1
  };
}

export function makeHeatmap(
  commit: string,
  overrides: Partial<HeatmapResponse> = {}
): HeatmapResponse {
  return {
    branch: "main",
    commit,
    commits: 1,
    nodes: {},
    members: {},
    ...overrides
  };
}

export function makeModel(
  commit: CommitInfo,
  overrides: Partial<ModelResponse> = {}
): ModelResponse {
  return {
    commit,
    snapshot: {
      commit: commit.sha,
      branch: "main",
      analyzerVersion: "1.0.0",
      files: [],
      edges: [],
      diagnostics: [],
      stats: {
        files: 0,
        declarations: 0,
        classes: 0,
        interfaces: 0,
        enums: 0,
        types: 0,
        functions: 0,
        edges: 0
      }
    },
    diff: {
      from: null,
      to: commit.sha,
      isEmpty: true,
      files: [],
      declarations: [],
      members: [],
      edges: []
    },
    diagnostics: [],
    warnings: [],
    ...overrides
  };
}

export class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

export class FakeClient implements ClientLike {
  projects: Project[];
  commits: Record<string, CommitInfo[]>;
  branches: Record<string, string[]>;
  models: Record<string, ModelResponse>;
  heatmaps: Record<string, HeatmapResponse>;
  heatmapGates: Record<string, Promise<void>> = {};
  heatmapCalls: { id: string; sha: string; branch?: string }[] = [];
  errors: Partial<Record<keyof ClientLike, Error>> = {};
  importCalls: ProjectImportRequest[] = [];
  importResult: ImportProjectResult | null = null;
  importError: Error | null = null;
  importGate: Promise<void> | null = null;
  subscriptions: {
    handlers: EventHandlers;
    options?: { projectId?: string };
    active: boolean;
  }[] = [];

  constructor(options: {
    projects?: Project[];
    commits?: Record<string, CommitInfo[]>;
    branches?: Record<string, string[]>;
    models?: Record<string, ModelResponse>;
    heatmaps?: Record<string, HeatmapResponse>;
  } = {}) {
    this.projects = options.projects ?? [];
    this.commits = options.commits ?? {};
    this.branches = options.branches ?? {};
    this.models = options.models ?? {};
    this.heatmaps = options.heatmaps ?? {};
  }

  async listProjects(): Promise<Project[]> {
    this.maybeThrow("listProjects");
    return [...this.projects];
  }

  async getProject(id: string): Promise<Project> {
    this.maybeThrow("getProject");
    const project = this.projects.find((item) => item.id === id);
    if (!project) {
      throw new ApiError("project_not_found", "El proyecto no existe.", 404);
    }
    return project;
  }

  async importProject(request: ProjectImportRequest): Promise<ImportProjectResult> {
    this.importCalls.push(request);
    if (this.importGate) {
      await this.importGate;
    }
    if (this.importError) {
      throw this.importError;
    }
    const result =
      this.importResult ??
      ({
        project: makeProject({
          id: "imported",
          name: "importado",
          location: request.location,
          sourceType: request.source
        }),
        warnings: []
      } satisfies ImportProjectResult);
    if (!this.projects.some((project) => project.id === result.project.id)) {
      this.projects.push(result.project);
    }
    return result;
  }

  async updateProject(id: string, patch: ProjectUpdateRequest): Promise<Project> {
    this.maybeThrow("updateProject");
    const project = await this.getProject(id);
    const updated = { ...project, ...patch } as Project;
    this.projects = this.projects.map((item) => (item.id === id ? updated : item));
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    this.maybeThrow("deleteProject");
    this.projects = this.projects.filter((project) => project.id !== id);
  }

  async refreshProject(id: string): Promise<Project> {
    this.maybeThrow("refreshProject");
    return this.getProject(id);
  }

  async listBranches(id: string): Promise<string[]> {
    this.maybeThrow("listBranches");
    const project = await this.getProject(id);
    return this.branches[id] ?? [project.branch];
  }

  async listCommits(id: string, branch?: string): Promise<CommitListResponse> {
    this.maybeThrow("listCommits");
    const project = await this.getProject(id);
    return { branch: branch ?? project.branch, commits: this.commits[id] ?? [] };
  }

  async getModel(id: string, sha: string, branch?: string): Promise<ModelResponse> {
    this.maybeThrow("getModel");
    const key = `${id}:${sha}`;
    const model = this.models[key];
    if (model) {
      return model;
    }
    const commit = (this.commits[id] ?? []).find((item) => item.sha === sha);
    if (!commit) {
      throw new ApiError("invalid_commit", "El commit no existe.", 404);
    }
    return {
      ...makeModel(commit),
      snapshot: { ...makeModel(commit).snapshot, branch: branch ?? "main" }
    };
  }

  async getHeatmap(
    id: string,
    sha: string,
    branch?: string
  ): Promise<HeatmapResponse> {
    this.maybeThrow("getHeatmap");
    this.heatmapCalls.push({ id, sha, ...(branch ? { branch } : {}) });
    const gate = this.heatmapGates[sha];
    if (gate) {
      await gate;
    }
    const key = `${id}:${sha}`;
    return (
      this.heatmaps[key] ??
      makeHeatmap(sha, { branch: branch ?? "main" })
    );
  }

  subscribeEvents(
    handlers: EventHandlers,
    options?: { projectId?: string }
  ): () => void {
    const subscription = { handlers, options, active: true };
    this.subscriptions.push(subscription);
    return () => {
      subscription.active = false;
    };
  }

  emit(event: ImportProgressEvent): void {
    for (const subscription of this.subscriptions) {
      if (!subscription.active) {
        continue;
      }
      subscription.handlers[event.type]?.(event);
    }
  }

  private maybeThrow(method: keyof ClientLike): void {
    const error = this.errors[method];
    if (error) {
      throw error;
    }
  }
}

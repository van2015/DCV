import type {
  CommitListResponse,
  DiagramView,
  ImportProgressEvent,
  ImportProjectResult,
  ModelResponse,
  Project,
  ProjectImportRequest,
  ProjectUpdateRequest
} from "@dcv/shared";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: { data?: string }) => void): void;
  close(): void;
}

export type EventHandlers = Partial<
  Record<ImportProgressEvent["type"], (event: ImportProgressEvent) => void>
> & {
  onError?: (error: unknown) => void;
};

export interface DcvClientOptions {
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  eventSourceFactory?: (url: string) => EventSourceLike;
  reconnectDelay?: (attempt: number) => number;
}

const EVENT_TYPES: ImportProgressEvent["type"][] = [
  "import:start",
  "import:progress",
  "import:done",
  "import:error",
  "analysis:start",
  "analysis:progress",
  "analysis:done",
  "analysis:error"
];

export class DcvClient {
  private readonly baseUrl: string;
  private readonly explicitToken: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly eventSourceFactory: (url: string) => EventSourceLike;
  private readonly reconnectDelay: (attempt: number) => number;

  constructor(options: DcvClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.explicitToken = options.token;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.eventSourceFactory =
      options.eventSourceFactory ??
      ((url) => new EventSource(url) as unknown as EventSourceLike);
    this.reconnectDelay = options.reconnectDelay ?? ((attempt) => Math.min(1000 * 2 ** attempt, 30000));
  }

  get token(): string {
    if (this.explicitToken !== undefined) {
      return this.explicitToken;
    }
    const injected = (globalThis as { __DCV_TOKEN__?: unknown }).__DCV_TOKEN__;
    return typeof injected === "string" ? injected : "";
  }

  listProjects(): Promise<Project[]> {
    return this.request<Project[]>("/api/projects");
  }

  getProject(id: string): Promise<Project> {
    return this.request<Project>(`/api/projects/${encodeURIComponent(id)}`);
  }

  importProject(request: ProjectImportRequest): Promise<ImportProjectResult> {
    return this.request<ImportProjectResult>("/api/projects", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }

  updateProject(id: string, patch: ProjectUpdateRequest): Promise<Project> {
    return this.request<Project>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
  }

  async deleteProject(id: string): Promise<void> {
    await this.request<void>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  }

  refreshProject(id: string): Promise<Project> {
    return this.request<Project>(`/api/projects/${encodeURIComponent(id)}/refresh`, {
      method: "POST"
    });
  }

  async listBranches(id: string): Promise<string[]> {
    const body = await this.request<{ branches: string[] }>(
      `/api/projects/${encodeURIComponent(id)}/branches`
    );
    return body.branches;
  }

  listCommits(id: string, branch?: string): Promise<CommitListResponse> {
    return this.request<CommitListResponse>(
      `/api/projects/${encodeURIComponent(id)}/commits${branchQuery(branch)}`
    );
  }

  getModel(id: string, sha: string, branch?: string): Promise<ModelResponse> {
    return this.request<ModelResponse>(
      `/api/projects/${encodeURIComponent(id)}/commits/${encodeURIComponent(sha)}/model${branchQuery(branch)}`
    );
  }

  subscribeEvents(handlers: EventHandlers, options: { projectId?: string } = {}): () => void {
    let closed = false;
    let attempt = 0;
    let source: EventSourceLike | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const open = () => {
      if (closed) {
        return;
      }
      source = this.eventSourceFactory(this.eventsUrl(options.projectId));
      source.addEventListener("open", () => {
        attempt = 0;
      });
      for (const type of EVENT_TYPES) {
        source.addEventListener(type, (message) => {
          if (typeof message.data !== "string") {
            return;
          }
          try {
            const event = JSON.parse(message.data) as ImportProgressEvent;
            handlers[type]?.(event);
          } catch {
            // Los mensajes malformados se ignoran.
          }
        });
      }
      source.addEventListener("error", () => {
        if (closed) {
          return;
        }
        source?.close();
        source = null;
        const delay = this.reconnectDelay(attempt);
        attempt += 1;
        handlers.onError?.(new Error("Conexión SSE interrumpida"));
        timer = setTimeout(open, delay);
      });
    };

    open();

    return () => {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      source?.close();
      source = null;
    };
  }

  eventsUrl(projectId?: string): string {
    const path = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/events`
      : "/api/events";
    return `${this.baseUrl}${path}?token=${encodeURIComponent(this.token)}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (this.token) {
      headers.set("x-dcv-token", this.token);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      throw await toApiError(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

export function createClient(options: DcvClientOptions = {}): DcvClient {
  return new DcvClient(options);
}

export type { DiagramView };

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    return new ApiError(
      body.error?.code ?? "http_error",
      body.error?.message ?? `Error HTTP ${response.status}`,
      response.status,
      body.error?.details
    );
  } catch {
    return new ApiError("http_error", `Error HTTP ${response.status}`, response.status);
  }
}

function branchQuery(branch: string | undefined): string {
  return branch ? `?branch=${encodeURIComponent(branch)}` : "";
}

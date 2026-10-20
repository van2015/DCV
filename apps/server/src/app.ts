import { diffSnapshots } from "@dcv/analyzer";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  ANALYZER_VERSION,
  ModelQuerySchema,
  ProjectUpdateRequestSchema,
  type CommitListResponse,
  type ImportProgressEvent,
  type ModelResponse,
  type ProjectImportRequest
} from "@dcv/shared";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AnalysisService, type AnalysisTarget } from "./analysis/service.js";
import type { ProjectAnalyzer } from "./analysis/queue.js";
import type { WorkerAnalyzerContext } from "./analysis/worker-executor.js";
import { AppError, toApiError } from "./errors.js";
import { EventBus } from "./events.js";
import { diffTrees } from "./git/diff.js";
import { getCommit, listCommits } from "./git/history.js";
import { ProjectService } from "./projects/service.js";

export interface SecurityOptions {
  token: string;
  allowedHostnames?: string[];
  allowedOrigins?: string[];
}

export interface AppOptions {
  webRoot?: string;
  dataDir?: string;
  security?: SecurityOptions;
  bus?: EventBus;
  service?: ProjectService;
  analysis?: AnalysisService;
  createAnalyzer?: (context: WorkerAnalyzerContext) => ProjectAnalyzer;
  analyzerVersion?: string;
}

interface ApiDependencies {
  service: ProjectService;
  analysis: AnalysisService;
  bus: EventBus;
  ready: Promise<void>;
}

export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono();
  const security = options.security;

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      analyzerVersion: options.analyzerVersion ?? ANALYZER_VERSION
    })
  );

  if (security) {
    app.use("/api/*", securityMiddleware(security));
  }

  const dependencies = resolveDependencies(options);
  if (dependencies) {
    registerApi(app, dependencies);
  }

  if (options.webRoot) {
    const webRoot = options.webRoot;

    app.use("*", async (c, next) => {
      if (c.req.method !== "GET" || c.req.path.startsWith("/api/")) {
        return next();
      }
      if (c.req.path === "/" || c.req.path === "/index.html") {
        return next();
      }
      return serveStatic({ root: webRoot })(c, next);
    });

    app.get("*", async (c) => {
      if (c.req.path.startsWith("/api/")) {
        return c.json({ error: { code: "not_found", message: "Ruta no encontrada" } }, 404);
      }
      try {
        const html = await readFile(join(webRoot, "index.html"), "utf8");
        return c.html(security ? injectToken(html, security.token) : html);
      } catch {
        return c.text("La SPA no está compilada. Ejecutá pnpm build.", 503);
      }
    });
  }

  return app;
}

function resolveDependencies(options: AppOptions): ApiDependencies | null {
  if (options.service && options.analysis) {
    return {
      service: options.service,
      analysis: options.analysis,
      bus: options.bus ?? new EventBus(),
      ready: options.service.init()
    };
  }
  if (!options.dataDir) {
    return null;
  }

  const bus = options.bus ?? new EventBus();
  const service = options.service ?? new ProjectService({ dataDir: options.dataDir });
  const analysis =
    options.analysis ??
    new AnalysisService({
      dataDir: options.dataDir,
      analyzerVersion: options.analyzerVersion ?? ANALYZER_VERSION,
      bus,
      ...(options.createAnalyzer ? { createAnalyzer: options.createAnalyzer } : {})
    });
  return { service, analysis, bus, ready: service.init() };
}

function registerApi(app: Hono, dependencies: ApiDependencies): void {
  const { service, analysis, bus, ready } = dependencies;

  app.use("/api/*", async (_c, next) => {
    await ready;
    return next();
  });

  app.get("/api/projects", (c) => respond(c, async () => c.json(await service.list())));

  app.post("/api/projects", (c) =>
    respond(c, async () => {
      const body = await readJson(c);
      bus.publish(event("import:start", null, "Importando proyecto…"));
      try {
        const result = await service.importProject(body as ProjectImportRequest, (progress) => {
          bus.publish(
            event(
              "import:progress",
              null,
              progress.message,
              progress.percent === null ? null : progress.percent / 100
            )
          );
        });
        bus.publish({
          ...event("import:done", result.project.id, "Proyecto importado.", 1),
          project: result.project
        });
        return c.json(result, 201);
      } catch (error) {
        bus.publish({
          ...event("import:error", null, errorMessage(error)),
          error: apiErrorSummary(error)
        });
        throw error;
      }
    })
  );

  app.get("/api/projects/:id", (c) =>
    respond(c, async () => c.json(await service.get(c.req.param("id"))))
  );

  app.patch("/api/projects/:id", (c) =>
    respond(c, async () => {
      const id = c.req.param("id");
      const parsed = ProjectUpdateRequestSchema.safeParse(await readJson(c));
      if (!parsed.success) {
        throw new AppError("invalid_request", "La actualización no es válida.", 400, {
          issues: parsed.error.issues
        });
      }
      let project = await service.get(id);
      if (parsed.data.branch) {
        project = await service.setBranch(id, parsed.data.branch);
      }
      if (parsed.data.lastCommit !== undefined) {
        project = await service.markOpened(id, parsed.data.lastCommit ?? undefined);
      }
      return c.json(project);
    })
  );

  app.delete("/api/projects/:id", (c) =>
    respond(c, async () => {
      const id = c.req.param("id");
      await service.remove(id);
      analysis.cancel(id);
      return c.body(null, 204);
    })
  );

  app.post("/api/projects/:id/refresh", (c) =>
    respond(c, async () => {
      const id = c.req.param("id");
      const project = await service.get(id);
      await service.refresh(id);
      analysis.cancel(id);
      return c.json(await service.get(project.id));
    })
  );

  app.get("/api/projects/:id/branches", (c) =>
    respond(c, async () => {
      const branches = await service.branches(c.req.param("id"));
      return c.json({ branches });
    })
  );

  app.get("/api/projects/:id/commits", (c) =>
    respond(c, async () => {
      const project = await service.get(c.req.param("id"));
      const branch = queryBranch(c) ?? project.branch;
      const commits = await listCommits(project.repoPath, branch);
      const body: CommitListResponse = { branch, commits };
      return c.json(body);
    })
  );

  app.get("/api/projects/:id/commits/:sha/model", (c) =>
    respond(c, async () => {
      const project = await service.get(c.req.param("id"));
      const branch = queryBranch(c) ?? project.branch;
      const commit = await getCommit(project.repoPath, c.req.param("sha"));
      const target: AnalysisTarget = {
        projectId: project.id,
        repoPath: project.repoPath,
        branch
      };

      const snapshot = await analysis.snapshot(target, commit.sha);
      let diff = diffSnapshots(null, snapshot);
      const parent = commit.parents[0];
      if (parent) {
        try {
          const previous = await analysis.snapshot(target, parent);
          const fileChanges = await diffTrees(project.repoPath, parent, commit.sha);
          const fileRenames = new Map<string, string>();
          for (const change of fileChanges) {
            if (change.status === "renamed" && change.previousPath) {
              fileRenames.set(change.previousPath, change.path);
            }
          }
          diff = diffSnapshots(previous, snapshot, { fileRenames });
        } catch {
          diff = diffSnapshots(null, snapshot);
        }
      }

      await service.markOpened(project.id, commit.sha);
      void prefetchNeighbours(analysis, target, commit.sha).catch(() => undefined);

      const body: ModelResponse = {
        commit,
        snapshot,
        diff,
        diagnostics: snapshot.diagnostics,
        warnings: []
      };
      return c.json(body);
    })
  );

  app.get("/api/events", (c) =>
    streamEvents(c, bus, (event) => event, null)
  );

  app.get("/api/projects/:id/events", (c) =>
    streamEvents(c, bus, (event) => event, c.req.param("id"))
  );
}

function streamEvents(
  c: Context,
  bus: EventBus,
  transform: (event: ImportProgressEvent) => ImportProgressEvent,
  projectId: string | null
): Response | Promise<Response> {
  return streamSSE(c, async (stream) => {
    const unsubscribe = bus.subscribe((event) => {
      void stream.writeSSE({
        event: event.type,
        data: JSON.stringify(transform(event))
      });
    }, projectId);
    stream.onAbort(unsubscribe);
    try {
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          resolve();
        });
      });
    } finally {
      unsubscribe();
    }
  });
}

async function prefetchNeighbours(
  analysis: AnalysisService,
  target: AnalysisTarget,
  sha: string
): Promise<void> {
  const commits = await listCommits(target.repoPath, target.branch);
  const index = commits.findIndex((commit) => commit.sha === sha);
  if (index === -1) {
    return;
  }
  const neighbours = [commits[index - 1]?.sha, commits[index + 1]?.sha].filter(
    (candidate): candidate is string => candidate !== undefined
  );
  if (neighbours.length > 0) {
    analysis.prefetch(target, neighbours);
  }
}

async function respond(c: Context, action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    const { status, body } = toApiError(error);
    return c.json(body, status as ContentfulStatusCode);
  }
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError("invalid_request", "El cuerpo de la petición no es JSON válido.", 400);
  }
}

function queryBranch(c: Context): string | undefined {
  const params = new URL(c.req.url).searchParams;
  const parsed = ModelQuerySchema.safeParse({
    branch: params.get("branch") ?? undefined
  });
  if (!parsed.success) {
    throw new AppError("invalid_request", "La consulta no es válida.", 400, {
      issues: parsed.error.issues
    });
  }
  return parsed.data.branch;
}

function event(
  type: ImportProgressEvent["type"],
  projectId: string | null,
  message: string,
  progress: number | null = null
): ImportProgressEvent {
  return { type, projectId, message, progress };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "La importación falló.";
}

function apiErrorSummary(error: unknown): { code: string; message: string } {
  const { body } = toApiError(error);
  return body.error;
}

function injectToken(html: string, token: string): string {
  const script = `<script>window.__DCV_TOKEN__=${JSON.stringify(token)};</script>`;
  return html.includes("</head>")
    ? html.replace("</head>", `${script}</head>`)
    : `${script}${html}`;
}

function securityMiddleware(security: SecurityOptions) {
  const allowedHostnames = new Set(
    security.allowedHostnames ?? ["127.0.0.1", "localhost", "::1", "[::1]"]
  );

  return async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
    if (c.req.path === "/api/health") {
      return next();
    }

    const host = hostnameOf(c.req.header("host"));
    if (host && !allowedHostnames.has(host)) {
      return c.json({ error: { code: "invalid_host", message: "Host no permitido." } }, 403);
    }

    const origin = c.req.header("origin");
    if (origin) {
      const allowed = security.allowedOrigins
        ? security.allowedOrigins.includes(origin)
        : allowedHostnames.has(hostnameOf(origin) ?? "");
      if (!allowed) {
        return c.json(
          { error: { code: "invalid_origin", message: "Origen no permitido." } },
          403
        );
      }
    }

    const token =
      c.req.header("x-dcv-token") ?? new URL(c.req.url).searchParams.get("token");
    if (token !== security.token) {
      return c.json(
        { error: { code: "unauthorized", message: "Token de sesión inválido o ausente." } },
        401
      );
    }

    return next();
  };
}

function hostnameOf(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    return url.hostname;
  } catch {
    return null;
  }
}

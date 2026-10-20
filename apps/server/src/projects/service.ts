import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import {
  ProjectImportRequestSchema,
  type ImportProjectResult,
  type Project,
  type ProjectImportRequest,
  type ProjectWarning
} from "@dcv/shared";
import { ensureDataLayout, projectRepoPath } from "../config.js";
import { AppError } from "../errors.js";
import {
  cloneBare,
  validateGitUrl,
  type CloneOptions,
  type CloneProgress
} from "../git/clone.js";
import {
  branchExists,
  canonicalizeLocalRepository,
  hasAnalyzableTypeScript,
  listBranches,
  refreshRepository,
  repositoryBranches
} from "../git/repo.js";
import { ProjectRegistry } from "./registry.js";

type CloneFunction = (options: CloneOptions) => Promise<void>;

export interface ProjectServiceOptions {
  dataDir: string;
  registry?: ProjectRegistry;
  now?: () => Date;
  newId?: () => string;
  clone?: CloneFunction;
  cloneAllowedProtocols?: string[];
}

export class ProjectService {
  readonly dataDir: string;
  readonly registry: ProjectRegistry;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly clone: CloneFunction;
  private readonly cloneAllowedProtocols: string[] | undefined;

  constructor(options: ProjectServiceOptions) {
    this.dataDir = options.dataDir;
    this.registry =
      options.registry ?? new ProjectRegistry(join(options.dataDir, "projects.json"));
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => randomUUID());
    this.clone = options.clone ?? cloneBare;
    this.cloneAllowedProtocols = options.cloneAllowedProtocols;
  }

  async init(): Promise<void> {
    await ensureDataLayout(this.dataDir);
    await this.registry.init();
  }

  async list(): Promise<Project[]> {
    return this.registry.list();
  }

  async importProject(
    request: ProjectImportRequest,
    onProgress?: (progress: CloneProgress) => void
  ): Promise<ImportProjectResult> {
    const parsed = ProjectImportRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new AppError("invalid_request", "La solicitud de importación no es válida.", 400, {
        issues: parsed.error.issues
      });
    }
    await ensureDataLayout(this.dataDir);

    if (parsed.data.source === "local") {
      return this.importLocalPath(parsed.data.location, parsed.data.branch);
    }
    return this.importRemoteUrl(parsed.data.location, parsed.data.branch, onProgress);
  }

  async remove(id: string): Promise<Project> {
    const project = await this.requireProject(id);

    if (project.managed) {
      this.assertManagedRepoPath(project);
      await rm(project.repoPath, { recursive: true, force: true });
    }

    const removed = await this.registry.remove(id);
    if (!removed) {
      throw new AppError("project_not_found", "El proyecto no existe.", 404, { projectId: id });
    }
    return removed;
  }

  async setBranch(id: string, branch: string): Promise<Project> {
    const project = await this.requireProject(id);
    if (!(await branchExists(project.repoPath, branch))) {
      throw new AppError("branch_not_found", `La rama "${branch}" no existe.`, 404, { branch });
    }
    return this.registry.update(id, { branch });
  }

  async refresh(id: string): Promise<Project> {
    const project = await this.requireProject(id);
    try {
      await refreshRepository(project.repoPath, project.managed);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("refresh_failed", "No se pudieron actualizar las referencias.", 422);
    }
    return project;
  }

  async branches(id: string): Promise<string[]> {
    const project = await this.requireProject(id);
    return listBranches(project.repoPath);
  }

  async markOpened(id: string, lastCommit?: string): Promise<Project> {
    return this.registry.update(id, {
      lastOpenedAt: this.now().toISOString(),
      ...(lastCommit === undefined ? {} : { lastCommit })
    });
  }

  async get(id: string): Promise<Project> {
    return this.requireProject(id);
  }

  private async importLocalPath(
    location: string,
    requestedBranch: string | undefined
  ): Promise<ImportProjectResult> {
    const repoPath = await canonicalizeLocalRepository(location);
    const projects = await this.registry.list();
    const duplicate = projects.find((project) => project.repoPath === repoPath);
    if (duplicate) {
      throw this.duplicateError(duplicate);
    }

    const { branches, defaultBranch } = await repositoryBranches(repoPath);
    const branch = requestedBranch ?? defaultBranch;
    if (!branches.includes(branch)) {
      throw new AppError("branch_not_found", `La rama "${branch}" no existe.`, 404, { branch });
    }

    const hasTypeScript = await hasAnalyzableTypeScript(repoPath, branch);
    const project: Project = {
      id: this.newId(),
      name: basename(repoPath) || "proyecto",
      sourceType: "local",
      location: repoPath,
      repoPath,
      branch,
      defaultBranch,
      createdAt: this.now().toISOString(),
      lastOpenedAt: null,
      managed: false,
      lastCommit: null
    };

    await this.registry.add(project);
    return {
      project,
      warnings: hasTypeScript ? [] : [noTypeScriptWarning()]
    };
  }

  private async importRemoteUrl(
    location: string,
    requestedBranch: string | undefined,
    onProgress?: (progress: CloneProgress) => void
  ): Promise<ImportProjectResult> {
    const normalizedUrl = validateGitUrl(location, this.cloneAllowedProtocols);
    const projects = await this.registry.list();
    const duplicate = projects.find(
      (project) => project.sourceType === "url" && project.location === normalizedUrl
    );
    if (duplicate) {
      throw this.duplicateError(duplicate);
    }

    const projectId = this.newId();
    const repoPath = projectRepoPath(this.dataDir, projectId);

    try {
      await this.clone({
        url: normalizedUrl,
        destination: repoPath,
        onProgress,
        allowedProtocols: this.cloneAllowedProtocols
      });

      const { branches, defaultBranch } = await repositoryBranches(repoPath);
      const branch = requestedBranch ?? defaultBranch;
      if (!branches.includes(branch)) {
        throw new AppError("branch_not_found", `La rama "${branch}" no existe.`, 404, {
          branch
        });
      }

      const hasTypeScript = await hasAnalyzableTypeScript(repoPath, branch);
      const project: Project = {
        id: projectId,
        name: projectNameFromUrl(normalizedUrl),
        sourceType: "url",
        location: normalizedUrl,
        repoPath,
        branch,
        defaultBranch,
        createdAt: this.now().toISOString(),
        lastOpenedAt: null,
        managed: true,
        lastCommit: null
      };

      await this.registry.add(project);
      return {
        project,
        warnings: hasTypeScript ? [] : [noTypeScriptWarning()]
      };
    } catch (error) {
      await rm(repoPath, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async requireProject(id: string): Promise<Project> {
    const project = await this.registry.get(id);
    if (!project) {
      throw new AppError("project_not_found", "El proyecto no existe.", 404, { projectId: id });
    }
    return project;
  }

  private duplicateError(project: Project): AppError {
    return new AppError(
      "project_exists",
      "El proyecto ya está registrado en la biblioteca.",
      409,
      { projectId: project.id, name: project.name }
    );
  }

  private assertManagedRepoPath(project: Project): void {
    const root = resolve(this.dataDir, "repos");
    const target = resolve(project.repoPath);
    const relativePath = relative(root, target);
    if (
      relativePath.length === 0 ||
      relativePath.startsWith("..") ||
      resolve(root, relativePath) !== target ||
      basename(target) !== project.id
    ) {
      throw new AppError(
        "unsafe_repo_path",
        "La copia gestionada del proyecto no está en una ubicación segura.",
        500
      );
    }
  }
}

function noTypeScriptWarning(): ProjectWarning {
  return {
    code: "no_typescript",
    message:
      "El repositorio no contiene archivos TypeScript analizables en la rama seleccionada."
  };
}

function projectNameFromUrl(input: string): string {
  try {
    const url = new URL(input);
    const candidate = basename(decodeURIComponent(url.pathname));
    return stripGitSuffix(candidate) || url.hostname;
  } catch {
    const candidate = input.split(/[/:]/).filter((part) => part.length > 0).at(-1) ?? "";
    return stripGitSuffix(candidate) || "proyecto";
  }
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/, "");
}

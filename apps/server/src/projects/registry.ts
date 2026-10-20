import { ProjectSchema, type Project } from "@dcv/shared";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { AppError } from "../errors.js";
import { writeJsonAtomic } from "../fs/atomic.js";

const REGISTRY_VERSION = 1;

const RegistrySchema = z.object({
  version: z.literal(REGISTRY_VERSION),
  projects: z.array(ProjectSchema)
});

export type ProjectPatch = Partial<Omit<Project, "id" | "createdAt">>;

export class ProjectRegistry {
  private projects: Project[] | null = null;
  private tail: Promise<void> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async init(): Promise<void> {
    await this.run(async () => {
      await this.loadUnlocked();
    });
  }

  async list(): Promise<Project[]> {
    return this.run(async () => {
      const projects = await this.loadUnlocked();
      return projects.map((project) => ({ ...project }));
    });
  }

  async get(id: string): Promise<Project | null> {
    return this.run(async () => {
      const projects = await this.loadUnlocked();
      const project = projects.find((candidate) => candidate.id === id);
      return project ? { ...project } : null;
    });
  }

  async add(project: Project): Promise<Project> {
    return this.run(async () => {
      const projects = await this.loadUnlocked();
      if (projects.some((candidate) => candidate.id === project.id)) {
        throw new AppError("project_exists", "El proyecto ya está registrado.", 409, {
          projectId: project.id
        });
      }
      const next = [...projects, project];
      await this.persist(next);
      this.projects = next;
      return { ...project };
    });
  }

  async update(id: string, patch: ProjectPatch): Promise<Project> {
    return this.run(async () => {
      const projects = await this.loadUnlocked();
      const index = projects.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        throw new AppError("project_not_found", "El proyecto no existe.", 404, { projectId: id });
      }
      const updated: Project = { ...projects[index]!, ...patch, id, createdAt: projects[index]!.createdAt };
      const next = projects.map((project, projectIndex) =>
        projectIndex === index ? updated : project
      );
      await this.persist(next);
      this.projects = next;
      return { ...updated };
    });
  }

  async remove(id: string): Promise<Project | null> {
    return this.run(async () => {
      const projects = await this.loadUnlocked();
      const project = projects.find((candidate) => candidate.id === id);
      if (!project) {
        return null;
      }
      const next = projects.filter((candidate) => candidate.id !== id);
      await this.persist(next);
      this.projects = next;
      return { ...project };
    });
  }

  private run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action, action);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async loadUnlocked(): Promise<Project[]> {
    if (this.projects) {
      return this.projects;
    }

    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.projects = [];
        return this.projects;
      }
      throw new AppError(
        "registry_unreadable",
        "No se pudo leer el registro de proyectos.",
        500,
        { path: this.filePath }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError(
        "registry_corrupt",
        "El registro de proyectos está dañado y no se puede leer.",
        500,
        { path: this.filePath }
      );
    }

    const result = RegistrySchema.safeParse(parsed);
    if (!result.success) {
      throw new AppError(
        "registry_corrupt",
        "El registro de proyectos tiene un formato inválido.",
        500,
        { path: this.filePath, issues: result.error.issues }
      );
    }

    this.projects = result.data.projects;
    return this.projects;
  }

  private async persist(projects: Project[]): Promise<void> {
    try {
      await writeJsonAtomic(this.filePath, {
        version: REGISTRY_VERSION,
        projects
      });
    } catch (error) {
      throw new AppError(
        "registry_write_failed",
        "No se pudo guardar el registro de proyectos.",
        500,
        { path: this.filePath, cause: error instanceof Error ? error.message : String(error) }
      );
    }
  }
}

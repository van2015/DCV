import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.js";
import { AppStore } from "./store.js";
import {
  FakeClient,
  MemoryStorage,
  makeCommit,
  makeModel,
  makeProject
} from "../test/fakes.js";

async function setup(options: {
  projects?: ReturnType<typeof makeProject>[];
  commits?: Record<string, ReturnType<typeof makeCommit>[]>;
  models?: Record<string, ReturnType<typeof makeModel>>;
  storage?: MemoryStorage;
} = {}) {
  const client = new FakeClient({
    projects: options.projects ?? [],
    commits: options.commits ?? {},
    models: options.models ?? {}
  });
  const storage = options.storage ?? new MemoryStorage();
  const store = new AppStore(client, { storage });
  return { client, store, storage };
}

describe("AppStore", () => {
  it("carga la biblioteca y expone errores", async () => {
    const { client, store } = await setup({ projects: [makeProject()] });
    await store.loadProjects();
    expect(store.getState().libraryStatus).toBe("ready");
    expect(store.getState().projects).toHaveLength(1);

    client.errors.listProjects = new ApiError("registry_unreadable", "No se pudo leer", 500);
    await store.loadProjects();
    expect(store.getState().libraryStatus).toBe("error");
    expect(store.getState().libraryError).toBe("No se pudo leer");
  });

  it("restaura el último commit visitado o el más antiguo", async () => {
    const commits = [
      makeCommit("c1", "primero"),
      makeCommit("c2", "segundo", ["c1"]),
      makeCommit("c3", "tercero", ["c2"])
    ];
    const project = makeProject({ lastCommit: "c2" });
    const { store } = await setup({ projects: [project], commits: { p1: commits } });

    await store.openProject("p1");
    await vi.waitFor(() => expect(store.getState().modelStatus).toBe("ready"));

    expect(store.getState().selectedSha).toBe("c2");
    expect(store.getState().model?.commit.sha).toBe("c2");

    const fresh = makeProject({ id: "p2", lastCommit: "desconocido" });
    const second = new FakeClient({
      projects: [fresh],
      commits: { p2: commits }
    });
    const store2 = new AppStore(second, { storage: new MemoryStorage() });
    await store2.openProject("p2");
    expect(store2.getState().selectedSha).toBe("c1");
  });

  it("registra el progreso de importación y cierra el diálogo al terminar", async () => {
    const { client, store } = await setup();
    let release!: () => void;
    client.importGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = store.importProject({ source: "local", location: "/tmp/repo" });
    client.emit({
      type: "import:progress",
      projectId: null,
      message: "Clonando…",
      progress: 0.4
    });

    expect(store.getState().importState).toMatchObject({
      status: "loading",
      message: "Clonando…",
      progress: 0.4
    });

    release();
    const project = await pending;

    expect(project?.id).toBe("imported");
    expect(store.getState().importState.open).toBe(false);
    expect(store.getState().projects.map((item) => item.id)).toContain("imported");
  });

  it("traduce los errores de importación duplicada", async () => {
    const { client, store } = await setup();
    client.importError = new ApiError("project_exists", "duplicado", 409);

    const result = await store.importProject({ source: "local", location: "/tmp/repo" });

    expect(result).toBeNull();
    expect(store.getState().importState).toMatchObject({
      status: "error",
      error: "Este proyecto ya está registrado en la biblioteca."
    });
  });

  it("persiste la vista elegida por proyecto", async () => {
    const commits = [makeCommit("c1", "inicial")];
    const storage = new MemoryStorage();
    const project = makeProject();
    const { store } = await setup({
      storage,
      projects: [project],
      commits: { p1: commits }
    });
    await store.openProject("p1");
    await vi.waitFor(() => expect(store.getState().modelStatus).toBe("ready"));

    store.setView("packages");
    expect(storage.getItem("dcv.view:p1")).toBe("packages");

    const second = new AppStore(
      new FakeClient({ projects: [project], commits: { p1: commits } }),
      { storage }
    );
    await second.openProject("p1");
    expect(second.getState().view).toBe("packages");
  });

  it("autoselecciona la vista según el contenido cuando no hay elección previa", async () => {
    const commits = [makeCommit("c1", "inicial")];
    const project = makeProject();
    const model = makeModel(commits[0]!);
    const functional = makeModel(commits[0]!, {
      snapshot: {
        ...model.snapshot,
        stats: { ...model.snapshot.stats, files: 2, functions: 3 }
      }
    });
    const { store } = await setup({
      projects: [project],
      commits: { p1: commits },
      models: { "p1:c1": functional }
    });

    await store.openProject("p1");
    await vi.waitFor(() => expect(store.getState().modelStatus).toBe("ready"));

    expect(store.getState().view).toBe("modules");
  });

  it("persiste los controles visuales y el token de re-layout", async () => {
    const commits = [makeCommit("c1", "inicial")];
    const project = makeProject();
    const storage = new MemoryStorage();
    const { store } = await setup({
      storage,
      projects: [project],
      commits: { p1: commits }
    });
    await store.openProject("p1");

    store.toggleMembers();
    store.setFocusEnabled(true);
    store.setFocusDepth(9);
    store.toggleFocusHide();
    store.toggleFolder("src/util");
    store.requestRelayout();

    expect(store.getState().visualControls).toEqual({
      showMembers: false,
      focusEnabled: true,
      focusDepth: 3,
      focusHide: true,
      collapsedFolders: ["src/util"]
    });
    expect(store.getState().relayoutToken).toBe(1);

    const second = new AppStore(
      new FakeClient({ projects: [project], commits: { p1: commits } }),
      { storage }
    );
    await second.openProject("p1");
    expect(second.getState().visualControls).toEqual({
      showMembers: false,
      focusEnabled: true,
      focusDepth: 3,
      focusHide: true,
      collapsedFolders: ["src/util"]
    });
    expect(second.getState().relayoutToken).toBe(0);

    second.toggleFolder("src/util");
    expect(second.getState().visualControls.collapsedFolders).toEqual([]);
  });

  it("al eliminar el proyecto activo vuelve a la biblioteca", async () => {
    const project = makeProject();
    const { store } = await setup({
      projects: [project],
      commits: { p1: [makeCommit("c1", "inicial")] }
    });
    await store.openProject("p1");
    expect(store.getState().activeProject?.id).toBe("p1");

    await store.deleteProject("p1");

    expect(store.getState().activeProject).toBeNull();
    expect(store.getState().projects).toEqual([]);
  });
});

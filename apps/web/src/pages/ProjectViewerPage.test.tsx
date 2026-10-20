import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { DeclarationModel, SnapshotDeclaration } from "@dcv/shared";
import { App } from "../App.js";
import { AppStore } from "../state/store.js";
import {
  FakeClient,
  MemoryStorage,
  makeCommit,
  makeModel,
  makeProject
} from "../test/fakes.js";

function renderViewer(client: FakeClient) {
  const store = new AppStore(client, { storage: new MemoryStorage() });
  render(
    <MemoryRouter initialEntries={["/projects/p1"]}>
      <App store={store} />
    </MemoryRouter>
  );
  return store;
}

function asModel(declaration: SnapshotDeclaration): DeclarationModel {
  const { id: _id, path: _path, ...model } = declaration;
  return model;
}

describe("ProjectViewerPage", () => {
  it("muestra un estado vacío cuando el commit no tiene archivos analizables", async () => {
    const commit = makeCommit("c1", "inicial");
    renderViewer(
      new FakeClient({
        projects: [makeProject()],
        commits: { p1: [commit] },
        models: { "p1:c1": makeModel(commit) }
      })
    );

    expect(await screen.findByText("Sin estructura para visualizar")).toBeInTheDocument();
    expect(screen.getByText(/no contiene archivos TypeScript analizables/)).toBeInTheDocument();
  });

  it("avisa cuando el modelo está incompleto por errores de sintaxis", async () => {
    const commit = makeCommit("c1", "inicial");
    renderViewer(
      new FakeClient({
        projects: [makeProject()],
        commits: { p1: [commit] },
        models: {
          "p1:c1": makeModel(commit, {
            diagnostics: [
              {
                severity: "error",
                code: "parse_error",
                message: "Unexpected token",
                path: "src/broken.ts",
                line: 3
              }
            ]
          })
        }
      })
    );

    const warning = await screen.findByText(/Modelo incompleto/);
    expect(warning).toHaveTextContent("1 archivo con errores de sintaxis");
  });

  it("permite abrir una clase desde la vista de módulos", async () => {
    const commit = makeCommit("c1", "inicial");
    const base = makeModel(commit);
    const declaration = {
      id: "src/service.ts#class:Service",
      path: "src/service.ts",
      kind: "class" as const,
      name: "Service",
      exported: true,
      defaultExport: false,
      abstract: false,
      declare: false,
      async: false,
      signature: null,
      type: null,
      members: [],
      heritage: [],
      bodyHash: null,
      sourceRange: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 }
    };
    const withClass = makeModel(commit, {
      snapshot: {
        ...base.snapshot,
        files: [
          {
            path: "src/service.ts",
            contentHash: "hash",
            scriptKind: "ts",
            imports: [],
            declarations: [declaration],
            diagnostics: []
          }
        ],
        stats: { ...base.snapshot.stats, files: 1, declarations: 1, classes: 1 }
      }
    });
    renderViewer(
      new FakeClient({
        projects: [makeProject()],
        commits: { p1: [commit] },
        models: { "p1:c1": withClass }
      })
    );
    const user = userEvent.setup();

    expect(await screen.findByLabelText("class Service")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Vista"), "modules");
    await screen.findByLabelText("módulo src/service.ts");
    fireEvent.click(screen.getByTitle("Abrir class Service en la vista de clases"));

    expect(screen.getByLabelText("Vista")).toHaveValue("classes");
    expect(await screen.findByLabelText("class Service")).toBeInTheDocument();
  });

  it("resalta cambios, muestra fantasmas, enfoca desde el panel y conserva filtros", async () => {
    const commits = [makeCommit("c1", "inicial"), makeCommit("c2", "cambio", ["c1"])];
    const base = makeModel(commits[0]!);
    const range = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };
    const member = {
      kind: "method" as const,
      name: "run",
      visibility: "public" as const,
      static: false,
      readonly: false,
      optional: false,
      abstract: false,
      async: false,
      signature: "run(): void",
      type: "void",
      bodyHash: "body",
      sourceRange: range
    };
    const service = {
      id: "src/service.ts#class:Service",
      path: "src/service.ts",
      kind: "class" as const,
      name: "Service",
      exported: true,
      defaultExport: false,
      abstract: false,
      declare: false,
      async: false,
      signature: null,
      type: null,
      members: [member, { ...member, name: "paint", signature: "paint(): void" }],
      heritage: [],
      bodyHash: null,
      sourceRange: range
    };
    const added = {
      ...service,
      id: "src/new.ts#class:New",
      path: "src/new.ts",
      name: "New"
    };
    const old = { ...service, id: "src/old.ts#class:Old", path: "src/old.ts", name: "Old" };
    const snapshot = {
      ...base.snapshot,
      files: [
        {
          path: "src/service.ts",
          contentHash: "h1",
          scriptKind: "ts" as const,
          imports: [],
          declarations: [service],
          diagnostics: []
        },
        {
          path: "src/new.ts",
          contentHash: "h2",
          scriptKind: "ts" as const,
          imports: [],
          declarations: [added],
          diagnostics: []
        }
      ],
      stats: { ...base.snapshot.stats, files: 2, declarations: 2, classes: 2 }
    };
    const diff = {
      from: "c1",
      to: "c2",
      isEmpty: false,
      files: [],
      declarations: [
        {
          status: "added" as const,
          id: added.id,
          previousId: null,
          kind: "class" as const,
          name: "New",
          path: added.path,
          previousPath: null,
          probable: false,
          declaration: asModel(added),
          previousDeclaration: null
        },
        {
          status: "removed" as const,
          id: old.id,
          previousId: old.id,
          kind: "class" as const,
          name: "Old",
          path: old.path,
          previousPath: old.path,
          probable: false,
          declaration: null,
          previousDeclaration: asModel(old)
        }
      ],
      members: [
        {
          status: "body-only" as const,
          parentId: service.id,
          parentName: "Service",
          parentKind: "class" as const,
          parentPath: service.path,
          memberKey: "method:paint",
          member: service.members[1]!,
          previousMember: { ...service.members[1]!, bodyHash: "old" },
          probable: false
        }
      ],
      edges: []
    };
    const model = makeModel(commits[0]!, { snapshot, diff });
    renderViewer(
      new FakeClient({
        projects: [makeProject()],
        commits: { p1: commits },
        models: { "p1:c1": model, "p1:c2": model }
      })
    );
    const user = userEvent.setup();

    const serviceCard = await screen.findByLabelText("class Service");
    expect(serviceCard.querySelector(".status-body-only")).toHaveTextContent("≈");
    const addedCard = screen.getByLabelText("class New");
    expect(addedCard).toHaveClass("change-added");
    expect(addedCard.querySelector(".change-badge")).toHaveTextContent("+");
    const removedCard = screen.getByLabelText("class Old (eliminado)");
    expect(removedCard).toHaveClass("change-removed");
    expect(removedCard).toHaveClass("ghost");
    expect(removedCard.querySelector(".change-badge")).toHaveTextContent("−");

    await user.click(screen.getByText("Clase Old"));
    await waitFor(() => {
      const ghostWrapper = screen
        .getByLabelText("class Old (eliminado)")
        .closest(".react-flow__node")!;
      expect(ghostWrapper.classList.contains("focused")).toBe(true);
    });

    await user.click(screen.getByLabelText("Cambios de implementación"));
    await waitFor(() =>
      expect(screen.queryByText("Solo cuerpo")).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText("class Service").querySelector(".status-body-only")
      ).toBeNull()
    );

    await user.click(screen.getByRole("button", { name: "Siguiente →" }));
    await screen.findByRole("heading", { name: "cambio" });
    expect(screen.getByLabelText("Cambios de implementación")).not.toBeChecked();
  });

  it("autoselecciona la vista de módulos y permite cambiarla sin mover el commit", async () => {
    const commit = makeCommit("c1", "inicial");
    const model = makeModel(commit);
    const functional = makeModel(commit, {
      snapshot: {
        ...model.snapshot,
        stats: { ...model.snapshot.stats, files: 1, functions: 2 }
      }
    });
    renderViewer(
      new FakeClient({
        projects: [makeProject()],
        commits: { p1: [commit] },
        models: { "p1:c1": functional }
      })
    );
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "inicial" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Vista")).toHaveValue("modules"));

    await user.selectOptions(screen.getByLabelText("Vista"), "packages");

    expect(screen.getByLabelText("Vista")).toHaveValue("packages");
    expect(screen.getByRole("heading", { name: "inicial" })).toBeInTheDocument();
  });
});

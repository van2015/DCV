import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import { AppStore } from "./state/store.js";
import { FakeClient, MemoryStorage, makeCommit, makeProject } from "./test/fakes.js";

function renderApp(
  options: {
    projects?: ReturnType<typeof makeProject>[];
    commits?: Record<string, ReturnType<typeof makeCommit>[]>;
  } = {},
  initialEntries: string[] = ["/"]
) {
  const client = new FakeClient({
    projects: options.projects ?? [],
    commits: options.commits ?? {}
  });
  const store = new AppStore(client, { storage: new MemoryStorage() });
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <App store={store} />
    </MemoryRouter>
  );
  return { client, store };
}

describe("App", () => {
  it("muestra el título y el estado vacío de la biblioteca", async () => {
    renderApp();
    expect(screen.getByRole("heading", { name: "DCV" })).toBeInTheDocument();
    expect(await screen.findByText(/No hay proyectos todavía/)).toBeInTheDocument();
  });

  it("abre la ruta de un proyecto y muestra su nombre", async () => {
    const project = makeProject({ name: "mi-proyecto" });
    renderApp(
      { projects: [project], commits: { p1: [makeCommit("c1", "inicial")] } },
      ["/projects/p1"]
    );

    expect(await screen.findByRole("heading", { name: "mi-proyecto" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Histórico de commits")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Biblioteca/ })).toBeInTheDocument();
  });

  it("redirige rutas desconocidas a la biblioteca", async () => {
    renderApp({}, ["/ruta/inexistente"]);
    expect(await screen.findByText(/No hay proyectos todavía/)).toBeInTheDocument();
  });
});

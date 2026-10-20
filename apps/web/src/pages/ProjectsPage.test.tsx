import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.js";
import { App } from "../App.js";
import { AppStore } from "../state/store.js";
import { FakeClient, MemoryStorage, makeProject } from "../test/fakes.js";

function renderLibrary(client: FakeClient) {
  const store = new AppStore(client, { storage: new MemoryStorage() });
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App store={store} />
    </MemoryRouter>
  );
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProjectsPage", () => {
  it("lista los proyectos y permite eliminarlos", async () => {
    (window as unknown as { confirm: () => boolean }).confirm = () => true;
    const client = new FakeClient({
      projects: [
        makeProject({ id: "p1", name: "alpha" }),
        makeProject({ id: "p2", name: "beta", branch: "dev", sourceType: "url" })
      ]
    });
    renderLibrary(client);

    expect(await screen.findByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("remoto")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Eliminar" })[0]!);

    await waitFor(() => expect(screen.queryByText("alpha")).not.toBeInTheDocument());
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(client.projects.map((project) => project.id)).toEqual(["p2"]);
  });

  it("muestra el error de la biblioteca y permite reintentar", async () => {
    const client = new FakeClient({ projects: [makeProject({ name: "recuperado" })] });
    client.errors.listProjects = new ApiError("registry_unreadable", "Fallo de registro", 500);
    renderLibrary(client);

    expect(await screen.findByRole("alert")).toHaveTextContent("Fallo de registro");

    client.errors.listProjects = undefined;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("recuperado")).toBeInTheDocument();
  });
});

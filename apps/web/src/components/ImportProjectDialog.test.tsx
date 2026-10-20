import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client.js";
import { App } from "../App.js";
import { AppStore } from "../state/store.js";
import { FakeClient, MemoryStorage } from "../test/fakes.js";

function renderApp(client: FakeClient) {
  const store = new AppStore(client, { storage: new MemoryStorage() });
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App store={store} />
    </MemoryRouter>
  );
  return store;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, location = "/tmp/repo") {
  await user.click(await screen.findByRole("button", { name: "Importar proyecto" }));
  await user.type(screen.getByLabelText(/Ubicación/), location);
}

describe("ImportProjectDialog", () => {
  it("importa un proyecto mostrando progreso y cierra al terminar", async () => {
    const client = new FakeClient();
    let release!: () => void;
    client.importGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderApp(client);
    const user = userEvent.setup();

    await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByText(/Iniciando importación/)).toBeInTheDocument();

    act(() => {
      client.emit({
        type: "import:progress",
        projectId: null,
        message: "Clonando…",
        progress: 0.42
      });
    });

    expect(await screen.findByText(/Clonando… \(42%\)/)).toBeInTheDocument();
    expect(client.importCalls[0]).toEqual({ source: "local", location: "/tmp/repo" });

    act(() => {
      release();
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("importado")).toBeInTheDocument();
  });

  it("envía origen URL y rama opcional", async () => {
    const client = new FakeClient();
    renderApp(client);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Importar proyecto" }));
    await user.selectOptions(screen.getByLabelText("Origen"), "url");
    await user.type(
      screen.getByLabelText(/Ubicación/),
      "https://example.com/repo.git"
    );
    await user.type(screen.getByLabelText(/Rama/), "dev");
    await user.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() => expect(client.importCalls).toHaveLength(1));
    expect(client.importCalls[0]).toEqual({
      source: "url",
      location: "https://example.com/repo.git",
      branch: "dev"
    });
  });

  it("muestra el error cuando el proyecto ya existe", async () => {
    const client = new FakeClient();
    client.importError = new ApiError("project_exists", "duplicado", 409);
    renderApp(client);
    const user = userEvent.setup();

    await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este proyecto ya está registrado en la biblioteca."
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

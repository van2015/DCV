import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client.js";
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

function historyList() {
  return within(screen.getByLabelText("Histórico de commits"));
}

describe("CommitPlayer", () => {
  it("navega con anterior/siguiente y salta desde el timeline", async () => {
    const commits = [
      makeCommit("c1", "primero"),
      makeCommit("c2", "segundo", ["c1"]),
      makeCommit("c3", "tercero", ["c2"])
    ];
    const client = new FakeClient({
      projects: [makeProject()],
      commits: { p1: commits }
    });
    renderViewer(client);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "primero" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Siguiente →" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Siguiente →" }));
    expect(await screen.findByRole("heading", { name: "segundo" })).toBeInTheDocument();

    await user.click(historyList().getByRole("button", { name: /tercero/ }));
    expect(await screen.findByRole("heading", { name: "tercero" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente →" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "← Anterior" })).toBeEnabled();
  });

  it("indica línea base y commits sin cambios estructurales", async () => {
    const commits = [
      makeCommit("c1", "primero"),
      makeCommit("c2", "segundo", ["c1"]),
      makeCommit("c3", "tercero", ["c2"])
    ];
    const base = makeModel(commits[1]!);
    const client = new FakeClient({
      projects: [makeProject()],
      commits: { p1: commits },
      models: {
        "p1:c1": makeModel(commits[0]!),
        "p1:c2": makeModel(commits[1]!, {
          diff: { ...base.diff, from: "c1", isEmpty: true }
        }),
        "p1:c3": makeModel(commits[2]!, {
          diff: {
            ...base.diff,
            from: "c2",
            isEmpty: false,
            files: [
              { status: "added", path: "src/new.ts", previousPath: null, probable: false }
            ]
          }
        })
      }
    });
    renderViewer(client);
    const user = userEvent.setup();

    expect(await screen.findByText("Línea base del histórico.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Siguiente →" }));
    expect(
      (await screen.findAllByText("Sin cambios estructurales de TypeScript en este commit."))
        .length
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Siguiente →" }));
    await screen.findByRole("heading", { name: "tercero" });
    expect(
      screen.queryAllByText("Sin cambios estructurales de TypeScript en este commit.")
    ).toHaveLength(0);
  });

  it("actualiza el histórico conservando la selección existente", async () => {
    const commits = [
      makeCommit("c1", "primero"),
      makeCommit("c2", "segundo", ["c1"])
    ];
    const client = new FakeClient({
      projects: [makeProject()],
      commits: { p1: commits }
    });
    renderViewer(client);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "primero" })).toBeInTheDocument();

    client.commits.p1 = [...commits, makeCommit("c3", "tercero", ["c2"])];
    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    expect(await historyList().findByRole("button", { name: /tercero/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "primero" })).toBeInTheDocument();
  });

  it("cambia de rama y muestra los errores de histórico", async () => {
    const commits = [makeCommit("c1", "primero")];
    const client = new FakeClient({
      projects: [makeProject()],
      commits: { p1: commits },
      branches: { p1: ["main", "dev"] }
    });
    renderViewer(client);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "primero" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Rama"), "dev");
    await waitFor(() =>
      expect(client.projects[0]!.branch).toBe("dev")
    );

    client.errors.listCommits = new ApiError("branch_not_found", "Rama inexistente", 404);
    await user.selectOptions(screen.getByLabelText("Rama"), "main");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La rama indicada no existe."
    );
  });
});

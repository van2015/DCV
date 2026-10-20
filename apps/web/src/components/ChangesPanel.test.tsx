import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SnapshotDiff } from "@dcv/shared";
import { ChangesPanel } from "./ChangesPanel.js";
import { DEFAULT_CHANGE_FILTERS, type ChangeFilters } from "../diagram/overlay.js";

const baseDiff: SnapshotDiff = {
  from: "c1",
  to: "c2",
  isEmpty: false,
  files: [],
  declarations: [
    {
      status: "added",
      id: "src/new.ts#class:New",
      previousId: null,
      kind: "class",
      name: "New",
      path: "src/new.ts",
      previousPath: null,
      probable: false,
      declaration: null,
      previousDeclaration: null
    },
    {
      status: "body-only",
      id: "src/util.ts#function:helper",
      previousId: null,
      kind: "function",
      name: "helper",
      path: "src/util.ts",
      previousPath: null,
      probable: false,
      declaration: null,
      previousDeclaration: null
    }
  ],
  members: [
    {
      status: "modified",
      parentId: "src/new.ts#class:New",
      parentName: "New",
      parentKind: "class",
      parentPath: "src/new.ts",
      memberKey: "method:run",
      member: {
        kind: "method",
        name: "run",
        visibility: "public",
        static: false,
        readonly: false,
        optional: false,
        abstract: false,
        async: false,
        signature: "run(): void",
        type: "void",
        bodyHash: null,
        sourceRange: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 }
      },
      previousMember: null,
      probable: true
    }
  ],
  edges: [
    {
      status: "added",
      kind: "imports",
      from: "module:src/util.ts",
      to: "module:src/new.ts",
      fromPath: "src/util.ts",
      toPath: "src/new.ts"
    }
  ]
};

function renderPanel(diff = baseDiff, filters: ChangeFilters = DEFAULT_CHANGE_FILTERS) {
  const onFocus = vi.fn();
  const view = render(<ChangesPanel diff={diff} filters={filters} onFocus={onFocus} />);
  return { onFocus, view };
}

describe("ChangesPanel", () => {
  it("agrupa los cambios y enfoca el elemento al seleccionarlo", async () => {
    const { onFocus } = renderPanel();
    const user = userEvent.setup();

    expect(screen.getByText("Añadidos")).toBeInTheDocument();
    expect(screen.getByText("Solo cuerpo")).toBeInTheDocument();
    expect(screen.getByText("Modificados")).toBeInTheDocument();
    expect(screen.getByText("Clase New")).toBeInTheDocument();
    expect(screen.getByText("Clase New.run")).toBeInTheDocument();

    const additions = screen.getByText("Añadidos").closest("section")!;
    await user.click(within(additions).getByRole("button", { name: /Clase New/ }));

    expect(onFocus).toHaveBeenCalledWith(
      expect.objectContaining({ view: "classes", targetId: "src/new.ts#class:New" })
    );

    const imports = screen.getByText("Importación src/util.ts → src/new.ts").closest("button")!;
    await user.click(imports);
    expect(onFocus).toHaveBeenCalledWith(
      expect.objectContaining({ view: "modules", targetId: "module:src/util.ts" })
    );
  });

  it("respeta los filtros de implementación, miembros y tipos", () => {
    const { view } = renderPanel(baseDiff, {
      ...DEFAULT_CHANGE_FILTERS,
      implementation: false
    });
    expect(screen.queryByText("Solo cuerpo")).not.toBeInTheDocument();
    expect(screen.queryByText("Función helper")).not.toBeInTheDocument();

    view.rerender(
      <ChangesPanel
        diff={baseDiff}
        filters={{ ...DEFAULT_CHANGE_FILTERS, members: false }}
        onFocus={vi.fn()}
      />
    );
    expect(screen.queryByText("Clase New.run")).not.toBeInTheDocument();

    const withInterface: SnapshotDiff = {
      ...baseDiff,
      declarations: [
        ...baseDiff.declarations,
        {
          status: "modified",
          id: "src/ports.ts#interface:Port",
          previousId: "src/ports.ts#interface:Port",
          kind: "interface",
          name: "Port",
          path: "src/ports.ts",
          previousPath: "src/ports.ts",
          probable: false,
          declaration: null,
          previousDeclaration: null
        }
      ]
    };
    view.rerender(
      <ChangesPanel
        diff={withInterface}
        filters={{ ...DEFAULT_CHANGE_FILTERS, types: false }}
        onFocus={vi.fn()}
      />
    );
    expect(screen.queryByText("Interfaz Port")).not.toBeInTheDocument();
  });

  it("indica commits sin cambios y filtros sin coincidencias", () => {
    const { view } = renderPanel({
      from: "c1",
      to: "c2",
      isEmpty: true,
      files: [],
      declarations: [],
      members: [],
      edges: []
    });
    expect(
      screen.getByText("Sin cambios estructurales de TypeScript en este commit.")
    ).toBeInTheDocument();

    view.rerender(
      <ChangesPanel
        diff={{
          ...baseDiff,
          declarations: [baseDiff.declarations[1]!],
          members: [],
          edges: []
        }}
        filters={{ ...DEFAULT_CHANGE_FILTERS, implementation: false }}
        onFocus={vi.fn()}
      />
    );
    expect(
      screen.getByText("Ningún cambio coincide con los filtros activos.")
    ).toBeInTheDocument();
  });
});

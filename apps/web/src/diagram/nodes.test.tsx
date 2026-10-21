import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { memberKey, type MemberModel, type SnapshotDeclaration } from "@dcv/shared";
import { ClassNodeCard } from "./nodes/ClassNode.js";
import { ModuleNodeCard } from "./nodes/ModuleNode.js";
import { PackageNodeCard } from "./nodes/PackageNode.js";

const RANGE = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };

function declaration(overrides: Partial<SnapshotDeclaration>): SnapshotDeclaration {
  return {
    id: "src/a.ts#class:A",
    path: "src/a.ts",
    kind: "class",
    name: "A",
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
    sourceRange: RANGE,
    ...overrides
  };
}

function member(overrides: Partial<MemberModel>): MemberModel {
  return {
    kind: "method",
    name: "run",
    visibility: "public",
    static: false,
    readonly: false,
    optional: false,
    abstract: false,
    async: false,
    signature: null,
    type: null,
    bodyHash: null,
    sourceRange: RANGE,
    ...overrides
  };
}

describe("tarjetas de nodos UML", () => {
  it("muestra estereotipo, miembros, visibilidad y modificadores de clase", () => {
    const node = declaration({
      abstract: true,
      name: "Service",
      members: [
        member({ kind: "property", name: "count", visibility: "private", type: "number" }),
        member({
          kind: "method",
          name: "execute",
          visibility: "protected",
          signature: "execute(x: string): void"
        }),
        member({
          kind: "method",
          name: "instance",
          visibility: "public",
          static: true,
          signature: "instance(): Service"
        })
      ]
    });

    render(
      <ClassNodeCard data={{ kind: "class", declaration: node, stereotype: "abstract class" }} />
    );

    const card = screen.getByLabelText("abstract class Service");
    expect(card).toHaveTextContent("«abstract class»");
    expect(card).toHaveTextContent("count: number");
    expect(card).toHaveTextContent("execute(x: string): void");
    expect(card.querySelectorAll(".uml-visibility")[0]).toHaveTextContent("-");
    expect(card.querySelectorAll(".uml-visibility")[1]).toHaveTextContent("#");
    expect(card.querySelectorAll(".uml-visibility")[2]).toHaveTextContent("+");
    expect(card.querySelector(".is-static")).toHaveTextContent("instance(): Service");
    expect(card).toHaveTextContent("src/a.ts");
  });

  it("muestra funciones y tipos de un módulo", () => {
    render(
      <ModuleNodeCard
        data={{
          kind: "module",
          path: "src/util/math.ts",
          functions: [
            declaration({
              kind: "function",
              name: "add",
              path: "src/util/math.ts",
              signature: "add(a: number): number"
            })
          ],
          types: [
            declaration({
              kind: "type",
              name: "Result",
              path: "src/util/math.ts",
              type: "number"
            })
          ]
        }}
      />
    );

    const card = screen.getByLabelText("módulo src/util/math.ts");
    expect(card).toHaveTextContent("«module»");
    expect(card).toHaveTextContent("Funciones");
    expect(card).toHaveTextContent("add(a: number): number");
    expect(card).toHaveTextContent("Tipos");
    expect(card).toHaveTextContent("Result: number");
  });

  it("oculta los compartimentos cuando se desactivan los miembros", () => {
    const classNode = declaration({ name: "Compact", members: [member({ name: "run" })] });
    const { container } = render(
      <ClassNodeCard
        data={{ kind: "class", declaration: classNode, stereotype: "class" }}
        showMembers={false}
      />
    );
    expect(container.querySelector(".uml-compartment")).toBeNull();
    expect(screen.getByLabelText("class Compact")).toBeInTheDocument();
  });

  it("muestra el nombre y la cantidad de módulos de un paquete", () => {
    render(
      <PackageNodeCard
        data={{ kind: "package", directory: "src/domain", moduleCount: 3 }}
      />
    );

    const card = screen.getByLabelText("paquete src/domain");
    expect(card).toHaveTextContent("«package»");
    expect(card).toHaveTextContent("3 módulos");
    expect(card).toHaveTextContent("src/domain");
  });

  it("aplica niveles de calor a cajas y miembros sin teñir fantasmas", () => {
    const run = member({ name: "run" });
    render(
      <ClassNodeCard
        data={{ kind: "class", declaration: declaration({ name: "Hot", members: [run] }), stereotype: "class" }}
        change={{ status: "added", probable: false, kind: "class" }}
        heatCount={8}
        heatLevel={4}
        memberHeatLevels={new Map([[memberKey(run), 3]])}
      />
    );

    const classCard = screen.getByLabelText("class Hot");
    expect(classCard).toHaveClass("heat-4");
    expect(classCard).toHaveClass("change-added");
    expect(classCard.querySelector(".uml-member")).toHaveClass("heat-3");

    const add = declaration({
      id: "src/math.ts#function:add",
      kind: "function",
      name: "add",
      path: "src/math.ts",
      signature: "add(): number"
    });
    const result = declaration({
      id: "src/math.ts#type:Result",
      kind: "type",
      name: "Result",
      path: "src/math.ts",
      type: "number"
    });
    render(
      <ModuleNodeCard
        data={{ kind: "module", path: "src/math.ts", functions: [add], types: [result] }}
        heatCount={4}
        heatLevel={2}
        declarationHeatLevels={new Map([[add.id, 1], [result.id, 4]])}
      />
    );
    const moduleCard = screen.getByLabelText("módulo src/math.ts");
    expect(moduleCard).toHaveClass("heat-2");
    expect(moduleCard.querySelector(".uml-member")).toHaveClass("heat-1");
    expect(moduleCard.querySelectorAll(".uml-member")[1]).toHaveClass("heat-4");

    render(
      <PackageNodeCard
        data={{ kind: "package", directory: "src/domain", moduleCount: 3 }}
        heatCount={6}
        heatLevel={3}
      />
    );
    expect(screen.getByLabelText("paquete src/domain")).toHaveClass("heat-3");

    render(
      <ClassNodeCard
        data={{ kind: "class", declaration: declaration({ name: "GhostHeat" }), stereotype: "class" }}
        ghost
        change={{ status: "removed", probable: false, kind: "class" }}
        heatCount={10}
        heatLevel={4}
      />
    );
    const ghost = screen.getByLabelText("class GhostHeat (eliminado)");
    expect(ghost).not.toHaveClass("heat-4");
    expect(ghost).toHaveClass("ghost");
  });

  it("marca la caja de un nodo añadido y conserva la insignia", () => {
    render(
      <ClassNodeCard
        data={{ kind: "class", declaration: declaration({ name: "Fresh" }), stereotype: "class" }}
        change={{ status: "added", probable: false, kind: "class" }}
      />
    );

    const card = screen.getByLabelText("class Fresh");
    expect(card).toHaveClass("change-added");
    expect(card.querySelector(".change-badge")).toHaveTextContent("+");
  });

  it("marca la caja de un fantasma eliminado y conserva la insignia", () => {
    render(
      <ClassNodeCard
        data={{ kind: "class", declaration: declaration({ name: "Gone" }), stereotype: "class" }}
        change={{ status: "removed", probable: false, kind: "class" }}
        ghost
      />
    );

    const card = screen.getByLabelText("class Gone (eliminado)");
    expect(card).toHaveClass("change-removed");
    expect(card).toHaveClass("ghost");
    expect(card.querySelector(".change-badge")).toHaveTextContent("−");
  });
});

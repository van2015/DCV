import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MemberModel, SnapshotDeclaration } from "@dcv/shared";
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
});

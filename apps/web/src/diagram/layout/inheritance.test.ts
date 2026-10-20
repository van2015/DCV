import { describe, expect, it } from "vitest";
import type { LayoutPositions } from "./types.js";
import {
  nearestCommitWithPositions,
  resolveCommitPositions,
  type CommitPositionsSource
} from "./inheritance.js";

function source(options: {
  commits?: Record<string, LayoutPositions>;
  legacy?: LayoutPositions;
}): CommitPositionsSource {
  const commits = options.commits ?? {};
  return {
    hasCommitPositions: (_view, sha) => Object.hasOwn(commits, sha),
    loadCommitPositions: (_view, sha) => commits[sha] ?? null,
    hasCommitEntries: () => Object.keys(commits).length > 0,
    loadPositions: () => options.legacy ?? {}
  };
}

const POSITION: LayoutPositions = {
  A: { x: 1, y: 2, width: 3, height: 4 }
};

describe("nearestCommitWithPositions", () => {
  it("devuelve null sin candidatos o si el commit no está en el histórico", () => {
    expect(nearestCommitWithPositions([], "a", () => true)).toBeNull();
    expect(nearestCommitWithPositions(["a", "b"], "b", () => false)).toBeNull();
    expect(nearestCommitWithPositions(["a", "b"], "x", () => true)).toBeNull();
  });

  it("elige el commit anterior cuando hay candidatos a la misma distancia", () => {
    const positions = new Set(["a", "c"]);
    expect(
      nearestCommitWithPositions(["a", "b", "c"], "b", (sha) => positions.has(sha))
    ).toBe("a");
  });

  it("elige el candidato más cercano en cualquier dirección", () => {
    expect(
      nearestCommitWithPositions(["a", "b", "c"], "b", (sha) => sha === "c")
    ).toBe("c");
    expect(
      nearestCommitWithPositions(["a", "b", "c"], "b", (sha) => sha === "a")
    ).toBe("a");
    expect(
      nearestCommitWithPositions(
        ["a", "b", "c", "d"],
        "b",
        (sha) => sha === "c" || sha === "d"
      )
    ).toBe("c");
  });
});

describe("resolveCommitPositions", () => {
  it("prioriza las posiciones propias del commit", () => {
    const own: LayoutPositions = { own: { x: 9, y: 9, width: 9, height: 9 } };
    const resolved = resolveCommitPositions(
      source({ commits: { a: POSITION, b: own }, legacy: POSITION }),
      "classes",
      "b",
      ["a", "b"]
    );
    expect(resolved).toEqual(own);
  });

  it("hereda del commit más cercano cuando el actual no tiene posiciones", () => {
    const resolved = resolveCommitPositions(
      source({ commits: { a: POSITION } }),
      "classes",
      "c",
      ["a", "b", "c"]
    );
    expect(resolved).toEqual(POSITION);
  });

  it("usa la clave por vista solo cuando no hay ninguna entrada por commit", () => {
    expect(
      resolveCommitPositions(
        source({ legacy: POSITION }),
        "classes",
        "a",
        ["a"]
      )
    ).toEqual(POSITION);

    expect(
      resolveCommitPositions(
        source({ commits: { other: POSITION } }),
        "classes",
        "a",
        ["a"]
      )
    ).toEqual({});
  });

  it("no hereda si el commit seleccionado no está en el histórico", () => {
    expect(
      resolveCommitPositions(
        source({ commits: { a: POSITION }, legacy: POSITION }),
        "classes",
        "x",
        ["a"]
      )
    ).toEqual({});
  });
});

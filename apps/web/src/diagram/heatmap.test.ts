import { describe, expect, it } from "vitest";
import { makeHeatmap } from "../test/fakes.js";
import { heatLevel, heatmapMaxima } from "./heatmap.js";

describe("heatLevel", () => {
  it("devuelve cero sin actividad o sin máximo", () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(undefined, 10)).toBe(0);
    expect(heatLevel(3, 0)).toBe(0);
  });

  it("asigna cuatro niveles por cuartiles", () => {
    expect(heatLevel(1, 10)).toBe(1);
    expect(heatLevel(2, 10)).toBe(1);
    expect(heatLevel(3, 10)).toBe(2);
    expect(heatLevel(5, 10)).toBe(2);
    expect(heatLevel(7, 10)).toBe(3);
    expect(heatLevel(8, 10)).toBe(4);
    expect(heatLevel(10, 10)).toBe(4);
  });
});

describe("heatmapMaxima", () => {
  it("calcula máximos independientes para nodos y miembros", () => {
    const heatmap = makeHeatmap("c1", {
      nodes: { a: 2, b: 7, c: 0 },
      members: {
        a: { run: 1, stop: 4 },
        b: { run: 2 }
      }
    });

    expect(heatmapMaxima(heatmap)).toEqual({ nodes: 7, members: 4 });
    expect(heatmapMaxima(heatmap, ["a"])).toEqual({ nodes: 2, members: 4 });
    expect(heatmapMaxima(heatmap, ["module:otro"])).toEqual({
      nodes: 0,
      members: 0
    });
    expect(heatmapMaxima(null)).toEqual({ nodes: 0, members: 0 });
  });
});

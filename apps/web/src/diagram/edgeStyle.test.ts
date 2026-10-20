import { describe, expect, it } from "vitest";
import type { EdgeKind } from "@dcv/shared";
import {
  EDGE_BASE_COLOR,
  EDGE_STATUS_COLORS,
  edgeAppearance
} from "./edgeStyle.js";

describe("apariencia de aristas", () => {
  it("asigna estilos UML base a cada tipo sin cambios", () => {
    expect(edgeAppearance("extends", null, false)).toMatchObject({
      status: null,
      statusClass: null,
      color: EDGE_BASE_COLOR,
      linePattern: "solid",
      markerShape: "hollow-triangle"
    });
    expect(edgeAppearance("implements", null, false)).toMatchObject({
      color: EDGE_BASE_COLOR,
      linePattern: "6 4",
      markerShape: "hollow-triangle"
    });
    expect(edgeAppearance("association", null, false)).toMatchObject({
      color: EDGE_BASE_COLOR,
      linePattern: "solid",
      markerShape: "filled-triangle"
    });
    expect(edgeAppearance("imports", null, false)).toMatchObject({
      color: EDGE_BASE_COLOR,
      linePattern: "solid",
      markerShape: "filled-triangle"
    });
  });

  it("reserva verde y rojo para los estados de diff", () => {
    expect(edgeAppearance("extends", "added", false)).toMatchObject({
      statusClass: "edge-added",
      color: EDGE_STATUS_COLORS.added
    });
    expect(edgeAppearance("association", "removed", false)).toMatchObject({
      statusClass: "edge-removed",
      color: EDGE_STATUS_COLORS.removed
    });
  });

  it("conserva la forma de punta al teñir el diff", () => {
    for (const status of ["added", "removed"] as const) {
      expect(edgeAppearance("extends", status, false).markerShape).toBe(
        "hollow-triangle"
      );
      expect(edgeAppearance("implements", status, false).markerShape).toBe(
        "hollow-triangle"
      );
      expect(edgeAppearance("association", status, false).markerShape).toBe(
        "filled-triangle"
      );
      expect(edgeAppearance("imports", status, false).markerShape).toBe(
        "filled-triangle"
      );
    }
  });

  it("conserva el patrón de línea del tipo en aristas eliminadas", () => {
    for (const kind of ["imports", "extends", "association"] as EdgeKind[]) {
      expect(edgeAppearance(kind, "removed", false).linePattern).toBe("solid");
    }
    expect(edgeAppearance("implements", "removed", false).linePattern).toBe("6 4");
  });

  it("aplica el patrón discontinuo de solo tipo sobre el tipo", () => {
    for (const kind of ["imports", "extends", "implements", "association"] as EdgeKind[]) {
      expect(edgeAppearance(kind, null, true).linePattern).toBe("4 4");
      expect(edgeAppearance(kind, "removed", true).linePattern).toBe("4 4");
    }
  });
});

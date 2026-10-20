import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../../test/fakes.js";
import { VisualStateStore } from "./persistence.js";

describe("VisualStateStore", () => {
  it("persiste posiciones y cámara por proyecto y vista", () => {
    const storage = new MemoryStorage();
    const store = new VisualStateStore(storage, "p1");
    store.savePositions("modules", {
      "module:src/a.ts": { x: 10, y: 20, width: 260, height: 200 }
    });
    store.saveCamera("modules", { x: 5, y: 6, zoom: 1.5 });

    const reopened = new VisualStateStore(storage, "p1");
    expect(reopened.loadPositions("modules")).toEqual({
      "module:src/a.ts": { x: 10, y: 20, width: 260, height: 200 }
    });
    expect(reopened.loadCamera("modules")).toEqual({ x: 5, y: 6, zoom: 1.5 });
    expect(reopened.loadPositions("classes")).toEqual({});
    expect(reopened.loadCamera("classes")).toBeNull();
  });

  it("persiste controles con valores por defecto ante datos inválidos", () => {
    const storage = new MemoryStorage();
    const store = new VisualStateStore(storage, "p1");
    expect(store.loadControls()).toEqual({
      showMembers: true,
      focusEnabled: false,
      focusDepth: 1,
      focusHide: false,
      collapsedFolders: []
    });

    store.saveControls({
      showMembers: false,
      focusEnabled: true,
      focusDepth: 2,
      focusHide: true,
      collapsedFolders: ["src/util"]
    });
    expect(new VisualStateStore(storage, "p1").loadControls()).toEqual({
      showMembers: false,
      focusEnabled: true,
      focusDepth: 2,
      focusHide: true,
      collapsedFolders: ["src/util"]
    });

    storage.setItem("dcv.layout:p1:controls", "{no-json");
    expect(new VisualStateStore(storage, "p1").loadControls().focusDepth).toBe(1);

    storage.setItem(
      "dcv.layout:p1:controls",
      JSON.stringify({ focusDepth: 99, collapsedFolders: [1, "ok"] })
    );
    const sanitized = new VisualStateStore(storage, "p1").loadControls();
    expect(sanitized.focusDepth).toBe(1);
    expect(sanitized.collapsedFolders).toEqual(["ok"]);
  });

  it("descarta posiciones corruptas y permite limpiarlas", () => {
    const storage = new MemoryStorage();
    const store = new VisualStateStore(storage, "p1");
    storage.setItem("dcv.layout:p1:classes:positions", JSON.stringify({ bad: { x: "no" } }));
    expect(store.loadPositions("classes")).toEqual({});

    store.savePositions("classes", { A: { x: 1, y: 2, width: 3, height: 4 } });
    store.clearPositions("classes");
    expect(store.loadPositions("classes")).toEqual({});
  });
});

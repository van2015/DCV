import { describe, expect, it } from "vitest";
import type { StorageLike } from "../../state/store.js";
import { MemoryStorage } from "../../test/fakes.js";
import { MAX_COMMITS_PER_VIEW, VisualStateStore } from "./persistence.js";

class QuotaStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  constructor(private readonly capacity: number) {}

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (!this.values.has(key) && this.values.size >= this.capacity) {
      throw new Error("QuotaExceededError");
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

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

  it("guarda, lee y elimina posiciones por commit", () => {
    const storage = new MemoryStorage();
    const store = new VisualStateStore(storage, "p1");
    store.saveCommitPositions("classes", "a", {
      A: { x: 10.4, y: 20.6, width: 100.2, height: 50.8 }
    });
    store.saveCommitPositions("classes", "b", {
      A: { x: 30, y: 40, width: 100, height: 50 }
    });

    const reopened = new VisualStateStore(storage, "p1");
    expect(reopened.hasCommitPositions("classes", "a")).toBe(true);
    expect(reopened.loadCommitPositions("classes", "a")).toEqual({
      A: { x: 10, y: 21, width: 100, height: 51 }
    });
    expect(reopened.loadCommitPositions("classes", "b")).toEqual({
      A: { x: 30, y: 40, width: 100, height: 50 }
    });
    expect(reopened.loadCommitPositions("classes", "missing")).toBeNull();
    expect(reopened.loadPositions("classes")).toEqual({});

    reopened.clearCommitPositions("classes", "a");
    expect(reopened.hasCommitPositions("classes", "a")).toBe(false);
    expect(reopened.loadCommitPositions("classes", "b")).toEqual({
      A: { x: 30, y: 40, width: 100, height: 50 }
    });
  });

  it("poda las posiciones de los 50 commits usados más recientemente por vista", () => {
    const store = new VisualStateStore(new MemoryStorage(), "p1");
    for (let index = 0; index <= MAX_COMMITS_PER_VIEW; index += 1) {
      store.saveCommitPositions("classes", `c${index}`, {
        A: { x: index, y: index, width: 100, height: 50 }
      });
    }
    expect(store.hasCommitPositions("classes", "c0")).toBe(false);
    expect(store.hasCommitPositions("classes", "c1")).toBe(true);
    expect(store.hasCommitPositions("classes", `c${MAX_COMMITS_PER_VIEW}`)).toBe(true);

    for (let index = 0; index <= MAX_COMMITS_PER_VIEW; index += 1) {
      store.saveCommitPositions("modules", `m${index}`, {
        A: { x: index, y: index, width: 100, height: 50 }
      });
    }
    expect(store.hasCommitPositions("modules", "m0")).toBe(false);
    expect(store.hasCommitPositions("modules", `m${MAX_COMMITS_PER_VIEW}`)).toBe(true);
    expect(store.hasCommitPositions("classes", "c1")).toBe(true);
    expect(store.hasCommitPositions("classes", `c${MAX_COMMITS_PER_VIEW}`)).toBe(true);
  });

  it("descarta las entradas más antiguas cuando se agota la cuota de almacenamiento", () => {
    const storage = new QuotaStorage(3);
    const store = new VisualStateStore(storage, "p1");
    store.saveCommitPositions("classes", "a", { A: { x: 0, y: 0, width: 10, height: 10 } });
    store.saveCommitPositions("classes", "b", { A: { x: 1, y: 1, width: 10, height: 10 } });
    store.saveCommitPositions("classes", "c", { A: { x: 2, y: 2, width: 10, height: 10 } });

    expect(store.hasCommitPositions("classes", "a")).toBe(false);
    expect(store.hasCommitPositions("classes", "b")).toBe(true);
    expect(store.hasCommitPositions("classes", "c")).toBe(true);

    const full = new VisualStateStore(new QuotaStorage(0), "p1");
    expect(() =>
      full.saveCommitPositions("classes", "d", {
        A: { x: 3, y: 3, width: 10, height: 10 }
      })
    ).not.toThrow();
    expect(full.hasCommitPositions("classes", "d")).toBe(false);
  });

  it("marca el commit como reciente al leer y no escribe la clave heredada", () => {
    const storage = new MemoryStorage();
    const store = new VisualStateStore(storage, "p1");
    for (let index = 0; index < MAX_COMMITS_PER_VIEW; index += 1) {
      store.saveCommitPositions("classes", `c${index}`, {
        A: { x: index, y: index, width: 100, height: 50 }
      });
    }
    expect(store.loadCommitPositions("classes", "c0")).not.toBeNull();
    store.saveCommitPositions("classes", `c${MAX_COMMITS_PER_VIEW}`, {
      A: { x: 99, y: 99, width: 100, height: 50 }
    });
    expect(store.hasCommitPositions("classes", "c0")).toBe(true);
    expect(store.hasCommitPositions("classes", "c1")).toBe(false);

    store.savePositions("classes", { legacy: { x: 7, y: 8, width: 9, height: 10 } });
    const legacy = storage.getItem("dcv.layout:p1:classes:positions");
    store.saveCommitPositions("classes", "own", {
      A: { x: 1, y: 2, width: 3, height: 4 }
    });
    store.clearCommitPositions("classes", "own");
    expect(storage.getItem("dcv.layout:p1:classes:positions")).toBe(legacy);
    expect(store.loadPositions("classes")).toEqual({
      legacy: { x: 7, y: 8, width: 9, height: 10 }
    });
  });
});

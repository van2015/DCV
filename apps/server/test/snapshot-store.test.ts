import type { Snapshot } from "@dcv/shared";
import { describe, expect, it } from "vitest";
import { SnapshotStore, type SnapshotSource } from "../src/analysis/snapshot-store.js";

function fakeSnapshot(commit: string): Snapshot {
  return {
    commit,
    branch: "main",
    analyzerVersion: "1.0.0",
    files: [],
    edges: [],
    diagnostics: [],
    stats: {
      files: 0,
      declarations: 0,
      classes: 0,
      interfaces: 0,
      enums: 0,
      types: 0,
      functions: 0,
      edges: 0
    }
  };
}

class CountingSource implements SnapshotSource {
  builds = 0;

  async build(commit: string): Promise<Snapshot> {
    this.builds += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return fakeSnapshot(commit);
  }
}

describe("SnapshotStore", () => {
  it("evicts the least recently used snapshots", async () => {
    const source = new CountingSource();
    const store = new SnapshotStore(source, "1.0.0:main", 2);

    await store.get("c1");
    await store.get("c2");
    expect(store.size).toBe(2);

    await store.get("c1");
    await store.get("c3");

    expect(store.size).toBe(2);
    expect(source.builds).toBe(3);

    await store.get("c2");
    expect(source.builds).toBe(4);
  });

  it("coalesces concurrent requests for the same commit", async () => {
    const source = new CountingSource();
    const store = new SnapshotStore(source, "1.0.0:main", 5);

    const [first, second] = await Promise.all([store.get("c1"), store.get("c1")]);

    expect(first).toEqual(second);
    expect(source.builds).toBe(1);
    expect(store.size).toBe(1);
  });
});

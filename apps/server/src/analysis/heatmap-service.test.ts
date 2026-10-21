import type {
  CommitInfo,
  MemberModel,
  Snapshot,
  SnapshotDeclaration,
  SnapshotFile
} from "@dcv/shared";
import { describe, expect, it, vi } from "vitest";
import { HeatmapService, type SnapshotSource } from "./heatmap-service.js";
import type { AnalysisTarget } from "./service.js";

const RANGE = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };
const PATH = "src/a.ts";
const CLASS_ID = `${PATH}#class:A`;

function makeCommit(sha: string, parent: string | null): CommitInfo {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents: parent ? [parent] : [],
    subject: sha,
    message: sha,
    authorName: "DCV",
    authorEmail: "dcv@example.com",
    date: "2026-01-01T00:00:00Z",
    changedFiles: 1
  };
}

function member(name: string): MemberModel {
  return {
    kind: "method",
    name,
    visibility: "public",
    static: false,
    readonly: false,
    optional: false,
    abstract: false,
    async: false,
    signature: `${name}(): void`,
    type: "void",
    bodyHash: name,
    sourceRange: RANGE
  };
}

function declaration(methods: string[]): SnapshotDeclaration {
  return {
    id: CLASS_ID,
    path: PATH,
    kind: "class",
    name: "A",
    exported: true,
    defaultExport: false,
    abstract: false,
    declare: false,
    async: false,
    signature: null,
    type: null,
    members: methods.map(member),
    heritage: [],
    bodyHash: null,
    sourceRange: RANGE
  };
}

function file(methods: string[], hash: string): SnapshotFile {
  return {
    path: PATH,
    contentHash: hash,
    scriptKind: "ts",
    imports: [],
    declarations: [declaration(methods)],
    diagnostics: []
  };
}

function snapshot(commit: string, methods: string[]): Snapshot {
  return {
    commit,
    branch: "main",
    analyzerVersion: "1.0.0",
    files: [file(methods, commit)],
    edges: [],
    diagnostics: [],
    stats: {
      files: 1,
      declarations: 1,
      classes: 1,
      interfaces: 0,
      enums: 0,
      types: 0,
      functions: 0,
      edges: 0
    }
  };
}

function provider(snapshots: Record<string, Snapshot>): SnapshotSource & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    async snapshot(_target: AnalysisTarget, commit: string): Promise<Snapshot> {
      calls.push(commit);
      const value = snapshots[commit];
      if (!value) {
        throw new Error(`Snapshot desconocido: ${commit}`);
      }
      return value;
    }
  };
}

const TARGET: AnalysisTarget = {
  projectId: "p1",
  repoPath: "/tmp/repo",
  branch: "main"
};

function histories(): Record<string, CommitInfo[]> {
  return {
    main: [
      makeCommit("c1", null),
      makeCommit("c2", "c1"),
      makeCommit("c3", "c2")
    ],
    dev: [makeCommit("d1", null), makeCommit("d2", "d1")]
  };
}

function snapshots(): Record<string, Snapshot> {
  return {
    c1: snapshot("c1", ["run"]),
    c2: snapshot("c2", ["run", "extra"]),
    c3: snapshot("c3", ["run", "extra", "more"]),
    d1: snapshot("d1", ["run"]),
    d2: snapshot("d2", ["run", "dev"])
  };
}

describe("HeatmapService", () => {
  it("reutiliza deltas al avanzar y retroceder entre commits", async () => {
    const differ = vi.fn(async () => []);
    const service = new HeatmapService(provider(snapshots()), {
      commits: async (_repo, branch) => histories()[branch]!,
      diffTrees: differ
    });

    const second = await service.get(TARGET, "c2");
    expect(second.commits).toBe(2);
    expect(second.nodes[CLASS_ID]).toBe(1);
    expect(second.nodes["module:src/a.ts"]).toBe(1);
    expect(second.nodes["package:src"]).toBe(1);
    expect(second.members[CLASS_ID]).toEqual({ "method:run": 0, "method:extra": 1 });
    expect(differ).toHaveBeenCalledTimes(1);

    const third = await service.get(TARGET, "c3");
    expect(third.commits).toBe(3);
    expect(third.nodes[CLASS_ID]).toBe(2);
    expect(differ).toHaveBeenCalledTimes(2);

    const again = await service.get(TARGET, "c2");
    expect(again.commits).toBe(2);
    expect(differ).toHaveBeenCalledTimes(2);
    expect(again.nodes[CLASS_ID]).toBe(1);
  });

  it("aísla la caché entre ramas del mismo proyecto", async () => {
    const differ = vi.fn(async () => []);
    const service = new HeatmapService(provider(snapshots()), {
      commits: async (_repo, branch) => histories()[branch]!,
      diffTrees: differ
    });

    await service.get(TARGET, "c2");
    expect(differ).toHaveBeenCalledTimes(1);

    const dev = await service.get({ ...TARGET, branch: "dev" }, "d2");
    expect(dev.branch).toBe("dev");
    expect(dev.nodes[CLASS_ID]).toBe(1);
    expect(differ).toHaveBeenCalledTimes(2);

    await service.get(TARGET, "c2");
    expect(differ).toHaveBeenCalledTimes(2);
  });

  it("rechaza un commit que no pertenece al histórico lineal", async () => {
    const differ = vi.fn(async () => []);
    const service = new HeatmapService(provider(snapshots()), {
      commits: async (_repo, branch) => histories()[branch]!,
      diffTrees: differ
    });

    await expect(service.get(TARGET, "d2")).rejects.toMatchObject({
      name: "AppError",
      code: "commit_not_found",
      status: 404
    });
    expect(differ).not.toHaveBeenCalled();
  });

  it("devuelve la línea base sin actividad y todas las entidades en cero", async () => {
    const differ = vi.fn(async () => []);
    const service = new HeatmapService(provider(snapshots()), {
      commits: async (_repo, branch) => histories()[branch]!,
      diffTrees: differ
    });

    const baseline = await service.get(TARGET, "c1");

    expect(baseline.commits).toBe(1);
    expect(baseline.nodes).toEqual({
      [CLASS_ID]: 0,
      "module:src/a.ts": 0,
      "package:src": 0
    });
    expect(baseline.members).toEqual({
      [CLASS_ID]: { "method:run": 0 }
    });
    expect(differ).not.toHaveBeenCalled();
  });
});

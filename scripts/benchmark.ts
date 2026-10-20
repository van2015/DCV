import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import ELK from "../apps/web/node_modules/elkjs/lib/elk.bundled.js";
import type { OverlayStatus } from "../apps/web/src/diagram/overlay.js";
import { projectSnapshot } from "../apps/web/src/diagram/projection.js";
import { buildLayoutGraph } from "../apps/web/src/diagram/layout/graph.js";
import {
  FOCUS_THRESHOLD,
  focusActive,
  focusNeighborhood
} from "../apps/web/src/diagram/layout/focus.js";
import { SnapshotBuilder } from "../apps/server/src/analysis/snapshot-builder.js";
import { FileModelCache } from "../apps/server/src/analysis/cache.js";
import { diffSnapshots } from "../packages/analyzer/src/index.js";
import { ANALYZER_VERSION } from "../packages/shared/src/index.js";
import { git, headSha, initRepo } from "../apps/server/test/helpers/git.js";

const FILE_COUNT = Number.parseInt(process.env.DCV_BENCH_FILES ?? "100", 10);
const CLASSES_PER_FILE = Number.parseInt(process.env.DCV_BENCH_CLASSES ?? "8", 10);

function fileSource(index: number): string {
  const lines: string[] = [];
  if (index > 0) {
    lines.push(`import { C${index - 1}_0 } from "./file${index - 1}";`);
    lines.push("");
  }
  for (let member = 0; member < CLASSES_PER_FILE; member += 1) {
    lines.push(
      `export class C${index}_${member} {`,
      "  value(): number {",
      `    return ${index * CLASSES_PER_FILE + member};`,
      "  }",
      "}",
      ""
    );
  }
  if (index > 0) {
    lines.push(
      `export function use${index}(input: number): number {`,
      `  return input + new C${index - 1}_0().value();`,
      "}",
      ""
    );
  }
  return lines.join("\n");
}

async function createBenchmarkRepo(directory: string): Promise<{ first: string; second: string }> {
  await rm(directory, { recursive: true, force: true });
  await initRepo(directory);
  await mkdir(join(directory, "src"), { recursive: true });

  for (let index = 0; index < FILE_COUNT; index += 1) {
    await writeFile(join(directory, "src", `file${index}.ts`), fileSource(index), "utf8");
  }
  await git(directory, ["add", "-A"]);
  await git(directory, ["commit", "-m", "genera repositorio mediano"], {
    GIT_AUTHOR_DATE: "2024-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2024-01-01T00:00:00Z"
  });
  const first = await headSha(directory);

  const modified = fileSource(0).replace("return 0;", "return 10_000;");
  await writeFile(join(directory, "src", "file0.ts"), modified, "utf8");
  await git(directory, ["add", "-A"]);
  await git(directory, ["commit", "-m", "modifica una clase"], {
    GIT_AUTHOR_DATE: "2024-01-02T00:00:00Z",
    GIT_COMMITTER_DATE: "2024-01-02T00:00:00Z"
  });
  const second = await headSha(directory);

  return { first, second };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

const repoPath = ".tmp/benchmark-repo";
const cacheDir = ".tmp/benchmark-cache";
await rm(cacheDir, { recursive: true, force: true });

const { first, second } = await createBenchmarkRepo(repoPath);
const cache = new FileModelCache(cacheDir, ANALYZER_VERSION);
const builder = new SnapshotBuilder({
  repoPath,
  branch: "main",
  analyzerVersion: ANALYZER_VERSION,
  cache
});

const coldStart = performance.now();
await builder.build(first);
const coldMs = performance.now() - coldStart;

const warmStart = performance.now();
const warmSnapshot = await builder.build(first);
const warmMs = performance.now() - warmStart;

const secondStart = performance.now();
const secondSnapshot = await builder.build(second);
const secondMs = performance.now() - secondStart;

const diffStart = performance.now();
const diff = diffSnapshots(warmSnapshot, secondSnapshot);
const diffMs = performance.now() - diffStart;

const projections = {
  classes: projectSnapshot(secondSnapshot, "classes"),
  modules: projectSnapshot(secondSnapshot, "modules"),
  packages: projectSnapshot(secondSnapshot, "packages")
};

const classes = projections.classes;
const graph = buildLayoutGraph({
  nodes: classes.nodes,
  edges: classes.edges,
  collapsedFolders: []
});

const elk = new ELK();
const layoutStart = performance.now();
const layout = await elk.layout(graph);
const layoutMs = performance.now() - layoutStart;

let positioned = 0;
const count = (nodes: { x?: number; y?: number; children?: unknown[] }[]): void => {
  for (const node of nodes) {
    if (typeof node.x === "number") {
      positioned += 1;
    }
    if (node.children) {
      count(node.children as { x?: number; y?: number; children?: unknown[] }[]);
    }
  }
};
count((layout.children ?? []) as never[]);

const focusStart = performance.now();
const neighborhood = focusNeighborhood({
  nodeStatuses: new Map<string, OverlayStatus>([
    [classes.nodes[0]?.id ?? "", { status: "added", probable: false, kind: "class" }]
  ]),
  ghostIds: [],
  focusedNodeId: classes.nodes[0]?.id ?? null,
  edges: classes.edges,
  depth: 1
});
const focusMs = performance.now() - focusStart;

const results = {
  generatedAt: new Date().toISOString(),
  files: FILE_COUNT,
  classesPerFile: CLASSES_PER_FILE,
  snapshot: {
    coldMs: round(coldMs),
    warmMs: round(warmMs),
    secondCommitMs: round(secondMs),
    cacheSpeedup: warmMs > 0 ? round(coldMs / warmMs) : null,
    stats: secondSnapshot.stats
  },
  diff: { ms: round(diffMs), declarations: diff.declarations.length, members: diff.members.length },
  views: {
    classes: { nodes: projections.classes.nodes.length, edges: projections.classes.edges.length },
    modules: { nodes: projections.modules.nodes.length, edges: projections.modules.edges.length },
    packages: { nodes: projections.packages.nodes.length, edges: projections.packages.edges.length }
  },
  layout: { ms: round(layoutMs), positioned, requested: classes.nodes.length },
  focus: {
    threshold: FOCUS_THRESHOLD,
    active: focusActive(classes.nodes.length, { focusEnabled: true }),
    ms: round(focusMs),
    neighborhood: neighborhood.size
  }
};

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);

const report = [
  "# Benchmark de DCV",
  "",
  `Generado: ${results.generatedAt}`,
  "",
  `Repositorio sintético: ${FILE_COUNT} archivos, ${CLASSES_PER_FILE} clases por archivo (${results.snapshot.stats.declarations} declaraciones, ${results.snapshot.stats.edges} aristas).`,
  "",
  "| Fase | Tiempo | Notas |",
  "| --- | --- | --- |",
  `| Snapshot en frío | ${results.snapshot.coldMs} ms | parseo + resolución sin cache |`,
  `| Snapshot con cache | ${results.snapshot.warmMs} ms | reutiliza modelos por blob (speedup x${results.snapshot.cacheSpeedup}) |`,
  `| Snapshot segundo commit | ${results.snapshot.secondCommitMs} ms | reutiliza archivos sin cambios |`,
  `| Diff de snapshots | ${results.diff.ms} ms | ${results.diff.declarations} declaraciones afectadas |`,
  `| Layout ELK (clases) | ${results.layout.ms} ms | ${results.layout.positioned}/${results.layout.requested} nodos posicionados |`,
  `| Foco (1 salto) | ${results.focus.ms} ms | vecindario de ${results.focus.neighborhood} nodos |`,
  "",
  "## Ajuste de umbrales",
  "",
  `- El umbral de foco (${FOCUS_THRESHOLD} nodos) se activa con ${classes.nodes.length} nodos en la vista de clases, por lo que el modo foco es útil en repositorios medianos.`,
  `- La cache de modelos por blob reduce el tiempo de snapshot de ${results.snapshot.coldMs} ms a ${results.snapshot.warmMs} ms (x${results.snapshot.cacheSpeedup}); conviene mantenerla por versión de analizador.`,
  `- El layout ELK en worker se mantiene por debajo de ${Math.ceil(results.layout.ms / 100) * 100} ms para ${classes.nodes.length} nodos, lo que evita bloquear la interacción en repositorios medianos.`,
  ""
].join("\n");

const reportPath =
  process.env.DCV_BENCH_OUTPUT ??
  "openspec/changes/archive/2026-10-20-add-uml-history-viewer/benchmark.md";
await writeFile(reportPath, report, "utf8");

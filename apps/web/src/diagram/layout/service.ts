import { runElkLayout } from "./elk.js";
import type { LayoutGraph } from "./graph.js";
import type { LayoutPositions } from "./types.js";
import type { LayoutRequestMessage, LayoutResponseMessage } from "./layout.worker.js";

export interface LayoutRunner {
  run(graph: LayoutGraph): Promise<LayoutPositions>;
}

class ElkLayoutRunner implements LayoutRunner {
  run(graph: LayoutGraph): Promise<LayoutPositions> {
    return runElkLayout(graph);
  }
}

class WorkerLayoutRunner implements LayoutRunner {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (positions: LayoutPositions) => void; reject: (error: Error) => void }
  >();

  constructor() {
    this.worker = new Worker(new URL("./layout.worker.ts", import.meta.url), {
      type: "module"
    });
    this.worker.addEventListener("message", (event: MessageEvent<LayoutResponseMessage>) => {
      const message = event.data;
      const entry = this.pending.get(message.id);
      if (!entry) {
        return;
      }
      this.pending.delete(message.id);
      if (message.type === "error") {
        entry.reject(new Error(message.message));
        return;
      }
      entry.resolve(message.positions);
    });
    this.worker.addEventListener("error", () => {
      for (const entry of this.pending.values()) {
        entry.reject(new Error("layout_worker_failed"));
      }
      this.pending.clear();
    });
  }

  run(graph: LayoutGraph): Promise<LayoutPositions> {
    const id = this.nextId++;
    const message: LayoutRequestMessage = { type: "layout", id, graph };
    return new Promise<LayoutPositions>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(message);
    }).catch(() => runElkLayout(graph));
  }
}

export function createLayoutRunner(): LayoutRunner {
  if (typeof Worker === "undefined") {
    return new ElkLayoutRunner();
  }
  try {
    return new WorkerLayoutRunner();
  } catch {
    return new ElkLayoutRunner();
  }
}

let defaultRunner: LayoutRunner | null = null;

export function defaultLayoutRunner(): LayoutRunner {
  defaultRunner ??= createLayoutRunner();
  return defaultRunner;
}

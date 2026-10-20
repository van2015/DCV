import { runElkLayout } from "./elk.js";
import type { LayoutGraph } from "./graph.js";
import type { LayoutPositions } from "./types.js";

export interface LayoutRequestMessage {
  type: "layout";
  id: number;
  graph: LayoutGraph;
}

export interface LayoutResultMessage {
  type: "result";
  id: number;
  positions: LayoutPositions;
}

export interface LayoutErrorMessage {
  type: "error";
  id: number;
  message: string;
}

export type LayoutResponseMessage = LayoutResultMessage | LayoutErrorMessage;

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LayoutRequestMessage>) => void) | null;
  postMessage: (message: LayoutResponseMessage) => void;
};

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type !== "layout") {
    return;
  }
  void runElkLayout(message.graph).then(
    (positions) => {
      scope.postMessage({ type: "result", id: message.id, positions });
    },
    (error: unknown) => {
      scope.postMessage({
        type: "error",
        id: message.id,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  );
};

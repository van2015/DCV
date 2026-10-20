import type { ImportProgressEvent } from "@dcv/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DcvClient, type EventSourceLike } from "./client.js";

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, ((event: { data?: string }) => void)[]>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data });
    }
  }
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.useRealTimers();
});

function createClient() {
  return new DcvClient({
    token: "tok",
    eventSourceFactory: (url) => new FakeEventSource(url),
    reconnectDelay: () => 250
  });
}

describe("SSE del cliente", () => {
  it("incluye el token y filtra por proyecto en la URL", () => {
    const client = createClient();

    expect(client.eventsUrl()).toBe("/api/events?token=tok");
    expect(client.eventsUrl("p1")).toBe("/api/projects/p1/events?token=tok");
  });

  it("entrega los eventos tipados y descarta JSON inválido", () => {
    const client = createClient();
    const received: ImportProgressEvent[] = [];
    const close = client.subscribeEvents({
      "import:progress": (event) => received.push(event)
    });

    const source = FakeEventSource.instances[0]!;
    source.emit(
      "import:progress",
      JSON.stringify({
        type: "import:progress",
        projectId: null,
        message: "Clonando…",
        progress: 0.4
      })
    );
    source.emit("import:progress", "{ roto");
    close();

    expect(received).toEqual([
      { type: "import:progress", projectId: null, message: "Clonando…", progress: 0.4 }
    ]);
  });

  it("reconecta tras un error y deja de hacerlo al cerrar", () => {
    vi.useFakeTimers();
    const client = createClient();
    const errors: unknown[] = [];
    const close = client.subscribeEvents({
      onError: (error) => errors.push(error)
    });

    const first = FakeEventSource.instances[0]!;
    first.emit("error");
    expect(first.closed).toBe(true);
    expect(errors).toHaveLength(1);

    vi.advanceTimersByTime(250);
    expect(FakeEventSource.instances).toHaveLength(2);

    const second = FakeEventSource.instances[1]!;
    close();
    second.emit("error");
    vi.advanceTimersByTime(1000);

    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it("reinicia el backoff cuando la conexión se abre", () => {
    vi.useFakeTimers();
    const client = createClient();
    const close = client.subscribeEvents({});

    const first = FakeEventSource.instances[0]!;
    first.emit("open");
    first.emit("error");
    vi.advanceTimersByTime(250);
    const second = FakeEventSource.instances[1]!;
    second.emit("open");
    second.emit("error");
    vi.advanceTimersByTime(250);

    expect(FakeEventSource.instances).toHaveLength(3);
    close();
  });
});

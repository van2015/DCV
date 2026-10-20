import type { ImportProgressEvent } from "@dcv/shared";

export type EventListener = (event: ImportProgressEvent) => void;

export class EventBus {
  private readonly listeners = new Set<{
    projectId: string | null;
    listener: EventListener;
  }>();

  get size(): number {
    return this.listeners.size;
  }

  subscribe(listener: EventListener, projectId: string | null = null): () => void {
    const entry = { projectId, listener };
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  publish(event: ImportProgressEvent): void {
    for (const entry of [...this.listeners]) {
      if (entry.projectId !== null && entry.projectId !== event.projectId) {
        continue;
      }
      try {
        entry.listener(event);
      } catch {
        // Los suscriptores no deben romper el flujo principal.
      }
    }
  }
}

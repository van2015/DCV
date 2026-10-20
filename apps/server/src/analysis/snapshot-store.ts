import type { Snapshot } from "@dcv/shared";

export interface SnapshotSource {
  build(commit: string): Promise<Snapshot>;
}

export class SnapshotStore {
  private readonly entries = new Map<string, Snapshot>();
  private readonly inFlight = new Map<string, Promise<Snapshot>>();

  constructor(
    private readonly source: SnapshotSource,
    private readonly keyPrefix: string,
    private readonly maxEntries = 50
  ) {}

  get size(): number {
    return this.entries.size;
  }

  async get(commit: string): Promise<Snapshot> {
    const key = `${this.keyPrefix}:${commit}`;
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }

    const request = this.source
      .build(commit)
      .then((snapshot) => {
        this.entries.set(key, snapshot);
        this.evictIfNeeded();
        return snapshot;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }

  put(commit: string, snapshot: Snapshot): void {
    this.entries.set(`${this.keyPrefix}:${commit}`, snapshot);
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }
}

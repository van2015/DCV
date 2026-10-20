import "@testing-library/jest-dom/vitest";

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    queueMicrotask(() => {
      this.callback(
        [
          {
            target,
            contentRect: { width: 1024, height: 640, top: 0, left: 0, bottom: 640, right: 1024, x: 0, y: 0 }
          } as ResizeObserverEntry
        ],
        this as unknown as ResizeObserver
      );
    });
  }

  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

class DOMMatrixReadOnlyStub {
  m11 = 1;
  m22 = 1;
  a = 1;
  b = 0;
  c = 0;
  d = 1;

  constructor(_transform?: string) {}
}

if (typeof (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly === "undefined") {
  (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly =
    DOMMatrixReadOnlyStub;
}

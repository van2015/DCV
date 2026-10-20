export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayoutPositions = Record<string, LayoutRect>;

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/analysis/analyzer.worker.ts"],
  format: ["esm"],
  target: "node22",
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: [/^@dcv\//],
  external: ["typescript"],
  outDir: "dist"
});

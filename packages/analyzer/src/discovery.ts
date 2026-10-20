const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs"
]);

const EXCLUDED_FILE_SUFFIXES = [".d.ts", ".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];

export function isAnalyzableSourcePath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  if (!/\.(ts|tsx)$/.test(normalized)) {
    return false;
  }
  if (EXCLUDED_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return false;
  }
  const segments = normalized.split("/");
  return !segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment.toLowerCase()));
}

import { defineConfig, devices } from "@playwright/test";

const PORT = 4318;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && tsx scripts/e2e-server.ts",
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: {
      DCV_PORT: String(PORT),
      DCV_DATA_DIR: ".tmp/e2e-data",
      DCV_FIXTURES_DIR: ".tmp/e2e-fixtures"
    },
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe"
  }
});

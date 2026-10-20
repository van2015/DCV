import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createScenarioRepo, type FixtureScenario } from "../apps/server/test/helpers/fixtures.js";

const SCENARIOS: FixtureScenario[] = [
  "oo",
  "functional",
  "mixed",
  "monorepo",
  "broken",
  "large",
  "diff-colors",
  "edge-colors"
];

export async function createFixtureRepos(
  baseDir: string
): Promise<Record<FixtureScenario, string>> {
  await rm(baseDir, { recursive: true, force: true });
  await mkdir(baseDir, { recursive: true });
  const repos = {} as Record<FixtureScenario, string>;
  for (const scenario of SCENARIOS) {
    const directory = resolve(baseDir, scenario);
    const repo = await createScenarioRepo(directory, scenario);
    repos[scenario] = repo.repo;
  }
  return repos;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;

if (invokedDirectly) {
  const baseDir = resolve(process.env.DCV_FIXTURES_DIR ?? ".tmp/fixtures");
  const repos = await createFixtureRepos(baseDir);
  process.stdout.write(`${JSON.stringify(repos, null, 2)}\n`);
}

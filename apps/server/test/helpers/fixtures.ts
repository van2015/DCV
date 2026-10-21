import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { git, headSha, initRepo } from "./git.js";

export type FixtureScenario =
  | "oo"
  | "functional"
  | "mixed"
  | "monorepo"
  | "broken"
  | "large"
  | "diff-colors"
  | "edge-colors"
  | "heatmap";

export interface FixtureCommit {
  sha: string;
  subject: string;
}

export interface ScenarioRepo {
  repo: string;
  commits: FixtureCommit[];
}

interface CommitSpec {
  message: string;
  files?: Record<string, string>;
  moves?: [string, string][];
  remove?: string[];
}

const BASE_DATE = Date.UTC(2024, 0, 1);

function dateFor(index: number): string {
  return new Date(BASE_DATE + index * 86_400_000).toISOString();
}

function scenarioCommits(scenario: FixtureScenario): CommitSpec[] {
  switch (scenario) {
    case "oo":
      return [
        {
          message: "modelo OO inicial",
          files: {
            "src/domain/animal.ts": [
              "export interface Animal {",
              "  name: string;",
              "  speak(): string;",
              "}",
              "",
              "export abstract class BasePet {",
              "  protected name = \"\";",
              "  abstract speak(): string;",
              "}",
              "",
              "export class Dog extends BasePet implements Animal {",
              "  speak(): string {",
              "    return \"guau\";",
              "  }",
              "}",
              ""
            ].join("\n"),
            "src/index.ts": "export const app = \"oo\";\n"
          }
        },
        {
          message: "agrega color y metodo bark",
          files: {
            "src/domain/animal.ts": [
              "export interface Animal {",
              "  name: string;",
              "  speak(): string;",
              "}",
              "",
              "export abstract class BasePet {",
              "  protected name = \"\";",
              "  abstract speak(): string;",
              "}",
              "",
              "export enum Color {",
              "  Brown,",
              "  Black,",
              "}",
              "",
              "export class Dog extends BasePet implements Animal {",
              "  speak(): string {",
              "    return \"guau\";",
              "  }",
              "",
              "  bark(): string {",
              "    return \"wow\";",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "renombra archivo a creature",
          moves: [["src/domain/animal.ts", "src/domain/creature.ts"]],
          files: {
            "src/domain/creature.ts": [
              "export interface Animal {",
              "  name: string;",
              "  speak(): string;",
              "}",
              "",
              "export abstract class BasePet {",
              "  protected name = \"\";",
              "  abstract speak(): string;",
              "}",
              "",
              "export enum Color {",
              "  Brown,",
              "  Black,",
              "}",
              "",
              "export class Dog extends BasePet implements Animal {",
              "  speak(): string {",
              "    return \"GUAU\";",
              "  }",
              "",
              "  bark(): string {",
              "    return \"wow\";",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        }
      ];
    case "functional":
      return [
        {
          message: "utilidades iniciales",
          files: {
            "src/util/math.ts": [
              "export function add(a: number, b: number): number {",
              "  return a + b;",
              "}",
              ""
            ].join("\n"),
            "src/util/text.ts": [
              "export function normalize(input: string): string {",
              "  return input.trim();",
              "}",
              ""
            ].join("\n"),
            "src/app.ts": [
              "import { add } from \"./util/math\";",
              "",
              "export function sumAll(values: number[]): number {",
              "  return values.reduce(add, 0);",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "usa normalize",
          files: {
            "src/app.ts": [
              "import { add } from \"./util/math\";",
              "import { normalize } from \"./util/text\";",
              "",
              "export function sumAll(values: number[]): number {",
              "  return values.reduce(add, 0);",
              "}",
              "",
              "export function clean(input: string): string {",
              "  return normalize(input);",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "solo formato y comentarios",
          files: {
            "src/util/math.ts": [
              "// Suma dos numeros.",
              "export function add(a: number, b: number): number {",
              "    return a + b;",
              "}",
              ""
            ].join("\n")
          }
        }
      ];
    case "mixed":
      return [
        {
          message: "modelo mixto",
          files: {
            "src/model.ts": [
              "export type Identifier = string;",
              "",
              "export interface Entity {",
              "  id: Identifier;",
              "}",
              "",
              "export class User implements Entity {",
              "  constructor(public id: Identifier) {}",
              "}",
              ""
            ].join("\n"),
            "src/helpers.ts": [
              "export function formatId(id: string): string {",
              "  return id.toLowerCase();",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "cambia firma y agrega helper",
          files: {
            "src/model.ts": [
              "export type Identifier = string | number;",
              "",
              "export interface Entity {",
              "  id: Identifier;",
              "}",
              "",
              "export class User implements Entity {",
              "  constructor(public id: Identifier) {}",
              "}",
              ""
            ].join("\n"),
            "src/helpers.ts": [
              "export function formatId(id: string): string {",
              "  return id.toLowerCase();",
              "}",
              "",
              "export function formatName(name: string): string {",
              "  return name.trim();",
              "}",
              ""
            ].join("\n")
          }
        }
      ];
    case "monorepo":
      return [
        {
          message: "monorepo con alias",
          files: {
            "tsconfig.json": [
              "{",
              "  \"compilerOptions\": {",
              "    \"baseUrl\": \".\",",
              "    \"paths\": {",
              "      \"@core/*\": [\"packages/core/src/*\"]",
              "    }",
              "  }",
              "}",
              ""
            ].join("\n"),
            "packages/core/src/index.ts": [
              "export class Core {",
              "  version(): string {",
              "    return \"1.0.0\";",
              "  }",
              "}",
              ""
            ].join("\n"),
            "packages/app/src/main.ts": [
              "import { Core } from \"@core/index\";",
              "",
              "export function boot(): string {",
              "  return new Core().version();",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "core cambia de version",
          files: {
            "packages/core/src/index.ts": [
              "export class Core {",
              "  version(): string {",
              "    return \"2.0.0\";",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        }
      ];
    case "broken":
      return [
        {
          message: "base sana",
          files: {
            "src/ok.ts": [
              "export class Ok {",
              "  value(): number {",
              "    return 1;",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "archivo con error de sintaxis",
          files: {
            "src/broken.ts": "export function broken( {\n",
            "src/ok.ts": [
              "export class Ok {",
              "  value(): number {",
              "    return 2;",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "arregla sintaxis",
          files: {
            "src/broken.ts": [
              "export function fixed(value: number): number {",
              "  return value;",
              "}",
              ""
            ].join("\n")
          }
        }
      ];
    case "large": {
      const files: Record<string, string> = {};
      for (let file = 0; file < 10; file += 1) {
        const lines: string[] = [];
        for (let index = 0; index < 6; index += 1) {
          const value = file * 6 + index;
          lines.push(
            `export class C${file}_${index} {`,
            "  value(): number {",
            `    return ${value};`,
            "  }",
            "}",
            ""
          );
        }
        files[`src/file${file}.ts`] = lines.join("\n");
      }
      const changed: Record<string, string> = { ...files };
      changed["src/file0.ts"] = files["src/file0.ts"]!.replace("return 0;", "return 100;");
      return [
        { message: "muchas clases", files },
        { message: "modifica una clase", files: changed }
      ];
    }
    case "diff-colors":
      return [
        {
          message: "modelo con baja",
          files: {
            "src/base.ts": [
              "export class Stable {",
              "  value(): number {",
              "    return 1;",
              "  }",
              "}",
              "",
              "export class Gone {",
              "  value(): number {",
              "    return 2;",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "elimina Gone y agrega Added",
          files: {
            "src/base.ts": [
              "export class Stable {",
              "  value(): number {",
              "    return 1;",
              "  }",
              "}",
              "",
              "export class Added {",
              "  label = \"nuevo\";",
              "",
              "  run(): string {",
              "    return this.label;",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        }
      ];
    case "heatmap":
      return [
        {
          message: "base del mapa de calor",
          files: {
            "src/hot.ts": [
              "export class Hot {",
              "  alpha(): string {",
              "    return \"a\";",
              "  }",
              "}",
              ""
            ].join("\n"),
            "src/cold.ts": [
              "export class Cold {",
              "  chill(): string {",
              "    return \"cold\";",
              "  }",
              "}",
              ""
            ].join("\n"),
            "src/steady.ts": [
              "export class Steady {",
              "  step(): number {",
              "    return 1;",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "Hot añade beta y Steady cambia su cuerpo",
          files: {
            "src/hot.ts": [
              "export class Hot {",
              "  alpha(): string {",
              "    return \"a\";",
              "  }",
              "",
              "  beta(): string {",
              "    return \"b\";",
              "  }",
              "}",
              ""
            ].join("\n"),
            "src/steady.ts": [
              "export class Steady {",
              "  step(): number {",
              "    return 2;",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "Hot añade gamma y Cold añade freeze",
          files: {
            "src/hot.ts": [
              "export class Hot {",
              "  alpha(): string {",
              "    return \"a\";",
              "  }",
              "",
              "  beta(): string {",
              "    return \"b\";",
              "  }",
              "",
              "  gamma(): string {",
              "    return \"g\";",
              "  }",
              "}",
              ""
            ].join("\n"),
            "src/cold.ts": [
              "export class Cold {",
              "  chill(): string {",
              "    return \"cold\";",
              "  }",
              "",
              "  freeze(): string {",
              "    return \"frozen\";",
              "  }",
              "}",
              ""
            ].join("\n"),
            "src/steady.ts": [
              "export class Steady {",
              "  step(): number {",
              "    return 3;",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "Hot añade delta y Steady cambia otra vez",
          files: {
            "src/hot.ts": [
              "export class Hot {",
              "  alpha(): string {",
              "    return \"a\";",
              "  }",
              "",
              "  beta(): string {",
              "    return \"b\";",
              "  }",
              "",
              "  gamma(): string {",
              "    return \"g\";",
              "  }",
              "",
              "  delta(): string {",
              "    return \"d\";",
              "  }",
              "}",
              ""
            ].join("\n"),
            "src/steady.ts": [
              "export class Steady {",
              "  step(): number {",
              "    return 4;",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "Hot añade epsilon y aparece Newbie",
          files: {
            "src/hot.ts": [
              "export class Hot {",
              "  alpha(): string {",
              "    return \"a\";",
              "  }",
              "",
              "  beta(): string {",
              "    return \"b\";",
              "  }",
              "",
              "  gamma(): string {",
              "    return \"g\";",
              "  }",
              "",
              "  delta(): string {",
              "    return \"d\";",
              "  }",
              "",
              "  epsilon(): string {",
              "    return \"e\";",
              "  }",
              "}",
              ""
            ].join("\n"),
            "src/newbie.ts": [
              "import { Hot } from \"./hot\";",
              "",
              "export class Newbie extends Hot {",
              "  start(): string {",
              "    return \"new\";",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        }
      ];
    case "edge-colors":
      return [
        {
          message: "relaciones iniciales",
          files: {
            "src/base.ts": [
              "export class Base {",
              "  id(): string {",
              "    return \"base\";",
              "  }",
              "}",
              ""
            ].join("\n"),
            "src/stable.ts": [
              "import { Base } from \"./base\";",
              "",
              "export interface Contract {",
              "  run(): string;",
              "}",
              "",
              "export class Stable extends Base implements Contract {",
              "  run(): string {",
              "    return \"stable\";",
              "  }",
              "}",
              "",
              "export class Holder {",
              "  item: Base;",
              "",
              "  constructor(item: Base) {",
              "    this.item = item;",
              "  }",
              "}",
              ""
            ].join("\n"),
            "src/legacy.ts": [
              "import { Base } from \"./base\";",
              "",
              "export class Gone extends Base {",
              "  label = \"viejo\";",
              "",
              "  run(): number {",
              "    return 1;",
              "  }",
              "}",
              ""
            ].join("\n")
          }
        },
        {
          message: "elimina relaciones antiguas y agrega nuevas",
          files: {
            "src/added.ts": [
              "import { Base } from \"./base\";",
              "",
              "export class Added extends Base {",
              "  step = 2;",
              "",
              "  next(): string {",
              "    return \"added\";",
              "  }",
              "}",
              ""
            ].join("\n")
          },
          remove: ["src/legacy.ts"]
        }
      ];
  }
}

export async function createScenarioRepo(
  directory: string,
  scenario: FixtureScenario
): Promise<ScenarioRepo> {
  await initRepo(directory);
  const commits: FixtureCommit[] = [];
  const specs = scenarioCommits(scenario);

  for (const [index, spec] of specs.entries()) {
    for (const [from, to] of spec.moves ?? []) {
      await mkdir(dirname(join(directory, to)), { recursive: true });
      await git(directory, ["mv", "--", from, to]);
    }
    for (const [relativePath, contents] of Object.entries(spec.files ?? {})) {
      const filePath = join(directory, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, contents, "utf8");
    }
    for (const relativePath of spec.remove ?? []) {
      await git(directory, ["rm", "--", relativePath]);
    }
    await git(directory, ["add", "-A"]);
    const date = dateFor(index);
    await git(directory, ["commit", "-m", spec.message], {
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date
    });
    commits.push({ sha: await headSha(directory), subject: spec.message });
  }

  return { repo: directory, commits };
}

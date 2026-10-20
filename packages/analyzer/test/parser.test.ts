import { describe, expect, it } from "vitest";
import { parseFile } from "../src/parser.js";

function parse(content: string, path = "src/sample.ts", scriptKind: "ts" | "tsx" = "ts") {
  return parseFile({ path, content, contentHash: "hash-1", scriptKind });
}

describe("parseFile declarations", () => {
  it("extracts classes, interfaces, enums, type aliases and functions", () => {
    const model = parse(`
import { Base } from "./base";
import type { IPerson } from "./person";

export abstract class UserService extends Base implements IPerson {
  static readonly version = "1";
  private cache = new Map<string, IPerson>();
  #secret = 1;
  protected name?: string;

  constructor(private id: string) {
    super();
  }

  async find(id: string, extra?: number): Promise<IPerson | undefined> {
    return undefined;
  }

  get label(): string {
    return "x";
  }

  set label(value: string) {
    this.name = value;
  }

  run(): void {}
}

interface IPerson extends Named {
  readonly id: string;
  name?: string;
  greet(name: string): string;
}

enum Role {
  Admin = "admin",
  User,
}

type UserId = string | number;

export function buildUser(id: UserId): IPerson {
  return {} as IPerson;
}

export const toUpper = (value: string) => value.toUpperCase();

function internal() {
  return 1;
}

export default function factory(): UserService {
  return new UserService("1");
}
`);

    const byName = new Map(model.declarations.map((declaration) => [declaration.name, declaration]));
    expect([...byName.keys()]).toEqual([
      "UserService",
      "IPerson",
      "Role",
      "UserId",
      "buildUser",
      "toUpper",
      "internal",
      "factory"
    ]);

    const service = byName.get("UserService")!;
    expect(service.kind).toBe("class");
    expect(service.exported).toBe(true);
    expect(service.abstract).toBe(true);
    expect(service.heritage).toEqual([
      { kind: "extends", name: "Base" },
      { kind: "implements", name: "IPerson" }
    ]);
    expect(service.sourceRange.startLine).toBeGreaterThan(0);

    const memberByName = new Map(service.members.map((member) => [member.name, member]));
    expect(memberByName.get("version")).toMatchObject({
      kind: "property",
      static: true,
      readonly: true,
      visibility: "public"
    });
    expect(memberByName.get("cache")).toMatchObject({
      kind: "property",
      visibility: "private",
      type: null
    });
    expect(memberByName.get("cache")!.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(memberByName.get("#secret")).toMatchObject({ visibility: "private" });
    expect(memberByName.get("name")).toMatchObject({ visibility: "protected", optional: true });
    expect(memberByName.get("constructor")).toMatchObject({ kind: "constructor" });
    expect(memberByName.get("find")).toMatchObject({ kind: "method", async: true });
    expect(memberByName.get("find")!.signature).toContain(
      "find(id: string, extra?: number)"
    );
    expect(memberByName.get("find")!.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(service.members.filter((member) => member.name === "label")).toHaveLength(2);
    expect(service.members.find((member) => member.kind === "getter")!.signature).toContain(
      "get label()"
    );
    expect(service.members.find((member) => member.kind === "setter")!.signature).toContain(
      "set label(value: string)"
    );

    const person = byName.get("IPerson")!;
    expect(person.kind).toBe("interface");
    expect(person.exported).toBe(false);
    expect(person.heritage).toEqual([{ kind: "extends", name: "Named" }]);
    const personMembers = new Map(person.members.map((member) => [member.name, member]));
    expect(personMembers.get("id")).toMatchObject({ readonly: true, type: "string" });
    expect(personMembers.get("name")).toMatchObject({ optional: true });
    expect(personMembers.get("greet")!.signature).toContain("greet(name: string): string");
    expect(personMembers.get("greet")!.bodyHash).toBeNull();

    const role = byName.get("Role")!;
    expect(role.kind).toBe("enum");
    expect(role.members.map((member) => member.name)).toEqual(["Admin", "User"]);
    expect(role.members[0]!.bodyHash).not.toBeNull();

    const userId = byName.get("UserId")!;
    expect(userId.kind).toBe("type");
    expect(userId.type).toBe("string | number");

    const buildUser = byName.get("buildUser")!;
    expect(buildUser).toMatchObject({ kind: "function", exported: true, async: false });
    expect(buildUser.signature).toContain("buildUser(id: UserId)");
    expect(buildUser.bodyHash).toMatch(/^[0-9a-f]{64}$/);

    const toUpper = byName.get("toUpper")!;
    expect(toUpper.signature).toBe("toUpper(value: string)");
    expect(toUpper.type).toBeNull();
    expect(toUpper.bodyHash).not.toBeNull();

    const internal = byName.get("internal")!;
    expect(internal.exported).toBe(false);

    const factory = byName.get("factory")!;
    expect(factory).toMatchObject({ kind: "function", exported: true, defaultExport: true });
  });

  it("marks declarations exported through export lists and export default", () => {
    const model = parse(`
class Hidden {}
function visible() {}
export { Hidden, visible as publicVisible };
export default Hidden;
`);

    const hidden = model.declarations.find((declaration) => declaration.name === "Hidden")!;
    expect(hidden.exported).toBe(true);
    expect(hidden.defaultExport).toBe(true);

    const visible = model.declarations.find((declaration) => declaration.name === "visible")!;
    expect(visible.exported).toBe(true);
    expect(visible.defaultExport).toBe(false);
  });

  it("extracts an anonymous default function", () => {
    const model = parse("export default () => 42;");
    expect(model.declarations).toHaveLength(1);
    expect(model.declarations[0]).toMatchObject({
      kind: "function",
      name: "default",
      exported: true,
      defaultExport: true
    });
  });

  it("extracts imports and re-exports", () => {
    const model = parse(`
import Default, { A as B, C } from "./dep";
import * as ns from "./namespace";
import "./side-effect";
export { B, default as D } from "./other";
export * from "./all";
export * as everything from "./all-in-one";
import legacy = require("./legacy");
`);

    const [dep, namespace, sideEffect, other, all, allInOne, legacy] = model.imports;
    expect(dep).toMatchObject({
      specifier: "./dep",
      typeOnly: false,
      reExport: false,
      bindings: [
        { imported: "default", local: "Default" },
        { imported: "A", local: "B" },
        { imported: "C", local: "C" }
      ]
    });
    expect(namespace!.bindings).toEqual([{ imported: "*", local: "ns" }]);
    expect(sideEffect!.bindings).toEqual([]);
    expect(other).toMatchObject({
      specifier: "./other",
      reExport: true,
      starReExport: false,
      bindings: [
        { imported: "B", local: "B" },
        { imported: "default", local: "D" }
      ]
    });
    expect(all).toMatchObject({ starReExport: true, bindings: [] });
    expect(allInOne!.bindings).toEqual([{ imported: "*", local: "everything" }]);
    expect(legacy!.bindings).toEqual([{ imported: "=", local: "legacy" }]);
  });
});

describe("parseFile body hashes", () => {
  it("ignores comments and formatting but detects body changes", () => {
    const formatted = parse(
      `export function add(a: number, b: number) {
  // sum the values
  return a + b;
}`
    );
    const compact = parse(`export function add(a: number, b: number){/* sum */ return a+b;}`);
    const changed = parse(`export function add(a: number, b: number){ return a - b; }`);

    const formattedHash = formatted.declarations[0]!.bodyHash;
    const compactHash = compact.declarations[0]!.bodyHash;
    const changedHash = changed.declarations[0]!.bodyHash;

    expect(formattedHash).toBe(compactHash);
    expect(changedHash).not.toBe(formattedHash);
    expect(formatted.declarations[0]!.signature).toBe(changed.declarations[0]!.signature);
  });

  it("hashes method bodies and property initializers", () => {
    const model = parse(`
export class Counter {
  value = 0;
  increment(): void {
    this.value += 1;
  }
}
`);
    const counter = model.declarations[0]!;
    expect(counter.members[0]!.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(counter.members[1]!.bodyHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseFile diagnostics", () => {
  it("reports syntax errors without throwing", () => {
    const model = parse("export class Broken { run( }\n");
    expect(model.diagnostics.length).toBeGreaterThan(0);
    expect(model.diagnostics[0]!.severity).toBe("error");
    expect(model.diagnostics[0]!.code).toMatch(/^TS\d+$/);
    expect(model.diagnostics[0]!.line).toBeGreaterThan(0);
  });

  it("parses tsx without errors", () => {
    const model = parse(
      "export const Button = (props: { label: string }) => <button>{props.label}</button>;\n",
      "src/Button.tsx",
      "tsx"
    );
    expect(model.diagnostics).toEqual([]);
    expect(model.declarations[0]!.name).toBe("Button");
  });
});

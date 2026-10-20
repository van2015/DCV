import { expect, test, type Page } from "@playwright/test";
import { basename, resolve } from "node:path";

function fixture(name: string): string {
  return resolve(process.env.DCV_FIXTURES_DIR ?? ".tmp/e2e-fixtures", name);
}

async function importProject(page: Page, location: string): Promise<void> {
  await page.getByRole("button", { name: "Importar proyecto" }).click();
  const dialog = page.getByRole("dialog", { name: "Importar proyecto" });
  await dialog.getByLabel("Ubicación").fill(location);
  await dialog.getByRole("button", { name: "Importar", exact: true }).click();
  const card = page.locator(".project-card", {
    has: page.getByRole("heading", { name: basename(location) })
  });
  await expect(card).toBeVisible();
}

async function openProject(page: Page, name: string): Promise<void> {
  const card = page.locator(".project-card", {
    has: page.getByRole("heading", { name })
  });
  await card.getByRole("link", { name: "Abrir" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("importa un proyecto, navega el histórico y cambia de vista", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Biblioteca de proyectos" })).toBeVisible();

  await importProject(page, fixture("oo"));
  await openProject(page, "oo");

  const timeline = page.locator('ol[aria-label="Histórico de commits"] li');
  await expect(timeline).toHaveCount(3);
  await expect(page.locator(".player-position")).toHaveText("1 / 3");
  await expect(page.getByText("Línea base del histórico.")).toBeVisible();

  await page.getByRole("button", { name: "Siguiente →" }).click();
  await expect(page.locator(".player-position")).toHaveText("2 / 3");
  await expect(timeline.nth(1).locator("button")).toHaveAttribute("aria-current", "true");

  await page.getByLabel("Vista").selectOption("modules");
  const canvas = page.getByLabel("Diagrama de modules");
  await expect(canvas.getByLabel("módulo src/domain/animal.ts")).toBeVisible();
  await expect(canvas.getByLabel("módulo src/index.ts")).toBeVisible();

  await page.getByLabel("Vista").selectOption("packages");
  await expect(page.getByLabel("paquete src/domain")).toBeVisible();

  await page.getByRole("button", { name: "← Anterior" }).click();
  await expect(page.locator(".player-position")).toHaveText("1 / 3");
});

test("enfoca nodos y persiste la cámara entre recargas", async ({ page }) => {
  await page.goto("/");
  await importProject(page, fixture("large"));
  await openProject(page, "large");

  const canvas = page.getByLabel("Diagrama de classes");
  await expect(canvas.locator(".react-flow__node").first()).toBeVisible();

  await page.getByRole("button", { name: "Siguiente →" }).click();
  await expect(page.locator(".player-position")).toHaveText("2 / 2");

  await page.getByLabel("Modo foco").check();
  await expect(canvas.locator(".react-flow__node.dimmed").first()).toBeVisible();

  const pane = canvas.locator(".react-flow__pane");
  const box = await pane.boundingBox();
  if (!box) {
    throw new Error("El lienzo no tiene dimensiones visibles.");
  }
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 160, center.y + 90, { steps: 12 });
  await page.mouse.up();

  const viewport = canvas.locator(".react-flow__viewport");
  const before = await viewport.evaluate((element) => (element as HTMLElement).style.transform);
  expect(before).toContain("translate");

  await page.reload();
  await expect(canvas.locator(".react-flow__node").first()).toBeVisible();
  await expect(async () => {
    const after = await viewport.evaluate((element) => (element as HTMLElement).style.transform);
    expect(after).toBe(before);
  }).toPass({ timeout: 15_000 });
});

function translateOf(transform: string): { x: number; y: number } {
  const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
  if (!match) {
    throw new Error(`Transform inesperado: ${transform}`);
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

test("restaura la posición de los nodos al volver a un commit", async ({ page }) => {
  await page.goto("/");
  await importProject(page, fixture("functional"));
  await openProject(page, "functional");
  await page.getByLabel("Vista").selectOption("modules");
  await page.getByRole("button", { name: "Siguiente →" }).click();
  await expect(page.locator(".player-position")).toHaveText("2 / 3");

  const canvas = page.getByLabel("Diagrama de modules");
  const node = canvas.locator('.react-flow__node[data-id="module:src/app.ts"]');
  await expect(node).toBeVisible();
  const readTransform = () =>
    node.evaluate((element) => (element as HTMLElement).style.transform);
  const before = translateOf(await readTransform());

  const box = await node.boundingBox();
  if (!box) {
    throw new Error("El nodo no tiene dimensiones visibles.");
  }
  const startX = box.x + 30;
  const startY = box.y + 16;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 140, startY + 90, { steps: 12 });
  await page.mouse.up();

  let moved = before;
  await expect(async () => {
    moved = translateOf(await readTransform());
    expect(moved).not.toEqual(before);
  }).toPass();

  await page.getByRole("button", { name: "Siguiente →" }).click();
  await expect(page.locator(".player-position")).toHaveText("3 / 3");
  await page.getByRole("button", { name: "← Anterior" }).click();
  await expect(page.locator(".player-position")).toHaveText("2 / 3");
  await expect(node).toBeVisible();

  await expect(async () => {
    const restored = translateOf(await readTransform());
    expect(Math.abs(restored.x - moved.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(restored.y - moved.y)).toBeLessThanOrEqual(1);
  }).toPass({ timeout: 15_000 });
});

function colorChannels(value: string): [number, number, number] {
  const legacy = /^rgba?\(([^)]+)\)/.exec(value);
  if (legacy) {
    const [red, green, blue] = legacy[1]!.split(",").map(Number);
    return [red!, green!, blue!];
  }
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (srgb) {
    return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
  }
  throw new Error(`Color inesperado: ${value}`);
}

function expectChannelDominance(color: string, dominant: "red" | "green"): void {
  const [red, green, blue] = colorChannels(color);
  if (dominant === "green") {
    expect(green).toBeGreaterThan(red + 5);
    expect(green).toBeGreaterThan(blue + 5);
    return;
  }
  expect(red).toBeGreaterThan(green + 5);
  expect(red).toBeGreaterThan(blue + 5);
}

test("tiñe los nodos añadidos y eliminados según el estado", async ({ page }) => {
  await page.goto("/");
  await importProject(page, fixture("diff-colors"));
  await openProject(page, "diff-colors");
  await page.getByLabel("Vista").selectOption("classes");
  await expect(page.locator(".player-position")).toHaveText("1 / 2");

  await page.getByRole("button", { name: "Siguiente →" }).click();
  await expect(page.locator(".player-position")).toHaveText("2 / 2");

  const canvas = page.getByLabel("Diagrama de classes");
  const added = canvas.getByLabel("class Added");
  await expect(added).toHaveClass(/change-added/);
  await expect(added.locator(".uml-node-header .change-badge")).toHaveText("+");
  const addedColors = await added.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderTopColor };
  });
  expectChannelDominance(addedColors.background, "green");
  expectChannelDominance(addedColors.border, "green");

  const removed = canvas.getByLabel("class Gone (eliminado)");
  await expect(removed).toHaveClass(/change-removed/);
  await expect(removed).toHaveClass(/ghost/);
  await expect(removed.locator(".uml-node-header .change-badge")).toHaveText("−");
  const removedColors = await removed.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderTopColor };
  });
  expectChannelDominance(removedColors.background, "red");
  expectChannelDominance(removedColors.border, "red");
});

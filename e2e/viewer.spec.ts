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

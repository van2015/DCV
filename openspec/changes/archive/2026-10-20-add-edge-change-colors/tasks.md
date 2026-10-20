## 1. Contrato y diff

- [x] 1.1 Añadir `typeOnly` a `EdgeChange` en `packages/shared/src/index.ts` y propagarlo en `diffEdges` de `packages/analyzer/src/diff.ts`; actualizar el test de aristas en `packages/analyzer/test/diff.test.ts` y verificar con `pnpm --filter @dcv/analyzer test diff.test.ts`.
- [x] 1.2 Verificar que el nuevo campo llega a la respuesta del servidor y no rompe tipos ni tests existentes con `pnpm typecheck` y `pnpm --filter @dcv/server test`.

## 2. Overlay de aristas

- [x] 2.1 Extender `DiagramOverlay` con `edgeStatuses` y `ghostEdges`, y calcular en `buildOverlay` las relaciones añadidas y las eliminadas con resolución de extremos actual/fantasma para clases y módulos; añadir tests en `apps/web/src/diagram/overlay.test.ts` y verificar con `pnpm --filter @dcv/web test overlay.test.ts`.
- [x] 2.2 Implementar la clasificación agregada de paquetes (añadida con al menos una importación nueva; eliminada solo si desaparece la arista agregada, agrupando importaciones y conservando `typeOnly`) y cubrirla con tests en `overlay.test.ts`; verificar con `pnpm --filter @dcv/web test overlay.test.ts`.

## 3. Renderizado y estilos

- [x] 3.1 Añadir en `apps/web/src/styles.css` los estilos `edge-added` (verde) y `edge-removed` (rojo discontinuo, con variante de solo tipo), después de las reglas por tipo, y comprobar el marcador de flecha; verificar con `pnpm --filter @dcv/web build`.
- [x] 3.2 Aplicar el estado a las aristas actuales en `buildFlow` de `apps/web/src/diagram/DiagramCanvas.tsx` y añadir las aristas fantasma solo cuando ambos extremos estén visibles, sin incluirlas en layout ni foco; ampliar `apps/web/src/diagram/DiagramCanvas.test.tsx` y verificar con `pnpm --filter @dcv/web test DiagramCanvas.test.tsx`.

## 4. Fixture y E2E

- [x] 4.1 Añadir el escenario `edge-colors` a `apps/server/test/helpers/fixtures.ts` y a `scripts/create-fixture-repos.ts`: dos commits con herencia e importaciones que se añaden y eliminan, incluyendo una clase eliminada; verificar con `pnpm typecheck`.
- [x] 4.2 Añadir a `e2e/viewer.spec.ts` una prueba que compruebe en clases y módulos el `stroke` calculado verde de aristas añadidas y rojo de aristas fantasma, además de su desaparición al cambiar de commit; verificar con `pnpm e2e`.

## 5. Documentación y verificación final

- [x] 5.1 Actualizar `README.md` con el coloreado de relaciones y los nuevos conteos de pruebas y E2E; verificar que la descripción coincide con el comportamiento implementado.
- [x] 5.2 Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm e2e`, y confirmar que todo pasa con los conteos reflejados en el README.

## 1. Agregación histórica

- [x] 1.1 Añadir `HeatmapResponse` a `packages/shared` con `branch`, `commit`, `commits`, `nodes` y `members`; verificar con `pnpm --filter @dcv/shared typecheck` y `pnpm --filter @dcv/shared test`.
- [x] 1.2 Crear `apps/server/src/analysis/heatmap.ts` con el agregador puro de deltas: conteo único por commit, línea base sin actividad, unión de miembros en declaraciones, módulos, paquetes y transferencia/descarte de identidad en renombrados, movimientos y eliminaciones; cubrir cada caso en `heatmap.test.ts` y verificar con `pnpm --filter @dcv/server test heatmap.test.ts`.
- [x] 1.3 Crear `HeatmapService` con caché incremental por proyecto y rama, recorrido secuencial de snapshots y reutilización de deltas al retroceder o avanzar; probar reutilización, aislamiento entre ramas y commit fuera de la rama, y verificar con `pnpm --filter @dcv/server test heatmap-service.test.ts`.

## 2. API y cliente

- [x] 2.1 Registrar `GET /api/projects/:id/commits/:sha/heatmap?branch=...`, resolver renombrados de archivos con `diffTrees`, devolver 404 si el SHA no pertenece al histórico lineal y cubrir éxito y errores con pruebas de API/integración; verificar con `pnpm --filter @dcv/server test`.
- [x] 2.2 Añadir `getHeatmap` a `DcvClient` y a los dobles de prueba (`ClientLike`/`FakeClient`); verificar ruta, query de rama y manejo de errores con `pnpm --filter @dcv/web test client.test.ts store.test.ts`.

## 3. Estado y controles

- [x] 3.1 Añadir `heatmapEnabled` a `VisualControls` y `DEFAULT_VISUAL_CONTROLS`, con lectura y escritura persistente; ampliar `persistence.test.ts` y verificar con `pnpm --filter @dcv/web test persistence.test.ts`.
- [x] 3.2 Añadir `heatmap`, `heatmapStatus` y `heatmapError` al store, cargar solo cuando el control está activo, proteger contra respuestas fuera de orden y limpiar al cambiar de proyecto o rama; cubrir apertura, navegación, error y reintento en `store.test.ts`.
- [x] 3.3 Conectar el control «Mapa de calor» y el efecto de carga en `ProjectViewerPage`, incluyendo el estado persistido al reabrir; verificar con `pnpm --filter @dcv/web test ProjectViewerPage.test.tsx store.test.ts`.

## 4. Visualización

- [x] 4.1 Crear `apps/web/src/diagram/heatmap.ts` con `heatLevel(count, max)` de cuatro niveles, cálculo del máximo por nodos de la vista y máximo de miembros; probar límites, máximo cero y entidades sin actividad con `heatmap.test.ts` y `pnpm --filter @dcv/web test heatmap.test.ts`.
- [x] 4.2 Propagar conteo, nivel y niveles de miembros por `DiagramCanvas`/`CanvasLeafData` solo cuando el mapa está activo; verificar con `pnpm --filter @dcv/web test DiagramCanvas.test.tsx` y `pnpm --filter @dcv/web typecheck`.
- [x] 4.3 Aplicar clases `heat-1`…`heat-4` en `ClassNodeCard`, `ModuleNodeCard` y `PackageNodeCard`, incluidos miembros, sin teñir fantasmas ni alterar las marcas de diff; verificar con `pnpm --filter @dcv/web test nodes.test.tsx`.
- [x] 4.4 Añadir la leyenda con degradado, máximo, commits considerados, carga y error con reintento, y estilos azules posteriores a los tintes verde/rojo que neutralicen la caja solo cuando el calor está activo; verificar la convivencia y el retorno a la apariencia de diff con `pnpm --filter @dcv/web test` y `pnpm lint`.

## 5. Fixture, E2E y cierre

- [x] 5.1 Añadir el escenario `heatmap` a `apps/server/test/helpers/fixtures.ts` y a `scripts/create-fixture-repos.ts`, con al menos cuatro commits y actividad desigual en clases, métodos, módulos y paquetes; verificar con `pnpm typecheck` y `pnpm --filter @dcv/server test`.
- [x] 5.2 Añadir una prueba E2E que active el mapa, compruebe intensidades distintas, leyenda, persistencia al navegar/reabrir, convivencia con marcas/aristas de diff y actualización al retroceder de commit; verificar con `pnpm e2e`.
- [x] 5.3 Documentar en `README.md` la métrica por commits, acumulación hasta el commit seleccionado, escala azul, convivencia con el diff y los conteos actualizados de pruebas/E2E.
- [x] 5.4 Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e` y `openspec validate add-change-heatmap --strict`, y confirmar que todo pasa con los conteos documentados.

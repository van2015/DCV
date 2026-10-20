## 1. Estilos de nodos

- [x] 1.1 Añadir en `apps/web/src/styles.css` las variables `--change-color` y las reglas compartidas de fondo, borde y cabecera para `.uml-node.change-added` y `.uml-node.change-removed`, con las mezclas suaves definidas en design.md; verificar que `pnpm --filter @dcv/web build` compila el CSS sin errores.
- [x] 1.2 Eliminar `filter: saturate(0.4)` de `.uml-node.ghost` manteniendo opacidad 0,55 y borde discontinuo; verificar que `pnpm --filter @dcv/web build` sigue compilando y que la regla `.ghost` conserva solo esas dos propiedades visuales.

## 2. Pruebas de componentes

- [x] 2.1 Ampliar `apps/web/src/diagram/nodes.test.tsx` con casos que rendericen `ClassNodeCard` con estado `added` y con estado `removed` más `ghost`, y comprueben las clases `change-added`, `change-removed` y `ghost` junto a la insignia `+`/`−`; verificar con `pnpm --filter @dcv/web test nodes.test.tsx`.
- [x] 2.2 Reforzar el test existente de overlay en `apps/web/src/pages/ProjectViewerPage.test.tsx` para exigir que la clase `New` lleve `change-added` y que `Old (eliminado)` lleve `change-removed` y `ghost`; verificar con `pnpm --filter @dcv/web test ProjectViewerPage.test.tsx`.

## 3. Fixture y verificación E2E

- [x] 3.1 Añadir el escenario `diff-colors` a `FixtureScenario` y a `scenarioCommits` en `apps/server/test/helpers/fixtures.ts`: commit 1 con las clases `Stable` y `Gone`, commit 2 que elimina `Gone` y añade `Added`; registrar `diff-colors` en `SCENARIOS` de `scripts/create-fixture-repos.ts` y verificar con `pnpm typecheck`.
- [x] 3.2 Añadir a `e2e/viewer.spec.ts` un test que importe `diff-colors`, avance al segundo commit en la vista de clases y compruebe que `Added` tiene `change-added` con fondo y borde de dominancia verde, y que el fantasma de `Gone` tiene `change-removed` y `ghost` con dominancia roja, conservando ambas insignias; parsear los canales de `backgroundColor`/`borderColor` con tolerancia y verificar con `pnpm e2e`.

## 4. Documentación y verificación final

- [x] 4.1 Actualizar `README.md`: mencionar en la característica de overlay que los nodos añadidos se tiñen de verde suave y los eliminados de rojo suave, y ajustar los conteos de pruebas tras añadir los casos; verificar que la descripción coincide con el comportamiento implementado.
- [x] 4.2 Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm e2e`, y confirmar que todo pasa con los conteos reflejados en el README.

## 1. Apariencia de aristas

- [x] 1.1 Crear `apps/web/src/diagram/edgeStyle.ts` con un descriptor puro que combine `kind`, `status` y `typeOnly` en color (`#111111`, verde o rojo), patrón de línea (`solid`, `6 4`, `4 4`), forma de punta (`hollow-triangle` o `filled-triangle`) y clase de estado; añadir `edgeStyle.test.ts` con todas las combinaciones y verificar con `pnpm --filter @dcv/web test edgeStyle.test.ts`.
- [x] 1.2 Hacer que `buildFlowEdges` use el descriptor, asigne el edge type `uml` y transporte la apariencia necesaria al componente de arista; actualizar las aserciones existentes y verificar con `pnpm --filter @dcv/web test DiagramCanvas.test.tsx`.

## 2. Marcadores y estilos

- [x] 2.1 Implementar el edge type personalizado `UmlEdge` con `BaseEdge` y definiciones `<marker>` locales de id único: triángulo hueco blanco con contorno variable y triángulo relleno con color variable; registrar el tipo en `DiagramCanvas` y verificar con `pnpm --filter @dcv/web typecheck`.
- [x] 2.2 Actualizar `apps/web/src/styles.css` para dejar las relaciones sin cambios en negro (imports/extends/association continuas, implements discontinua, solo tipo `4 4`) y hacer que `edge-added`/`edge-removed` solo cambien el color, sin forzar patrón en las eliminadas; verificar que las reglas de estado quedan después de las de tipo con `pnpm --filter @dcv/web test`.

## 3. Cobertura unitaria

- [x] 3.1 Ampliar `DiagramCanvas.test.tsx` para comprobar forma de punta, color de marcador, clase de estado y patrón de línea en herencia, implementación, asociación, importación, solo tipo, añadida y eliminada; verificar con `pnpm --filter @dcv/web test DiagramCanvas.test.tsx`.

## 4. Fixture y E2E

- [x] 4.1 Ampliar el escenario `edge-colors` con relaciones estables de herencia, implementación, asociación e importación, manteniendo las relaciones añadidas y eliminadas actuales; verificar con `pnpm typecheck` y `pnpm --filter @dcv/server test`.
- [x] 4.2 Actualizar `e2e/viewer.spec.ts` para exigir negro continuo/discontinuo según el tipo, triángulos huecos/rellenos con el `fill`/`stroke` esperado, verde/rojo en los diffs y desaparición al cambiar de commit; verificar con `pnpm e2e`.

## 5. Documentación y verificación final

- [x] 5.1 Actualizar `README.md` con la nueva semántica de estilos UML y colores reservados al diff, y ajustar los conteos de pruebas y E2E si cambian.
- [x] 5.2 Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e` y `openspec validate use-uml-edge-styles --strict`, y confirmar que todo pasa con los conteos documentados.

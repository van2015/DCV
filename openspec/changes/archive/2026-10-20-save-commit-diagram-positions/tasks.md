## 1. Almacenamiento por commit

- [x] 1.1 Añadir a `VisualStateStore` las operaciones `loadCommitPositions`, `saveCommitPositions`, `hasCommitPositions` y `clearCommitPositions` con las claves `dcv.layout:<projectId>:<view>:commit:<sha>` y el índice `dcv.layout:<projectId>:<view>:commits`, serializando coordenadas redondeadas a enteros; verificar con tests nuevos en `apps/web/src/diagram/layout/persistence.test.ts` que cubran guardar, leer y eliminar por sha.
- [x] 1.2 Implementar la poda LRU de 50 commits por vista eliminando la clave del sha desplazado del índice; verificar con un test que guarda 51 commits y comprueba que el más antiguo deja de tener entrada y que la poda es independiente por vista.
- [x] 1.3 Añadir reintento con evicción ante fallo de cuota en `localStorage` y modo silencioso si aun así falla; verificar con un test que usa un `StorageLike` que lanza error de cuota y comprueba que se descartan las entradas más antiguas y que el diagrama no falla.
- [x] 1.4 Marcar uso al leer una entrada existente y dejar la clave heredada por vista como solo lectura (fallback); verificar con tests de que la lectura mueve el sha al frente del índice y de que la clave antigua nunca se escribe.

## 2. Herencia por cercanía

- [x] 2.1 Crear `apps/web/src/diagram/layout/inheritance.ts` con la función pura que elige el commit donante más cercano (empate favorece al commit anterior e ignora shas fuera del histórico); verificar con tests unitarios de todos los casos: sin candidatos, candidato anterior, candidato posterior, empate y sha ausente del histórico.
- [x] 2.2 Integrar el orden de resolución (entrada propia → donante más cercano → clave por vista → vacío) y guardar el resultado reconciliado como entrada del commit actual; verificar con un test de que tras reconciliar queda una entrada para el commit visitado y de que la clave por vista solo se usa cuando no hay ninguna entrada por commit.

## 3. Cableado del lienzo

- [x] 3.1 Pasar `selectedSha` y la lista de commits a `DiagramCanvas` desde `ProjectViewerPage`; verificar que el typecheck y `pnpm --filter @dcv/web test` siguen pasando con la vista renderizando.
- [x] 3.2 Usar la herencia en el efecto de layout y guardar en la entrada del commit actual tras reconciliar y tras `onNodeDragStop`; verificar con un test de `DiagramCanvas.test.tsx` que monta dos commits con posiciones guardadas distintas y restaura la de cada uno al alternar.
- [x] 3.3 Cambiar "Re-layout" para limpiar solo el commit actual con `clearCommitPositions`, sin tocar otros commits ni la clave por vista; verificar con un test de que el re-layout recalcula el commit actual y conserva intacta la entrada de otro commit.

## 4. Verificación final

- [x] 4.1 Extender `e2e/viewer.spec.ts` con un escenario que mueve un nodo en un commit, navega a otro y vuelve comprobando que la posición se restaura; verificar con `pnpm e2e` en verde.
- [x] 4.2 Ejecutar `pnpm lint && pnpm typecheck && pnpm test` y `pnpm e2e` completos; verificar que todo pasa y actualizar `README.md` (flujo de uso: las posiciones se guardan por commit; la cámara sigue por vista) dejando `pnpm exec prettier --check README.md` sin avisos.

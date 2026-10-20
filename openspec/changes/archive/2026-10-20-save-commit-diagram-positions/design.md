## Context

Ver proposal.md — Why. Estado actual relevante:

- `VisualStateStore` (`apps/web/src/diagram/layout/persistence.ts`) persiste en `localStorage` con claves `dcv.layout:<projectId>:<view>:positions`, `:camera` y el registro `controls`. Las posiciones se comparten entre commits y se restauran en cada navegación.
- `DiagramCanvas` carga `stored = force ? {} : visualStore.loadPositions(view)` dentro del efecto de layout, guarda el resultado de `reconcileLayout`, guarda tras `onNodeDragStop` y borra las posiciones de la vista al pulsar "Re-layout".
- `ProjectViewerPage` ya dispone de `state.selectedSha` y `state.commits` (histórico de más antiguo a más reciente, con el commit seleccionado indexado).
- `reconcileLayout` reutiliza posiciones conocidas, coloca nodos nuevos cerca de vecinos y separa solapamientos; los fantasmas reutilizan el id original, por lo que heredar posiciones los ubica igual que hoy.

## Goals / Non-Goals

**Goals:**

- Memoria espacial independiente por commit, proyecto y vista, con restauración exacta al volver a un commit visitado.
- Herencia determinista desde el commit más cercano del histórico que tenga posiciones guardadas, sin re-layout completo automático.
- Poda LRU de 50 commits por vista con degradación segura ante cuota de `localStorage`.

**Non-Goals:**

- Guardar la cámara por commit (sigue por proyecto y vista, decisión del usuario).
- UI para inspeccionar o borrar la memoria espacial de commits concretos.
- Persistencia en servidor o sincronización entre dispositivos.
- Heredar desde commits de otras ramas que no estén en el histórico actual.

## Decisions

### 1. Claves de almacenamiento por commit más un índice de uso

Se añaden a `VisualStateStore`:

- `dcv.layout:<projectId>:<view>:commit:<sha>` → posiciones con el mismo formato que hoy (`Record<id, {x,y,width,height}>`).
- `dcv.layout:<projectId>:<view>:commits` → índice `{ order: string[] }` con los shas más recientes primero (máximo 50).

`loadPositions`/`savePositions` (clave por vista) se conservan sin escrituras nuevas como **fallback de compatibilidad**: se leen solo cuando no hay ninguna entrada por commit para esa vista.

*Alternativas consideradas*: (a) un único registro por vista con mapa `sha → posiciones`; se descartó porque cada arrastre reescribiría varios MB. (b) Reutilizar la clave por vista sobrescribiendo con el sha actual; se descartó porque imposibilita restaurar otros commits. La elección por-commit mantiene las escrituras pequeñas (~un commit) y la poda atómica.

### 2. Resolución de la herencia con un helper puro

`apps/web/src/diagram/layout/inheritance.ts` expone una función pura que, dado el índice del commit actual, la lista de shas del histórico y un predicado `hasPositions(sha)`, devuelve el sha donante más cercano: recorre distancias crecientes comprobando primero el commit anterior (`índice - d`) y luego el siguiente (`índice + d`), de modo que los empates favorecen al commit anterior. Los shas guardados que no están en el histórico actual se ignoran (no hay posición conocida para ubicarlos).

Orden de resolución al cargar un commit: (1) entrada propia del commit; (2) posiciones del donante más cercano; (3) posiciones de la clave heredada por vista; (4) vacío. Tras reconciliar, el resultado se guarda como entrada del commit actual.

*Alternativa*: resolver dentro de `DiagramCanvas` con acceso directo a `localStorage`; se descartó para mantener la lógica testeable y sin efectos.

### 3. Marcado de uso y poda

`saveCommitPositions` y la lectura de una entrada existente mueven el sha al frente del índice (`order`). Al superar 50, los shas desplazados se eliminan junto con su clave `commit:<sha>`. Un commit descartado cae al camino de herencia al volver a visitarse.

### 4. "Re-layout" y compatibilidad

`clearPositions(view)` se sustituye por `clearCommitPositions(view, sha)`: el recálculo manual elimina solo las posiciones del commit actual (y su entrada en el índice) antes de calcular ELK completo y volver a guardar para ese commit. La clave heredada por vista nunca se borra automáticamente. `VisualStateStore.write` pasa a devolver éxito/fallo para poder reintentar la poda.

### 5. Cuota de `localStorage`

Si la escritura falla por cuota, `saveCommitPositions` elimina la entrada más antigua del índice y reintenta, como máximo hasta vaciar el índice; si aun así falla, se descarta la escritura en silencio (el diagrama sigue funcionando sin persistencia, como hoy). Las posiciones se serializan con coordenadas redondeadas a enteros para reducir tamaño.

### 6. Cableado en la interfaz

`ProjectViewerPage` pasa `selectedSha` y `state.commits` a `DiagramCanvas`. El efecto de layout usa el helper de herencia con un mapa sha→índice; `onNodeDragStop` guarda en la entrada del commit actual. La cámara y los controles mantienen sus claves y comportamiento actuales.

## Risks / Trade-offs

- [Cuota de `localStorage` con diagramas grandes y 50 commits] → formato compacto con enteros, escrituras por commit y evicción LRU con reintento; peor caso: sin persistencia para esa vista.
- [Sobrescritura costosa en cada arrastre] → cada guardado toca una sola entrada de commit (~decenas de KB), no el conjunto completo.
- [Cambio de comportamiento percibido en la primera visita a un commit] → la herencia desde el commit más cercano conserva la sensación incremental actual; la clave antigua por vista actúa como semilla cuando no hay entradas por commit.
- [Posiciones guardadas de ramas ya no presentes] → se ignoran al resolver la herencia y se eliminan con la poda; no rompen la carga.
- [Deriva con `reconcileLayout` al heredar de un commit lejano] → es el mismo algoritmo incremental ya probado; el donante se elige por distancia en el histórico.

## Migration Plan

No requiere migración de datos: las claves nuevas se crean al visitar commits y las claves antiguas por vista solo se leen. Rollback: revertir la versión web; las claves nuevas quedan ignoradas por la versión anterior. No hay cambios de servidor ni de formato de API.

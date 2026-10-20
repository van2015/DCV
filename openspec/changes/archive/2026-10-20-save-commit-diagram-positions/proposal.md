## Why

Hoy las posiciones del diagrama se guardan por proyecto y vista, y se reutilizan/reconcilian entre commits: mover nodos en el commit B sobrescribe la memoria espacial que el usuario había dejado en el commit A. Al volver a un commit ya visitado, el diagrama no refleja el acomodo que el usuario dejó allí, lo que rompe la lectura de la evolución y obliga a reacomodar una y otra vez.

## What Changes

- Guardar las posiciones de los elementos del diagrama por **commit, proyecto y vista**, de forma independiente: al volver a un commit se restauran las posiciones dejadas en él (incluidos los ajustes manuales de nodos).
- Al visitar un commit sin posiciones guardadas, **heredar y reconciliar** el layout del commit más cercano del histórico que sí tenga estado guardado para esa vista; si ninguno tiene, usar el layout genérico por vista (compatibilidad con datos existentes) y, en su defecto, calcular ELK desde cero.
- El "Re-layout" manual recalcula el layout del commit actual y reemplaza sus posiciones guardadas, sin afectar a otros commits.
- Aplicar **poda LRU**: conservar las posiciones de los 50 commits usados más recientemente por vista; los commits descartados se vuelven a heredar/reconciliar la próxima vez.
- La **cámara (zoom y pan) y los controles visuales siguen guardándose por proyecto y vista**, compartidos entre commits.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `uml-diagram-view`: "Estabilidad del layout" e "Interacción y persistencia visual" pasan a especificar memoria espacial independiente por commit (con herencia desde el commit más cercano y poda LRU), manteniendo la cámara y los controles por vista.

## Impact

- `apps/web/src/diagram/layout/persistence.ts`: claves de posiciones con `commit` en `VisualStateStore` y poda LRU.
- `apps/web/src/diagram/DiagramCanvas.tsx`: carga/guarda posiciones por commit, resolución del commit donante para herencia y guardado tras arrastre.
- `apps/web/src/state/store.ts` / `StoreProvider`: exponer el commit seleccionado y el histórico necesario para resolver la herencia por cercanía.
- Tests web: `persistence.test.ts`, `DiagramCanvas.test.tsx` (y ajustes menores en `store.test.ts` si cambian las claves persistidas).
- Sin cambios de API, servidor ni dependencias externas. No hay migración de datos obligatoria: las claves antiguas por vista se usan solo como último recurso de herencia.

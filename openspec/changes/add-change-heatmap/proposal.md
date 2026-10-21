## Why

El visor muestra el diff de un commit, pero no permite identificar qué clases, métodos, módulos o paquetes concentraron más actividad a lo largo del histórico. Sin esa señal, encontrar zonas calientes exige recorrer commits manualmente o revisar el repositorio fuera de la herramienta.

## What Changes

- Añadir una agregación histórica que cuenta, para cada declaración, miembro, módulo y paquete, la cantidad de **commits distintos** con cambios estructurales desde el inicio de la rama hasta el commit seleccionado.
- Propagar la identidad a través de renombrados y movimientos para que una clase o método renombrado conserve su historial de cambios.
- Exponer los conteos mediante una nueva respuesta de API y almacenarlos en caché del servidor por proyecto, rama y commit para evitar recalcular el histórico completo en cada navegación.
- Añadir un control persistente **Mapa de calor** que tiñe nodos, miembros, módulos y paquetes con una escala secuencial azul y muestra una leyenda con el máximo y la cantidad de commits considerados.
- Mantener visibles las marcas y aristas de diff cuando el mapa está activo; el tinte de caja verde/rojo del commit actual se sustituye por el calor para evitar mezclar escalas, pero las marcas `+`, `−`, `~`, etc. y las aristas conservan su semántica.
- No se modifican snapshots, detección de diffs, layout, foco ni posiciones persistidas. Los cambios de archivos fuera del modelo TypeScript y los cambios de líneas no participan en la métrica.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `typescript-model-extraction`: se añade la agregación histórica de cambios estructurales por entidad hasta un commit.
- `uml-diagram-view`: se añade el mapa de calor histórico y su convivencia con el overlay de diff.

## Impact

- `packages/shared`: nuevos tipos de respuesta del mapa de calor.
- `apps/server`: módulo de agregación, ruta de API, caché y pruebas de integración.
- `apps/web`: cliente API, store, controles visuales, canvas, nodos, leyenda, estilos y pruebas unitarias/E2E.
- Fixture E2E con actividad desigual y actualización de `README.md`.
- Sin migraciones de datos ni cambios en el formato de snapshot, diff o posiciones persistidas.

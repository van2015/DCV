## Why

Hoy las relaciones usan un color distinto por tipo (imports gris, extends azul, implements verde y association rosa), de modo que el color compite con la señal de diff y se aleja de la notación UML. El estado del commit debe ser el único uso de rojo/verde; el resto de relaciones debe recuperar una apariencia UML estable y monocroma.

## What Changes

- Las relaciones sin cambios pasan a negro:
  - imports/dependencias: línea continua y punta negra rellena;
  - herencia (`extends`): línea continua y triángulo hueco blanco con contorno negro;
  - implementación (`implements`): línea discontinua y triángulo hueco blanco con contorno negro;
  - asociación: línea continua y triángulo negro relleno.
- El verde y el rojo quedan reservados exclusivamente a relaciones añadidas y eliminadas. El color de estado tiñe línea y punta, manteniendo la forma de la punta y el patrón de línea del tipo.
- Las aristas eliminadas conservan el patrón de su tipo (continua o discontinua) en lugar de forzar un patrón global; el modificador de solo tipo mantiene su línea discontinua.
- Se actualizan fixture, pruebas unitarias/E2E y documentación para verificar estilos base y de diff en clases, módulos y paquetes.
- No cambia el modelo de datos, la detección de diffs, el layout, el foco ni la persistencia.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `uml-diagram-view`: se modifican los requisitos de relaciones para separar los estilos UML base del coloreado de diff.

## Impact

- `apps/web/src/diagram/DiagramCanvas.tsx` y un nuevo módulo de estilos/marcadores de aristas.
- `apps/web/src/styles.css`.
- Pruebas de `DiagramCanvas` y E2E; fixture `edge-colors`.
- `README.md`.
- Sin cambios en `@dcv/shared`, analizador, API ni formato de snapshot/diff.

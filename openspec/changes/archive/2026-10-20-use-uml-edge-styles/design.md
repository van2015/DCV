## Context

Ver `proposal.md`. Hoy `buildFlowEdges` asigna `MarkerType.ArrowClosed` a todas las aristas y solo cambia `markerEnd.color` para añadidas/eliminadas; `styles.css` define un color por tipo y un patrón global para eliminadas. Los requisitos vigentes están en `openspec/specs/uml-diagram-view/spec.md` (requisito "Relaciones coloreadas por cambio"). El cambio afecta solo a la capa de presentación del canvas web; no toca el modelo, el analizador ni la detección de diffs.

## Goals / Non-Goals

**Goals:**

- Separar la semántica de estado (verde/rojo) de la semántica de tipo (forma y patrón de línea).
- Soportar triángulos huecos blancos con contorno variable, imposibles con los marcadores integrados de React Flow.
- Mantener las aristas fantasma, el filtrado por extremos incluidos y el layout actuales.
- Verificar visualmente línea y punta en clases, módulos y paquetes.

**Non-Goals:**

- Cambiar la detección de relaciones, la dirección de las flechas o el layout.
- Añadir nuevos tipos de relación.
- Modificar nodos, panel de cambios o persistencia.
- Introducir interactividad nueva en las aristas.

## Decisions

1. **Descriptor puro de apariencia por arista.** Nuevo módulo `apps/web/src/diagram/edgeStyle.ts` con una función que, a partir de `kind`, `status` (`added`, `removed` o `null`) y `typeOnly`, devuelve:
   - clase CSS de estado (`edge-added`, `edge-removed` o ninguna);
   - color de línea/punta (`#111111`, `#15803d` o `#b91c1c`);
   - patrón de línea (`solid`, `6 4` para implements, `4 4` para solo tipo);
   - forma de punta (`hollow-triangle` o `filled-triangle`).
   
   Así las reglas se prueban sin DOM y `buildFlowEdges` solo compone datos de React Flow. Alternativa descartada: repartir condicionales por CSS y `buildFlowEdges`, que dificulta probar la combinación tipo/estado/solo tipo.

2. **Arista personalizada con marcador propio.** Registrar un edge type `uml` que use `BaseEdge` y renderice un `<defs><marker>` local con id único de React (`useId` saneado). La punta se elige por forma y color:
   - `hollow-triangle`: triángulo con `fill: #fff` y `stroke` del color de estado/base;
   - `filled-triangle`: triángulo con `fill` y `stroke` del color.
   
   Alternativa descartada: `MarkerType.ArrowClosed` con `markerEnd.color`, porque relleno y contorno comparten color y no permite el triángulo blanco hueco. Alternativa descartada: hack CSS sobre los marcadores integrados, porque todos los marcadores del mismo color comparten definición y no se puede distinguir herencia de asociación.

3. **Patrón de línea controlado por CSS, no por estado.** Las clases base quedan:
   - `edge-imports`: negro continuo;
   - `edge-extends`: negro continuo;
   - `edge-implements`: negro discontinuo `6 4`;
   - `edge-association`: negro continuo;
   - `.type-only`: discontinuo `4 4`, que prevalece sobre el tipo.
   
   `edge-added` y `edge-removed` solo cambian el `stroke` a verde/rojo y se elimina la regla que forzaba `6 4` en todas las eliminadas. Así una implementación eliminada sigue discontinua y una asociación eliminada sigue continua, como pidió el usuario. Alternativa descartada: mantener el patrón global de eliminadas, que borra la información de tipo.

4. **Puntas y colores.** Herencia e implementación usan triángulo hueco blanco; asociación e importación usan triángulo relleno. En diff, el contorno/relleno toma el color de estado y el relleno hueco permanece blanco. El marcador siempre apunta al destino, igual que hoy.

5. **Pruebas en dos niveles.** Tests unitarios del descriptor y de `buildFlowEdges` para combinaciones tipo/estado/solo tipo y URL de marcador; E2E en Chromium para `stroke`, `stroke-dasharray`, `fill` y `stroke` del marcador. El fixture `edge-colors` se amplía con relaciones estables (herencia, implementación, asociación e importación) para comprobar que lo no modificado es negro sin perder las aristas de diff existentes.

6. **Compatibilidad.** No se cambia el contrato `EdgeChange`, `DiagramOverlay` ni `DiagramProjection`; solo se consume la información ya existente. Las aristas fantasma siguen fuera del layout y del foco.

## Risks / Trade-offs

- **Marcadores SVG personalizados en jsdom** → los tests unitarios validan datos, no renderizado SVG; el E2E real cubre forma y color de las puntas.
- **Pérdida de la señal no cromática en eliminadas continuas** → el usuario eligió conservar el patrón del tipo; el color rojo sigue siendo el indicador de eliminación y los nodos fantasma mantienen sus marcas.
- **Triángulo hueco poco visible sobre fondo claro** → relleno blanco, contorno negro/verde/rojo de 1.5 px y tamaño de marcador similar al actual; se verifica en E2E.
- **Duplicación de `<defs>` por arista** → ids únicos y definiciones pequeñas; el número de aristas visibles es moderado. Si el rendimiento se degrada, se puede migrar a un conjunto global de seis marcadores sin cambiar el descriptor.
- **Selectores E2E existentes** → se actualizan conteos y se conservan las clases `edge-added`/`edge-removed` para no depender de detalles internos del marcador.

## Migration Plan

Sin migración de datos. El cambio es visual y reversible revirtiendo el edge type, el descriptor, los estilos y las pruebas. No hay cambios de API ni de persistencia.

## Open Questions

Ninguna.

## Context

Ver `proposal.md` para la motivación. Hoy `SnapshotDiff.edges` ya clasifica relaciones como `added`/`removed`, pero `buildOverlay` ignora esas aristas: `DiagramProjection` solo contiene las relaciones del commit actual y `DiagramCanvas` les asigna únicamente `edge-<kind>` y `type-only`. Las relaciones eliminadas, por tanto, no se renderizan y no hay estado visual de arista.

Los nodos fantasma ya existen por vista: `ghost:<declarationId>` para clases, `ghost:module:<path>` para módulos eliminados y `ghost:package:<directory>` para paquetes eliminados. Las aristas eliminadas vienen normalizadas por renombrados de archivo (`normalizeEdge`), así que sus extremos se pueden resolver contra los nodos actuales o esos fantasmas. Para conservar el trazo de solo tipo en una arista eliminada, `EdgeChange` necesita `typeOnly`, que hoy solo existe en `SnapshotEdge`.

## Goals / Non-Goals

**Goals:**
- Superponer el estado `added`/`removed` a las relaciones sin perder el color ni el trazo por tipo de las relaciones sin cambios.
- Mostrar relaciones eliminadas solo durante el commit actual, con extremos existentes o fantasma, sin tocar layout, foco ni persistencia.
- Cubrir las tres vistas, incluida la agregación de dependencias de paquetes.

**Non-Goals:**
- Añadir etiquetas, símbolos o insignias nuevas en las aristas.
- Persistir aristas fantasma o incluirlas en el cálculo de posiciones o en el subgrafo de foco.
- Reordenar o recalcular el diagrama al mostrar u ocultar relaciones eliminadas.
- Cambiar el panel de cambios o los filtros de tipos.

## Decisions

1. **El estado de arista vive en el overlay, no en la proyección.** `DiagramOverlay` gana `edgeStatuses: Map<string, "added" | "removed">` (clave: id de la arista proyectada) y `ghostEdges: DiagramGhostEdge[]` para las eliminadas. `buildOverlay` los calcula a partir de `projection`, `diff` y los fantasmas ya construidos. Alternativa descartada: marcar `DiagramEdge` en la proyección, que obligaría a reconstruir la proyección con el diff y contaminaría el layout con aristas que no deben participar en él.

2. **Resolución de extremos por vista.** Un extremo eliminado se resuelve primero como nodo actual de la proyección; si no existe, como fantasma con el id convencional de su vista; si tampoco, la arista se omite. Clases usa `ghost:<id>` y solo relaciones distintas de imports; módulos usa `ghost:module:<path>`; paquetes usa `ghost:package:<directory>`. Así nunca se dibujan conexiones huérfanas.

3. **Aristas eliminadas fuera del layout y del foco.** `DiagramCanvas` sigue pasando solo `projection.edges` a ELK, `reconcileLayout` y `visibilitySet`; las aristas fantasma se añaden al resultado de `buildFlow` únicamente si ambos extremos están incluidos en el grafo visible. Se renderizan con la posición ya calculada y desaparecen al cambiar de commit. Alternativa descartada: incluirlas en ELK, que movería nodos por relaciones que ya no existen y rompería la estabilidad del layout.

4. **Agregación de paquetes con reglas explícitas.** Una arista de paquete se marca añadida si al menos una importación añadida conecta sus dos directorios y la arista agregada existe. Una arista eliminada solo se dibuja si no existe ninguna arista agregada actual entre esos directorios; si la dependencia persiste por otra importación, se mantiene sin cambio. Alternativa descartada: contar contribuyentes por arista, que exigiría ampliar la proyección y distinguir aristas parcialmente nuevas; el coste no aporta una lectura mejor a nivel de paquete.

5. **`typeOnly` en `EdgeChange`.** Se añade el campo al contrato compartido y el analizador lo propaga al clasificar aristas. Es un cambio aditivo y permite que una arista eliminada de solo tipo mantenga el trazo discontinuo. Alternativa descartada: asumir `typeOnly: false`, que perdería información ya disponible en `SnapshotEdge`.

6. **CSS por orden y especificidad.** Las reglas `edge-added`/`edge-removed` se colocan después de `.edge-<kind>` y `.type-only`, con selectores `path` y contenedor. El estado gana el color; los patrones de trazo de tipo y solo tipo se conservan. Las aristas eliminadas llevan además trazo discontinuo (6 4) como señal no cromática; las de solo tipo usan 2 4. Alternativa descartada: añadir estilos inline, que romperían la separación actual entre lógica y presentación.

7. **Verificación en tres niveles.** Tests de analizador para `typeOnly`; tests de overlay para las tres vistas (añadidas, eliminadas, extremo no resoluble, agregación de paquetes); test de canvas para clases CSS y aristas fantasma; E2E con un fixture `edge-colors` que lee `stroke` calculado para exigir dominancia verde/roja. Alternativa descartada: confiar solo en snapshots de clases, que no prueban el color aplicado.

## Risks / Trade-offs

- **Exceso visual al mostrar todas las relaciones eliminadas de una clase borrada** → se limitan al commit actual y a extremos representables; el modo foco puede ocultarlas si oculta sus extremos.
- **Daltonismo** → las eliminadas son discontinuas y las sin cambios mantienen su color/patrón de tipo; el color no es el único canal en las eliminadas.
- **Heurística de paquetes** → una relación existente que recibe una importación nueva se muestra verde aunque no sea nueva; se acepta como señal de dependencia reforzada y queda reflejado en el spec.
- **Renombrados y fantasmas** → si un extremo normalizado no coincide con ningún nodo ni fantasma, la arista se omite en lugar de dibujarse mal.
- **Marcador de flecha** → si el marcador no hereda el `stroke` de la arista, se ajustará el estilo del marcador en la misma tarea de CSS y se verificará en E2E.

## Migration Plan

No hay migración de datos. El campo `typeOnly` es aditivo en la respuesta del modelo. Rollback: revertir overlay, canvas, estilos, fixture y pruebas.

## Open Questions

Ninguna.

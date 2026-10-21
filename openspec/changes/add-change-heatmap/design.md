## Context

Ver `proposal.md` para la motivación y los delta specs para el contrato de comportamiento. El estado actual relevante:

- `listCommits` devuelve el histórico lineal de primeros padres en orden antiguo→nuevo, con SHA y padre.
- `GET /api/projects/:id/commits/:sha/model` ya obtiene snapshots y calcula `diffSnapshots` con renombrados de archivos resueltos mediante `diffTrees`.
- El cliente solo carga el modelo del commit seleccionado y sus vecinos se prefetchean; no existe una vista agregada del histórico.
- `VisualControls` se persiste por proyecto e incluye miembros, foco y carpetas colapsadas.
- Los nodos reciben `ClassNodeData`/`ModuleNodeData`/`PackageNodeData`; el overlay añade marcas y tintes de diff.
- `MemberChange` identifica miembros con `memberKey(kind:name)` y conserva `previousMember` en renombrados/movimientos.

## Goals / Non-Goals

**Goals:**

- Calcular conteos históricos acumulados sin alterar snapshots, diffs ni layout.
- Mantener la identidad de entidades a través de renombrados y movimientos.
- Evitar recalcular el histórico completo al navegar entre commits ya procesados.
- Mantener el mapa de calor legible junto con las marcas y aristas de diff.

**Non-Goals:**

- Medir líneas cambiadas, churn de Git o cambios en archivos no analizables.
- Añadir rangos de fechas, ventanas de N commits o filtros históricos.
- Persistir los conteos entre reinicios del servidor.
- Cambiar el orden del histórico, el layout o la memoria espacial.

## Decisions

1. **Agregación como módulo puro en el servidor.** `apps/server/src/analysis/heatmap.ts` recibe una secuencia cronológica de deltas pequeños (`commit`, declaraciones cambiadas, miembros cambiados y renombrados de archivo) y devuelve los conteos. La ruta no contiene reglas de identidad ni de agregación. Alternativa descartada: agregar en el cliente, que obligaría a descargar todos los modelos y diffs.

2. **Delta por commit y caché incremental.** Un `HeatmapService` mantiene por proyecto y rama un mapa `sha → delta` de los commits ya procesados. Para un commit seleccionado reutiliza los deltas existentes y solo analiza el tramo faltante, manteniendo el snapshot anterior en memoria para no pedirlo dos veces. Los conteos se recalculan desde la línea base aplicando deltas pequeños, sin volver a analizar código. Alternativa descartada: cachear solo la respuesta completa por SHA, que no acelera la navegación hacia commits vecinos. La caché es en memoria y se descarta al reiniciar; una rama nueva crea su propia entrada.

3. **Métrica por conjuntos de commits.** Internamente cada entidad acumula un `Set<sha>`, no un contador. Así varios cambios de la misma entidad en un commit cuentan una vez y los renombrados pueden fusionar conjuntos sin doble conteo. Al responder se convierten los conjuntos en números. Las reglas son:
   - declaración: unión de sus propios cambios y los de sus miembros;
   - miembro: solo sus propios cambios;
   - módulo: unión de cambios de declaraciones y miembros de su archivo;
   - paquete: unión de commits de los módulos de su carpeta directa.
   El commit más antiguo no genera delta. Los cambios de aristas no participan porque no pertenecen a una única entidad.

4. **Identidad y renombrados.** Antes de registrar un cambio se aplica el delta de identidad:
   - una declaración `renamed`/`moved` transfiere su conjunto y sus miembros de `previousId` a `id`;
   - un miembro `renamed`/`moved` transfiere su conjunto de `previousMemberKey` a `memberKey` dentro de la declaración;
   - un renombrado de archivo transfiere el conjunto `module:previousPath` a `module:path`;
   - una entidad eliminada descarta sus conjuntos, de modo que una reaparición posterior con el mismo nombre empieza de cero.
   Los paquetes se identifican por carpeta; un movimiento de archivo entre carpetas cuenta el commit en ambas carpetas únicamente si el diff lo reporta así. Alternativa descartada: usar solo IDs históricos, que fragmentaría el historial tras un renombrado.

5. **Respuesta de API y tipos compartidos.** Se añade `HeatmapResponse` en `packages/shared`:
   ```ts
   interface HeatmapResponse {
     branch: string;
     commit: string;
     commits: number;
     nodes: Record<string, number>;
     members: Record<string, Record<string, number>>;
   }
   ```
   `nodes` usa los mismos IDs de proyección (`declaration.id`, `module:<path>`, `package:<dir>`), por lo que el canvas no necesita traducciones. `members[parentId][memberKey]` cubre las filas de clases e interfaces. `commits` es la cantidad de commits considerados, incluida la línea base.
   Endpoint: `GET /api/projects/:id/commits/:sha/heatmap?branch=...`, con los mismos errores de proyecto/commit/rama que el endpoint de modelo. Si el SHA no pertenece al histórico lineal de la rama, responde 404.

6. **Cálculo de intensidad en el cliente.** `apps/web/src/diagram/heatmap.ts` expone una función pura `heatLevel(count, max)` con cuatro niveles más el nivel cero. La página calcula el máximo de los nodos de la vista activa y el máximo de miembros, de modo que la escala no se diluya por entidades de otras vistas. La respuesta se guarda en `AppState` con estados `idle/loading/error/ready`, protegida contra respuestas fuera de orden. El control `heatmapEnabled` se añade a `VisualControls` y se persiste como los demás controles. Alternativa descartada: normalizar con el máximo global de todos los tipos de entidad, que produciría mapas casi planos en vistas con menos actividad.

7. **Integración visual aditiva.** `DiagramCanvas` recibe el mapa y el máximo activo y propaga a cada nodo su conteo, nivel y niveles de sus miembros. Se aplican clases `heat-1`…`heat-4` con una escala azul secuencial; el nivel cero no añade clase ni estilo. Cuando el mapa está activo:
   - las marcas `ChangeBadge` y las aristas de diff no cambian;
   - los selectores de calor se aplican después de los tintes verde/rojo y los neutralizan para la caja del nodo, evitando mezclar escalas;
   - los fantasmas conservan su borde discontinuo y semitransparencia, pero no reciben calor propio;
   - una leyenda junto a los controles muestra el degradado, el máximo y `commits` considerados, además de estados de carga y error con reintento.
   Al desactivar el control se dejan de pasar datos de calor; la apariencia vuelve a ser exactamente la del overlay actual.

8. **Pruebas en tres niveles.** Unitarias del agregador puro (conteo único por commit, acumulación, línea base, renombrados, módulos/paquetes, eliminación y reaparición); unitarias web para niveles, store, cliente y nodos; integración/E2E con un fixture nuevo `heatmap` de varios commits que produzca intensidades distintas y permita comprobar el estado de carga, la persistencia del toggle y la convivencia con el diff.

## Risks / Trade-offs

- **Primer cálculo costoso en históricos largos** → recorrido secuencial con un solo snapshot vivo, caché de deltas por rama y estado de carga no bloqueante. Si se necesita más rendimiento, los deltas podrían persistirse sin cambiar el contrato.
- **Renombrados heurísticos** → se reutiliza la semántica ya existente de `diffSnapshots` y `diffTrees`; los renombrados probables conservan la identidad igual que en el panel de cambios.
- **Caché obsoleta tras `fetch` o cambio de rama** → la clave incluye proyecto y rama; los commits son inmutables y la caché solo cubre SHA ya analizados. Un `refresh` no invalida deltas de commits existentes.
- **Fallos de análisis en un commit intermedio** → la ruta falla y el cliente muestra error con reintento; el diagrama y el reproductor siguen utilizables. No se inventan conteos parciales.
- **Confusión entre azul de calor y morado de «solo cuerpo»** → el calor solo tiñe fondos de caja/fila; las marcas conservan sus colores y la leyenda explica la escala.
- **Respuesta grande en proyectos enormes** → el mapa contiene una entrada por entidad visible en el modelo seleccionado, no por combinación histórica; el tamaño queda acotado por el snapshot.

## Migration Plan

Sin migración de datos. El control nuevo se inicializa desactivado. La caché de deltas vive en memoria; reiniciar el servidor solo obliga a recalcular. Revertir el cambio consiste en retirar la ruta, el control y los estilos; snapshots, diffs y posiciones persistidas no se modifican.

## Open Questions

Ninguna.

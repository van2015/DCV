## Why

Los nodos ya se tiñen según su cambio, pero las relaciones entre elementos siguen coloreadas solo por tipo (herencia, implementación, asociación, importación). Al recorrer el histórico no se distingue de un vistazo qué relaciones aparecieron o desaparecieron, y las eliminadas ni siquiera se dibujan. Colorear las aristas añadidas en verde y las eliminadas en rojo completa la lectura visual del diff en las tres vistas.

## What Changes

- Las relaciones añadidas respecto al commit anterior se dibujan con trazo verde, manteniendo el patrón de trazo de su tipo y de "solo tipo".
- Las relaciones eliminadas se dibujan como aristas fantasma rojas durante el paso actual, siempre que ambos extremos puedan representarse con un nodo existente o un fantasma; desaparecen al cambiar de commit y no alteran el layout.
- Las relaciones sin cambios conservan los colores actuales por tipo (imports gris, extends azul, implements verde discontinuo, association rosa).
- En módulos y clases la relación se colorea de forma directa. En paquetes, una relación agregada se marca añadida cuando recibe una importación nueva y solo se dibuja como eliminada cuando deja de existir la dependencia agregada entre ambos paquetes.
- Las aristas eliminadas conservan el patrón discontinuo propio de las relaciones de solo tipo.
- No cambian los nodos, el panel de cambios, los filtros, el modo foco ni las reglas de layout. Las aristas fantasma son solo una capa visual del commit actual.

## Capabilities

### New Capabilities
- (ninguna)

### Modified Capabilities
- `uml-diagram-view`: se añade el comportamiento de colorear por cambio las relaciones del diagrama, incluidas las aristas fantasma de relaciones eliminadas.

## Impact

- `packages/shared`: `EdgeChange` incorpora `typeOnly` para conservar el trazo de las aristas eliminadas.
- `packages/analyzer`: el diff de aristas propaga `typeOnly`.
- `apps/web`: overlay de aristas, resolución de extremos fantasma, renderizado en el canvas y estilos por estado.
- Pruebas de analizador, overlay, canvas y E2E con un fixture de aristas añadidas y eliminadas; actualización del README.
- Sin dependencias nuevas ni cambios incompatibles en la API.

## Why

Hoy los cambios entre commits se comunican casi exclusivamente con la insignia de estado dentro de cada nodo; la caja del nodo no cambia de aspecto. Al recorrer el histórico, distinguir de un vistazo qué elementos aparecieron o desaparecieron exige leer cada insignia. Un fondo y borde tenue por estado en los nodos añadidos y eliminados acelera la lectura del diff sin sustituir las marcas no cromáticas existentes.

## What Changes

- Los nodos añadidos muestran un fondo y un borde verde suave, incluida una variante tenue de la cabecera, manteniendo la insignia `+` y su etiqueta.
- Los nodos eliminados (fantasmas) muestran un fondo y un borde rojo suave, manteniendo la insignia `−`, la forma discontinua y la semitransparencia que ya identifican a un fantasma.
- Los estados modificado, solo cuerpo, movido y renombrado conservan el comportamiento actual: se siguen indicando con la insignia y no tiñen la caja del nodo.
- Los colores propuestos son deliberadamente suaves (baja saturación sobre blanco) y no son el único indicador: se conservan el símbolo, la etiqueta accesible y la forma del nodo.
- No cambian las aristas, el panel de cambios, los filtros ni las reglas de layout.

## Capabilities

### New Capabilities
- (ninguna)

### Modified Capabilities
- `uml-diagram-view`: el requisito "Overlay de cambios" incorpora el resaltado cromático suave de la caja de los nodos añadidos y eliminados, además de los marcadores no cromáticos existentes.

## Impact

- Estilos de nodos en `apps/web/src/styles.css`.
- Posible ajuste menor de las clases de estado ya emitidas por `ClassNode`, `ModuleNode` y `PackageNode`; no se prevén cambios de API ni de datos.
- Pruebas de nodos y de canvas, y verificación E2E de los estilos calculados en un commit con altas y bajas.
- Sin dependencias nuevas.

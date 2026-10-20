## Context

Ver `proposal.md` para la motivación. Hoy `ClassNodeCard`, `ModuleNodeCard` y `PackageNodeCard` ya añaden la clase `change-<estado>` a la caja cuando reciben un `OverlayStatus`, pero `apps/web/src/styles.css` no define reglas para esas clases: el estado solo se ve en la insignia `ChangeBadge` (símbolo y color `status-*`). Los fantasmas añaden además `.ghost` con opacidad 0,55, borde discontinuo y `filter: saturate(0.4)`.

El overlay solo otorga estado propio a clases, interfaces, enums y módulos; las carpetas contenedoras no participan. `ghostChange` en `DiagramCanvas.tsx` asigna el estado `removed` a todo fantasma, por lo que la clase `change-removed` ya está disponible también en ellos.

## Goals / Non-Goals

**Goals:**
- Que un nodo añadido y un fantasma eliminado se distingan de un vistazo por el tinte de su caja, sin leer la insignia.
- Mantener los símbolos, etiquetas accesibles y la forma fantasma como indicadores redundantes al color.
- Cambiar solo la capa visual: ni overlay, ni datos, ni layout.

**Non-Goals:**
- Teñir nodos modificados, con solo cuerpo modificado, movidos o renombrados, o sus miembros.
- Alterar colores de aristas, panel de cambios, filtros o insignias.
- Introducir un tema oscuro o preferencias de color configurables.

## Decisions

1. **CSS puro sobre las clases existentes.** Se añaden reglas para `.uml-node.change-added` y `.uml-node.change-removed` en `styles.css`, junto a `.uml-node` y `.status-*`. No se tocan los componentes de nodo ni `ghostChange`, porque la clase ya llega a la caja. Alternativa descartada: estilos inline desde React, que duplicarían la lógica de estado en tres componentes y complicarían los tests.

2. **Un color de estado compartido con `color-mix`.** Cada selector define `--change-color` (`#15803d` para añadido, `#b91c1c` para eliminado) y una regla común aplica:
   - fondo del cuerpo: `color-mix(in srgb, var(--change-color) 8%, #fff)`;
   - borde: `color-mix(in srgb, var(--change-color) 45%, #fff)`;
   - cabecera: `color-mix(in srgb, var(--change-color) 16%, #fff)`.
   
   Son mezclas suaves sobre blanco, coherentes con los tonos ya usados en `.status-*`, y conservan el texto `#1d2330`. Alternativa descartada: colores planos de fondo, demasiado dominantes para un diagrama denso.

3. **Fantasmas: conservar forma, quitar desaturación.** Se mantiene la opacidad 0,55 y el borde discontinuo de `.ghost`, pero se elimina `filter: saturate(0.4)` para que el rojo suave no pierda identidad cromática. La suavidad ya la aportan la mezcla al 8 % y la opacidad. Alternativa descartada: mantener el filtro y subir la mezcla, que ensuciaría el color y dificultaría la verificación.

4. **Solo dos estados tiñen la caja.** La ausencia de reglas para `change-modified`, `change-body-only`, `change-moved` y `change-renamed` conserva su aspecto actual con insignia. Esto limita el alcance a lo pedido y evita competir visualmente con el tinte de altas y bajas.

5. **Verificación en dos niveles.** Los tests de componentes (jsdom, `css: false`) comprueban que la caja recibe `change-added`/`change-removed` y conserva la insignia. La comprobación del color calculado se hace en E2E, donde el navegador aplica `styles.css`: se añade el escenario de fixture `diff-colors` (dos commits: uno con la clase `Gone` y otro que la elimina y añade `Added`) y se leen los canales RGB de `backgroundColor`/`borderColor` para exigir dominancia verde o roja. Alternativa descartada: habilitar CSS en Vitest, que añade infraestructura solo para una regla visual.

## Risks / Trade-offs

- **Contraste insuficiente para daltonismo o pantallas pobres** → el símbolo, la etiqueta accesible y la forma fantasma siguen presentes; el tinte es redundante y no el único canal.
- **La desaturación de los fantasmas era intencional** → se sustituye por opacidad y borde discontinuo; el cambio es deliberado para que "eliminado" se lea en rojo.
- **El color calculado por `color-mix` varía de formato entre navegadores** → el E2E compara canales numéricos con tolerancia, no cadenas exactas.
- **Añadir un escenario de fixture altera el inventario de E2E** → se añade al final del tipo y de la lista, sin modificar escenarios existentes usados por tests.

## Migration Plan

No hay migración de datos ni de API. Rollback: revertir las reglas CSS, el escenario de fixture `diff-colors` y sus pruebas.

## Open Questions

Ninguna.

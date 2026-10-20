## MODIFIED Requirements

### Requirement: Overlay de cambios
El sistema SHALL resaltar en el diagrama los elementos añadidos, eliminados, modificados y con solo cuerpo modificado respecto al commit anterior, usando color y una marca no dependiente del color, y SHALL mantener visibles los elementos eliminados como fantasmas durante el paso actual. Los nodos de los elementos añadidos SHALL mostrar un fondo y un borde verde suave, y los nodos de los elementos eliminados, incluidos los fantasmas, SHALL mostrar un fondo y un borde rojo suave. El tinte SHALL complementar, no sustituir, la marca no dependiente del color, y los fantasmas SHALL conservar su borde discontinuo y su semitransparencia. Los elementos modificados, con solo cuerpo modificado, movidos o renombrados SHALL conservar la indicación mediante su marca sin teñir la caja del nodo.

#### Scenario: Función añadida
- **WHEN** el commit actual añade una función
- **THEN** el diagrama la resalta como añadida y el panel de cambios la lista

#### Scenario: Elemento eliminado
- **WHEN** el commit actual elimina una clase
- **THEN** el diagrama la muestra como fantasma en su última posición durante ese paso

#### Scenario: Solo cuerpo modificado
- **WHEN** una función cambia de implementación sin cambiar de firma
- **THEN** el diagrama la marca de forma discreta y el filtro de implementación decide si se muestra

#### Scenario: Nodo añadido con tinte verde suave
- **WHEN** el commit actual añade una clase o un módulo y el nodo está visible
- **THEN** la caja del nodo muestra un fondo y un borde verde suave, junto con la marca `+` y su etiqueta accesible

#### Scenario: Nodo eliminado con tinte rojo suave
- **WHEN** el commit actual elimina una clase y se muestra su fantasma
- **THEN** la caja del fantasma muestra un fondo y un borde rojo suave, conserva el borde discontinuo y la semitransparencia, y mantiene la marca `−` y su etiqueta accesible

#### Scenario: Estados sin tinte de caja
- **WHEN** un elemento está modificado, con solo cuerpo modificado, movido o renombrado
- **THEN** el nodo conserva su apariencia de caja habitual y el cambio se sigue indicando con su marca

# uml-diagram-view Specification

## Purpose

Presenta el modelo estructural de cada commit como diagramas interactivos de clases, módulos y paquetes, resaltando los cambios respecto al commit anterior y manteniendo la legibilidad y la memoria espacial durante la navegación.

## Requirements

### Requirement: Vistas de diagrama
El sistema SHALL ofrecer al menos tres vistas del mismo commit (clases, módulos y paquetes) y SHALL permitir cambiar entre ellas sin perder la posición en el histórico.

#### Scenario: Cambiar de vista
- **WHEN** el usuario cambia de la vista de clases a la de módulos
- **THEN** el sistema muestra el mismo commit en la nueva proyección y mantiene el commit seleccionado

### Requirement: Autoselección de vista inicial
El sistema SHALL elegir la vista inicial según el contenido del proyecto y SHALL recordar la elección manual del usuario por proyecto.

#### Scenario: Proyecto solo de funciones
- **WHEN** el usuario abre un proyecto sin clases pero con funciones
- **THEN** el sistema abre la vista de módulos

#### Scenario: Proyecto dominado por clases
- **WHEN** el usuario abre un proyecto con clases e interfaces relevantes
- **THEN** el sistema abre la vista de clases

#### Scenario: Elección manual persistente
- **WHEN** el usuario cambia manualmente a la vista de paquetes y vuelve a abrir el proyecto
- **THEN** el sistema restaura la vista de paquetes

### Requirement: Vista de clases
La vista de clases SHALL representar clases, interfaces y enums como cajas UML con nombre, estereotipo, compartimentos de miembros y visibilidad, y SHALL mostrar relaciones de herencia, implementación y asociación resueltas.

#### Scenario: Clase con interfaz
- **WHEN** una clase implementa una interfaz
- **THEN** el diagrama muestra ambas cajas y una relación de implementación

#### Scenario: Miembros de una clase
- **WHEN** el usuario consulta una clase
- **THEN** el sistema muestra sus miembros con visibilidad y firma

### Requirement: Vista de módulos
La vista de módulos SHALL representar cada archivo analizable como un módulo con estereotipo, funciones y tipos exportados, SHALL disponer las carpetas como contenedores visuales y SHALL mostrar las dependencias de importación como aristas.

#### Scenario: Archivo de funciones
- **WHEN** el usuario abre un archivo con funciones exportadas en la vista de módulos
- **THEN** el sistema muestra un módulo con esas funciones como miembros

#### Scenario: Dependencia entre archivos
- **WHEN** un archivo importa otro archivo analizable
- **THEN** el diagrama muestra una arista de dependencia entre ambos módulos

### Requirement: Vista de paquetes
La vista de paquetes SHALL agrupar los archivos por carpeta y SHALL mostrar dependencias agregadas entre carpetas, permitiendo identificar la estructura de alto nivel del proyecto.

#### Scenario: Dependencia agregada
- **WHEN** varios archivos de una carpeta importan archivos de otra
- **THEN** la vista de paquetes muestra una dependencia agregada entre ambas carpetas

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

### Requirement: Panel de cambios
El sistema SHALL mostrar un panel con los cambios estructurales del commit seleccionado, agrupados por tipo, y SHALL permitir seleccionar un cambio para enfocar el elemento correspondiente en el diagrama.

#### Scenario: Enfocar desde el panel
- **WHEN** el usuario selecciona una función modificada en el panel de cambios
- **THEN** el diagrama enfoca esa función y su contexto inmediato

#### Scenario: Commit sin cambios estructurales
- **WHEN** el commit no modifica el modelo TypeScript
- **THEN** el panel lo indica y el diagrama permanece estable

### Requirement: Modo foco
El sistema SHALL ofrecer un modo foco que muestre los elementos afectados y sus vecinos hasta una profundidad configurable, atenuando u ocultando el resto del diagrama.

#### Scenario: Proyecto grande
- **WHEN** el usuario activa el modo foco en un proyecto con cientos de módulos
- **THEN** el diagrama reduce la vista al subgrafo del cambio y sus vecinos

#### Scenario: Ajustar profundidad
- **WHEN** el usuario cambia la profundidad del foco
- **THEN** el sistema añade o quita niveles de vecinos alrededor de los elementos afectados

### Requirement: Estabilidad del layout
El sistema SHALL conservar las posiciones de los elementos por commit, proyecto y vista, de modo que al volver a un commit ya visitado se restauren las posiciones que el usuario dejó en él, incluidos los ajustes manuales de nodos. Cuando el usuario visite un commit sin posiciones guardadas para la vista, el sistema SHALL heredar y reconciliar el layout del commit más cercano del histórico que sí tenga posiciones guardadas para esa vista; si no existe ninguno, SHALL usar el layout genérico de la vista y, en su defecto, calcular un layout completo. Los elementos nuevos SHALL colocarse cerca de sus vecinos. El sistema SHALL ofrecer un recálculo manual del layout que reemplace únicamente las posiciones del commit actual. La navegación entre commits MUST NOT provocar un re-layout completo automático.

#### Scenario: Avanzar al siguiente commit
- **WHEN** el usuario avanza a un commit sin posiciones guardadas
- **THEN** los elementos que ya existían conservan la posición heredada del commit más cercano y los nuevos aparecen cerca de su contexto

#### Scenario: Volver a un commit visitado
- **WHEN** el usuario reacomoda nodos en un commit y luego navega a otro commit y vuelve al primero
- **THEN** el diagrama restaura las posiciones que el usuario había dejado en ese commit

#### Scenario: Independencia entre commits
- **WHEN** el usuario mueve un nodo en el commit A y luego mueve el mismo nodo a otra posición en el commit B
- **THEN** cada commit conserva su propia posición del nodo al volver a él

#### Scenario: Recalcular layout
- **WHEN** el usuario pulsa "re-layout"
- **THEN** el sistema reorganiza el diagrama del commit actual, conserva el commit seleccionado y no modifica las posiciones guardadas de otros commits

### Requirement: Interacción y persistencia visual
El sistema SHALL permitir pan, zoom, selección de elementos, expansión y colapso de carpetas. La cámara y el estado de los controles SHALL conservarse por proyecto y vista al cambiar de commit, mientras que las posiciones de los elementos SHALL conservarse por commit según el requisito de estabilidad del layout.

#### Scenario: Navegar por un diagrama grande
- **WHEN** el usuario hace zoom y pan sobre una zona del diagrama y avanza al commit siguiente
- **THEN** la vista conserva esa zona y el estado de los contenedores

#### Scenario: Ocultar miembros
- **WHEN** el usuario desactiva la visualización de miembros
- **THEN** las cajas se simplifican y el cambio se conserva al navegar a otro commit

#### Scenario: Volver a un commit no altera la cámara
- **WHEN** el usuario vuelve a un commit con posiciones guardadas
- **THEN** se restauran las posiciones de sus elementos sin cambiar la cámara actual de la vista

### Requirement: Memoria espacial acotada
El sistema SHALL guardar las posiciones de los 50 commits usados más recientemente por proyecto y vista, descartando primero el commit más antiguo en uso cuando se supere el límite. Un commit descartado SHALL comportarse como un commit sin posiciones guardadas cuando se vuelva a visitar.

#### Scenario: Poda de commits antiguos
- **WHEN** el usuario visita más de 50 commits con posiciones guardadas en la misma vista
- **THEN** el sistema conserva solo las posiciones de los 50 commits más recientes y el más antiguo se vuelve a heredar o reconciliar en su próxima visita

#### Scenario: El límite es por vista
- **WHEN** el usuario guarda posiciones en 50 commits de la vista de clases
- **THEN** las posiciones guardadas de la vista de módulos no se ven afectadas

### Requirement: Estado vacío
El sistema SHALL mostrar un estado vacío explicativo cuando el commit no tenga archivos TypeScript analizables o el filtro activo oculte todo el contenido.

#### Scenario: Proyecto sin TypeScript
- **WHEN** el usuario abre un proyecto sin archivos TypeScript analizables
- **THEN** el diagrama muestra un mensaje que explica que no hay estructura que visualizar

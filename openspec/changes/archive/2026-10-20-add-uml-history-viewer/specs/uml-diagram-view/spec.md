## Purpose

Presenta el modelo estructural de cada commit como diagramas interactivos de clases, módulos y paquetes, resaltando los cambios respecto al commit anterior y manteniendo la legibilidad y la memoria espacial durante la navegación.

## ADDED Requirements

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
El sistema SHALL resaltar en el diagrama los elementos añadidos, eliminados, modificados y con solo cuerpo modificado respecto al commit anterior, usando color y una marca no dependiente del color, y SHALL mantener visibles los elementos eliminados como fantasmas durante el paso actual.

#### Scenario: Función añadida
- **WHEN** el commit actual añade una función
- **THEN** el diagrama la resalta como añadida y el panel de cambios la lista

#### Scenario: Elemento eliminado
- **WHEN** el commit actual elimina una clase
- **THEN** el diagrama la muestra como fantasma en su última posición durante ese paso

#### Scenario: Solo cuerpo modificado
- **WHEN** una función cambia de implementación sin cambiar de firma
- **THEN** el diagrama la marca de forma discreta y el filtro de implementación decide si se muestra

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
El sistema SHALL conservar las posiciones de los elementos entre commits, SHALL colocar los elementos nuevos cerca de sus vecinos y SHALL ofrecer un recálculo manual del layout. La navegación entre commits MUST NOT provocar un re-layout completo automático.

#### Scenario: Avanzar al siguiente commit
- **WHEN** el usuario avanza al siguiente commit
- **THEN** los elementos que ya existían conservan su posición y los nuevos aparecen cerca de su contexto

#### Scenario: Recalcular layout
- **WHEN** el usuario pulsa "re-layout"
- **THEN** el sistema reorganiza el diagrama y conserva el commit seleccionado

### Requirement: Interacción y persistencia visual
El sistema SHALL permitir pan, zoom, selección de elementos, expansión y colapso de carpetas, y SHALL conservar la cámara, las posiciones y el estado de los controles al cambiar de commit.

#### Scenario: Navegar por un diagrama grande
- **WHEN** el usuario hace zoom y pan sobre una zona del diagrama y avanza al commit siguiente
- **THEN** la vista conserva esa zona y el estado de los contenedores

#### Scenario: Ocultar miembros
- **WHEN** el usuario desactiva la visualización de miembros
- **THEN** las cajas se simplifican y el cambio se conserva al navegar a otro commit

### Requirement: Estado vacío
El sistema SHALL mostrar un estado vacío explicativo cuando el commit no tenga archivos TypeScript analizables o el filtro activo oculte todo el contenido.

#### Scenario: Proyecto sin TypeScript
- **WHEN** el usuario abre un proyecto sin archivos TypeScript analizables
- **THEN** el diagrama muestra un mensaje que explica que no hay estructura que visualizar

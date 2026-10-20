# history-player Specification

## Purpose

Permite recorrer el histórico lineal de una rama elegida, desde el commit más antiguo hasta la punta, mostrando los metadatos de cada commit y manteniendo el estado del recorrido entre aperturas.

## Requirements

### Requirement: Enumeración de commits
El sistema SHALL enumerar los commits alcanzables desde la rama seleccionada en orden lineal de primeros padres, desde el commit más antiguo hasta la punta, incluyendo para cada uno SHA, mensaje, autor, fecha y padre.

#### Scenario: Orden del histórico
- **WHEN** el usuario abre un proyecto cuya rama tiene varios commits
- **THEN** el sistema muestra los commits en orden cronológico lineal, empezando por el más antiguo

#### Scenario: Commits de ramas laterales
- **WHEN** la rama contiene merges con ramas laterales
- **THEN** el recorrido sigue la primera línea de padres y presenta cada merge como un único paso con el estado resultante

### Requirement: Navegación secuencial
El sistema SHALL ofrecer controles de commit anterior y siguiente, SHALL actualizar el estado visual al commit seleccionado y SHALL deshabilitar el control correspondiente al llegar a un extremo del histórico.

#### Scenario: Avanzar al siguiente commit
- **WHEN** el usuario pulsa "siguiente" estando en un commit que no es la punta
- **THEN** el sistema selecciona el commit inmediatamente posterior y actualiza la visualización

#### Scenario: Retroceder desde el primer commit
- **WHEN** el usuario está en el commit más antiguo
- **THEN** el control "anterior" aparece deshabilitado y no se produce ningún cambio

### Requirement: Salto directo a un commit
El sistema SHALL permitir seleccionar cualquier commit del histórico mediante la lista o la línea temporal, sin obligar a recorrer todos los intermedios.

#### Scenario: Saltar a un commit lejano
- **WHEN** el usuario selecciona un commit del timeline que está lejos del actual
- **THEN** el sistema carga el estado de ese commit y actualiza el diagrama

### Requirement: Posición inicial y restauración
El sistema SHALL iniciar en el commit más antiguo la primera vez que se abre un proyecto y SHALL restaurar el último commit visitado en aperturas posteriores si ese commit sigue existiendo.

#### Scenario: Primera apertura
- **WHEN** el usuario abre por primera vez un proyecto
- **THEN** el sistema selecciona el commit más antiguo como punto de partida

#### Scenario: Reapertura del proyecto
- **WHEN** el usuario vuelve a abrir un proyecto que ya había visitado
- **THEN** el sistema selecciona el último commit visitado si todavía está en el histórico

### Requirement: Metadatos del commit
El sistema SHALL mostrar el SHA, mensaje, autor, fecha y número de archivos modificados del commit seleccionado, junto con una indicación cuando no haya cambios estructurales en TypeScript.

#### Scenario: Commit sin cambios estructurales
- **WHEN** el commit seleccionado solo modifica archivos que no afectan al modelo TypeScript
- **THEN** el sistema lo indica y mantiene el diagrama del commit anterior

### Requirement: Commits sin cambios TypeScript
El sistema SHALL incluir por defecto todos los commits del histórico lineal, incluso los que no modifican archivos TypeScript, para que la navegación siga correspondiendo al histórico real de la rama.

#### Scenario: Commit de documentación
- **WHEN** el usuario avanza a un commit que solo modifica documentación
- **THEN** el sistema muestra el commit y señala que no hay cambios estructurales

### Requirement: Actualización del histórico
El sistema SHALL permitir actualizar las referencias del repositorio, SHALL incorporar los commits nuevos y SHALL conservar la selección actual si el commit sigue existiendo.

#### Scenario: Nuevos commits en la rama
- **WHEN** el usuario actualiza un proyecto cuyo repositorio remoto tiene commits nuevos
- **THEN** el sistema añade los commits al final del histórico y permite navegar hasta ellos

#### Scenario: Commit actual desaparecido tras actualizar
- **WHEN** el commit seleccionado ya no existe tras actualizar las referencias
- **THEN** el sistema selecciona el commit válido más cercano y avisa del cambio

### Requirement: Errores de histórico inaccesible
El sistema SHALL mostrar un estado de error explícito cuando la rama no existe, el repositorio no se puede leer o no contiene commits, sin bloquear el resto de la biblioteca.

#### Scenario: Rama inexistente
- **WHEN** el usuario abre un proyecto cuya rama seleccionada ya no existe
- **THEN** el sistema muestra un error y permite elegir otra rama

## Purpose

Gestiona una biblioteca persistente de proyectos TypeScript, permitiendo importarlos desde un path local o una URL pública de Git, elegir la rama a analizar y abrirlos o eliminarlos sin alterar los repositorios locales del usuario.

## ADDED Requirements

### Requirement: Persistencia de proyectos
El sistema SHALL persistir la lista de proyectos con, al menos, identificador, nombre, tipo de origen, ubicación, rama seleccionada y fecha de última apertura, y SHALL recuperarla tras reiniciar la aplicación.

#### Scenario: Recuperar la biblioteca tras reiniciar
- **WHEN** el usuario reinicia la aplicación después de haber importado proyectos
- **THEN** el sistema muestra los mismos proyectos con su rama y metadatos conservados

### Requirement: Importación desde path local
El sistema SHALL permitir importar un proyecto indicando un path local, SHALL validar que el path corresponde a un repositorio Git y SHALL tratar el repositorio como solo lectura.

#### Scenario: Importar un repositorio local válido
- **WHEN** el usuario introduce el path de un repositorio Git que contiene archivos TypeScript
- **THEN** el sistema registra el proyecto y lo deja disponible para abrir

#### Scenario: Path local que no es un repositorio Git
- **WHEN** el usuario introduce un path que no pertenece a un repositorio Git
- **THEN** el sistema rechaza la importación y muestra un error que explica que se requiere un repositorio Git

### Requirement: Importación desde URL pública
El sistema SHALL permitir importar un proyecto desde una URL pública de Git, SHALL clonarlo en un almacenamiento gestionado por la aplicación y SHALL informar del progreso y de los fallos de clonación.

#### Scenario: Clonación correcta
- **WHEN** el usuario introduce una URL pública válida y la clonación termina correctamente
- **THEN** el sistema registra el proyecto con el repositorio clonado y permite elegir una rama

#### Scenario: Fallo de clonación
- **WHEN** la URL no es accesible, requiere autenticación o no apunta a un repositorio Git
- **THEN** el sistema no registra el proyecto y muestra un error accionable sin dejar una entrada incompleta

### Requirement: Detección de duplicados
El sistema SHALL detectar que un path local o una URL normalizada ya existen en la biblioteca y SHALL ofrecer abrir el proyecto existente en lugar de crear un duplicado.

#### Scenario: Importar un proyecto ya registrado
- **WHEN** el usuario intenta importar un origen que ya existe en la biblioteca
- **THEN** el sistema indica que el proyecto ya está registrado y ofrece abrirlo

### Requirement: Selección de rama
El sistema SHALL listar las ramas disponibles del repositorio y SHALL permitir seleccionar la rama que se va a analizar, usando la rama por defecto como selección inicial.

#### Scenario: Elegir una rama distinta de la predeterminada
- **WHEN** el usuario selecciona otra rama de la lista
- **THEN** el sistema guarda esa rama como la rama activa del proyecto

#### Scenario: Rama no disponible
- **WHEN** la rama guardada ya no existe en el repositorio
- **THEN** el sistema informa del problema y permite elegir otra rama sin perder el proyecto

### Requirement: Listado y apertura de proyectos
El sistema SHALL mostrar la biblioteca de proyectos y SHALL permitir abrir un proyecto para analizarlo, manteniendo un único proyecto activo a la vez.

#### Scenario: Abrir un proyecto de la lista
- **WHEN** el usuario selecciona un proyecto de la biblioteca
- **THEN** el sistema lo marca como activo y muestra su histórico de commits

### Requirement: Eliminación de proyectos
El sistema SHALL permitir eliminar un proyecto de la biblioteca; para proyectos clonados SHALL eliminar también la copia gestionada, y para proyectos locales SHALL eliminar solo el registro sin borrar ni modificar el repositorio original.

#### Scenario: Eliminar un proyecto clonado
- **WHEN** el usuario elimina un proyecto importado por URL
- **THEN** el sistema borra su entrada y la copia clonada gestionada por la aplicación

#### Scenario: Eliminar un proyecto local
- **WHEN** el usuario elimina un proyecto importado por path local
- **THEN** el sistema borra la entrada y el repositorio original permanece intacto

### Requirement: Validación de contenido TypeScript
El sistema SHALL permitir registrar un repositorio Git válido aunque no contenga archivos TypeScript analizables y SHALL mostrar una advertencia indicando que no hay contenido estructural que visualizar.

#### Scenario: Proyecto sin archivos TypeScript
- **WHEN** el usuario importa un repositorio Git sin archivos TypeScript analizables
- **THEN** el sistema registra el proyecto y muestra una advertencia sobre la ausencia de contenido visualizable

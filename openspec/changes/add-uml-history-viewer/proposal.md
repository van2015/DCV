## Why

Entender cómo evoluciona la arquitectura de un proyecto TypeScript obliga a saltar entre commits, abrir diffs y reconstruir mentalmente el diagrama en cada paso. No existe una vista temporal que muestre la estructura del código commit a commit, y menos aún que funcione igual de bien en repos orientados a clases que en repos de módulos y funciones.

## What Changes

- Nueva aplicación web local para importar proyectos TypeScript y recorrer el histórico de una rama con botones anterior/siguiente.
- Biblioteca de proyectos: listar, seleccionar, importar y eliminar proyectos desde un path local o una URL pública de Git, con selección de rama.
- Reproductor de commits: enumeración lineal (`first-parent`) desde el inicio de la rama hasta la punta, metadatos del commit y navegación secuencial.
- Modelo unificado de código por commit: archivos, imports, clases, interfaces, enums, alias de tipo y funciones, incluyendo firmas, exportación y hash del cuerpo de cada declaración.
- Tres proyecciones del mismo modelo: vista de clases, vista de módulos (archivo como `<<module>>` con funciones y tipos dentro) y vista de paquetes (carpetas con dependencias agregadas).
- Diff visual entre commits: elementos añadidos, eliminados, con firma modificada o solo con cuerpo modificado; panel lateral de cambios y modo foco sobre el subgrafo afectado.
- Layout con posiciones preservadas entre commits, fantasmas de elementos eliminados y opción de recalcular.
- Análisis incremental sin checkout: lectura de blobs de git y cache por hash de contenido, para que abrir un commit no requiera procesar toda la historia.
- Autoselección de la vista inicial según el contenido del proyecto, con posibilidad de cambiar manualmente.

**Fuera de alcance (v1):** repos privados por URL, lenguajes distintos de TypeScript, diagramas de secuencia o de estados, grafo de llamadas entre funciones, comparación lado a lado de ramas o proyectos, edición de código y despliegue multiusuario.

## Capabilities

### New Capabilities

- `project-library`: registro persistente de proyectos, importación desde path local o URL pública de Git, selección de rama, listado, apertura y eliminación.
- `history-player`: enumeración del histórico de una rama, metadatos de commit y navegación anterior/siguiente con estado reproducible.
- `typescript-model-extraction`: extracción incremental del modelo unificado de archivos y declaraciones, imports, firmas, cuerpos y diff semántico entre commits.
- `uml-diagram-view`: vistas de clases, módulos y paquetes, overlay de cambios, foco, layout estable y controles de visualización.

### Modified Capabilities

Ninguna. El proyecto no tiene specs existentes.

## Impact

- Proyecto greenfield: no hay código de aplicación todavía; solo el scaffold de OpenSpec.
- Nuevo backend local en Node (API HTTP en `127.0.0.1`) para git, filesystem y análisis; nueva SPA en React + Vite.
- Dependencias previstas: TypeScript compiler API (o ts-morph), React Flow, ELK.js, SQLite o almacenamiento JSON + cache en disco, y git del sistema.
- Acceso de lectura al filesystem local y clonación de repos públicos; los repos locales nunca se modifican. El endpoint local debe limitarse a loopback y validar origen/token.
- Fuente de datos: `git rev-list`, `git diff-tree`, `git ls-tree` y `git cat-file`, sin checkout del working tree.
- Los repos privados quedan cubiertos solo si el usuario los clona aparte e importa el path local.

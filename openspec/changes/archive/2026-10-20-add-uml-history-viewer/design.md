## Context

Ver `proposal.md` para la motivación y las specs para el comportamiento esperado. El proyecto es greenfield: solo existe el scaffold de OpenSpec. El entorno local tiene Node 24, pnpm 11 y git 2.53.

La aplicación analiza repositorios TypeScript ajenos, por lo que hay dos consumidores con necesidades distintas:

- El backend local necesita git, acceso de lectura al filesystem y el parser de TypeScript.
- El frontend necesita modelos semánticos pequeños, diffs y posiciones de layout; no debería saber nada de Git.

El requisito de importar un path local obliga a que el backend corra en la máquina del usuario. No se diseña como un servicio remoto multiusuario.

## Goals / Non-Goals

**Goals:**

- Leer la historia de una rama sin hacer checkout ni modificar el repositorio analizado.
- Construir un modelo estructural incremental y cacheable por contenido, no por commit.
- Soportar repos orientados a clases y repos de módulos con funciones con el mismo modelo de datos.
- Hacer que el cambio sea visible: diff estructural, overlay, foco y posiciones estables.
- Mantener la primera versión ejecutable como app local sin infraestructura externa.

**Non-Goals:**

- Type checker completo de TypeScript por cada commit.
- Grafo de llamadas entre funciones o análisis de runtime.
- Diagramas de secuencia, estados u objetos.
- Repos privados por URL, autenticación multiusuario o despliegue hospedado.
- Edición de código o escritura en los repositorios analizados.
- Cumplimiento estricto de todos los elementos UML: se usa un perfil pragmático de clases y componentes/módulos.
- Navegación al código fuente línea a línea en v1.

## Decisions

### 1. App web local con backend Node

Un único proceso Node sirve la API y, en producción, el build estático de la SPA. En desarrollo, Vite sirve el frontend y hace proxy a la API.

- **Por qué:** el path local, Git y el parser viven en el backend; el navegador solo dibuja. No hay que empaquetar una app de escritorio para validar el producto.
- **Alternativas:** Tauri/Electron (mejor integración de escritorio, pero más packaging y superficie de mantenimiento); servicio hospedado (incompatible con paths locales y con un modelo de seguridad simple).
- **Consecuencia:** la distribución inicial es `pnpm dev` o `pnpm start`; un wrapper de escritorio queda para después.

### 2. Lectura de Git sin checkout

Para repos remotos se usa un clon bare en el directorio de datos de la app:

```
git clone --bare --no-recurse-submodules <url> <appData>/repos/<projectId>
```

Para repos locales se lee el repositorio existente y nunca se escribe en él.

La historia se enumera con:

```
git rev-list --first-parent --reverse <branch>
git ls-tree -r -z <sha>
git diff-tree -r -M --name-status <parent> <sha>
git cat-file --batch
```

- **Por qué:** no se materializa el working tree, no se pisan cambios del usuario y el acceso a blobs es directo. `--first-parent` produce una película lineal comprensible; los merges aparecen como un paso con el estado resultante.
- **Alternativas:** checkout o `git worktree` por commit (simple pero lento y con mucho disco); `isomorphic-git` (más portable, pero más lento y con menos compatibilidad); bindings a libgit2 (dependencia nativa innecesaria).
- **Refresco:** `git fetch --prune` para clones gestionados; para repos locales se releen las referencias. No hay watcher en v1.

### 3. Modelo unificado y tres proyecciones

El parser no produce "un diagrama de clases": produce un modelo de archivos y declaraciones. Las vistas son proyecciones.

```
FileModel
  path
  contentHash
  imports[]            specifier, typeOnly, resolvedPath?
  declarations[]
    kind               class | interface | enum | type | function
    name
    exported
    signature?         funciones
    members[]          clases e interfaces
    bodyHash?          funciones y metodos
    sourceRange
  diagnostics[]

Snapshot
  commit
  branch
  files[]
  edges[]              extends | implements | association | imports
  diagnostics[]
```

Vistas:

- **Clases:** nodos para class/interface/enum; aristas de herencia, implementación y asociación.
- **Módulos:** cada archivo es un nodo `<<module>>`; funciones y tipos exportados aparecen como miembros; las carpetas son contenedores; las aristas son imports.
- **Paquetes:** cada carpeta es un nodo y las aristas son imports agregados entre carpetas.

Decisiones asociadas:

- **Funciones como miembros, no como nodos.** Un repo mediano tiene decenas de archivos y cientos de funciones. El grafo de funciones explota en aristas y el grafo de llamadas estático es incompleto en TypeScript (métodos, DI, callbacks, imports dinámicos). El nivel archivo responde a "qué depende de qué" sin perder las funciones.
- **Las clases aparecen como símbolo dentro del módulo.** No se aplanan sus métodos en la vista de módulos; un doble clic puede abrir la vista de clases enfocada en esa clase.
- **Identidad estable:** `path#kind:name`. Si git detecta un archivo renombrado, se conserva la identidad de las declaraciones que mantienen nombre y tipo. Los movimientos y renombrados de declaración se detectan por `bodyHash` y se etiquetan como probables.
- **Alternativa descartada:** funciones como nodos con aristas de llamada. Se puede añadir después como vista experimental y con cobertura parcial, no como base del player.

### 4. Análisis sintáctico, no type checker

Se usa la API del compilador de TypeScript directamente, creando un `SourceFile` por blob y recorriendo el AST. No se construye un `Program` ni se ejecuta el checker.

- **Qué se extrae:** declaraciones de nivel superior, miembros de clases/interfaces, firmas, modificadores, imports, re-exports y rango de fuente.
- **Funciones:** `function` declarations, `export const` con arrow function o function expression, y default exports. Los métodos son miembros de clase. Las funciones internas se conservan para la vista detallada.
- **`bodyHash`:** hash del cuerpo normalizado, ignorando comentarios y formato. Permite distinguir cambio de firma de cambio de implementación y alimenta las heurísticas de renombrado/movimiento.
- **Imports:** se guardan specifiers crudos en el `FileModel`; la resolución a path ocurre al ensamblar el snapshot, donde se conoce el path del archivo. Se resuelven imports relativos, extensiones `.ts`/`.tsx`, `index.ts` y `paths`/`baseUrl` del tsconfig más cercano.
- **tsconfig:** se busca el `tsconfig.json` más cercano al archivo, se parsea `extends` local y se cachea por contenido. Si falta o es inválido, se resuelven solo imports relativos.
- **Asociaciones:** se resuelven tipos de propiedades cuando son identificables sin checker (mismo archivo o import resuelto, incluyendo arrays y uniones). Si hay ambigüedad, se omite la arista. No se dibujan composición ni agregación.
- **Alternativas:** ts-morph (cómodo, pero añade un `Project` y no aporta nada en modo sintáctico); type checker completo (resolvería asociaciones con precisión, pero exige un programa entero por commit y rompe la estrategia incremental); tree-sitter (rápido, pero sin semántica TypeScript y con una gramática extra que mantener).

### 5. Cache incremental por blob

La unidad de cache es el contenido del archivo, no el commit:

```
<appData>/cache/<analyzerVersion>/<blobSha>.json
```

Un snapshot se ensambla desde el árbol del commit:

```
git ls-tree -r <sha>  ->  path -> blobSha
                              |
                              v
                  FileModel desde cache o parser
                              |
                              v
                  resolucion de imports + edges
                              |
                              v
                         Snapshot
```

- **Por qué:** un archivo que no cambió se parsea una sola vez en toda la historia. Saltar a un commit arbitrario es `ls-tree` + parsear solo los blobs que faltan; no hacen falta checkpoints ni precalcular todo.
- **Invalidación:** la versión del analizador forma parte del path de cache. Cambiar el parser invalida todo sin mezclar resultados.
- **Memoria:** los snapshots visitados se guardan en una LRU; el disco guarda solo `FileModel` por blob. Los snapshots se reensamblan baratamente.
- **Evicción:** la cache es descartable; se puede borrar por LRU o por tamaño sin perder el registro de proyectos.
- **Alternativa:** SQLite para cache. Se descarta en v1 porque hay un solo usuario, sin concurrencia, y JSON content-addressed es más fácil de inspeccionar. Si el volumen lo justifica, se migra después manteniendo la misma clave lógica.

### 6. Diff estructural en el backend

El backend ensambla el snapshot del commit y el de su primer padre, y calcula el diff. El frontend recibe el snapshot y su diff; no compara modelos.

- **Cambios de nodo:** added, removed, modified (firma/miembros), body-only, moved, renamed.
- **Cambios de arista:** added/removed por `(kind, sourceId, targetId)`.
- **Renombrados/movimientos:** git `-M` detecta renombrados de archivo. Para declaraciones se combina nombre+tipo y `bodyHash`; si el hash coincide de forma única, se etiqueta como probable.
- **Línea base:** el primer commit no tiene diff; no se marcan todos los elementos como añadidos.
- **Navegación hacia atrás:** el diff mostrado es siempre el que introduce el commit seleccionado respecto a su padre. Retroceder no invierte etiquetas: se vuelve a ver el mismo cambio desde el otro lado del histórico.
- **Commit sin cambios estructurales:** diff vacío; el frontend conserva el diagrama y lo indica.
- **Si el modelo está incompleto:** el snapshot incluye diagnósticos y se muestra una advertencia; el diff se calcula con lo que sí se pudo analizar.

### 7. Layout estable y renderizado

Frontend con React + Vite + `@xyflow/react` (React Flow) y `elkjs` para layout jerárquico en un Web Worker. Nodos de clase y de módulo son componentes React custom.

- **Layout inicial:** ELK `layered`. La vista de módulos usa contenedores de carpeta; la de paquetes es plana.
- **Navegación:** no se ejecuta ELK en cada commit. Se cargan las posiciones guardadas por `projectId + view`; los nodos nuevos se colocan en el centroide de sus vecinos ya posicionados (o en un hueco libre) y se hace una pasada local de separación de solapes. Los eliminados conservan su última posición como fantasmas durante un paso.
- **Re-layout:** manual, ejecuta ELK desde cero y reemplaza las posiciones de esa vista.
- **Foco:** subgrafo de elementos cambiados + N saltos (por defecto 1-2), resto atenuado u oculto. Se activa por defecto cuando el diagrama completo supera un umbral de nodos; en proyectos pequeños se muestra todo.
- **Persistencia:** posiciones, cámara y estado de controles en `localStorage`, por proyecto y vista. Es estado de presentación, no del dominio; si se pierde, se recalcula.
- **Alternativas:** Mermaid (fácil de generar, pero sin posiciones estables, interacción ni control del diff); PlantUML (requiere servidor Java o remoto y devuelve imágenes); Graphviz WASM (mejor layout jerárquico, pero menos ergonomía para nodos React y eventos). React Flow + ELK ofrece el mejor equilibrio para un player interactivo.

### 8. API local y ejecución del análisis

API JSON sobre `127.0.0.1`; SSE para progreso de clonación e indexación.

```
GET    /api/projects
POST   /api/projects                 { source: "local" | "url", location, branch? }
DELETE /api/projects/:id
POST   /api/projects/:id/refresh
GET    /api/projects/:id/branches
GET    /api/projects/:id/commits?branch=<name>
GET    /api/projects/:id/commits/:sha/model
GET    /api/projects/:id/events      (SSE)
```

- El análisis corre en un worker thread para no bloquear la API.
- Hay una cola por proyecto y una petición de modelo en vuelo por commit; peticiones repetidas se coalescen.
- Al visitar un commit se precargan los vecinos inmediatos en background, con cancelación al cambiar de proyecto.
- El endpoint de modelo devuelve metadatos del commit, snapshot, diff y diagnósticos en una sola respuesta.

### 9. Persistencia de la aplicación

```
<appData>/projects.json            registro de proyectos (versionado)
<appData>/repos/<projectId>/       clones bare
<appData>/cache/<analyzerVersion>/ cache de FileModel por blob
```

- Escrituras atómicas (temporal + rename) para el registro.
- El registro es la única fuente de verdad que no se puede perder; la cache es descartable.
- `appData` sigue la convención del sistema (`XDG_DATA_HOME` en Linux, `Application Support` en macOS, `APPDATA` en Windows).
- Alternativa: SQLite para registro y cache. Se pospone; la interfaz de persistencia se aísla para poder cambiarla.

### 10. Seguridad y límites

- El servidor escucha solo en loopback y valida `Origin`/`Host`; además usa un token de sesión que la SPA recibe al cargar. Sin token no se aceptan peticiones de análisis.
- Git se invoca con `execFile`/`spawn` y arrays de argumentos; nunca con shell.
- Solo se aceptan URLs `https` o `ssh` para clonar; no se siguen submódulos ni se ejecuta código del repo.
- Los paths locales se validan como repositorios Git y se tratan como solo lectura. Los clones viven en un directorio generado por la app, no en un path controlado por el usuario.
- Se aplican timeouts y límites de tamaño a clones y respuestas; un repo malicioso puede consumir CPU al parsear, pero no ejecutar código.
- Repos privados por URL quedan fuera de v1; el usuario puede clonarlos por su cuenta e importar el path local.

### 11. Estructura del repositorio

Monorepo ligero con pnpm:

```
apps/server        Node + Hono + API + workers
apps/web           React + Vite + React Flow + ELK
packages/analyzer  parser TypeScript, resolucion, diff
packages/shared    tipos DTO y esquemas compartidos
```

- El analyzer se prueba de forma aislada y se puede ejecutar en worker.
- Hono se elige por superficie pequeña y soporte de streaming/SSE; Fastify queda como alternativa si hacen falta más plugins.
- TypeScript estricto; Vitest para unitarios e integración.

### 12. Estrategia de pruebas

Fixtures de repositorios creados por script, con commits deterministas:

- OO: clases, interfaces, herencia, implementación, miembros.
- Funcional: funciones declaradas, arrow functions exportadas, tipos, cambios de cuerpo.
- Mixto: renombrados de archivo, movimientos de declaración, eliminaciones, imports con alias de tsconfig y un archivo con error de sintaxis.
- Monorepo mínimo con dos tsconfigs para validar la resolución por archivo.

Se prueban con snapshots JSON el parser, la resolución de imports, el diff y las heurísticas de renombrado. La lectura de Git se prueba con repositorios temporales reales. El layout estable se prueba a nivel de lógica de posiciones y, más adelante, con Playwright para navegación y persistencia de cámara.

## Risks / Trade-offs

- **Resolución estática incompleta** (re-exports, barrels, imports dinámicos, tipos complejos) -> resolver imports directos, tsconfig y re-exports hasta un número limitado de saltos; registrar diagnósticos; medir con fixtures reales.
- **Repos funcionales con muchos cambios de cuerpo** -> `bodyHash`, indicador discreto y filtro de implementación; sin eso el player parecería vacío.
- **Estabilidad de layout vs claridad** -> posiciones preservadas + separación local de solapes + re-layout manual; aceptar que grafos con cambios masivos se vean menos ordenados.
- **Coste del primer commit** en repos grandes -> análisis lazy, progreso, cache por blob y prefetch de vecinos.
- **Renombrados heurísticos** -> etiquetar como "probable" y no fusionar identidades si la coincidencia no es única.
- **Monorepos y tsconfig** -> tsconfig más cercano por archivo, soporte de `extends` local; los project references complejos quedan fuera y se resuelven por imports relativos.
- **Superficie del servidor local** -> loopback, token de sesión, validación de origen, `execFile` sin shell y límites de recursos.
- **Clonación de repos no confiables** -> clon bare, sin submódulos, sin hooks, sin ejecutar código; solo se parsea texto TypeScript.
- **Versión de TypeScript del analizador** -> se usa la versión incluida en la app; sintaxis más nueva que la soportada produce diagnósticos, no un crash.
- **Crecimiento de la cache** -> content-addressed y descartable; política LRU por tamaño; migración a SQLite si el volumen lo pide.
- **Confusión entre vista de clases y de módulos** -> autoselección por contenido, badge de cambio de vista y enlace directo desde un símbolo de clase.

## Migration Plan

No hay migración de datos: la aplicación es nueva. El registro de proyectos lleva una versión de esquema para poder evolucionar sin perder proyectos; la cache lleva la versión del analizador y puede borrarse y regenerarse en cualquier momento. El despliegue inicial es local: desarrollo con `pnpm dev`, uso con build estático servido por el backend.

## Open Questions

- Umbral exacto de nodos para activar el foco por defecto y profundidad inicial; se ajustará con fixtures y un repo real.
- Política de tamaño/LRU de la cache; se definirá tras medir el peso de `FileModel` en repos medianos.
- Profundidad de resolución de re-exports/barrels; se empieza con un límite conservador y se mide cuántas aristas faltan.
- Momento para añadir clon parcial (`--filter=blob:none`) en repos muy grandes; no cambia la arquitectura de lectura.
- Si el registro o la cache deben migrar a SQLite; la interfaz de persistencia queda aislada para no bloquearlo.

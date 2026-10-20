## 1. Scaffold y tooling

- [x] 1.1 Crear el workspace pnpm con `apps/server`, `apps/web`, `packages/analyzer` y `packages/shared`; verificar con `pnpm install` y comprobando que existen los cuatro paquetes.
- [x] 1.2 Configurar TypeScript estricto, ESLint, Prettier, Vitest y Testing Library en los paquetes que correspondan; verificar con `pnpm typecheck`, `pnpm lint` y `pnpm test` sobre un test trivial.
- [x] 1.3 Levantar el esqueleto del servidor (Hono en loopback, `/api/health`, servido estático del build) y de la SPA (Vite + React); verificar con `pnpm dev` que la app carga y `/api/health` responde.
- [x] 1.4 Definir en `packages/shared` los DTO y esquemas de `Project`, `CommitInfo`, `FileModel`, `Declaration`, `Snapshot`, `Diff` y `Diagnostic`; verificar con typecheck y tests de serialización.

## 2. Biblioteca de proyectos

- [x] 2.1 Implementar la resolución del directorio de datos y el registro JSON versionado con escritura atómica; verificar con tests de crear, cargar, actualizar y recuperar tras un reinicio simulado.
- [x] 2.2 Implementar la validación de un path local (repo Git, canonicalización, solo lectura) y la detección de duplicados; verificar con repositorios temporales y con un path que no es Git.
- [x] 2.3 Implementar la clonación bare de URLs públicas con progreso, sin submódulos, limpieza ante fallo y validación de protocolos; verificar con un remoto local y con una URL inválida.
- [x] 2.4 Implementar listado de ramas, rama por defecto, cambio de rama, refresco de referencias y borrado según origen (clon gestionado vs path local); verificar con tests de integración.

## 3. Adaptador Git

- [x] 3.1 Implementar la enumeración `first-parent` y los metadatos de commit; verificar orden, extremos y manejo de merges con un fixture de commits.
- [x] 3.2 Implementar `ls-tree` y la lectura por lotes de blobs con `cat-file`; verificar el mapa path -> blob y el contenido contra el fixture.
- [x] 3.3 Implementar `diff-tree` con detección de renombrados y manejo del commit raíz; verificar archivos añadidos, modificados, eliminados y renombrados.
- [x] 3.4 Implementar errores de rama inexistente, repositorio ilegible e histórico vacío; verificar que se muestran como errores explícitos sin bloquear la biblioteca.

## 4. Parser TypeScript

- [x] 4.1 Implementar el descubrimiento y las exclusiones de `.ts`/`.tsx` (`node_modules`, salidas de build y tests); verificar con un fixture mixto.
- [x] 4.2 Implementar la extracción de clases, interfaces, enums, alias de tipo y funciones (declaraciones, arrow functions exportadas y default exports) con exportación, firma, miembros y modificadores; verificar con tests por tipo de declaración.
- [x] 4.3 Implementar `bodyHash` normalizado que ignore comentarios y formato; verificar que un cambio de cuerpo altera el hash y uno de formato o comentarios no.
- [x] 4.4 Implementar la búsqueda y el parseo del tsconfig más cercano por archivo, `extends` local y resolución de imports (relativos, extensiones, `index`, `paths`/`baseUrl` y re-exports con límite); verificar con un fixture de alias y barrel.
- [x] 4.5 Implementar las aristas `extends`, `implements`, `imports` y asociaciones resolubles, sin inventar composición ni agregación; verificar con fixtures OO y mixto.
- [x] 4.6 Implementar diagnósticos por archivo (sintaxis, import no resuelto, tsconfig inválido) sin abortar el snapshot; verificar que un archivo roto no impide analizar el resto del modelo.

## 5. Cache y snapshots

- [x] 5.1 Implementar la cache content-addressed por `blobSha + analyzerVersion` con escritura atómica; verificar hit/miss y reutilización entre commits.
- [x] 5.2 Implementar el ensamblado de snapshot desde el árbol y los `FileModel`, incluyendo la resolución de imports; verificar que cache fría y caliente producen el mismo JSON.
- [x] 5.3 Implementar la LRU de snapshots en memoria y la política de evicción de cache por tamaño; verificar con tests de límites.
- [x] 5.4 Implementar la invalidación por versión del analizador; verificar que tras cambiar la versión no se sirven resultados antiguos.

## 6. Diff estructural

- [x] 6.1 Implementar la identidad de nodos, miembros y aristas, y la clasificación de añadidos, eliminados y modificados; verificar con snapshots dorados.
- [x] 6.2 Implementar la distinción entre firma modificada y solo cuerpo modificado, ignorando formato y comentarios; verificar los cuatro casos del spec.
- [x] 6.3 Implementar la detección de archivo renombrado, declaración renombrada y movimiento por nombre y `bodyHash`, etiquetando los resultados como probables; verificar falsos positivos con declaraciones duplicadas.
- [x] 6.4 Implementar la línea base del primer commit y el diff vacío para commits sin cambios estructurales; verificar que el primer commit no marca todo como añadido.

## 7. API local y trabajos

- [x] 7.1 Implementar los endpoints de proyectos, ramas, commits, refresco, borrado y modelo con un envelope de errores; verificar con tests de integración de la API.
- [x] 7.2 Implementar SSE de progreso para clonación e indexación; verificar eventos de inicio, progreso, fin y error.
- [x] 7.3 Implementar la cola de análisis en worker thread por proyecto, coalescing, cancelación y prefetch de commits vecinos; verificar que la API sigue respondiendo durante un análisis y que no se duplican trabajos.
- [x] 7.4 Implementar la seguridad local: loopback, token de sesión, validación de `Origin`/`Host`, `execFile` sin shell y timeouts; verificar que las peticiones sin token o con origen inválido se rechazan.

## 8. Shell y biblioteca en el frontend

- [x] 8.1 Implementar el layout, routing y estado global (proyecto activo, vista y commit); verificar con tests de render del shell.
- [x] 8.2 Implementar el listado de proyectos con abrir, eliminar y estados vacío/error; verificar con la API mockeada.
- [x] 8.3 Implementar el diálogo de importación local/URL, selección de rama, progreso, duplicados y errores; verificar los flujos feliz y de error con la API mockeada.
- [x] 8.4 Implementar el cliente API tipado, la inyección del token y el manejo de SSE con reconexión; verificar con tests del cliente y de los eventos.

## 9. Reproductor de commits

- [x] 9.1 Implementar el timeline/lista de commits con metadatos y número de archivos modificados en orden `first-parent`; verificar con datos de fixture.
- [x] 9.2 Implementar anterior/siguiente/salto, límites deshabilitados y actualización del estado; verificar con tests de navegación.
- [x] 9.3 Implementar la restauración del último commit, el indicador de "sin cambios estructurales", el refresco del histórico y los errores de rama; verificar con tests de estado y de UI.

## 10. Vistas y nodos del diagrama

- [x] 10.1 Implementar las proyecciones de modelo a clases, módulos y paquetes (nodos, contenedores y aristas); verificar con unit tests sobre snapshots OO y funcional.
- [x] 10.2 Implementar el nodo de clase con estereotipo, compartimentos, visibilidad y marcadores de abstracta/interfaz; verificar el render con un fixture OO.
- [x] 10.3 Implementar el nodo de módulo con funciones y tipos, los contenedores de carpeta y las aristas de importación; verificar con un fixture funcional.
- [x] 10.4 Implementar la vista de paquetes con agregación de imports; verificar la agregación con un fixture mixto.
- [x] 10.5 Implementar el selector de vistas, la autoselección por contenido, la persistencia de la elección y el enlace de una clase desde el módulo a la vista de clases; verificar con tests de UI.
- [x] 10.6 Implementar el estado vacío y la advertencia de modelo incompleto; verificar con un proyecto sin TypeScript y con un archivo roto.

## 11. Overlay y panel de cambios

- [x] 11.1 Implementar el overlay de añadido, modificado, eliminado y body-only con color y una marca no dependiente del color, además de los fantasmas de eliminados; verificar con snapshots de diff.
- [x] 11.2 Implementar el panel de cambios agrupado y el enfoque del elemento al seleccionar un cambio; verificar con tests de UI.
- [x] 11.3 Implementar los filtros de cambios de implementación, miembros y tipos, conservando su estado; verificar que el diagrama responde y que el estado persiste al navegar.

## 12. Layout estable y foco

- [x] 12.1 Implementar el layout ELK en Web Worker para las tres vistas; verificar posiciones válidas y ausencia de solapes graves con los fixtures.
- [x] 12.2 Implementar la persistencia de posiciones y cámara por proyecto y vista; verificar que se restauran al reabrir.
- [x] 12.3 Implementar la estrategia incremental (reusar posiciones, colocar nodos nuevos junto a sus vecinos y separar solapes) conservando los fantasmas; verificar con una secuencia de commits simulada.
- [x] 12.4 Implementar el re-layout manual conservando el commit seleccionado; verificar que solo se recalcula al pulsar el control.
- [x] 12.5 Implementar el modo foco con N saltos, umbral de activación y atenuación/ocultación, además de la persistencia de controles; verificar con un diagrama grande y con el ajuste de profundidad.
- [x] 12.6 Implementar el colapso/expansión de carpetas y el toggle de miembros con persistencia; verificar que el estado se conserva al navegar entre commits.

## 13. Fixtures, integración y validación

- [x] 13.1 Crear el generador de fixtures con historias OO, funcional, mixta, monorepo con alias y archivo con error; verificar que produce commits deterministas.
- [x] 13.2 Añadir tests dorados de parser, resolución, diff, renombrados y cache; verificar con `pnpm test` completo.
- [x] 13.3 Añadir un test de integración de backend que importe un fixture local, liste commits, obtenga modelo/diff y detecte cambios; verificar el flujo completo.
- [x] 13.4 Configurar Playwright y añadir un E2E de importación, navegación, cambio de vista, foco y persistencia de cámara; verificar el escenario completo.
- [x] 13.5 Ejecutar un benchmark con un repositorio TypeScript mediano y registrar tiempos de parseo, snapshot y layout; verificar que los umbrales de foco y cache se ajustan con datos.
- [x] 13.6 Ejecutar `openspec validate "add-uml-history-viewer" --strict` y `pnpm build`; verificar que ambos pasan.

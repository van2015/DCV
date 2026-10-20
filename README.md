# DCV

Visor local de la evolución arquitectónica de proyectos TypeScript. Importa un repositorio (ruta local o URL pública), recorre su histórico commit a commit y muestra diagramas UML estilo clases, módulos o paquetes, con los cambios estructurales de cada commit resaltados.

## Características

- Importación de repositorios locales o públicos por URL (clon desnudo en segundo plano), selección de rama y actualización del histórico con `fetch`.
- Reproductor de histórico de más antiguo a más reciente: botones `← Anterior` / `Siguiente →`, metadatos del commit y avisos de "Línea base del histórico" o "Sin cambios estructurales de TypeScript en este commit".
- Tres vistas sobre el mismo modelo: **Clases**, **Módulos** y **Paquetes**; las carpetas se dibujan como contenedores colapsables.
- Superposición de diferencias con marcadores: `+` añadido, `−` eliminado, `~` modificado, `≈` solo cuerpo, `→` movido, `↻` renombrado; los nodos añadidos se tiñen de verde suave, los eliminados de rojo suave y los elementos eliminados se muestran como nodos fantasma.
- Panel de cambios agrupado por estado, con filtros (implementación, miembros, tipos) y salto directo al nodo afectado.
- Layout incremental con ELK ejecutado en un Web Worker (con fallback en proceso), posiciones persistidas por commit, proyecto y vista (con herencia desde el commit más cercano y poda LRU de 50), cámara y controles por proyecto y vista, y botón `Re-layout`.
- Modo foco con profundidad de 1 a 3 saltos (se activa a partir de 40 nodos) y opción de ocultar el resto.
- Análisis sintáctico con la API del compilador de TypeScript (no ejecuta el código), cache por blob y versión de analizador; los archivos con errores de sintaxis se avisan sin romper la vista.
- Seguridad pensada para uso local: escucha solo en `127.0.0.1`, token de sesión por arranque y validación de Host/Origin.

## Requisitos

- Node.js >= 22
- pnpm 11
- `git` disponible en el `PATH`

## Instalación

```bash
pnpm install
```

## Uso

Modo producción local:

```bash
pnpm build
pnpm start
# Abre http://127.0.0.1:4317
```

Modo desarrollo:

```bash
pnpm dev
# Interfaz: http://127.0.0.1:5173  (Vite)
# API:      http://127.0.0.1:4317  (token de desarrollo inyectado automáticamente)
```

En producción el servidor inyecta el token de sesión en `index.html`; en desarrollo lo inyecta Vite a partir de `DCV_TOKEN` (el script `dev` usa `dev` por defecto).

## Flujo de uso

1. Pulsa **Importar proyecto** e indica una ruta local o una URL `https`/`ssh` pública sin credenciales.
2. Elige la rama en el visor; **Actualizar** re-ejecuta `git fetch` y recarga el histórico.
3. Recorre los commits con `← Anterior` / `Siguiente →`; el diagrama se recalcula para cada commit.
4. Cambia la **Vista** (Clases / Módulos / Paquetes), oculta compartimentos con **Miembros** o recalcula el layout con **Re-layout**.
5. En el **panel de cambios**, haz clic en una entrada para enfocar el nodo afectado (cambia de vista si es necesario). Usa los filtros para acotar el overlay.
6. Activa **Modo foco** y ajusta la profundidad; marca **Ocultar el resto** para ver solo el vecindario del foco.
7. El zoom y el desplazamiento del lienzo se guardan por proyecto y vista.

## Scripts

| Comando           | Descripción                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm dev`        | Servidor API + Vite en modo desarrollo                                                               |
| `pnpm build`      | Compila la web (Vite) y el servidor (tsup)                                                           |
| `pnpm start`      | Sirve la web compilada y la API en `127.0.0.1:4317`                                                  |
| `pnpm test`       | Suite completa de tests (Vitest) en todos los paquetes                                               |
| `pnpm test:watch` | Tests en modo vigilancia en todos los paquetes                                                       |
| `pnpm typecheck`  | Verificación de tipos de todos los paquetes                                                          |
| `pnpm lint`       | ESLint sobre el repositorio                                                                          |
| `pnpm format`     | Formatea con Prettier                                                                                |
| `pnpm e2e`        | Pruebas de extremo a extremo con Playwright (compila y levanta un servidor con fixtures)             |
| `pnpm e2e:server` | Levanta solo el servidor E2E con repositorios de prueba                                              |
| `pnpm fixtures`   | Genera repositorios de ejemplo en `.tmp/fixtures`                                                    |
| `pnpm benchmark`  | Mide parseo, snapshot, diff y layout; escribe `openspec/changes/add-uml-history-viewer/benchmark.md` |

## Estructura

```
apps/server         API Hono, acceso a git, análisis en worker y SSE
apps/web            React 19 + Vite + React Flow (interfaz en español)
packages/analyzer   Descubrimiento, parser y motor de diff (compiler API de TypeScript)
packages/shared     DTOs, validación con zod y utilidades de identificadores
e2e                 Especificaciones de Playwright
scripts             Fixtures, servidor E2E y benchmark
openspec            Especificación del cambio implementado (specs, diseño y tareas)
```

## API

Todas las rutas salvo `/api/health` requieren el token de sesión (`x-dcv-token` o `?token=`).

| Método y ruta                                      | Descripción                                           |
| -------------------------------------------------- | ----------------------------------------------------- |
| `GET /api/health`                                  | Estado del servidor                                   |
| `GET /api/projects`                                | Lista la biblioteca de proyectos                      |
| `POST /api/projects`                               | Importa un proyecto (`{ source, location, branch? }`) |
| `GET /api/projects/:id`                            | Detalle de un proyecto                                |
| `PATCH /api/projects/:id`                          | Actualiza rama o último commit abierto                |
| `DELETE /api/projects/:id`                         | Elimina el proyecto y sus datos gestionados           |
| `POST /api/projects/:id/refresh`                   | Refresca el repositorio remoto                        |
| `GET /api/projects/:id/branches`                   | Lista de ramas                                        |
| `GET /api/projects/:id/commits?branch=`            | Histórico del proyecto                                |
| `GET /api/projects/:id/commits/:sha/model?branch=` | Snapshot del commit y diff contra su primer padre     |
| `GET /api/events`                                  | Eventos SSE de importación                            |
| `GET /api/projects/:id/events`                     | Eventos SSE de análisis del proyecto                  |

## Variables de entorno

| Variable       | Valor por defecto            | Descripción                                |
| -------------- | ---------------------------- | ------------------------------------------ |
| `DCV_PORT`     | `4317`                       | Puerto de la API y de la web servida       |
| `DCV_TOKEN`    | UUID aleatorio               | Token de sesión; se inyecta en la interfaz |
| `DCV_DATA_DIR` | Según plataforma (ver abajo) | Directorio de datos                        |
| `DCV_WEB_ROOT` | `apps/web/dist`              | Carpeta de la web compilada                |

Directorio de datos por defecto:

- Linux: `$XDG_DATA_HOME/dcv` o `~/.local/share/dcv`
- macOS: `~/Library/Application Support/DCV`
- Windows: `%APPDATA%\DCV`

Contenido: `projects.json` (registro), `repos/<projectId>` (clones gestionados; los repos locales se leen en sitio) y `cache/<analyzerVersion>/<blobSha>.json`.

## Seguridad y límites

- El servidor escucha únicamente en la interfaz de loopback y valida Host y Origin; los repos privados por URL y las credenciales no están soportados.
- Clonado remoto: solo protocolos `https:` y `ssh:`, sin credenciales, con timeout de 10 minutos y tamaño máximo de 5 GB.
- El análisis es sintáctico: no ejecuta ni evalúa el código del proyecto analizado.

Fuera del alcance de la versión actual: repositorios privados por URL, otros lenguajes, diagramas de secuencia/estado, grafo de llamadas, uso multiusuario y edición de código.

## Estado del proyecto

Los cambios `add-uml-history-viewer` (58/58 tareas), `save-commit-diagram-positions` (11/11 tareas) y `add-node-change-colors` (8/8 tareas) están completos. La verificación incluye:

- `pnpm test`: 194 pruebas (shared 5, analyzer 36, web 86, server 67).
- `pnpm e2e`: 4 pruebas Playwright (importación, navegación, cambio de vista, foco, persistencia de cámara, restauración de posiciones por commit y tinte de nodos añadidos/eliminados).
- `pnpm benchmark`: en un repositorio sintético de 100 archivos y 800 clases, snapshot en frío de 263.6 ms, con cache 42.7 ms (x6.2), diff 8.2 ms y layout ELK de 216 ms; el umbral de foco de 40 nodos y la cache por blob quedan validados con estos datos.

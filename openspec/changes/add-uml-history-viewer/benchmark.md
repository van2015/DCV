# Benchmark de DCV

Generado: 2026-10-20T01:33:12.313Z

Repositorio sintético: 100 archivos, 8 clases por archivo (899 declaraciones, 99 aristas).

| Fase | Tiempo | Notas |
| --- | --- | --- |
| Snapshot en frío | 277.7 ms | parseo + resolución sin cache |
| Snapshot con cache | 42.7 ms | reutiliza modelos por blob (speedup x6.5) |
| Snapshot segundo commit | 46.5 ms | reutiliza archivos sin cambios |
| Diff de snapshots | 4.9 ms | 1 declaraciones afectadas |
| Layout ELK (clases) | 209.4 ms | 800/800 nodos posicionados |
| Foco (1 salto) | 0.1 ms | vecindario de 1 nodos |

## Ajuste de umbrales

- El umbral de foco (40 nodos) se activa con 800 nodos en la vista de clases, por lo que el modo foco es útil en repositorios medianos.
- La cache de modelos por blob reduce el tiempo de snapshot de 277.7 ms a 42.7 ms (x6.5); conviene mantenerla por versión de analizador.
- El layout ELK en worker se mantiene por debajo de 300 ms para 800 nodos, lo que evita bloquear la interacción en repositorios medianos.

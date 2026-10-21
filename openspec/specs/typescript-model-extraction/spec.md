# typescript-model-extraction Specification

## Purpose

Construye, para cada commit, un modelo estructural del código TypeScript (archivos, imports, declaraciones, firmas y relaciones) y calcula los cambios semánticos respecto al commit anterior de forma incremental y tolerante a errores.

## Requirements

### Requirement: Alcance de archivos analizados
El sistema SHALL analizar archivos `.ts` y `.tsx` del proyecto y SHALL excluir por defecto `node_modules`, directorios de salida y archivos de test.

#### Scenario: Excluir dependencias y tests
- **WHEN** el repositorio contiene `node_modules`, `dist` o archivos `*.test.ts`
- **THEN** el sistema no los incluye en el modelo

#### Scenario: Repositorio solo de funciones
- **WHEN** el proyecto contiene archivos con funciones y tipos pero ninguna clase
- **THEN** el sistema genera un modelo válido con módulos, funciones y tipos

### Requirement: Modelo de archivos y declaraciones
El sistema SHALL extraer, para cada archivo analizable, su path, sus imports y sus declaraciones de nivel superior, incluyendo clases, interfaces, enums, alias de tipo y funciones. Para cada declaración SHALL registrar nombre, tipo, exportación, firma cuando corresponda y hash normalizado del cuerpo.

#### Scenario: Archivo con funciones exportadas
- **WHEN** un archivo declara funciones con `export function` o `export const` con función
- **THEN** el modelo incluye esas funciones con su firma y las marca como exportadas

#### Scenario: Archivo con clases e interfaces
- **WHEN** un archivo declara una clase y una interfaz
- **THEN** el modelo incluye ambas declaraciones con sus miembros y relaciones

### Requirement: Miembros de clase y firmas de función
El sistema SHALL extraer los miembros de clases e interfaces con nombre, visibilidad, static, readonly, opcionalidad y firma, y SHALL extraer de las funciones sus parámetros, tipos, valor de retorno y modificadores relevantes.

#### Scenario: Miembro privado
- **WHEN** una clase declara un método privado
- **THEN** el modelo conserva su visibilidad privada y su firma

#### Scenario: Función asíncrona
- **WHEN** un archivo declara una función asíncrona exportada
- **THEN** el modelo conserva la marca de asíncrona, sus parámetros y su tipo de retorno

### Requirement: Resolución de imports
El sistema SHALL resolver imports relativos y alias definidos en el `tsconfig` del commit analizado para vincular archivos y declaraciones. Cuando un import no se pueda resolver, SHALL registrar el archivo igualmente y omitir la arista afectada sin fallar el análisis.

#### Scenario: Alias de tsconfig
- **WHEN** un archivo importa un símbolo mediante un alias configurado en `tsconfig`
- **THEN** el sistema resuelve la declaración de destino y crea la relación correspondiente

#### Scenario: Import no resuelto
- **WHEN** un import apunta a un módulo inexistente o no analizable
- **THEN** el modelo conserva el archivo y registra una dependencia no resuelta sin abortar el commit

### Requirement: Relaciones estructurales
El sistema SHALL producir relaciones de herencia, implementación e importación cuando puedan deducirse del código, y asociaciones a partir de tipos de propiedades cuando el destino sea resoluble. El sistema MUST NOT inventar relaciones de composición o agregación que el código no declare.

#### Scenario: Clase que implementa una interfaz
- **WHEN** una clase declara `implements` sobre una interfaz analizable
- **THEN** el modelo incluye la relación de implementación entre ambas

#### Scenario: Tipo de propiedad resoluble
- **WHEN** una propiedad de una clase usa como tipo otra declaración analizable
- **THEN** el modelo registra una asociación hacia esa declaración

### Requirement: Análisis incremental
El sistema SHALL reutilizar los resultados de análisis anteriores para archivos cuyo contenido no cambió entre commits y SHALL analizar únicamente el contenido nuevo o modificado.

#### Scenario: Commit que cambia un archivo
- **WHEN** un commit modifica un solo archivo TypeScript
- **THEN** el sistema reutiliza el análisis del resto de archivos y solo procesa el archivo modificado

#### Scenario: Archivo reutilizado en commits distintos
- **WHEN** dos commits contienen exactamente el mismo contenido de archivo
- **THEN** el sistema reutiliza el mismo resultado de análisis

### Requirement: Modelo por commit y línea base
El sistema SHALL asociar un modelo completo a cada commit consultado y SHALL tratar el commit más antiguo como línea base sin cambios visuales.

#### Scenario: Commit inicial
- **WHEN** el usuario abre el primer commit del histórico
- **THEN** el sistema muestra el modelo completo sin marcar todos sus elementos como añadidos

### Requirement: Diff estructural entre commits
El sistema SHALL comparar el modelo de un commit con el de su padre y SHALL clasificar los cambios en añadidos, eliminados, movidos, renombrados, con firma modificada y con solo cuerpo modificado, tanto para módulos como para declaraciones, miembros y relaciones.

#### Scenario: Función añadida
- **WHEN** un commit añade una función exportada
- **THEN** el diff la clasifica como añadida

#### Scenario: Cambio solo de cuerpo
- **WHEN** un commit modifica la implementación de una función sin cambiar su firma
- **THEN** el diff la clasifica como cambio de cuerpo y no como firma modificada

#### Scenario: Cambio solo de formato o comentarios
- **WHEN** un commit modifica únicamente espacios, formato o comentarios dentro de una función
- **THEN** el diff no la clasifica como cambio de cuerpo

#### Scenario: Movimiento entre archivos
- **WHEN** una declaración con el mismo nombre y cuerpo aparece en otro archivo
- **THEN** el sistema la presenta como movimiento probable en lugar de eliminación más adición

### Requirement: Detección de renombrados
El sistema SHALL intentar identificar renombrados de archivos y declaraciones y SHALL etiquetar los resultados como probables cuando se basen en heurísticas de nombre y contenido.

#### Scenario: Archivo renombrado
- **WHEN** un archivo se renombra sin cambiar su contenido
- **THEN** el sistema lo presenta como renombrado y conserva la identidad de sus declaraciones

### Requirement: Tolerancia a errores de análisis
El sistema SHALL continuar el análisis de un commit cuando un archivo no se pueda parsear o resolver, SHALL registrar el diagnóstico y SHALL exponer que el modelo está incompleto.

#### Scenario: Archivo con error de sintaxis
- **WHEN** un archivo TypeScript contiene un error de sintaxis
- **THEN** el commit se muestra con el resto del modelo y una advertencia sobre el archivo afectado

### Requirement: Agregación histórica de cambios
El sistema SHALL calcular, para un commit seleccionado de una rama, la cantidad de commits distintos con cambios estructurales acumulados desde el commit más antiguo hasta el seleccionado, ambos inclusive. SHALL producir conteos separados por declaración, miembro, módulo y paquete. El commit más antiguo MUST NOT aportar cambios. Una declaración SHALL contar un commit si cambió ella misma o alguno de sus miembros; un miembro SHALL contar solo los commits en los que cambió. Un módulo SHALL contar un commit si cambió alguna declaración o miembro de ese archivo; un paquete SHALL contar un commit si cambió algún módulo de su carpeta directa. Varios cambios de la misma entidad en un commit SHALL contar una sola vez. La identidad SHALL conservarse a través de renombrados y movimientos de archivos, declaraciones y miembros. La agregación MUST usar solo el histórico lineal de primeros padres de la rama seleccionada.

#### Scenario: Varios cambios de una entidad en un commit
- **WHEN** un commit modifica dos métodos de una clase y también la firma de la clase
- **THEN** la clase suma un solo commit y cada método modificado suma un commit

#### Scenario: Acumulación hasta el commit seleccionado
- **WHEN** una clase cambia en los commits dos y cuatro del histórico y el usuario selecciona el tercero
- **THEN** la clase muestra un commit de calor y al seleccionar el cuarto muestra dos

#### Scenario: Línea base sin actividad
- **WHEN** el usuario selecciona el commit más antiguo de la rama
- **THEN** todas las entidades tienen conteo cero aunque el commit contenga el modelo completo

#### Scenario: Identidad conservada tras renombrado
- **WHEN** una clase cambia en un commit, se renombra en otro y vuelve a cambiar después
- **THEN** la clase con su nombre actual acumula los tres commits y no aparece una entidad separada con el nombre anterior

#### Scenario: Módulo y paquete afectados por un miembro
- **WHEN** un commit modifica un método de una clase en `src/domain/a.ts`
- **THEN** la clase, el método, el módulo de ese archivo y el paquete `src/domain` suman ese commit

#### Scenario: Aislamiento entre ramas
- **WHEN** otra rama contiene cambios sobre la misma entidad
- **THEN** esos commits no se suman al mapa de calor de la rama seleccionada

#### Scenario: Entidad sin actividad
- **WHEN** una entidad permanece sin cambios estructurales en todo el histórico considerado
- **THEN** su conteo es cero

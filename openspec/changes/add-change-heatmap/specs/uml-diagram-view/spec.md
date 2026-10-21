## ADDED Requirements

### Requirement: Mapa de calor histórico
El sistema SHALL ofrecer un control persistente para activar un mapa de calor histórico. Mientras está activo, SHALL teñir declaraciones, miembros, módulos y paquetes con una escala secuencial azul proporcional a la cantidad de commits distintos con cambios hasta el commit seleccionado, y SHALL mostrar una leyenda con el valor máximo y la cantidad de commits considerados. El calor SHALL ser aditivo al diff: las marcas de estado y las aristas añadidas o eliminadas SHALL conservar sus colores y formas, pero el tinte de caja verde o rojo del commit actual MUST NOT mostrarse simultáneamente con el tinte azul. Las entidades sin actividad MUST NOT teñirse. Al cambiar de commit, el mapa SHALL recalcularse para reflejar únicamente la historia acumulada hasta ese commit. Al desactivar el control, el diagrama SHALL recuperar exactamente su apariencia sin calor. Un fallo al calcular el mapa MUST NOT bloquear el diagrama ni la navegación.

#### Scenario: Activar el mapa de calor
- **WHEN** el usuario activa «Mapa de calor» en un proyecto con histórico
- **THEN** el diagrama tiñe las entidades con actividad en azul y muestra una leyenda con el máximo y los commits considerados

#### Scenario: Clase caliente frente a clase fría
- **WHEN** una clase acumula más commits con cambios que otra clase visible
- **THEN** la primera recibe una intensidad azul mayor y la segunda una menor o ninguna

#### Scenario: Método caliente
- **WHEN** un método acumula cambios en varios commits
- **THEN** su fila dentro de la clase se tiñe con la intensidad correspondiente y conserva su marca de cambio del commit actual si la tiene

#### Scenario: Módulos y paquetes
- **WHEN** el usuario activa el mapa en las vistas de módulos o paquetes
- **THEN** cada módulo y paquete se tiñe según sus propios commits con cambios estructurales

#### Scenario: Convivencia con el diff
- **WHEN** el mapa está activo y el commit actual añade una clase con una relación nueva
- **THEN** la caja usa el tinte azul de calor, la clase conserva su marca `+` y la relación añadida sigue dibujada en verde

#### Scenario: Navegación por el histórico
- **WHEN** el usuario avanza o retrocede a otro commit con el mapa activo
- **THEN** las intensidades y la leyenda se actualizan para la historia acumulada hasta el nuevo commit

#### Scenario: Histórico sin actividad
- **WHEN** ninguna entidad acumula cambios hasta el commit seleccionado
- **THEN** el diagrama no aplica tinte azul y la leyenda indica un máximo de cero

#### Scenario: Desactivar el mapa
- **WHEN** el usuario desactiva «Mapa de calor»
- **THEN** desaparecen el tinte azul y la leyenda, y vuelven a mostrarse los tintes de caja del diff cuando correspondan

#### Scenario: Persistencia del control
- **WHEN** el usuario activa el mapa y cambia de commit o vuelve a abrir el proyecto
- **THEN** el control conserva su estado y el mapa se recalcula para el commit restaurado

#### Scenario: Error de cálculo
- **WHEN** la agregación histórica falla
- **THEN** el diagrama y el reproductor siguen operativos y la leyenda muestra un error con opción de reintentar

## ADDED Requirements

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

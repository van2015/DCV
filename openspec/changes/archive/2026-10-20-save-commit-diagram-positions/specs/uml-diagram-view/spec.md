## MODIFIED Requirements

### Requirement: Estabilidad del layout
El sistema SHALL conservar las posiciones de los elementos por commit, proyecto y vista, de modo que al volver a un commit ya visitado se restauren las posiciones que el usuario dejó en él, incluidos los ajustes manuales de nodos. Cuando el usuario visite un commit sin posiciones guardadas para la vista, el sistema SHALL heredar y reconciliar el layout del commit más cercano del histórico que sí tenga posiciones guardadas para esa vista; si no existe ninguno, SHALL usar el layout genérico de la vista y, en su defecto, calcular un layout completo. Los elementos nuevos SHALL colocarse cerca de sus vecinos. El sistema SHALL ofrecer un recálculo manual del layout que reemplace únicamente las posiciones del commit actual. La navegación entre commits MUST NOT provocar un re-layout completo automático.

#### Scenario: Avanzar al siguiente commit
- **WHEN** el usuario avanza a un commit sin posiciones guardadas
- **THEN** los elementos que ya existían conservan la posición heredada del commit más cercano y los nuevos aparecen cerca de su contexto

#### Scenario: Volver a un commit visitado
- **WHEN** el usuario reacomoda nodos en un commit y luego navega a otro commit y vuelve al primero
- **THEN** el diagrama restaura las posiciones que el usuario había dejado en ese commit

#### Scenario: Independencia entre commits
- **WHEN** el usuario mueve un nodo en el commit A y luego mueve el mismo nodo a otra posición en el commit B
- **THEN** cada commit conserva su propia posición del nodo al volver a él

#### Scenario: Recalcular layout
- **WHEN** el usuario pulsa "re-layout"
- **THEN** el sistema reorganiza el diagrama del commit actual, conserva el commit seleccionado y no modifica las posiciones guardadas de otros commits

### Requirement: Interacción y persistencia visual
El sistema SHALL permitir pan, zoom, selección de elementos, expansión y colapso de carpetas. La cámara y el estado de los controles SHALL conservarse por proyecto y vista al cambiar de commit, mientras que las posiciones de los elementos SHALL conservarse por commit según el requisito de estabilidad del layout.

#### Scenario: Navegar por un diagrama grande
- **WHEN** el usuario hace zoom y pan sobre una zona del diagrama y avanza al commit siguiente
- **THEN** la vista conserva esa zona y el estado de los contenedores

#### Scenario: Ocultar miembros
- **WHEN** el usuario desactiva la visualización de miembros
- **THEN** las cajas se simplifican y el cambio se conserva al navegar a otro commit

#### Scenario: Volver a un commit no altera la cámara
- **WHEN** el usuario vuelve a un commit con posiciones guardadas
- **THEN** se restauran las posiciones de sus elementos sin cambiar la cámara actual de la vista

## ADDED Requirements

### Requirement: Memoria espacial acotada
El sistema SHALL guardar las posiciones de los 50 commits usados más recientemente por proyecto y vista, descartando primero el commit más antiguo en uso cuando se supere el límite. Un commit descartado SHALL comportarse como un commit sin posiciones guardadas cuando se vuelva a visitar.

#### Scenario: Poda de commits antiguos
- **WHEN** el usuario visita más de 50 commits con posiciones guardadas en la misma vista
- **THEN** el sistema conserva solo las posiciones de los 50 commits más recientes y el más antiguo se vuelve a heredar o reconciliar en su próxima visita

#### Scenario: El límite es por vista
- **WHEN** el usuario guarda posiciones en 50 commits de la vista de clases
- **THEN** las posiciones guardadas de la vista de módulos no se ven afectadas

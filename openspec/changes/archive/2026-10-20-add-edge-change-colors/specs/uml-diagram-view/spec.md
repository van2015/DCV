## ADDED Requirements

### Requirement: Relaciones coloreadas por cambio
El sistema SHALL colorear las relaciones visibles según su cambio: añadidas en verde y eliminadas en rojo; las no modificadas conservan el color de su tipo. Las eliminadas SHALL dibujarse como aristas fantasma rojas durante el paso actual solo si ambos extremos son representables (nodo actual o fantasma) y SHALL desaparecer al cambiar de commit. Las aristas fantasma MUST NOT alterar layout, foco ni posiciones persistidas.

#### Scenario: Relación de herencia añadida
- **WHEN** el commit actual añade una relación de herencia, implementación o asociación entre clases visibles
- **THEN** la arista se dibuja en verde, mantiene su patrón de trazo por tipo y el resto de relaciones conserva su color

#### Scenario: Importación añadida
- **WHEN** el commit actual añade una importación entre módulos visibles
- **THEN** la arista del módulo se dibuja en verde

#### Scenario: Relación eliminada entre elementos existentes
- **WHEN** el commit actual elimina una relación cuyos dos extremos siguen existiendo en el diagrama
- **THEN** la arista se dibuja como fantasma rojo durante ese paso y deja de mostrarse al navegar a otro commit

#### Scenario: Relación eliminada con un extremo fantasma
- **WHEN** el commit actual elimina una clase y sus relaciones, de modo que un extremo solo existe como fantasma
- **THEN** la arista eliminada se dibuja en rojo y conecta el elemento existente con el nodo fantasma

#### Scenario: Extremo no representable
- **WHEN** una relación eliminada tiene un extremo que no puede representarse ni como nodo actual ni como fantasma en la vista activa
- **THEN** el sistema omite esa arista fantasma y no dibuja una conexión huérfana

#### Scenario: Relación sin cambios
- **WHEN** una relación se mantiene igual respecto al commit anterior
- **THEN** conserva el color de su tipo: imports gris, extends azul, implements verde discontinuo y association rosa

#### Scenario: Dependencia de paquetes que permanece
- **WHEN** se elimina una importación entre dos paquetes pero todavía existe otra importación vigente entre ellos
- **THEN** la arista agregada del paquete conserva su color de tipo y no se dibuja como eliminada

#### Scenario: Dependencia de paquetes reforzada
- **WHEN** el commit actual añade al menos una importación entre dos paquetes cuya relación agregada ya existía
- **THEN** la arista del paquete se dibuja en verde

#### Scenario: Dependencia de paquetes que desaparece
- **WHEN** se elimina la última importación vigente entre dos paquetes
- **THEN** la arista agregada se dibuja como fantasma rojo durante ese paso

#### Scenario: Relación de solo tipo eliminada
- **WHEN** la relación eliminada era de solo tipo
- **THEN** la arista fantasma roja conserva el patrón discontinuo de las relaciones de solo tipo

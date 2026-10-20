## MODIFIED Requirements

### Requirement: Relaciones coloreadas por cambio
El sistema SHALL reservar el verde y el rojo exclusivamente para indicar relaciones añadidas y eliminadas respecto al commit anterior. Las relaciones sin cambios MUST NOT usar colores de estado y SHALL seguir los estilos UML base de su tipo. Las eliminadas SHALL dibujarse como aristas fantasma rojas durante el paso actual solo si ambos extremos son representables (nodo actual o fantasma), SHALL conservar el patrón de línea y la forma de punta de su tipo, y SHALL desaparecer al cambiar de commit. Las aristas fantasma MUST NOT alterar layout, foco ni posiciones persistidas.

#### Scenario: Relación de herencia añadida
- **WHEN** el commit actual añade una relación de herencia entre clases visibles
- **THEN** la línea y el contorno del triángulo hueco se dibujan en verde, la línea sigue siendo continua y el resto de relaciones conserva su estilo UML

#### Scenario: Implementación añadida
- **WHEN** el commit actual añade una implementación entre clases visibles
- **THEN** la línea discontinua y el contorno del triángulo hueco se dibujan en verde

#### Scenario: Asociación añadida
- **WHEN** el commit actual añade una asociación entre clases visibles
- **THEN** la línea continua y el triángulo relleno se dibujan en verde

#### Scenario: Importación añadida
- **WHEN** el commit actual añade una importación entre módulos visibles
- **THEN** la arista del módulo se dibuja en verde y conserva la forma de punta de las importaciones

#### Scenario: Relación eliminada entre elementos existentes
- **WHEN** el commit actual elimina una relación cuyos dos extremos siguen existiendo en el diagrama
- **THEN** la arista se dibuja en rojo con el patrón de línea de su tipo durante ese paso y deja de mostrarse al navegar a otro commit

#### Scenario: Relación eliminada con un extremo fantasma
- **WHEN** el commit actual elimina una clase y sus relaciones, de modo que un extremo solo existe como fantasma
- **THEN** la arista eliminada se dibuja en rojo, conserva la forma de punta de su tipo y conecta el elemento existente con el nodo fantasma

#### Scenario: Extremo no representable
- **WHEN** una relación eliminada tiene un extremo que no puede representarse ni como nodo actual ni como fantasma en la vista activa
- **THEN** el sistema omite esa arista fantasma y no dibuja una conexión huérfana

#### Scenario: Relación sin cambios
- **WHEN** una relación se mantiene igual respecto al commit anterior
- **THEN** no usa verde ni rojo y se dibuja con el estilo UML base de su tipo

#### Scenario: Dependencia de paquetes que permanece
- **WHEN** se elimina una importación entre dos paquetes pero todavía existe otra importación vigente entre ellos
- **THEN** la arista agregada del paquete permanece negra y no se dibuja como eliminada

#### Scenario: Dependencia de paquetes reforzada
- **WHEN** el commit actual añade al menos una importación entre dos paquetes cuya relación agregada ya existía
- **THEN** la arista del paquete se dibuja en verde

#### Scenario: Dependencia de paquetes que desaparece
- **WHEN** se elimina la última importación vigente entre dos paquetes
- **THEN** la arista agregada se dibuja como fantasma rojo durante ese paso

#### Scenario: Relación de solo tipo eliminada
- **WHEN** la relación eliminada era de solo tipo
- **THEN** la arista fantasma roja conserva el patrón discontinuo de las relaciones de solo tipo

## ADDED Requirements

### Requirement: Estilos UML de relaciones
El sistema SHALL dibujar las relaciones sin cambios en negro con la punta de su tipo: herencia continua con triángulo hueco blanco de contorno negro; implementación discontinua con el mismo triángulo hueco; asociación continua con triángulo negro relleno; importación continua con punta negra rellena. El modificador de solo tipo SHALL mantener línea discontinua y los colores de estado MUST NOT identificar el tipo de relación.

#### Scenario: Herencia sin cambios
- **WHEN** una relación de herencia se mantiene igual respecto al commit anterior
- **THEN** se dibuja con línea negra continua y un triángulo hueco blanco de contorno negro en el extremo de destino

#### Scenario: Implementación sin cambios
- **WHEN** una relación de implementación se mantiene igual respecto al commit anterior
- **THEN** se dibuja con línea negra discontinua y un triángulo hueco blanco de contorno negro en el extremo de destino

#### Scenario: Asociación sin cambios
- **WHEN** una relación de asociación se mantiene igual respecto al commit anterior
- **THEN** se dibuja con línea negra continua y un triángulo negro relleno en el extremo de destino

#### Scenario: Importación sin cambios
- **WHEN** una importación entre módulos o paquetes se mantiene igual respecto al commit anterior
- **THEN** se dibuja con línea negra continua y una punta negra rellena

#### Scenario: Relación de solo tipo sin cambios
- **WHEN** una importación de solo tipo se mantiene igual respecto al commit anterior
- **THEN** se dibuja en negro con línea discontinua y conserva su punta

#### Scenario: Punta teñida por diff
- **WHEN** una relación añadida o eliminada se muestra con color de estado
- **THEN** la línea y la punta usan el mismo verde o rojo sin cambiar la forma de punta ni el patrón de línea de su tipo

---
title: Sorteo y siembra (seeding)
description: Qué son los seeds, los byes, y las restricciones de sorteo que esta pantalla respeta.
capabilities:
  - tournament-engine/bracket-seeding-builder
  - tournament-engine/draw-constraints
roles:
  - admin
---

## Para qué sirve esta pantalla

Arma el sorteo/bracket de una etapa: asigna cada participante a una posición inicial (un "seed"),
respetando las restricciones declaradas para esa disciplina/formato.

## Datos clave

- **Seed**: la posición de siembra de un participante en el bracket — determina contra quién juega
  primero y en qué ronda podría cruzarse con otros seeds altos.
- **Bye**: cuando el número de participantes no completa una llave perfecta, algunas posiciones
  "pasan de ronda" sin jugar. La pantalla los distribuye siguiendo la misma regla siempre, no al
  azar cada vez.
- **Restricciones de sorteo**: reglas declaradas (por ejemplo, que dos participantes del mismo club
  no se enfrenten en primera ronda) que el sorteo respeta automáticamente — la pantalla no permite
  guardar un sorteo que las viole.

## Cuándo se puede rehacer

El sorteo puede rehacerse mientras la etapa no haya arrancado. Una vez que la etapa está en curso,
rehacer el sorteo dejaría de tener sentido con partidos ya jugados — la pantalla no lo permite en
ese punto.

## Seguir a un participante

En la llave pública o el cuadro de siembra, seleccioná un participante para resaltar sus partidos y su posible recorrido si gana. La primera derrota continúa en la llave de perdedores cuando el cuadro define esa ruta. Seleccioná el nombre de nuevo o presioná Escape para quitar el resaltado. Los enlaces a los informes siguen separados. Los resultados públicos se pueden leer sin JavaScript.

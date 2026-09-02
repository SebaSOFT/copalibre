---
title: Sistema Suizo
description: Mecánicas de emparejamiento, grupos de puntuación, flotantes y descansos (byes) en torneos suizos.
capabilities:
  - tournament-engine/tournament-fixture-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Resumen

El sistema suizo empareja a los participantes a lo largo de múltiples rondas sin eliminación directa. A diferencia de las eliminatorias donde una derrota descalifica, o de todos contra todos (round-robin) donde se enfrenta a todos los rivales, el sistema suizo disputa un número fijo de rondas contra rivales con historiales idénticos o muy similares.

## Mecánicas de Emparejamiento

- **Grupos de Puntuación**: En cada ronda posterior a la primera, los participantes se dividen en grupos según sus puntos acumulados (por ejemplo: 2-0, 1-1, 0-2).
- **Prevención de Revanchas**: Los competidores nunca se enfrentan al mismo oponente más de una vez en la misma etapa suiza.
- **Flotantes (Floaters)**: Cuando un grupo de puntuación tiene un número impar de competidores, un participante "flota" hacia el grupo adyacente para completar los emparejamientos.
- **Descansos (Byes)**: Si la cantidad total de participantes es impar, el jugador elegible de menor puntuación sin descanso previo recibe un bye (computado como 1 victoria y margen de cero).

## Sistemas de Puntuación

CopaLibre soporta dos modelos principales de puntuación en formato suizo:

- `match-wins`: Otorga puntos de competencia por resultado de partido (p. ej. 1 punto por victoria, 0.5 por empate, 0 por derrota).
- `game-points`: Acumula diferenciales individuales de sets o juegos para desempatar dentro de los grupos de puntuación.

## Clasificación y Progresión

Las clasificaciones en etapas suizas se evalúan mediante métricas de dificultad del calendario (Buchholz y Sonneborn-Berger). Comúnmente se utiliza una fase suiza para clasificar a los mejores 8 o 16 competidores a una llave eliminatoria.

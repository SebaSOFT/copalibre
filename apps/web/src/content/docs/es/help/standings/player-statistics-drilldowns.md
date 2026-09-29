---
title: Estadísticas del Jugador por Partido
description: El total del torneo y el desglose partido por partido en el perfil público de jugador.
capabilities:
  - tournament-engine/player-statistics-drilldowns
roles:
  - viewer
  - broadcaster
---

## Resumen

La página pública de perfil de jugador muestra una fila de total del torneo y un desglose partido
por partido para cada tabla de ranking a nivel de persona que declare la disciplina del torneo — el
espectador cambia entre las tablas declaradas (por ejemplo, "goleadores" y "asistencias" de una
disciplina) mediante un selector, sin salir del perfil.

## Total del Torneo vs. Filas por Partido

- La fila de **total del torneo** muestra todo tipo de columna que declare la tabla: valores
  atómicos (recolectores) y cualquier razón compuesta o calculada a lo largo de todo el torneo (por
  ejemplo, goles por partido).
- Cada **fila de partido** muestra solo las columnas atómicas (de tipo recolector) de ese partido —
  una razón compuesta o calculada depende de más de un partido, por lo que nunca aparece en una fila
  de partido. Las filas de partido se ordenan cronológicamente por etapa y número de partido, e
  identifican el partido por su número público de etapa/partido, nunca por un identificador interno.

## Cuando un Jugador No Tiene Estadísticas Registradas

Un jugador sin participación en el plantel de los partidos finalizados del torneo ve un estado
vacío explícito en la sección de estadísticas del torneo, en lugar de una tabla que sugiera
partidos con valores en cero que nunca ocurrieron.

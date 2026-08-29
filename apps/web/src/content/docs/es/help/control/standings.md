---
title: Posiciones (standings)
description: Qué representa la tabla de posiciones de una etapa y cómo se explican los desempates.
capabilities:
  - tournament-engine/standings-explainability
  - tournament-engine/statistic-collectors
roles:
  - admin
  - club-admin
  - referee
  - broadcaster
  - viewer
---

## Para qué sirve esta pantalla

Muestra la tabla de posiciones de una etapa del torneo — quién está dónde y por qué, con la
explicación del cálculo visible, no solo el número final.

## Datos clave

- **Etapa (stage)**: una fase del torneo (por ejemplo, "fase de grupos" o "playoffs") con su propio
  formato y su propia tabla. Un torneo puede tener varias etapas encadenadas.
- **Puntos/criterios**: los criterios de cálculo y desempate son los que declaró la disciplina — esta
  pantalla no inventa un criterio propio, solo aplica y muestra el que corresponde según la
  configuración vigente en el momento en que se calculó.
- **Explicabilidad**: cada posición puede desglosarse para ver exactamente qué datos y qué regla
  determinaron ese puesto — la trama de decisión que produjo el número, no solo el número.

## Cuándo se actualiza

La tabla refleja resultados ya cargados y correcciones ya aplicadas. Un resultado corregido
recalcula la tabla completa a partir de los hechos vigentes, nunca ajusta el número de forma manual.

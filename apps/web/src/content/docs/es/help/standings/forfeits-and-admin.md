---
title: Incomparecencias y Ajustes Administrativos
description: Gestión de no presentaciones (walkovers), descalificaciones y correcciones administrativas en la tabla.
capabilities:
  - tournament-engine/standings-explainability
  - tournament-engine/rules-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Resumen

Cuando un partido concluye por motivos extraordinarios (ausencias, descalificaciones o sanciones), CopaLibre aplica motivos tipificados de resultado y actualiza las tablas de forma transparente y auditable.

## Motivos de Resultado

- `walkover`: El rival no se presentó; se otorga victoria al presente.
- `administrative-loss`: Derrota asignada por dictamen oficial.
- `forfeit-abandonment`: Partido iniciado y abandonado antes del desenlace natural.
- `disqualified`: Participante descalificado de la competición.
- `did-not-finish`: No finalizó la prueba o manga.

## Impacto en la Clasificación

Las correcciones de resultado son no destructivas: se registran en la pista de auditoría y recalculan la tabla desde los hechos vigentes sin sobrescrituras manuales.

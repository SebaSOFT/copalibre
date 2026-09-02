---
title: Grupos con Cuadro (GSL)
description: Grupos de doble eliminación de 4 participantes con partidos de apertura, ganadores, eliminación y desempate.
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

Los grupos con cuadro (conocidos popularmente en esports como formato GSL o torneo dual) organizan a los participantes en grupos de 4 con formato de doble eliminación. Dos victorias clasifican a la siguiente ronda; dos derrotas eliminan al participante.

## Flujo de Partidos del Grupo

Cada grupo disputa hasta 5 partidos a lo largo de 3 rondas:

1. **Ronda 1 (Partidos de Apertura)**:
   - Partido 1: Sembrado 1 vs Sembrado 4
   - Partido 2: Sembrado 2 vs Sembrado 3
2. **Ronda 2 (Partidos de Ganadores y Eliminación)**:
   - **Partido de Ganadores**: Ganador M1 vs Ganador M2. El vencedor (2-0) clasifica como 1.° del grupo.
   - **Partido de Eliminación**: Perdedor M1 vs Perdedor M2. El perdedor (0-2) queda eliminado.
3. **Ronda 3 (Partido Decisivo)**:
   - Perdedor de Ganadores vs Ganador de Eliminación (ambos con récord 1-1).
   - El vencedor (2-1) clasifica como 2.° del grupo; el perdedor (1-2) queda eliminado.

## Series al Mejor de N

Cada partido de la fase de grupos GSL puede configurarse como una serie al mejor de N (p. ej. Bo3 o Bo5).

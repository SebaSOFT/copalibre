---
title: Fuerza de Oponentes (Tiebreakers)
description: Fórmulas de desempate Buchholz, Buchholz Mediano y Sonneborn-Berger.
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

En torneos suizos y abiertos, los participantes no enfrentan exactamente a los mismos rivales. Las métricas de Fuerza de Oponentes premian a quienes jugaron contra rivales más competitivos.

## Fórmulas Disponibles

- **Buchholz**: Suma total de los puntos obtenidos por todos los oponentes a los que se enfrentó un jugador.
- **Buchholz Mediano (Cut 1 / Cut 2)**: Buchholz que excluye al rival con mayor y menor puntaje (Cut 1) o a los dos mejores y dos peores (Cut 2).
- **Sonneborn-Berger**: Suma de los puntos de los rivales derrotados más la mitad de los puntos de los rivales con quienes se empató.

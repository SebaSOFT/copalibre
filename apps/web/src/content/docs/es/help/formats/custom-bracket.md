---
title: Cuadros Personalizados (DAG)
description: Grafos acíclicos dirigidos declarativos para llaves asimétricas, partidos por el tercer puesto y repechajes.
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

Los cuadros personalizados permiten a los organizadores diseñar estructuras eliminatorias arbitrarias mediante un Grafo Acíclico Dirigido (DAG). Permiten definir partidos por el tercer puesto, llaves con descansos asimétricos y rondas de repechaje.

## Declaración de Nodos

Cada nodo declara su identificador, ronda y el origen de sus participantes:

- `{ seed: N }`: Posiciona a un sembrado inicial.
- `{ winnerOf: "matchId" }`: Recibe al ganador de un partido previo.
- `{ loserOf: "matchId" }`: Recibe al perdedor de un partido previo.

## Casos de Uso

- **Partidos por el 3.er Puesto**: Disputa del bronce entre los perdedores de semifinales.
- **Eliminatorias Asimétricas**: Rondas preliminares (wild cards) que alimentan cuartos de final.
- **Repechajes**: Cuadros de segunda oportunidad para deportes de combate u olímpicos.

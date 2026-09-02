---
title: Ámbitos de Clasificación y Duelo Directo
description: Ámbitos de evaluación (general, duelo directo, derrotas) y resolución recursiva de empates múltiples.
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

Cuando dos o más competidores empatan en puntos, CopaLibre aplica reglas de desempate con distintos ámbitos de evaluación para determinar el orden con precisión deportiva.

## Ámbitos de Evaluación

- **`overall` (General)**: Evalúa el criterio sobre todos los partidos disputados en la etapa.
- **`head-to-head` (Duelo Directo)**: Restringe el cálculo únicamente a los partidos jugados entre los competidores empatados.
- **`match-losses` (Derrotas)**: Filtra las estadísticas únicamente a los partidos en los que el competidor resultó derrotado.

## Desempates Múltiples Recursivos

Si tres o más participantes empatan, se genera una miniliga de duelo directo. Si esto despeja algunas posiciones pero persiste un empate parcial, CopaLibre evalúa recursivamente un sub-duelo directo entre los que continúan empatados.

## Trazabilidad Explicable

Cada puesto en la tabla cuenta con un desglose auditable que muestra la regla y datos exactos que decidieron la posición.

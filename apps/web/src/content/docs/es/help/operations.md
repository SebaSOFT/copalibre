---
title: Operación y trazabilidad
description: Reglas para operar partidos y corregir datos de torneo.
capabilities:
  - platform/async-job-processing
  - platform/persistence-layer
roles:
  - super-admin
---

## Consola de partido

Registre eventos y reloj desde consola autorizada. La proyección pública se actualiza desde eventos
durables y conserva versión para recuperación. Toda acción se escribe primero en una cola local
antes de enviarse, así una conexión cortada la deja en cola para reintento automático en vez de
perderla — ver [Consola de partido en vivo](/es/help/control/match-console/) para el comportamiento
completo.

## Correcciones

No sobrescriba resultados calculados. Una corrección requiere motivo, actor y vista previa de impacto
antes de afectar posiciones o fases posteriores.

## Roster

Roster representa selección de jugadores de un participante para un partido. No representa relación
persistente entre persona y equipo.

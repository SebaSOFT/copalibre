---
title: Correcciones y conflictos sin conexión
description: Previsualizar una corrección, qué hace una corrección de serie, y por qué un resultado en cola contra un partido anulado se conserva en lugar de descartarse.
capabilities:
  - tournament-engine/result-correction-authority
  - live-operations/live-match-operations
roles:
  - admin
  - referee
---

## Por qué una corrección nunca es una edición directa

Un resultado calculado no puede sobrescribirse. Una vez que un partido está finalizado, cambiarlo pasa
por una corrección auditada en su lugar — una acción explícita que registra quién la hizo, cuándo, por
qué, el estado previo y el estado resultante. Este es el único camino de vuelta a un resultado
finalizado, desde la [consola en vivo](/help/control/match-console), los
[datos de partido cargados](/help/control/load-match-data), u [horarios](/help/control/schedule).

## Previsualizá antes de aplicar

Una corrección previsualiza su propio impacto antes de aplicarse: qué posiciones, tablas y proyecciones
cambiarían si se aplicara. Nada se recalcula hasta que la corrección se confirma explícitamente.

Una corrección no se propaga automáticamente a una etapa que ya empezó a usar el resultado que se está
corrigiendo — un resultado de fase de grupos que alimenta una llave que ya empezó no reordena esa llave
en silencio. La corrección igual se aplica al registro; la etapa siguiente queda marcada para que el
organizador la revise, en lugar de reescribirse por su cuenta.

## Corregir un partido de una serie

Corregir un partido de una [serie](/help/control/series) previsualiza su efecto sobre toda la serie, no
solo sobre ese partido — un resultado corregido puede invertir qué lado va ganando un al-mejor-de, o
cambiar un total agregado, y la previsualización muestra eso antes de que la corrección se confirme.

## Por qué un resultado sin conexión en cola puede rechazarse y conservarse

La consola de partido sigue funcionando sin conexión y envía las acciones en cola cuando vuelve la
conectividad. Un resultado en cola puede rechazarse al reconectar — la causa más común es que el partido
que apuntaba fue anulado por una decisión de serie mientras el operador registraba sin conexión, y nunca
va a jugarse. Ese elemento en cola no se descarta: su contenido completo permanece en la cola, rechazado,
para que el operador pueda juzgar si el resultado pertenece a otro lado — típicamente como corrección a
un partido anterior de la misma serie — en lugar de perder lo que se registró. Un rechazo en un elemento
nunca bloquea que el resto de la cola se descargue.

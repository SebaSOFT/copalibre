---
title: Cargar datos del partido
description: Carga masiva/estructurada para un partido jugado sin consola en vivo presente.
---

## Para qué sirve esta pantalla

No todos los partidos tienen un operador en la consola mientras se juegan. Esta pantalla te permite
cargar el plantel de un partido, su historial completo de eventos y su resultado final juntos,
después del hecho — para un club que reporta un partido de visitante, o un organizador que se pone al
día con una pila de planillas en papel.

Solo aplica a un partido programado sin actividad registrada previamente. Un partido que ya tiene
eventos o segmentos de una sesión en vivo debe finalizarse a través de la
[consola en vivo](/help/control/match-console) en su lugar — cargar un segundo historial sobre uno en
vivo entraría en conflicto con él.

## Datos clave

- **Plantel**: la misma selección de jugadores por entrante que ofrece la consola en vivo, que se
  mantiene solo en esta pantalla hasta que envíes todo — nada se guarda en el partido hasta que se
  envíe el lote completo.
- **Segmentos**: cada período/tiempo/set que tuvo el partido, en orden de juego, cada uno ya marcado
  como completo con su duración. Acá no hay reloj en vivo.
- **Eventos**: el historial completo del partido, en el orden en que realmente ocurrió, cada uno con
  su propia marca de tiempo real — no el momento en que lo estás cargando.
- **Resultado**: el resultado final del partido, enviado junto con todo lo anterior.

## Un solo envío, todo o nada

Presionar «Enviar datos del partido» envía el plantel, cada evento y el resultado juntos, en una sola
transacción. Si un solo evento es inválido, no se registra nada — se rechaza el envío completo, y lo
que cargaste permanece en la pantalla para que corrijas la única entrada que falló y reenvíes, en vez
de tener que empezar de nuevo.

## Importar desde una planilla

La sección «Importar desde CSV» carga una planilla en el mismo editor de arriba, para revisión antes de
enviar — nunca salta el paso de revisión ni la validación del envío. Descargá la plantilla para conocer
la forma exacta de columnas que necesita un archivo.

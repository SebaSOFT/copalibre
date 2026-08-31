---
title: Vista de partidos
description: Una lista de tarjetas de los partidos de un torneo, fácil de recorrer — cancha, reloj, último evento y contexto de posiciones — en el sitio público y en el panel de control.
capabilities:
  - public-web/matches-view
  - control-web/matches-view
roles:
  - admin
  - viewer
  - broadcaster
  - referee
---

## Para qué sirve esta pantalla

Sea cual sea la estructura de una fase — un solo grupo, varias zonas, o una serie de varios partidos —
siempre se reduce a una lista de partidos por jugar. Esta pantalla es esa lista, como una grilla de
tarjetas: todo el torneo por defecto, o acotada a una fase, una zona/grupo, o un estado (en vivo,
próximo, final) con los filtros de arriba. Complementa, en vez de reemplazar, la vista de
[llave](/help/control/tournament-authoring) — la llave es la lectura correcta para el avance por
eliminación; esta es la lectura correcta para recorrer volumen, especialmente entre varios grupos de
todos contra todos simultáneos que una llave no tiene forma clara de mostrar a la vez.

Hay dos versiones de esta pantalla, que comparten la misma tarjeta:

- **Pública** (`/{organizacion}/tournaments/{torneo}/matches`) — anónima, sin necesidad de iniciar
  sesión.
- **Panel de control** (`.../matches-view`) — accesible solo para un admin de la organización o un
  tournament-admin con alcance sobre este torneo, la misma autoridad que ya exige la pantalla de
  posiciones internas.

## Qué muestra cada tarjeta

- **Estado**: en vivo, próximo o final, junto con un ícono para que el estado nunca dependa solo del
  color.
- **Reloj**: se muestra solo mientras el partido está en curso — su tiempo transcurrido actual, el
  mismo valor que lee la consola de partido en vivo.
- **Cancha**: el nombre de la cancha asignada, cuando la programación ya asignó una.
- **Último evento**: el evento registrado más recientemente, sea cual sea — esta tarjeta nunca trata un
  tipo de evento como caso especial, así que una disciplina que declare uno nuevo (una confirmación de
  revisión, una sustitución) aparece correctamente sin cambios en esta pantalla.
- **Zona/posición, o estado de la serie** — nunca ambos en la misma tarjeta:
  - Un cruce en una fase de zona/grupo sin serie declarada muestra el nombre de la zona/grupo (cuando
    la fase declara más de un grupo por defecto) y la posición actual de cada participante en las
    posiciones.
  - Un cruce resuelto por una serie muestra su avance y, una vez resuelto, su estado agregado — la
    misma representación de la serie que ya usa la [llave pública](/help/control/series).
- **Factor decisivo**: en un partido finalizado cuyo resultado necesitó un comparador de desempate para
  separar dos filas de las posiciones, una línea que nombra qué lo decidió (por ejemplo, "decidido por
  diferencia de gol entre sí").

## La línea de factor decisivo frente a la traza completa

La línea de factor decisivo de la tarjeta pública es deliberadamente un resumen, no el razonamiento
completo — nunca incluye los demás pasos ni los valores intermedios del comparador interno. Un
organizador con autoridad sobre las posiciones internas de este torneo (un admin, o un tournament-admin
con alcance sobre él) ve en cambio la traza completa del comparador, en la versión de esta misma
tarjeta del panel de control, exactamente como ya la muestra el expansor de traza de la pantalla de
posiciones internas. Nadie ve una versión intermedia: un espectador ve el resumen de una línea o la
traza completa, nunca una versión parcialmente reducida.

## Qué NO hace esta pantalla

Es de solo lectura. Ninguna tarjeta ni control aquí cambia el estado de un partido, registra un evento,
ni edita el horario — esas acciones se hacen en la [consola de partido en vivo](/help/control/match-console)
y en el [armador de horarios](/help/control/schedule). Esta pantalla sirve para ver qué está pasando y
qué ya pasó, no para operar un partido.

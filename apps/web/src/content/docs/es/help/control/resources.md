---
title: Canchas y árbitros
description: Lista, creá y editá las canchas y árbitros de una organización — lo que asigna el armador de horarios.
capabilities:
  - tournament-engine/resource-scheduling
roles:
  - admin
---

## Para qué sirve esta pantalla

Acá se gestionan las canchas y árbitros de una organización: el conjunto de recursos que el armador de
horarios asigna a los partidos de una etapa. Ambos son reutilizables en todos los torneos que corre
esta organización — se crean una vez y se asignan tantas veces como haga falta.

## Datos clave

- **Nombre / alias / capacidad de la cancha**: la identidad de una cancha y cuántos partidos puede
  albergar a la vez (un club con tres canchas es una sola cancha con capacidad tres, no tres canchas).
- **Detalles de la cancha**: texto libre, para que lo lea un operador — una dirección, una superficie
  de juego, o para una cancha virtual (un servidor de juego), su dirección, región o mapa actual.
  Nunca se valida ni se interpreta.
- **Nombre / roles del árbitro**: la identidad de un árbitro y los roles a los que puede asignarse
  (árbitro principal, asistente, árbitro de mesa, veedor).

## Qué no podés hacer acá

Borrar una cancha o un árbitro todavía no está disponible — uno creado por error y nunca usado
simplemente puede ignorarse. Asignar una cancha o un árbitro a un partido específico se hace en el
armador de horarios, no acá.

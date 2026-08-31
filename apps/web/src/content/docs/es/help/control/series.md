---
title: Series de varios partidos
description: Declarar una serie, qué hace cada clase de resolución, programar sus partidos, y leer una en la llave pública.
capabilities:
  - tournament-engine/match-series
roles:
  - admin
  - referee
  - broadcaster
  - viewer
---

## Qué es una serie

Una serie resuelve un cruce entre dos entrantes con más de un partido en lugar de uno. No tiene pantalla
propia — se declara en el asistente de [creación de torneo](/help/control/tournament-authoring), se
programa en [horarios](/help/control/schedule), se registra partido a partido en la
[consola en vivo](/help/control/match-console) o se [carga](/help/control/load-match-data) después, y se
lee en la llave pública. Un cruce que no declara serie genera exactamente un partido y se comporta
exactamente como siempre.

## Declararla

Una serie declara una extensión (cuántos partidos puede jugar) y una clase de resolución:

- **Al mejor de**: la serie termina en cuanto un lado ganó suficientes partidos como para volver
  irrelevantes los restantes. Una extensión al mejor-de tiene que ser impar, para que siempre sea
  posible una mayoría.
- **Agregado**: el ganador es quien anotó más en total a lo largo de todos los partidos, sumados — no
  quien ganó más partidos individuales.
- **Puntos por partido**: cada partido de la serie otorga sus propios puntos, y el ganador de la serie
  es quien acumula más en total.

Una serie también puede marcarse como jugada en cancha neutral, y sus posiciones pueden contarse por
partido (por defecto — cada partido suma su propio triunfo, empate o derrota) o por serie (toda la
serie suma un único resultado, sin importar cuántos partidos hicieron falta).

## Programarla y jugarla

Cada partido de la serie recibe su propio turno y sus propios árbitros en la pantalla de
[horarios](/help/control/schedule). Una vez que la serie se decide — un lado se aseguró un al-mejor-de,
o quedan suficientes partidos sin poder cambiar el resultado — sus partidos restantes se marcan como ya
no requeridos, en lugar de quedar con aspecto de no programados o abandonados.

## Qué no podés hacer acá

Un partido ya jugado y registrado no puede des-jugarse volviendo a declarar la serie: corregir un
partido finalizado de una serie decidida pasa por el
[flujo de corrección auditada](/help/control/corrections), que bloquea explícitamente que una corrección
se propague a una etapa que ya empezó a usar el resultado de la serie.

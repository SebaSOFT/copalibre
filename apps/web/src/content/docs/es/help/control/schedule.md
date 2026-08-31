---
title: Horarios
description: Asigná cada partido a un turno — un horario, cancha y duración declarados — y los árbitros que lo trabajan.
capabilities:
  - control-web/match-scheduling
  - tournament-engine/schedule-slots
roles:
  - admin
---

## Para qué sirve esta pantalla

Acá se le asigna un turno a cada partido de una etapa — una vista de calendario y una vista de lista
sobre el mismo lote. Un turno no se tipea a mano por partido: es un horario de inicio, cancha y duración
declarados una vez en el conjunto de recursos de [canchas y árbitros](/help/control/resources), y el
armador de horarios asigna un partido a uno de ellos, no al revés. Los árbitros se activan por partido
desde el mismo conjunto de recursos.

## Grano de partido, no de cruce

La programación opera sobre el partido, no sobre el cruce entre dos entrantes. Un cruce de un solo
partido tiene un partido para ubicar; una [serie](/help/control/series) de cinco tiene cinco, cada uno
con su propio turno y sus propios árbitros — el cuarto y el quinto partido de la serie pueden estar en
turnos reservados que nunca se llenan si la serie se decide antes, y el armador los marca como ya no
requeridos en lugar de dejarlos con aspecto de no programados.

## Previsualizá antes de publicar

Antes de que se publique cualquier cosa, el armador previsualiza el lote y muestra cada conflicto — una
cancha o árbitro doble-reservado, una violación de la regla de descanso — nombrando los partidos
involucrados, y nombra cualquier partido ya publicado que el lote movería. Publicar es atómico: cada
asignación del lote entra en vigencia junto, o ninguna lo hace.

## Qué no podés hacer acá

Reprogramar un partido que ya finalizó se rechaza: su horario ya es un registro, no un plan, y cambiarlo
pasa por el [flujo de corrección auditada](/help/control/corrections) en su lugar. Un partido sin turno
asignado se muestra explícitamente como sin partido programado — nunca se omite en silencio, y nunca se
confunde con un bye de la llave. Crear o editar una cancha o un árbitro se hace en
[canchas y árbitros](/help/control/resources), no acá.

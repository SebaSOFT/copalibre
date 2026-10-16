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

## Cuánto ocupa un partido su turno

Un partido ubicado ocupa el inicio de su turno más su **duración estimada**: el tiempo reglamentario
de la disciplina (por ejemplo, dos tiempos de 25 minutos, 50 minutos), con la cantidad de segmentos
propia del torneo. Una disciplina sin tiempo reglamentario (que se juega por sets, por ejemplo) ocupa
el turno completo. La cancha además queda reservada durante el cambio entre partidos del horario. Así,
los turnos cortos nunca esconden un choque: dos partidos de 50 minutos separados por quince minutos en
la misma cancha son un conflicto.

La regla de descanso viene de la [configuración](/help/control/tournament-authoring) del torneo: el
descanso mínimo entre el final de un partido de un participante y el inicio del siguiente. Un torneo
que no la declara no aplica ninguna regla de descanso.

## Cambiar un partido publicado pide un motivo

Mover, cambiar los árbitros o retirar un partido ya **publicado** pide el motivo antes de publicar. El
cuadro lista cada partido publicado que cambia, con su horario y cancha anterior y nuevo. Indicá un
motivo para todo el lote — elegí uno habitual, uno que usaste hace poco o escribí el tuyo — o marcá un
partido como excepción con su propio motivo (el botón "Otro motivo" de la fila, o seleccioná varias
filas y marcalas juntas). Publicar queda deshabilitado hasta que todos los partidos de la lista tengan
motivo. Se guardan el turno, la cancha, el inicio y los árbitros anteriores junto con el motivo, la
persona y el momento. Un lote de primeras ubicaciones se publica sin preguntar.

Con el teclado: ↑/↓ te mueven entre partidos, Espacio selecciona, E marca una excepción, Enter publica
y Esc cierra: primero la lista de sugerencias abierta, después el diálogo.

## Retirar un partido de su turno

"Retirar del horario" saca un partido ubicado de su turno dentro del lote: la previsualización lo
muestra sin horario y lista los turnos que libera el lote, para que otro partido pueda ocupar uno en la
misma publicación.

## Qué no podés hacer acá

Reprogramar un partido que ya finalizó se rechaza: su horario ya es un registro, no un plan, y cambiarlo
pasa por el [flujo de corrección auditada](/help/control/corrections) en su lugar. Un partido sin turno
asignado se muestra explícitamente como sin partido programado — nunca se omite en silencio, y nunca se
confunde con un bye de la llave. Crear o editar una cancha o un árbitro se hace en
[canchas y árbitros](/help/control/resources), no acá.

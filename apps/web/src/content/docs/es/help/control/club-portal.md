---
title: Portal del club
description: El directorio de miembros propio de un administrador de club y el envío de planillas de torneo.
capabilities:
  - control-web/club-portal
roles:
  - club-admin
  - admin
---

## Para quién es esto

El Portal del club es un espacio de autoservicio para un `club-admin` — un usuario cuyo rol está
acotado a un club específico, en lugar de a toda la organización. Todo aquí está limitado a ese
club: un administrador de club nunca puede ver ni modificar los miembros, equipos o inscripciones
de otro club.

## Directorio de miembros

`/control/<organización>/clubs/<club>/portal/members` lista a todas las personas ya afiliadas a tu
club y te permite agregar una nueva (nombre y, opcionalmente, alias y fecha de nacimiento) o
corregir el nombre o alias de un miembro existente. Un miembro agregado aquí pertenece a tu club
desde el momento en que se crea — no existe un paso separado de "asignar al club".

La nacionalidad, una foto y otros detalles de identidad siguen siendo tarea de un administrador de
la organización, igual que hoy para cualquier registro de persona.

## Enviar la planilla de un torneo

`/control/<organización>/clubs/<club>/portal/tournaments/<torneo>/roster` te guía para inscribir a
tu club en un torneo abierto:

1. Elegí uno de los equipos existentes de tu club, o creá uno nuevo.
2. Seleccioná qué miembros de tu club integran el plantel y asignale a cada uno un rol — jugador,
   suplente, entrenador o personal.
3. Enviá. Esto inscribe tu equipo como entrante **pendiente** con ese plantel adjunto — el mismo
   estado pendiente con el que empieza cualquier inscripción.

Un administrador del torneo revisa y aprueba la inscripción desde su propia pantalla de revisión de
inscripciones; nada de ese paso cambia porque la hayas enviado vos mismo. Siempre podés volver y
preparar otro equipo para un torneo distinto — nada acá es una acción única.

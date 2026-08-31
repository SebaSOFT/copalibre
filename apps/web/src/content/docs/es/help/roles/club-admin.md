---
title: Admin de club
description: Qué puede hacer el rol club-admin, qué hereda y qué no puede hacer.
capabilities:
  - control-web/roles-permissions
roles:
  - club-admin
---

## Para qué sirve este rol

Autoridad sobre un club: el que nombra esa asignación, y solo ese club. Un admin de club mantiene la
identidad de ese club — su nombre, alias, abreviatura y emblema — sin necesitar acceso de administrador
a nivel de organización para hacerlo.

## Qué puede hacer

<!-- GENERATED:CAPABILITIES:START -->

- `org.manage-clubs`

<!-- GENERATED:CAPABILITIES:END -->

Limitado, no a nivel de organización: un admin de club que actúa sobre un club que no administra es
rechazado, del mismo modo en que un participante es rechazado al actuar sobre los registros de otro
participante.

## Qué hereda

Nada — club-admin no tiene las capacidades de ningún otro rol. [Admin](/es/help/roles/admin/) hereda
`org.manage-clubs` de club-admin, no al revés: admin tiene todo lo que tiene club-admin, sin límite,
además de lo propio.

## Qué no puede hacer

Nada fuera de la administración de clubes. Un admin de club no puede invitar ni administrar usuarios,
cambiar la configuración de la organización, crear ni administrar torneos, revisar inscripciones, ni
operar un partido — cada una de esas acciones necesita una capacidad que este rol no tiene. Tampoco
puede actuar sobre un club que no administra, incluso dentro de la misma organización.

## Qué pantallas ve

Cada pantalla del panel de control que ven los miembros de esta organización, excepto "Roles" — la
administración de usuarios es `org.manage-users`, una capacidad que club-admin nunca tiene, así que esa
entrada de navegación nunca aparece para él. Esto se deriva de la correspondencia declarada, no de una
lista de exclusión por pantalla: agregar mañana una nueva pantalla de administración de usuarios excluye
a club-admin automáticamente, sin nada que recordar actualizar aquí.

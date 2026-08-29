---
title: Admin de torneo
description: Qué puede hacer el rol tournament-admin, qué hereda y qué no puede hacer.
capabilities:
  - control-web/roles-permissions
roles:
  - tournament-admin
---

## Para qué sirve este rol

Autoridad para dirigir un torneo — el que nombra esa asignación — sin alcance a nivel de organización.
Una organización que quiere que alguien dirija una sola competencia de principio a fin, y nada más, usa
este rol en lugar de admin.

## Qué puede hacer

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.manage-display-tokens`
- `org.manage-registrations`
- `org.manage-schedule`
- `org.manage-seeding`
- `org.manage-stages`
- `org.manage-tournament-data`
- `org.manage-zones-groups`
- `org.operate-match`
- `org.review-reports`
- `org.view-internal-standings`
- `org.view-internal-tables`

<!-- GENERATED:CAPABILITIES:END -->

Cada una de estas está limitada al torneo que nombra la asignación. Actuar contra un torneo distinto
dentro de la misma organización es rechazado por motivos de titularidad, del mismo modo en que se aplica
el límite de club para club-admin.

## Qué hereda

Nada. Cada capacidad que tiene tournament-admin, la tiene directamente — [admin](/es/help/roles/admin/)
tiene el mismo conjunto de capacidades operativas de torneo también, sin límite, pero como un conjunto
propio declarado directamente en lugar de heredado de tournament-admin.

## Qué no puede hacer

Ninguna autoridad a nivel de organización: tournament-admin no puede invitar ni administrar usuarios,
cambiar la configuración de la organización, ni administrar clubes — `org.manage-users`,
`org.manage-settings` y `org.manage-clubs` nunca están en su conjunto. Tampoco puede crear un torneo
nuevo (`org.create-tournaments`) ni cambiar el ciclo de vida de un torneo existente — publicar,
archivar, o sus scripts personalizados (`org.manage-tournament-lifecycle`): eso sigue siendo exclusivo
de admin, ya que crear o retirar un torneo es una decisión a nivel de organización, no una decisión
dentro del torneo. Y no puede actuar sobre ningún torneo distinto al que nombra su asignación, incluso
dentro de la misma organización.

## Qué pantallas ve

Cada pantalla del panel de control que ven los miembros de esta organización, excepto "Roles" — igual
que [club-admin](/es/help/roles/club-admin/), y por el mismo motivo: la administración de usuarios
necesita `org.manage-users`, que tournament-admin nunca tiene.

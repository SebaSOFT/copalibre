---
title: Admin
description: Qué puede hacer el rol admin, qué hereda y qué no puede hacer.
capabilities:
  - control-web/roles-permissions
roles:
  - admin
---

## Para qué sirve este rol

El operador de más alto nivel de la propia organización. Un admin gestiona todo lo que hace la
organización: crea y publica torneos, invita y administra a cualquier otro usuario, administra cada
club, y opera partidos, igual que el resto de las capacidades de la organización — nada aquí está
limitado a un club o un torneo.

## Qué puede hacer

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.create-tournaments`
- `org.manage-clubs` (heredado de `club-admin`)
- `org.manage-display-tokens`
- `org.manage-persons`
- `org.manage-registrations`
- `org.manage-resources`
- `org.manage-schedule`
- `org.manage-seeding`
- `org.manage-settings`
- `org.manage-stages`
- `org.manage-tournament-data`
- `org.manage-tournament-lifecycle`
- `org.manage-users`
- `org.manage-zones-groups`
- `org.operate-match`
- `org.rebuild-statistics`
- `org.review-reports`
- `org.view-internal-standings`
- `org.view-internal-tables`

Además de las propias, este rol tiene cada capacidad que tiene `club-admin`, por herencia — una
capacidad agregada allí llega a este rol sin necesidad de una segunda edición aquí.

<!-- GENERATED:CAPABILITIES:END -->

## Qué no puede hacer

La autoridad de admin nunca cruza hacia otra organización — el admin de una segunda organización es una
asignación completamente distinta, que nadie tiene hasta que alguien lo invite allí. Admin tampoco tiene
autoridad a nivel de instalación: crear organizaciones, gestionar los super-admins de la instalación, e
instalar módulos de disciplina o perfil de torneo para toda la instalación son autoridad de
[super-admin](/es/help/roles/super-admin/), un rol por encima de admin, no por debajo.

## Qué pantallas ve

Cada pantalla del panel de control de su organización, sin ninguna entrada de navegación oculta — admin
es el único rol de organización que siempre ve la pantalla "Roles", ya que la administración de usuarios
(`org.manage-users`) es propia.

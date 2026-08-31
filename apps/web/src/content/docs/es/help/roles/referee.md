---
title: Árbitro
description: Qué puede hacer el rol referee, qué hereda y qué no puede hacer.
capabilities:
  - control-web/roles-permissions
roles:
  - referee
---

## Para qué sirve este rol

Operar un partido mientras está en vivo: registrar eventos, controlar el reloj, resolver temporizadores,
y seleccionar una alineación — la consola que usa un oficial en la cancha, sin nada de la administración
del torneo que lo rodea.

## Qué puede hacer

<!-- GENERATED:CAPABILITIES:START -->

- `org.operate-match`

<!-- GENERATED:CAPABILITIES:END -->

Tener `org.operate-match` por sí solo no es lo mismo que estar designado a un partido específico — la
consola de partido además verifica una asignación limitada al partido (`MATCH_CAPABILITIES`) antes de
admitir un comando, una autoridad más limitada que la que otorga el propio rol de organización.

## Qué hereda

Nada — referee no tiene las capacidades de ningún otro rol, y ningún rol hereda de referee.

## Qué no puede hacer

Referee no puede corregir un resultado de partido finalizado (`org.correct-match-results` — esa es
autoridad de admin o de tournament-admin, ejercida después del partido, no durante), y no tiene ninguna
de las capacidades de preparación del torneo: ninguna autoridad de etapa, zona, grupo, calendario,
siembra o inscripciones, ninguna revisión de reportes, ninguna administración de usuarios o clubes,
ninguna configuración de organización.

## Qué pantallas ve

Solo lo que alcanza `org.operate-match` — principalmente la consola de partido en vivo. Cada otra
entrada de navegación del panel de control que sí ve se comporta igual que para club-admin y
tournament-admin: cada pantalla excepto "Roles", ya que referee tampoco tiene nunca
`org.manage-users`.

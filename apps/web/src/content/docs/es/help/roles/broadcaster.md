---
title: Transmisión
description: Qué puede hacer el rol broadcaster, qué hereda y qué no puede hacer.
capabilities:
  - control-web/roles-permissions
roles:
  - broadcaster
---

## Para qué sirve este rol

Un rol asignable dentro de la taxonomía de la organización, pensado para alguien que produce una
transmisión alrededor de un torneo en lugar de administrarlo.

## Qué puede hacer

<!-- GENERATED:CAPABILITIES:START -->

No se otorga ninguna capacidad a este rol por ahora.

<!-- GENERATED:CAPABILITIES:END -->

Dicho con claridad en lugar de dejarlo en silencio: ninguna ruta admite hoy a broadcaster en nada que
nombre la correspondencia declarada, así que esto es lo que el rol realmente otorga en este momento, no
un marcador pendiente de documentar. Las superficies de lectura pública — resúmenes en vivo, tablas y
llaves publicadas, rutas de TV/overlay servidas por un token de exhibición — no necesitan ningún rol de
organización y siguen siendo accesibles sin importar si broadcaster está asignado.

## Qué hereda

Nada — ningún rol hereda de broadcaster, y este no hereda de ninguno.

## Qué no puede hacer

Todo lo que protege una capacidad de organización: ninguna administración de usuarios, clubes o
torneos, ninguna operación de partido, ninguna revisión de reportes, ninguna exportación o importación
de datos. Asignar broadcaster otorga membresía en la taxonomía de la organización sin otorgar ninguna
autoridad operativa dentro de ella.

## Qué pantallas ve

Cada pantalla del panel de control excepto "Roles" — la misma navegación que ve un viewer, ya que
ninguno de los dos roles tiene `org.manage-users`, y ninguno tiene tampoco ninguna otra capacidad que
alguna pantalla límite hoy.

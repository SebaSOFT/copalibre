---
title: Admin de club
description: Ce que le rôle club-admin peut faire, ce qu'il hérite, et ce qu'il ne peut pas faire.
capabilities:
  - control-web/roles-permissions
roles:
  - club-admin
---

## À quoi sert ce rôle

Autorité sur un club : celui que nomme cette affectation, et seulement ce club. Un admin de club
maintient l'identité de ce club — son nom, alias, abréviation et emblème — sans avoir besoin d'un accès
administrateur à l'échelle de l'organisation pour le faire.

## Ce qu'il peut faire

<!-- GENERATED:CAPABILITIES:START -->

- `org.manage-clubs`

<!-- GENERATED:CAPABILITIES:END -->

Limité, pas à l'échelle de l'organisation : un admin de club agissant sur un club qu'il n'administre pas
est refusé, de la même manière qu'un participant est refusé s'il agit sur les dossiers d'un autre
participant.

## Ce qu'il hérite

Rien — club-admin ne détient les capacités d'aucun autre rôle. [Admin](/fr/help/roles/admin/) hérite de
`org.manage-clubs` depuis club-admin, pas l'inverse : admin détient tout ce que détient club-admin, sans
limite, en plus du sien.

## Ce qu'il ne peut pas faire

Rien en dehors de l'administration de club. Un admin de club ne peut pas inviter ni gérer des
utilisateurs, changer les paramètres de l'organisation, créer ni administrer des tournois, examiner des
inscriptions, ni opérer un match — chacune de ces actions nécessite une capacité que ce rôle ne détient
pas. Il ne peut pas non plus agir sur un club qu'il n'administre pas, même au sein de la même
organisation.

## Écrans qu'il voit

Chaque écran du panneau de contrôle que voient les membres de cette organisation, sauf « Rôles » — la
gestion des utilisateurs nécessite `org.manage-users`, une capacité que club-admin ne détient jamais,
donc cette entrée de navigation n'apparaît jamais pour lui. Cela découle de la correspondance déclarée,
pas d'une liste d'exclusion par écran : ajouter demain un nouvel écran de gestion des utilisateurs
exclut club-admin automatiquement, sans rien à retenir de mettre à jour ici.

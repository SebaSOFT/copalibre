---
title: Admin
description: Ce que le rôle admin peut faire, ce qu'il hérite, et ce qu'il ne peut pas faire.
capabilities:
  - control-web/roles-permissions
roles:
  - admin
---

## À quoi sert ce rôle

L'opérateur de plus haut niveau de l'organisation elle-même. Un admin gère tout ce que fait
l'organisation : il crée et publie des tournois, invite et gère chaque autre utilisateur, administre
chaque club, et opère des matchs, comme toute autre capacité de l'organisation — rien ici n'est limité
à un club ou un tournoi.

## Ce qu'il peut faire

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.create-tournaments`
- `org.manage-clubs` (hérité de `club-admin`)
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

En plus des siennes, ce rôle détient chaque capacité que détient `club-admin`, par héritage — une
capacité ajoutée là-bas atteint ce rôle sans nécessiter une seconde modification ici.

<!-- GENERATED:CAPABILITIES:END -->

## Ce qu'il ne peut pas faire

L'autorité d'admin ne traverse jamais vers une autre organisation — l'admin d'une seconde organisation
est une affectation entièrement différente, détenue par personne jusqu'à ce que quelqu'un l'y invite.
Admin ne détient non plus aucune autorité au niveau de l'installation : créer des organisations, gérer
les super-admins de l'installation, et installer des modules de discipline ou de profil de tournoi pour
toute l'installation appartiennent à [super-admin](/fr/help/roles/super-admin/), un rôle au-dessus
d'admin, pas en dessous.

## Écrans qu'il voit

Chaque écran du panneau de contrôle de son organisation, sans aucune entrée de navigation masquée —
admin est le seul rôle d'organisation qui voit toujours l'écran « Rôles », puisque la gestion des
utilisateurs (`org.manage-users`) lui appartient en propre.

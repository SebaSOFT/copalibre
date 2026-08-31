---
title: Admin de tournoi
description: Ce que le rôle tournament-admin peut faire, ce qu'il hérite, et ce qu'il ne peut pas faire.
capabilities:
  - control-web/roles-permissions
roles:
  - tournament-admin
---

## À quoi sert ce rôle

Autorité pour diriger un tournoi — celui que nomme cette affectation — sans portée à l'échelle de
l'organisation. Une organisation qui veut que quelqu'un dirige une seule compétition de bout en bout, et
rien d'autre, utilise ce rôle plutôt qu'admin.

## Ce qu'il peut faire

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

Chacune de ces capacités est limitée au tournoi que nomme l'affectation. Agir contre un tournoi
différent au sein de la même organisation est refusé pour des raisons de propriété, de la même manière
que la limite de club est appliquée pour club-admin.

## Ce qu'il hérite

Rien. Chaque capacité que détient tournament-admin, il la détient directement —
[admin](/fr/help/roles/admin/) détient le même ensemble de capacités opérationnelles de tournoi
également, sans limite, mais comme un ensemble propre déclaré directement plutôt qu'hérité de
tournament-admin.

## Ce qu'il ne peut pas faire

Aucune autorité à l'échelle de l'organisation : tournament-admin ne peut pas inviter ni gérer des
utilisateurs, changer les paramètres de l'organisation, ni gérer des clubs — `org.manage-users`,
`org.manage-settings` et `org.manage-clubs` ne sont jamais dans son ensemble. Il ne peut pas non plus
créer un nouveau tournoi (`org.create-tournaments`) ni changer le cycle de vie d'un tournoi existant —
publier, archiver, ou ses scripts personnalisés (`org.manage-tournament-lifecycle`) : cela reste
réservé à admin, car créer ou retirer un tournoi est une décision au niveau de l'organisation, pas une
décision interne au tournoi. Et il ne peut pas agir sur un tournoi autre que celui que nomme son
affectation, même au sein de la même organisation.

## Écrans qu'il voit

Chaque écran du panneau de contrôle que voient les membres de cette organisation, sauf « Rôles » — comme
[club-admin](/fr/help/roles/club-admin/), et pour la même raison : la gestion des utilisateurs
nécessite `org.manage-users`, que tournament-admin ne détient jamais.

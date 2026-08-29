---
title: Calendrier
description: Assignez chaque match à un créneau — une heure, un lieu et une durée déclarés — et les officiels qui le couvrent.
capabilities:
  - control-web/match-scheduling
  - tournament-engine/schedule-slots
roles:
  - admin
---

## À quoi sert cet écran

Chaque match d'une étape se voit assigner ici un créneau — une vue calendrier et une vue liste sur le
même lot. Un créneau ne se saisit pas à la main pour chaque match : c'est une heure de début, un lieu et
une durée déclarés une fois dans le pool de ressources [lieux et officiels](/help/control/resources), et
le constructeur de calendrier assigne un match à l'un d'eux, pas l'inverse. Les officiels sont activés
par match depuis ce même pool de ressources.

## Grain du match, pas du croisement

La planification opère sur le match, pas sur le croisement entre deux participants. Un croisement à un
seul match a un match à placer ; une [série](/help/control/series) de cinq matchs en a cinq, chacun avec
son propre créneau et ses propres officiels — les quatrième et cinquième matchs de la série peuvent
occuper des créneaux réservés jamais utilisés si la série est décidée plus tôt, et le constructeur les
marque comme n'étant plus requis plutôt que de les laisser paraître non planifiés.

## Prévisualisez avant de publier

Avant que quoi que ce soit soit publié, le constructeur prévisualise le lot et affiche chaque conflit —
un lieu ou un officiel réservé en double, une violation de la règle de repos — en nommant les matchs
concernés, et nomme tout match déjà publié que le lot déplacerait. La publication est atomique : chaque
assignation du lot prend effet ensemble, ou aucune ne le fait.

## Ce que vous ne pouvez pas faire ici

Replanifier un match déjà terminé est refusé : son horaire est désormais un enregistrement, pas un plan,
et le modifier passe plutôt par le [flux de correction audité](/help/control/corrections). Un match sans
créneau assigné est affiché explicitement comme n'ayant pas de match programmé — jamais omis
silencieusement, et jamais confondu avec une exemption (bye) de tableau. Créer ou modifier un lieu ou un
officiel se fait sur [lieux et officiels](/help/control/resources), pas ici.

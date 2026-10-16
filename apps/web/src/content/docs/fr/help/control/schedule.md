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

## Combien de temps un match occupe son créneau

Un match placé occupe le début de son créneau plus sa **durée estimée** : le temps réglementaire de la
discipline (par exemple deux mi-temps de 25 minutes, 50 minutes), avec le nombre de périodes propre au
tournoi. Une discipline sans temps réglementaire (jouée en sets, par exemple) occupe tout le créneau. Le
lieu reste en outre réservé pendant la transition entre deux matchs. Des créneaux courts ne masquent
donc jamais un conflit : deux matchs de 50 minutes à quinze minutes d’écart sur un même terrain sont un
conflit de lieu.

La règle de repos vient des [paramètres](/help/control/tournament-authoring) du tournoi : le repos
minimum entre la fin d’un match d’un participant et le début du suivant. Un tournoi qui n’en déclare
aucun n’applique aucune règle de repos.

## Modifier un match publié demande un motif

Déplacer, changer les officiels ou retirer un match déjà **publié** demande un motif avant la
publication. La fenêtre liste chaque match publié modifié avec son ancien et son nouvel horaire et
lieu. Donnez un motif pour tout le lot — choisissez un motif courant, un motif utilisé récemment ou
saisissez le vôtre — ou marquez un match comme exception avec son propre motif (le bouton « Autre
motif » de la ligne, ou sélectionnez plusieurs lignes et marquez-les ensemble). La publication reste
désactivée tant que chaque match listé n’est pas couvert. Le créneau, le lieu, l’horaire et les
officiels précédents sont conservés avec le motif, la personne et l’heure. Un lot de premiers
placements est publié sans question.

Au clavier : ↑/↓ changent de match, Espace sélectionne, E marque une exception, Entrée publie et Échap
ferme : d’abord la liste de suggestions ouverte, puis la boîte de dialogue.

## Retirer un match de son créneau

« Retirer du créneau » sort un match placé de son créneau dans le lot : l’aperçu l’affiche sans horaire
et liste les créneaux libérés, pour qu’un autre match puisse en prendre un dans la même publication.

## Ce que vous ne pouvez pas faire ici

Replanifier un match déjà terminé est refusé : son horaire est désormais un enregistrement, pas un plan,
et le modifier passe plutôt par le [flux de correction audité](/help/control/corrections). Un match sans
créneau assigné est affiché explicitement comme n'ayant pas de match programmé — jamais omis
silencieusement, et jamais confondu avec une exemption (bye) de tableau. Créer ou modifier un lieu ou un
officiel se fait sur [lieux et officiels](/help/control/resources), pas ici.

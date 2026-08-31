---
title: Séries multi-matchs
description: Déclarer une série, ce que fait chaque classe de résolution, planifier ses matchs, et lire une série sur le tableau public.
capabilities:
  - tournament-engine/match-series
roles:
  - admin
  - referee
  - broadcaster
  - viewer
---

## Ce qu'est une série

Une série règle un croisement entre deux participants avec plus d'un match plutôt qu'un seul. Elle n'a
pas d'écran propre — elle se déclare dans l'assistant de
[création de tournoi](/help/control/tournament-authoring), se planifie sur
[calendrier](/help/control/schedule), s'enregistre match par match sur la
[console en direct](/help/control/match-console) ou est
[chargée](/help/control/load-match-data) après coup, et se lit sur le tableau public. Un croisement qui
ne déclare aucune série génère exactement un match et se comporte exactement comme toujours.

## La déclarer

Une série déclare une portée (combien de matchs elle peut jouer) et une classe de résolution :

- **Au meilleur de** : la série se termine dès qu'un camp a gagné assez de matchs pour rendre les
  matchs restants sans effet. Une portée au-meilleur-de doit être impaire, pour qu'une majorité soit
  toujours possible.
- **Agrégat** : le vainqueur est celui qui a marqué le plus au total sur tous les matchs, additionnés —
  pas celui qui a gagné le plus de matchs individuels.
- **Points par manche** : chaque match de la série attribue ses propres points, et le vainqueur de la
  série est celui qui en cumule le plus au total.

Une série peut aussi être marquée comme jouée en terrain neutre, et son classement peut compter chaque
match séparément (par défaut — chaque match ajoute sa propre victoire, son nul ou sa défaite) ou la
série entière (toute la série ajoute un seul résultat, quel que soit le nombre de matchs nécessaires).

## La planifier et la jouer

Chaque match de la série reçoit son propre créneau et ses propres officiels sur l'écran
[calendrier](/help/control/schedule). Une fois la série décidée — un camp a assuré un au-meilleur-de, ou
il reste assez peu de manches pour changer le résultat — ses matchs restants sont marqués comme n'étant
plus requis plutôt que de paraître non planifiés ou abandonnés.

## Ce que vous ne pouvez pas faire ici

Un match déjà joué et enregistré ne peut pas être « déjoué » en redéclarant la série : corriger un match
terminé d'une série décidée passe par le [flux de correction audité](/help/control/corrections), qui
bloque explicitement la propagation d'une correction dans une étape ayant déjà commencé à utiliser le
résultat de la série.

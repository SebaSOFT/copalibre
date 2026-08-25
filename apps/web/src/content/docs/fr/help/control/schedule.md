---
title: Calendrier
description: Assignez à chaque match d'une étape une heure, un lieu et des officiels, prévisualisez les conflits, puis publiez.
---

## À quoi sert cet écran

Les matchs d'une étape se voient assigner ici une heure de début, une durée, un lieu et des officiels
— une vue calendrier et une vue liste sur le même lot. Rien n'est planifié par un algorithme : chaque
assignation est un choix propre de l'organisateur, construit, prévisualisé, puis explicitement publié.

## Champs clés

- **Heure de début / durée** : quand un match est réservé pour être joué, et pour combien de temps la
  ressource est retenue — pas combien de temps le match dure réellement, ce que personne ne sait à
  l'avance.
- **Lieu / officiels** : assignés depuis la liste des [lieux et officiels](/help/control/resources) de
  l'organisation.

## Prévisualisez avant de publier

Avant que quoi que ce soit soit publié, le constructeur prévisualise le lot et affiche chaque conflit
— un lieu ou un officiel réservé en double, une violation de la règle de repos — en nommant les matchs
concernés, et nomme tout match déjà publié que le lot déplacerait. La publication est atomique : chaque
assignation du lot prend effet ensemble, ou aucune ne le fait.

## Ce que vous ne pouvez pas faire ici

Replanifier un match dont le résultat est déjà finalisé est refusé : son horaire est désormais un
enregistrement, pas un plan, et le modifier passe plutôt par le flux de correction audité. Un
participant sans match assigné est affiché explicitement comme n'ayant pas de match programmé — jamais
omis silencieusement, et jamais confondu avec une exemption (bye) de tableau.

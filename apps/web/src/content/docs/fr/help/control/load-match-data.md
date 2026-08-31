---
title: Charger les données du match
description: Saisie groupée/structurée pour un match joué sans console en direct présente.
capabilities: []
roles:
  - admin
  - referee
---

## À quoi sert cet écran

Tous les matchs n'ont pas d'opérateur à la console pendant qu'ils se jouent. Cet écran vous permet de
saisir l'effectif d'un match, son historique complet d'événements et son résultat final ensemble, après
coup — pour un club rapportant un match à l'extérieur, ou un organisateur rattrapant une pile de
feuilles de match papier.

Il ne s'applique qu'à un match programmé sans activité déjà enregistrée. Un match qui a déjà des
événements ou des segments d'une session en direct doit être terminé via la
[console en direct](/help/control/match-console) à la place — charger un second historique par-dessus
un historique en direct entrerait en conflit avec lui.

## Champs clés

- **Effectif** : la même sélection de joueurs par participant que propose la console en direct, gardée
  uniquement sur cet écran jusqu'à l'envoi — rien n'est enregistré sur le match tant que le lot complet
  n'a pas été envoyé.
- **Segments** : chaque période/mi-temps/set du match, dans l'ordre de jeu, chacun déjà marqué comme
  terminé avec sa durée. Il n'y a pas de chronomètre en direct ici.
- **Événements** : l'historique complet du match, dans l'ordre où il s'est réellement produit, chacun
  avec son propre horodatage réel — pas le moment où vous le saisissez.
- **Résultat** : le résultat final du match, envoyé avec tout ce qui précède.

## Un seul envoi, tout ou rien

Appuyer sur « Envoyer les données du match » envoie l'effectif, chaque événement et le résultat
ensemble, en une seule transaction. Si un seul événement est invalide, rien n'est enregistré — l'envoi
entier est refusé, et ce que vous avez saisi reste à l'écran pour que vous corrigiez la seule entrée en
échec et renvoyiez, plutôt que de tout recommencer.

## Importer depuis une feuille de calcul

La section « Importer depuis un CSV » charge une feuille de calcul dans le même éditeur ci-dessus, pour
révision avant l'envoi — elle ne contourne jamais l'étape de révision ni la validation de l'envoi.
Téléchargez le modèle pour connaître le format de colonnes exact requis pour un fichier.

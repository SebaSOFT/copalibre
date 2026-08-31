---
title: Vue des matchs
description: Une liste de cartes des matchs d'un tournoi, facile à parcourir — lieu, chronomètre, dernier événement et contexte de classement — sur le site public et dans le panneau de contrôle.
capabilities:
  - public-web/matches-view
  - control-web/matches-view
roles:
  - admin
  - viewer
  - broadcaster
  - referee
---

## À quoi sert cet écran

Quelle que soit la structure d'une phase — un seul groupe, plusieurs zones, ou une série de plusieurs
matchs — elle se ramène toujours à une liste de matchs à jouer. Cet écran est cette liste, sous forme
de grille de cartes : tout le tournoi par défaut, ou restreinte à une phase, une zone/groupe, ou un
état (en direct, à venir, terminé) avec les filtres en haut. Il complète, sans le remplacer, le
[tableau](/help/control/tournament-authoring) — le tableau est la bonne lecture pour suivre
l'avancement par élimination ; cet écran est la bonne lecture pour parcourir le volume, en particulier
sur plusieurs groupes de round-robin simultanés qu'un tableau n'a aucun bon moyen de montrer à la fois.

Cet écran existe en deux versions, qui partagent la même carte :

- **Publique** (`/{organisation}/tournaments/{tournoi}/matches`) — anonyme, sans connexion requise.
- **Panneau de contrôle** (`.../matches-view`) — accessible uniquement à un admin de l'organisation ou
  à un tournament-admin ayant autorité sur ce tournoi, la même autorité déjà exigée par l'écran de
  classement interne.

## Ce que montre chaque carte

- **État** : en direct, à venir ou terminé, accompagné d'une icône pour que l'état ne dépende jamais
  de la seule couleur.
- **Chronomètre** : affiché uniquement pendant que le match est en cours — son temps écoulé actuel, la
  même valeur que lit la console de match en direct.
- **Lieu** : le nom du lieu assigné, quand la planification en a assigné un.
- **Dernier événement** : l'événement le plus récemment enregistré, quel qu'il soit — cette carte ne
  traite jamais un type d'événement comme un cas particulier, si bien qu'une discipline qui en déclare
  un nouveau (une confirmation d'arbitrage vidéo, un remplacement) s'affiche correctement sans aucun
  changement à cet écran.
- **Zone/position, ou état de la série** — jamais les deux sur la même carte :
  - Un croisement dans une phase de zone/groupe sans série déclarée montre le nom de la zone/groupe
    (quand la phase déclare plus d'un groupe par défaut) et la position actuelle de chaque participant
    au classement.
  - Un croisement réglé par une série montre sa progression et, une fois réglée, son état cumulé —
    la même représentation de série que le [tableau public](/help/control/series) utilise déjà.
- **Facteur décisif** : sur un match terminé dont le résultat a nécessité un comparateur de départage
  pour séparer deux lignes du classement, une ligne nommant ce qui l'a décidé (par exemple, « décidé
  par la différence de buts particulière »).

## La ligne de facteur décisif face à la trace complète

La ligne de facteur décisif de la carte publique est délibérément un résumé, pas le raisonnement
complet — elle ne porte jamais les autres étapes ni les valeurs intermédiaires du comparateur interne.
Un organisateur ayant autorité sur le classement interne de ce tournoi (un admin, ou un
tournament-admin ayant autorité sur lui) voit à la place la trace complète du comparateur, sur la
version de cette même carte dans le panneau de contrôle, exactement comme la montre déjà le
sélecteur de trace de l'écran de classement interne. Personne ne voit une version intermédiaire : un
spectateur voit soit le résumé d'une ligne, soit la trace complète, jamais une version partiellement
occultée.

## Ce que cet écran NE fait PAS

Il est en lecture seule. Aucune carte ni aucun contrôle ici ne change l'état d'un match, n'enregistre
un événement, ni ne modifie le calendrier — ces actions restent sur la
[console de match en direct](/help/control/match-console) et le
[constructeur de calendrier](/help/control/schedule). Cet écran sert à observer ce qui se passe et ce
qui s'est déjà passé, pas à opérer un match.

---
title: Détail des Statistiques Joueur
description: Le total du tournoi et le détail match par match sur le profil public du joueur.
capabilities:
  - tournament-engine/player-statistics-drilldowns
roles:
  - viewer
  - broadcaster
---

## Aperçu

La page de profil public d'un joueur affiche une ligne de total du tournoi et un détail match par
match pour chaque tableau de classement au niveau personne déclaré par la discipline du tournoi —
un spectateur bascule entre les tableaux déclarés (par exemple « meilleurs buteurs » et
« meilleurs passeurs » d'une discipline) via un sélecteur étiqueté, sans quitter le profil.

## Total du Tournoi vs. Lignes de Match

- La ligne **total du tournoi** affiche tous les types de colonnes déclarés par le tableau : les
  valeurs atomiques (collecteurs) ainsi que tout ratio composite ou calculé sur l'ensemble du
  tournoi (par exemple, buts par match).
- Chaque **ligne de match** n'affiche que les colonnes atomiques (de type collecteur) de ce match —
  un ratio composite ou calculé dépend de plusieurs matchs et n'apparaît donc jamais sur une ligne
  de match. Les lignes de match sont ordonnées chronologiquement par phase puis numéro de match, et
  identifient le match par son numéro public de phase/match, jamais par un identifiant interne.

## Quand un Joueur n'a Aucune Statistique Enregistrée

Un joueur sans apparition dans l'effectif des matchs terminés du tournoi voit un état vide explicite
dans la section des statistiques du tournoi, plutôt qu'un tableau suggérant des matchs à valeur
nulle qui n'ont jamais eu lieu.

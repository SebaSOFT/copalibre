---
title: Système Suisse
description: Mécanismes d’appariement, groupes de score, flotteurs et exemptions (byes) en tournois suisses.
capabilities:
  - tournament-engine/tournament-fixture-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Vue d’ensemble

Le système suisse apparie les participants sur plusieurs rondes sans élimination directe. Contrairement aux tableaux à élimination où une défaite est éliminatoire, ou au round-robin où chaque joueur affronte tous les autres, le système suisse propose un nombre fixe de rondes contre des adversaires affichant un bilan identique ou similaire.

## Mécanismes d’Appariement

- **Groupes de Score** : À chaque ronde après la première, les participants sont regroupés selon leurs points accumulés (ex. 2-0, 1-1, 0-2).
- **Non-répétition des rencontres** : Deux adversaires ne s'affrontent jamais plus d'une fois dans une même phase suisse.
- **Flotteurs** : Lorsqu'un groupe de score compte un nombre impair de joueurs, un joueur "flotte" vers le groupe voisin pour équilibrer les rencontres.
- **Exemptions (Byes)** : Si le nombre total de participants est impair, le joueur éligible le moins bien classé n'ayant pas encore reçu d'exemption bénéficie d'un bye (comptabilisé comme 1 victoire avec écart nul).

## Systèmes de Score

CopaLibre prend en charge deux modèles de score suisse :

- `match-wins` : Points attribués par issue de match (ex. 1 pt par victoire, 0.5 pt par nul, 0 pt par défaite).
- `game-points` : Différentiels cumulés de jeux ou de manches.

## Classements et Progression

Les classements suisses exploitent la force de l'opposition (Buchholz, Sonneborn-Berger) pour départager les ex æquo, permettant souvent de qualifier les 8 ou 16 premiers pour les phases finales.

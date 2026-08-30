---
title: Arbitre
description: Ce que le rôle referee peut faire, ce qu'il hérite, et ce qu'il ne peut pas faire.
capabilities:
  - control-web/roles-permissions
roles:
  - referee
---

## À quoi sert ce rôle

Opérer un match pendant qu'il est en direct : enregistrer des événements, contrôler l'horloge, résoudre
les minuteries, et sélectionner une composition — la console qu'utilise un officiel sur le terrain, sans
rien de l'administration du tournoi environnante.

## Ce qu'il peut faire

<!-- GENERATED:CAPABILITIES:START -->

- `org.operate-match`

<!-- GENERATED:CAPABILITIES:END -->

Détenir `org.operate-match` seul n'équivaut pas à être désigné pour un match spécifique — la console de
match vérifie en plus une affectation limitée au match (`MATCH_CAPABILITIES`) avant d'admettre une
commande, une autorité plus étroite que celle qu'accorde le rôle d'organisation lui-même.

## Ce qu'il hérite

Rien — referee ne détient les capacités d'aucun autre rôle, et aucun rôle n'hérite de referee.

## Ce qu'il ne peut pas faire

Referee ne peut pas corriger un résultat de match finalisé (`org.correct-match-results` — c'est
l'autorité d'admin ou de tournament-admin, exercée après le match, pas pendant), et ne détient aucune
des capacités de préparation du tournoi : aucune autorité d'étape, de zone, de groupe, de calendrier, de
tirage au sort ou d'inscriptions, aucun examen de rapport, aucune gestion d'utilisateurs ou de clubs,
aucun paramètre d'organisation.

## Écrans qu'il voit

Seulement ce qu'atteint `org.operate-match` — principalement la console de match en direct. Chaque
autre entrée de navigation du panneau de contrôle qu'il voit se comporte de la même manière que pour
club-admin et tournament-admin : chaque écran sauf « Rôles », puisque referee ne détient non plus
jamais `org.manage-users`.

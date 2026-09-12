---
title: Fonctionnement et traçabilité
description: Règles pour gérer les matchs et corriger les données de tournoi.
capabilities:
  - platform/async-job-processing
  - platform/persistence-layer
  - platform/release-process
roles:
  - super-admin
---

## Console de match

Enregistrez les événements et le chronomètre depuis une console autorisée. La projection publique se
met à jour à partir d'événements durables et conserve une version pour la récupération. Chaque
action s'écrit d'abord dans une file d'attente locale avant d'être envoyée, pour qu'une connexion
coupée la laisse en attente pour une nouvelle tentative automatique plutôt que de la perdre — voir
[Console de match en direct](/fr/help/control/match-console/) pour le comportement complet.

## Corrections

Ne jamais écraser un résultat calculé. Une correction nécessite une raison, un auteur et un aperçu de
l'impact avant d'affecter le classement ou les phases suivantes.

## Feuille de match

Une feuille de match représente les joueurs sélectionnés par un participant pour un match. Elle ne
représente pas une relation persistante entre une personne et une équipe.

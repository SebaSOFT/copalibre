---
title: Diffusion
description: Ce que le rôle broadcaster peut faire, ce qu'il hérite, et ce qu'il ne peut pas faire.
capabilities:
  - control-web/roles-permissions
roles:
  - broadcaster
---

## À quoi sert ce rôle

Un rôle attribuable dans la taxonomie de l'organisation, destiné à quelqu'un qui produit une diffusion
autour d'un tournoi plutôt que de l'administrer.

## Ce qu'il peut faire

<!-- GENERATED:CAPABILITIES:START -->

Aucune capacité n'est accordée à ce rôle aujourd'hui.

<!-- GENERATED:CAPABILITIES:END -->

Dit clairement plutôt que laissé silencieux : aucune route n'admet aujourd'hui broadcaster à quoi que ce
soit que nomme la correspondance déclarée, donc c'est ce que le rôle accorde réellement en ce moment, pas
un espace réservé en attente de documentation. Les surfaces de lecture publique — aperçus en direct,
classements et tableaux publiés, routes TV/overlay servies par un jeton d'affichage — n'ont besoin
d'aucun rôle d'organisation et restent accessibles que broadcaster soit attribué ou non.

## Ce qu'il hérite

Rien — aucun rôle n'hérite de broadcaster, et il n'hérite d'aucun.

## Ce qu'il ne peut pas faire

Tout ce qu'une capacité d'organisation protège : aucune gestion d'utilisateurs, de clubs ou de tournois,
aucune opération de match, aucun examen de rapport, aucune exportation ou importation de données.
Attribuer broadcaster accorde l'appartenance à la taxonomie de l'organisation sans accorder aucune
autorité opérationnelle en son sein.

## Écrans qu'il voit

Chaque écran du panneau de contrôle sauf « Rôles » — la même navigation que voit un viewer, puisqu'aucun
des deux rôles ne détient `org.manage-users`, et qu'aucun ne détient non plus aucune autre capacité
qu'un écran limite aujourd'hui.

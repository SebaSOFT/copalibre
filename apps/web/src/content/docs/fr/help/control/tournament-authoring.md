---
title: Création de tournoi
description: Ce que configure l'assistant de création de tournoi et ce que signifie chaque champ.
---

## À quoi sert cet écran

Crée un nouveau tournoi au sein de l'organisation : choisissez la discipline, le format et les
données de base avant qu'aucun participant ne soit inscrit.

## Champs clés

- **Discipline** : l'ensemble de règles du sport/activité pratiqué (condition de victoire, points,
  segments, etc.). Seules les disciplines installées sur cette installation apparaissent — si celle
  dont vous avez besoin manque, installez-la d'abord (`copalibre module add`) avant de pouvoir créer
  le tournoi.
- **Alias** : l'identifiant de route publique du tournoi, unique au sein de l'organisation. Utilise
  des minuscules et des tirets ; apparaît dans l'URL publique et ne peut pas être librement modifié
  ensuite.
- **Format** : le format de compétition disponible pour la discipline choisie (élimination directe,
  round robin, etc.).

## Cycle de vie

Un tournoi nouvellement créé démarre à l'état **brouillon**. À partir de là, il suit un chemin
linéaire : brouillon → publié → démarré → terminé → archivé. Chaque étape est une décision explicite
sur un autre écran, jamais quelque chose que cet écran fait pour vous. Une fois **démarré**, la
discipline et le profil de tournoi se figent à la version qu'ils avaient à ce moment — un tournoi en
cours ne change jamais ses règles en cours de route.

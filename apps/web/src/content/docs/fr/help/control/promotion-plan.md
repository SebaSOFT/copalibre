---
title: Plan de promotion
description: Configurez comment les groupes d'une zone se combinent dans le placement de l'étape suivante — révisé avant d'agir.
capabilities:
  - tournament-engine/stage-qualification
roles:
  - admin
---

## À quoi sert cet écran

Une fois que les groupes d'une zone ont terminé leur phase de matchs toutes rondes, cet écran configure
combien de participants avancent de chaque groupe et comment ces groupes se combinent en une seule liste
ordonnée pour l'étape suivante. Il affiche ensuite cette liste ordonnée et calculée pour révision — il
ne crée ni ne modifie jamais de placement par lui-même.

## Champs clés

- **Participants qui avancent par groupe** : combien de participants de chaque groupe sont promus.
- **Bandes** : quand l'étape suivante a plusieurs zones, quelle tranche contiguë de la liste combinée
  est dirigée vers laquelle des zones de cette étape.
- **Révision** : la liste ordonnée de candidats que ce plan promouvrait, calculée de la même manière à
  chaque fois — rien n'est écrit dans l'étape suivante tant qu'un opérateur n'a pas explicitement
  configuré son placement depuis le constructeur de placement, qui se pré-remplit à partir d'un plan
  révisé lorsqu'il en existe un.

## Ce que vous ne pouvez pas faire ici

Si un groupe a une égalité non résolue à sa propre ligne de coupure, cet écran le signale plutôt que de
présenter une liste incomplète — résolvez l'égalité (une correction auditée, si le résultat source en
a besoin) avant qu'une liste combinée puisse être calculée.

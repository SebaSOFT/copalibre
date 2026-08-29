---
title: Tirage et têtes de série
description: Ce que sont les têtes de série, les exemptions, et les contraintes de tirage que cet écran respecte.
capabilities:
  - tournament-engine/bracket-seeding-builder
  - tournament-engine/draw-constraints
roles:
  - admin
---

## À quoi sert cet écran

Construit le tirage/tableau d'une phase : assigne à chaque participant une position initiale (une
« tête de série »), en respectant les contraintes déclarées pour cette discipline/ce format.

## Champs clés

- **Tête de série** : la position d'un participant dans le tableau — détermine contre qui il joue
  d'abord et à quel tour il pourrait affronter d'autres têtes de série élevées.
- **Exemption (bye)** : quand le nombre de participants ne remplit pas un tableau parfait, certaines
  positions « passent au tour suivant » sans jouer. L'écran les distribue en suivant toujours la même
  règle, jamais au hasard.
- **Contraintes de tirage** : règles déclarées (par exemple, que deux participants du même club ne se
  rencontrent pas au premier tour) que le tirage respecte automatiquement — l'écran ne permet pas
  d'enregistrer un tirage qui les viole.

## Quand il peut être refait

Le tirage peut être refait tant que la phase n'a pas commencé. Une fois la phase en cours, refaire le
tirage n'aurait plus de sens avec des matchs déjà joués — l'écran ne le permet pas à ce stade.

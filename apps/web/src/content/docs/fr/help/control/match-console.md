---
title: Console de match en direct
description: Ce que fait la console de match, et ce qui ne peut plus changer une fois un résultat enregistré.
---

## À quoi sert cet écran

C'est l'écran d'exploitation d'un match en cours : enregistrer les événements et les segments au fur
et à mesure qu'ils se produisent, et enregistrer le résultat final quand le match se termine. Ce qui
se fait ici est diffusé en direct sur l'écran public du tournoi.

## Champs clés

- **Événement** : un fait ponctuel du match (un point, une carte, un remplacement) enregistré avec
  son moment exact — il forme l'historique reconstituable du match, pas seulement le score final.
- **Segment** : une division du match avec son propre chronomètre (un set, une période). Le
  chronomètre et le résultat sont gérés par segment, pas comme un seul chronomètre pour tout le
  match.
- **Résultat** : le résultat final du match, enregistré une seule fois. Une fois enregistré, il n'est
  pas écrasé depuis cet écran — toute correction ultérieure passe par le flux audité de
  correction/supersession, pas en le rechargeant ici.

## Ce que vous ne pouvez pas faire après avoir enregistré le résultat

Une fois le match terminé, cet écran ne permet plus d'ajouter des événements comme si le match se
poursuivait, ni de recharger le résultat directement. C'est intentionnel : cela protège l'intégrité
de l'historique déjà publié.

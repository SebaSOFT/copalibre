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

## Travailler avec une connexion peu fiable

La connectivité en bord de terrain se coupe. Cet écran est conçu pour ça : enregistrer un événement,
ajuster le chronomètre, sélectionner une feuille de match ou finaliser un match écrit d'abord dans
une file d'attente locale durable — _avant_ même d'être envoyé — pour qu'une coupure ne fasse jamais
perdre quelque chose que vous avez déjà fait.

- **L'état de synchronisation** est toujours visible en haut de l'écran : si vous êtes en ligne,
  combien d'actions attendent encore d'être envoyées, et quand la dernière a réellement abouti.
- **Une action en file d'attente le reste**, sans être perdue, malgré une connexion instable, une
  zone blanche, ou même en fermant et rouvrant cet écran — le rouvrir reprend l'envoi de tout ce qui
  attend encore.
- **Dès que la connectivité revient**, tout ce qui était en attente s'envoie automatiquement, dans
  l'ordre où vous l'avez fait.
- **Une action refusée** — une que le serveur aurait aussi refusée en direct, comme un changement de
  feuille de match soumis après la fin du match — s'affiche clairement, avec le motif, pour que vous
  sachiez exactement ce qui nécessite votre attention. Elle ne bloque jamais ce qui est en attente
  après elle.

Ce que cet écran ne fait pas : récupérer une saisie ou une sélection que vous n'avez jamais
réellement soumise. Si vous étiez en train de modifier quelque chose quand la connexion s'est
coupée, cette saisie précise est perdue comme d'habitude — seules les actions déjà tentées sont
protégées.

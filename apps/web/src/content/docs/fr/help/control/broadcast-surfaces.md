---
title: Surfaces de diffusion et publiques
description: Jetons d'affichage pour les écrans TV en salle et les overlays de streaming, et ce que voit un spectateur sur le site public.
capabilities:
  - live-operations/broadcast-tv-surfaces
  - live-operations/public-live-surfaces
  - public-web/public-web-shell
roles:
  - broadcaster
  - admin
---

## Jetons d'affichage

Une route `/tv/**` — un affichage en rotation complète ou un match unique épinglé, en page normale ou en
`?mode=overlay` transparent pour une capture chroma-key en stream — est autorisée par un jeton
d'affichage propre à l'appareil, pas par la connexion d'une personne. Le jeton est émis depuis le tableau
de bord de l'organisation, lié à une route `/tv/**` précise, et révocable indépendamment : révoquer le
jeton d'un appareil n'arrête que cet appareil, et aucun autre appareil ni aucune session d'une personne
n'est affecté.

Un appareil détenant un jeton valide n'a besoin de personne présente pour continuer à fonctionner. Il
survit à une coupure de courant sans redemander d'identifiants, et se rétablit silencieusement d'une
connexion perdue ou de données indisponibles — une surface `/tv/**` n'affiche jamais d'erreur qu'une
personne devrait fermer.

## Ce que voit un spectateur sur le site public

Le site public (sans connexion) affiche les classements, le tableau et les rapports de match d'un
tournoi tels qu'ils sont publiés, à la même adresse organisation/tournoi qu'utilisent le panneau de
contrôle et les surfaces `/tv/**`. Une [série](/help/control/series) en cours affiche son score en
direct et quel camp mène sur le tableau public de la même façon que dans le panneau de contrôle, et un
match pas encore planifié est affiché comme tel, jamais deviné.

## Ce que vous ne pouvez pas faire ici

Aucune des deux surfaces n'accepte de saisie d'un spectateur ou d'un appareil TV : les deux sont des
représentations en lecture seule de données déjà publiées. Changer ce qui est publié se fait dans le
propre panneau de contrôle de l'organisation, pas sur les surfaces publiques ni `/tv/**`.

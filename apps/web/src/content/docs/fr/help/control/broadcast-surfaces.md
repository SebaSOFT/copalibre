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

## Studio du diffuseur

`/control/<organization>/tournaments/<tournament>/broadcaster` est une console en libre-service
pour un streamer ou un opérateur média : elle émet automatiquement votre propre jeton d'affichage,
vous laisse choisir le mode de superposition (une bande en incrustation basse sur votre caméra, ou
une scène plein écran sans caméra) et un fond d'aperçu (transparent, fond vert, fond magenta ou un
décor de stade sombre), et vous fournit une URL Browser Source OBS prête à coller avec aperçu en
direct — aucun administrateur n'a besoin de vous donner un jeton ni de partager sa propre session.
Pendant que cette superposition est ouverte, un but, un point ou un carton enregistré en direct
affiche une bannière animée nommant l'équipe et le joueur, puis se referme automatiquement —
personne sur place n'a besoin de la déclencher ou de la fermer.

## Ce qu’affiche l’écran de la salle

L’écran en rotation complète parcourt le classement, les meilleurs joueurs, les statistiques du tournoi et, lorsque la phase mise en avant en a, le tableau et les matchs de championnat. Une adresse avec `?view=standings` ou `?view=fixtures` en fixe un au lieu de faire tourner.

Une phase peut mélanger les formats ; l’écran présente donc chaque zone selon le format qu’elle joue :

- **Classement** : Chaque zone qui classe ses participants dans un tableau a son propre tableau, titré du nom de la zone. Les lignes de zones différentes ne sont jamais mêlées dans un même classement, et chaque tableau montre jusqu’à huit lignes. Une phase dont toutes les zones jouent le format de la phase garde un seul tableau sans titre.
- **Tableau** : Les zones qui jouent un format à élimination sont dessinées en tableau.
- **Matchs** : Une zone qui joue un championnat liste ses matchs par ronde, avec l’état et le score de chacun. L’onglet n’apparaît que si la phase mise en avant a une telle zone.

L’incrustation du tiers inférieur ne change pas : elle nomme un match, pas une phase.

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

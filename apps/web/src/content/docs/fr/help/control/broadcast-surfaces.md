---
title: Surfaces de diffusion et publiques
description: Jetons d'affichage pour les écrans TV en salle et les overlays de streaming, et ce que voit un spectateur sur le site public.
capabilities:
  - live-operations/broadcast-tv-surfaces
  - live-operations/tv-dashboard-localization
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

L’écran en rotation complète parcourt le classement, les meilleurs joueurs, les statistiques du tournoi et, lorsque la phase mise en avant en a un, le tableau, puis la liste des matchs. Une adresse avec `?view=standings` ou `?view=matches` fixe cette seule section en plein écran au lieu de faire tourner (`?view=fixtures` fonctionne toujours comme ancien nom de `matches`). Le récapitulatif du champion d’un tournoi terminé appartient à l’écran en rotation seul. L’en-tête nomme l’état du tournoi : un tournoi en cours affiche une horloge étiquetée, à la minute, dans le fuseau de l’organisation ; un tournoi terminé affiche le jour de son dernier match, sans horloge qui défile.

Un match épinglé — `/tv/<organisation>/tournaments/<tournoi>/stages/<phase>/matches/<numéro>` — est désigné comme sur la page publique du match, par son numéro dans la phase, et montre toujours son score, ses côtés et ses événements enregistrés, terminé ou non. Un numéro que la phase n’a pas est signalé comme un match qui n’existe pas.

Une phase peut mélanger les formats ; l’écran présente donc chaque zone selon le format qu’elle joue :

- **Classement** : Chaque zone qui classe ses participants dans un tableau a son propre tableau, titré du nom de la zone. Les lignes de zones différentes ne sont jamais mêlées dans un même classement, et chaque tableau montre jusqu’à huit lignes. Une phase dont toutes les zones jouent le format de la phase garde un seul tableau sans titre.
- **Tableau** : Les zones qui jouent un format à élimination sont dessinées en tableau.
- **Matchs** : Liste tous les matchs du tournoi dans un tableau compact, deux par ligne avec abréviations et score, une page à la fois ; les pages avancent avec la rotation, et une vue `matches` fixe continue de paginer.

L’incrustation du tiers inférieur ne change pas : elle nomme un match, pas une phase.

### Incrustations : un match, séries et sets

Une incrustation (`?mode=overlay`) ne montre que le match qu’on lui a donné : celui que nomme son adresse (`/tv/<organisation>/tournaments/<tournoi>/stages/<phase>/matches/<numéro>?mode=overlay`) ou, avec `?court=<terrain>`, le match en direct de ce terrain. Ouverte sans aucun des deux, elle indique qu’aucun match n’est sélectionné et n’affiche aucun score, si bien que deux incrustations ne montrent jamais le même match par hasard. Un match dans une série montre où en est la série (matchs gagnés par chaque côté et match en cours) à côté du score, et un match joué en sets montre les sets déjà joués et celui en cours, le côté domicile d’abord, avec le libellé de set de la discipline dans la langue de la page. Le segment en cours est nommé par sa place dans le match (« 2e mi-temps », « 2e tour », « 3e set ») quand la discipline en joue plusieurs du même type, et sans numéro quand elle n’en joue qu’un. Un match sans rien de cela s’affiche comme avant.

### Le lanceur d’écran

`/tv` est un lanceur qui compose l’adresse d’un écran de salle ou d’une incrustation : choisissez l’organisation, le tournoi et l’affichage (rotation, classement, liste des matchs, un match épinglé ou l’incrustation de diffusion), le fond et la langue. La langue change aussitôt les libellés du lanceur, sans rechargement. Les phases sont listées avec leur numéro et leur nom, et les matchs regroupés par zone et groupe avec leur ronde, les deux participants et leur numéro (`#34`). Les affichages match épinglé et incrustation demandent un match et le lien de lancement le porte, si bien que plusieurs incrustations peuvent montrer chacune leur match ; une incrustation peut au contraire suivre le match en direct d’un terrain (`court=`).

## Ce que voit un spectateur sur le site public

Le site public (sans connexion) affiche les classements, le tableau et les rapports de match d'un
tournoi tels qu'ils sont publiés, à la même adresse organisation/tournoi qu'utilisent le panneau de
contrôle et les surfaces `/tv/**`. Une [série](/help/control/series) en cours affiche son score en
direct et quel camp mène sur le tableau public de la même façon que dans le panneau de contrôle, et un
match pas encore planifié est affiché comme tel, jamais deviné.

Sur l’écran TV, le récapitulatif d’un tournoi terminé décidé zone par zone liste le champion ou les co-champions de chaque zone de la dernière phase sous le nom de la zone, les mêmes vainqueurs que ceux de l’aperçu public. Un tournoi à champion unique garde la présentation du champion unique, et le leader du classement d’une phase précédente n’est jamais présenté comme champion.

## Ce que vous ne pouvez pas faire ici

Aucune des deux surfaces n'accepte de saisie d'un spectateur ou d'un appareil TV : les deux sont des
représentations en lecture seule de données déjà publiées. Changer ce qui est publié se fait dans le
propre panneau de contrôle de l'organisation, pas sur les surfaces publiques ni `/tv/**`.

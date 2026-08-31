---
title: Import et export
description: Import CSV en masse des participants, et export CSV/JSON des participants, résultats, classements et configuration du tournoi.
capabilities:
  - control-web/data-import-export
roles:
  - admin
---

## Import

Les participants s'importent en masse par CSV depuis l'écran de
[révision des inscriptions](/help/control/registration-review). Chaque ligne est validée avant que quoi
que ce soit ne soit écrit : une ligne qui échoue à la validation est signalée avec son numéro de ligne
et sa raison, et aucune ligne n'est importée tant que le fichier entier n'est pas accepté, ou corrigé et
re-téléversé — un fichier partiellement importé n'est pas un état que produit cet écran. Un CSV
précédemment exporté depuis cette même installation se réimporte proprement, donc faire un aller-retour
avec une liste de participants (la modifier dans un tableur, la ramener) est un chemin pris en charge,
pas un accident.

## Export

- **Participants** : effectifs individuels ou d'équipe, par alias — accessible depuis
  [révision des inscriptions](/help/control/registration-review).
- **Résultats et classements** : les résultats calculés et le tableau des classements d'une étape, par
  alias — accessible depuis [classements](/help/control/standings).
- **Configuration du tournoi** : le règlement complet, les surcharges et les scripts personnalisés en
  JSON, depuis le tableau de bord de l'organisation — le même document qu'une installation neuve
  pourrait réimporter pour reproduire les règles du tournoi, pas ses résultats.

Chaque export remplace un identifiant interne de base de données par l'alias public de l'entité, donc un
fichier exporté ne fuite jamais un identifiant que rien en dehors de l'installation ne devrait voir.

## Ce que vous ne pouvez pas faire ici

Importer des résultats ou des classements n'est pas pris en charge — ceux-ci sont calculés, pas saisis,
et le seul moyen d'en modifier un après coup est le
[flux de correction audité](/help/control/corrections).

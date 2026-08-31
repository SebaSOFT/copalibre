---
title: Revue des inscriptions
description: Ce que font accepter, rejeter ou retirer une inscription, et comment importer des participants par CSV.
capabilities:
  - control-web/registration-review
roles:
  - admin
  - club-admin
---

## À quoi sert cet écran

Examine chaque participant ou équipe inscrit avant la publication du tournoi, et décide si chacun est
accepté, rejeté ou retiré. Chaque décision est auditée individuellement avec l'état antérieur, l'état
résultant et qui l'a prise.

## Champs clés

- **Statut** : en attente, accepté, rejeté ou retiré. Seules les transitions valides sont autorisées
  depuis chaque statut — l'écran ne permet pas d'appliquer une décision illégale (par exemple,
  accepter quelque chose déjà rejeté).
- **Import CSV** : téléversez un fichier de participants ; le système valide le contenu et affiche un
  aperçu ligne par ligne avant confirmation. Aucune ligne en erreur n'est importée tant que le
  fichier n'est pas corrigé et réessayé.
- **Entrants nécessitant une abréviation** : un participant qui entre en collision sur chaque étiquette
  courte dérivée automatiquement s'enregistre sans en avoir une définie, et reste sinon invisible —
  cette section liste ces participants et vous permet d'en définir une directement. Une valeur déjà
  utilisée par un autre participant du tournoi est refusée sur place, en nommant le conflit ; un
  participant résolu disparaît de la liste.
- **Revue en masse** : applique la même décision à plusieurs inscriptions à la fois ; chacune reste
  auditée séparément, pas comme un seul événement agrégé.

## Ce que cet écran NE fait PAS

Il ne modifie pas les résultats de match ni le tableau — il concerne exclusivement qui participe,
avant que le tournoi ne démarre.

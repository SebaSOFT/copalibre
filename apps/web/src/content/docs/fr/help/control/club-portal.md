---
title: Portail du club
description: L'annuaire de membres propre à un administrateur de club et la soumission d'un effectif de tournoi.
capabilities:
  - control-web/club-portal
roles:
  - club-admin
  - admin
---

## À qui cela s'adresse

Le Portail du club est un espace en libre-service pour un `club-admin` — un utilisateur dont le rôle
est limité à un club précis, plutôt qu'à toute l'organisation. Tout ici est limité à ce club : un
administrateur de club ne peut jamais voir ni modifier les membres, équipes ou inscriptions d'un
autre club.

## Annuaire des membres

`/control/<organisation>/clubs/<club>/portal/members` liste tous les membres déjà affiliés à votre
club et permet d'en ajouter un nouveau (nom, et éventuellement alias et date de naissance) ou de
corriger le nom ou l'alias d'un membre existant. Un membre ajouté ici appartient à votre club dès sa
création — il n'y a pas d'étape séparée « assigner au club ».

La nationalité, une photo et les autres détails d'identité restent la tâche d'un administrateur de
l'organisation, exactement comme aujourd'hui pour toute fiche de personne.

## Soumettre l'effectif d'un tournoi

`/control/<organisation>/clubs/<club>/portal/tournaments/<tournoi>/roster` vous guide pour inscrire
votre club à un tournoi ouvert :

1. Choisissez l'une des équipes existantes de votre club, ou créez-en une nouvelle.
2. Sélectionnez quels membres de votre club composent l'effectif, et attribuez à chacun un rôle —
   joueur, remplaçant, entraîneur ou personnel.
3. Soumettez. Cela inscrit votre équipe comme participant **en attente** avec cet effectif joint —
   le même état d'attente que toute inscription.

Un administrateur du tournoi examine et approuve l'inscription depuis son propre écran de révision
des inscriptions ; rien de cette étape ne change parce que vous l'avez soumise vous-même. Vous
pouvez toujours revenir préparer une autre équipe pour un tournoi différent — rien ici n'est une
action unique.

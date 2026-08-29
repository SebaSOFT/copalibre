---
title: Administration de la plateforme
description: Créez des organisations, gérez les super-admins de l'installation, et installez des modules de discipline/profil.
capabilities:
  - control-web/platform-administration
  - platform/default-module-catalogue
roles:
  - super-admin
---

## À quoi sert cet écran

C'est la console propre à l'installation, accessible uniquement en tant que `super-admin` — un niveau
au-dessus de toute organisation. Rien ici n'est limité à une seule organisation : chaque action ici
affecte l'installation entière.

## Organisations

Une nouvelle organisation se crée ici — son alias, son nom affiché, sa langue principale et son fuseau
horaire — et son premier administrateur est invité par email dans la même étape. Une organisation créée
sans administrateur invité n'a personne pour se connecter et la gérer, c'est pourquoi les deux se font
ensemble.

## Utilisateurs

La liste des utilisateurs de n'importe quelle organisation s'atteint par son alias, pour qu'un
super-admin puisse y accéder pour changer le rôle ou le statut d'un utilisateur sans avoir besoin d'être
membre de cette organisation.

## Super-admins

Les super-admins de l'installation sont listés, créés et supprimés ici. Un super-admin se crée par ID de
principal — l'identité doit déjà exister (s'être connectée au moins une fois) avant de pouvoir être
promue.

## Modules

Les modules de discipline et de profil de tournoi s'installent ici par alias, une plage de version
optionnelle, et une source alternative optionnelle pour un module absent du catalogue par défaut. Les
modules installés sont listés avec leur type, version et source, et peuvent être vérifiés ou supprimés.
Vérifier les mises à jour compare les versions installées à ce que publie actuellement la source de
chaque module, sans rien installer avant d'y être invité.

## Ce que vous ne pouvez pas faire ici

Rien ici n'atteint les propres données de tournoi d'une organisation — aucun match, résultat ou
inscription n'est visible ni modifiable depuis cet écran. C'est le propre panneau de contrôle de chaque
organisation, atteint par un administrateur d'organisation, pas par un super-admin agissant depuis cette
console.

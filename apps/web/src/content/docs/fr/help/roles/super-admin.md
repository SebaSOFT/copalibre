---
title: Super-admin
description: Ce que le rôle super-admin peut faire, et ce qu'il ne peut pas faire.
capabilities:
  - control-web/platform-administration
roles:
  - super-admin
---

## À quoi sert ce rôle

L'opérateur de l'installation elle-même — un niveau au-dessus de chaque organisation, sans être membre
d'aucune d'elles. Super-admin existe pour créer des organisations, gérer qui d'autre détient super-admin,
et installer les modules de discipline et de profil de tournoi que toute l'installation exécute.

Contrairement à chaque autre rôle de ce site, super-admin se situe entièrement en dehors de la
correspondance de capacités d'organisation : c'est un rôle d'installation (`INSTALLATION_ROLES`), pas un
rôle d'organisation (`ORGANIZATION_ROLES`), donc il n'a aucune entrée dans la correspondance déclarée de
rôle à capacité ni de liste de capacités générée ici — son autorité est un ensemble fixe et restreint
d'actions au niveau de l'installation, décrites directement.

## Ce qu'il peut faire

- Créer une nouvelle organisation, en nommant son alias, son nom d'affichage, sa langue principale et
  son fuseau horaire, et inviter son premier administrateur dans la même étape.
- Lister, créer et retirer des super-admins d'installation, par ID de principal.
- Accéder à la liste des utilisateurs de n'importe quelle organisation, par alias, pour changer le rôle
  ou le statut d'un utilisateur — sans avoir besoin d'appartenir à cette organisation.
- Installer un module de discipline ou de profil de tournoi par alias, une plage de version optionnelle,
  et une source alternative optionnelle ; lister, vérifier, retirer, et vérifier les mises à jour des
  modules installés.
- Créer une nouvelle discipline ou un nouveau profil de tournoi via l'assistant guidé d'administration
  de plateforme, produisant un paquet de module que cette même autorité d'installation installe ensuite.

## Ce qu'il ne peut pas faire

Rien n'atteint les propres données de tournoi d'une organisation : aucun fixture, résultat ou
inscription n'est visible ou modifiable via ce rôle. Cela appartient au propre panneau de contrôle de
chaque organisation, atteint par un [admin](/fr/help/roles/admin/), pas par super-admin agissant via la
console d'installation.

## Écrans qu'il voit

L'écran d'administration de plateforme, et aucun autre écran du panneau de contrôle — les écrans limités
à une organisation appartiennent à un rôle d'organisation, que super-admin ne détient pas simplement en
étant super-admin.

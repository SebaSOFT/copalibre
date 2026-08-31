---
title: Préférences
description: Gérez vos jetons d'accès personnels et vos paramètres personnels CopaLibre.
capabilities:
  - platform/internationalization
  - platform/native-auth
  - platform/personal-access-tokens
roles:
  - admin
  - club-admin
  - referee
  - broadcaster
  - viewer
---

## À quoi sert cet écran

L'écran des préférences vous permet de gérer vos paramètres personnels dans CopaLibre.

## Jetons d'accès personnels

Vous pouvez générer des jetons d'accès personnels (PAT) pour vous authentifier auprès de l'API ou du
serveur MCP de CopaLibre sans utiliser votre nom d'utilisateur et votre mot de passe.

- **Générer un jeton** : saisissez un libellé et une durée d'expiration, puis cliquez sur « Générer ».
  Veillez à copier le jeton immédiatement, car il ne peut plus être affiché ensuite.
- **Révoquer un jeton** : si un jeton est compromis ou n'est plus nécessaire, vous pouvez le révoquer
  à tout moment.

Ces jetons sont sans état et vérifient votre identité à chaque requête.

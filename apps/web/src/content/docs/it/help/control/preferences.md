---
title: Preferenze
description: Gestisci i tuoi token di accesso personale e le tue impostazioni personali di CopaLibre.
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

## A cosa serve questa schermata

La schermata delle preferenze ti permette di gestire le tue impostazioni personali in CopaLibre.

## Token di accesso personale

Puoi generare token di accesso personale (PAT) per autenticarti verso l'API o il server MCP di
CopaLibre senza usare nome utente e password.

- **Genera un token**: inserisci un'etichetta e una durata di scadenza, poi premi "Genera". Assicurati
  di copiare subito il token, perché non potrà essere visualizzato di nuovo.
- **Revoca un token**: se un token viene compromesso o non serve più, puoi revocarlo in qualsiasi
  momento.

Questi token sono privi di stato e verificano la tua identità a ogni richiesta.

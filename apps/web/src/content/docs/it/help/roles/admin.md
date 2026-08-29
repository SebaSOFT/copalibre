---
title: Admin
description: Cosa può fare il ruolo admin, cosa eredita, e cosa non può fare.
capabilities:
  - control-web/roles-permissions
roles:
  - admin
---

## A cosa serve questo ruolo

L'operatore di più alto livello dell'organizzazione stessa. Un admin gestisce tutto ciò che
l'organizzazione fa: crea e pubblica tornei, invita e gestisce ogni altro utente, amministra ogni club,
e opera partite, come ogni altra capacità dell'organizzazione — nulla qui è limitato a un club o un
torneo.

## Cosa può fare

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.create-tournaments`
- `org.manage-clubs` (ereditato da `club-admin`)
- `org.manage-display-tokens`
- `org.manage-persons`
- `org.manage-registrations`
- `org.manage-resources`
- `org.manage-schedule`
- `org.manage-seeding`
- `org.manage-settings`
- `org.manage-stages`
- `org.manage-tournament-data`
- `org.manage-tournament-lifecycle`
- `org.manage-users`
- `org.manage-zones-groups`
- `org.operate-match`
- `org.rebuild-statistics`
- `org.review-reports`
- `org.view-internal-standings`
- `org.view-internal-tables`

Oltre alle proprie, questo ruolo detiene ogni capacità che detiene `club-admin`, per eredità — una
capacità aggiunta lì raggiunge questo ruolo senza bisogno di una seconda modifica qui.

<!-- GENERATED:CAPABILITIES:END -->

## Cosa non può fare

L'autorità di admin non attraversa mai verso un'altra organizzazione — l'admin di una seconda
organizzazione è un'assegnazione completamente diversa, che nessuno detiene finché qualcuno non lo
invita lì. Admin non detiene nemmeno alcuna autorità a livello di installazione: creare organizzazioni,
gestire i super-admin dell'installazione, e installare moduli di disciplina o profilo torneo per tutta
l'installazione appartengono a [super-admin](/it/help/roles/super-admin/), un ruolo sopra admin, non
sotto.

## Schermate che vede

Ogni schermata del pannello di controllo della propria organizzazione, senza alcuna voce di
navigazione nascosta — admin è l'unico ruolo di organizzazione che vede sempre la schermata "Ruoli",
poiché la gestione utenti (`org.manage-users`) è propria.

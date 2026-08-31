---
title: Admin del torneo
description: Cosa può fare il ruolo tournament-admin, cosa eredita, e cosa non può fare.
capabilities:
  - control-web/roles-permissions
roles:
  - tournament-admin
---

## A cosa serve questo ruolo

Autorità per gestire un torneo — quello che nomina quella assegnazione — senza portata a livello di
organizzazione. Un'organizzazione che vuole che qualcuno gestisca una singola competizione dall'inizio
alla fine, e nient'altro, usa questo ruolo invece di admin.

## Cosa può fare

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.manage-display-tokens`
- `org.manage-registrations`
- `org.manage-schedule`
- `org.manage-seeding`
- `org.manage-stages`
- `org.manage-tournament-data`
- `org.manage-zones-groups`
- `org.operate-match`
- `org.review-reports`
- `org.view-internal-standings`
- `org.view-internal-tables`

<!-- GENERATED:CAPABILITIES:END -->

Ognuna di queste è limitata al torneo che l'assegnazione nomina. Agire contro un torneo diverso
all'interno della stessa organizzazione viene rifiutato per motivi di titolarità, allo stesso modo in
cui viene applicato il limite del club per club-admin.

## Cosa eredita

Nulla. Ogni capacità che tournament-admin detiene, la detiene direttamente —
[admin](/it/help/roles/admin/) detiene lo stesso insieme di capacità operative del torneo anch'esso,
senza limiti, ma come insieme proprio dichiarato direttamente invece che ereditato da tournament-admin.

## Cosa non può fare

Nessuna autorità a livello di organizzazione: tournament-admin non può invitare o gestire utenti,
cambiare le impostazioni dell'organizzazione, né amministrare club — `org.manage-users`,
`org.manage-settings` e `org.manage-clubs` non sono mai nel suo insieme. Non può nemmeno creare un
nuovo torneo (`org.create-tournaments`) né cambiare il ciclo di vita di un torneo esistente —
pubblicare, archiviare, o i suoi script personalizzati (`org.manage-tournament-lifecycle`): questo
resta esclusivo di admin, poiché creare o ritirare un torneo è una decisione a livello di
organizzazione, non una decisione interna al torneo. E non può agire su nessun torneo diverso da quello
che la sua assegnazione nomina, anche all'interno della stessa organizzazione.

## Schermate che vede

Ogni schermata del pannello di controllo che i membri di questa organizzazione vedono, tranne "Ruoli" —
come [club-admin](/it/help/roles/club-admin/), e per lo stesso motivo: la gestione utenti richiede
`org.manage-users`, che tournament-admin non detiene mai.

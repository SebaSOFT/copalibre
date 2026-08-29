---
title: Admin del club
description: Cosa può fare il ruolo club-admin, cosa eredita, e cosa non può fare.
capabilities:
  - control-web/roles-permissions
roles:
  - club-admin
---

## A cosa serve questo ruolo

Autorità su un club: quello che nomina quella assegnazione, e solo quel club. Un admin del club
mantiene l'identità di quel club — nome, alias, abbreviazione ed emblema — senza aver bisogno
dell'accesso amministratore a livello di organizzazione per farlo.

## Cosa può fare

<!-- GENERATED:CAPABILITIES:START -->

- `org.manage-clubs`

<!-- GENERATED:CAPABILITIES:END -->

Limitato, non a livello di organizzazione: un admin del club che agisce su un club che non amministra
viene rifiutato, allo stesso modo in cui un partecipante viene rifiutato agendo sui dati di un altro
partecipante.

## Cosa eredita

Nulla — club-admin non detiene le capacità di nessun altro ruolo. [Admin](/it/help/roles/admin/) eredita
`org.manage-clubs` da club-admin, non il contrario: admin detiene tutto ciò che detiene club-admin,
senza limiti, in aggiunta al proprio.

## Cosa non può fare

Nulla al di fuori dell'amministrazione del club. Un admin del club non può invitare o gestire utenti,
cambiare le impostazioni dell'organizzazione, creare o amministrare tornei, revisionare iscrizioni, né
operare una partita — ognuna di queste azioni richiede una capacità che questo ruolo non detiene. Non
può nemmeno agire su un club che non amministra, anche all'interno della stessa organizzazione.

## Schermate che vede

Ogni schermata del pannello di controllo che i membri di questa organizzazione vedono, tranne "Ruoli" —
la gestione utenti richiede `org.manage-users`, una capacità che club-admin non detiene mai, quindi
quella voce di navigazione non appare mai per esso. Questo deriva dalla corrispondenza dichiarata, non
da un elenco di esclusione per schermata: aggiungere domani una nuova schermata di gestione utenti
esclude club-admin automaticamente, senza nulla da ricordare di aggiornare qui.

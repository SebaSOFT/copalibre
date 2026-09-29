---
title: Portale del club
description: L'archivio dei membri di un amministratore di club e l'invio della rosa del torneo.
capabilities:
  - control-web/club-portal
roles:
  - club-admin
  - admin
---

## A chi è rivolto

Il Portale del club è uno spazio self-service per un `club-admin` — un utente il cui ruolo è
limitato a un club specifico, anziché all'intera organizzazione. Tutto qui è circoscritto a quel
club: un amministratore di club non può mai vedere o modificare membri, squadre o iscrizioni di un
altro club.

## Archivio dei membri

`/control/<organizzazione>/clubs/<club>/portal/members` elenca tutti coloro già affiliati al tuo
club e permette di aggiungerne uno nuovo (nome e, facoltativamente, alias e data di nascita) o di
correggere il nome o l'alias di un membro esistente. Un membro aggiunto qui appartiene al tuo club
dal momento della creazione — non esiste un passaggio separato di "assegnazione al club".

Nazionalità, foto e altri dettagli identificativi restano compito di un amministratore
dell'organizzazione, esattamente come oggi per qualsiasi scheda persona.

## Invio della rosa di un torneo

`/control/<organizzazione>/clubs/<club>/portal/tournaments/<torneo>/roster` ti guida
nell'iscrizione del tuo club a un torneo aperto:

1. Scegli una delle squadre esistenti del tuo club, o creane una nuova.
2. Seleziona quali membri del tuo club compongono la rosa e assegna a ciascuno un ruolo — giocatore,
   riserva, allenatore o staff.
3. Invia. Questo iscrive la tua squadra come partecipante **in attesa** con quella rosa allegata —
   lo stesso stato di attesa in cui inizia ogni iscrizione.

Un amministratore del torneo esamina e approva l'iscrizione dalla propria schermata di revisione
delle iscrizioni; nulla di questo passaggio cambia perché l'hai inviata tu stesso. Puoi sempre
tornare e preparare un'altra squadra per un torneo diverso — nulla qui è un'azione unica.

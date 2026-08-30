---
title: Arbitro
description: Cosa può fare il ruolo referee, cosa eredita, e cosa non può fare.
capabilities:
  - control-web/roles-permissions
roles:
  - referee
---

## A cosa serve questo ruolo

Gestire una partita mentre è in corso: registrare eventi, controllare l'orologio, risolvere i
timer, e selezionare una formazione — la console che un ufficiale di gara usa sul campo, senza nulla
dell'amministrazione del torneo circostante.

## Cosa può fare

<!-- GENERATED:CAPABILITIES:START -->

- `org.operate-match`

<!-- GENERATED:CAPABILITIES:END -->

Detenere `org.operate-match` da solo non equivale a essere designato per una partita specifica — la
console di partita verifica inoltre un'assegnazione limitata alla partita (`MATCH_CAPABILITIES`) prima
di ammettere un comando, un'autorità più ristretta di quella che concede il ruolo di organizzazione
stesso.

## Cosa eredita

Nulla — referee non detiene le capacità di nessun altro ruolo, e nessun ruolo eredita da referee.

## Cosa non può fare

Referee non può correggere un risultato di partita finalizzato (`org.correct-match-results` — quella è
autorità di admin o tournament-admin, esercitata dopo la partita, non durante), e non detiene nessuna
delle capacità di preparazione del torneo: nessuna autorità di fase, zona, gruppo, calendario, sorteggio
o iscrizioni, nessuna revisione dei referti, nessuna gestione di utenti o club, nessuna impostazione
dell'organizzazione.

## Schermate che vede

Solo ciò che raggiunge `org.operate-match` — principalmente la console di partita in diretta. Ogni
altra voce di navigazione del pannello di controllo che vede si comporta come per club-admin e
tournament-admin: ogni schermata tranne "Ruoli", poiché referee non detiene mai nemmeno
`org.manage-users`.

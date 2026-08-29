---
title: Calendario
description: Assegna ogni partita a uno slot — un orario, una sede e una durata dichiarati — e gli ufficiali di gara che la seguono.
capabilities:
  - control-web/match-scheduling
  - tournament-engine/schedule-slots
roles:
  - admin
---

## A cosa serve questa schermata

Ogni partita di una fase riceve qui uno slot assegnato — una vista calendario e una vista elenco sullo
stesso lotto. Uno slot non si digita a mano per ogni partita: è un orario di inizio, una sede e una
durata dichiarati una volta nel pool di risorse [sedi e ufficiali di gara](/help/control/resources), e
il costruttore del calendario assegna una partita a uno di essi, non il contrario. Gli ufficiali di gara
si attivano per partita dallo stesso pool di risorse.

## Grana della partita, non dell'incontro

La programmazione opera sulla partita, non sull'incontro tra due partecipanti. Un incontro a partita
singola ha una partita da collocare; una [serie](/help/control/series) di cinque ne ha cinque, ognuna
con il proprio slot e i propri ufficiali di gara — la quarta e la quinta partita della serie possono
occupare slot riservati mai riempiti se la serie si decide prima, e il costruttore le marca come non più
necessarie invece di lasciarle con l'aspetto di non programmate.

## Anteprima prima di pubblicare

Prima che qualcosa venga pubblicato, il costruttore mostra un'anteprima del lotto ed evidenzia ogni
conflitto — una sede o un ufficiale di gara prenotato due volte, una violazione della regola di riposo —
nominando le partite coinvolte, e nomina qualsiasi partita già pubblicata che il lotto sposterebbe. La
pubblicazione è atomica: ogni assegnazione del lotto entra in vigore insieme, oppure nessuna lo fa.

## Cosa non puoi fare qui

Riprogrammare una partita già conclusa viene rifiutato: il suo orario è ormai un registro, non un piano,
e modificarlo passa invece dal [flusso di correzione controllato](/help/control/corrections). Una
partita senza slot assegnato è mostrata esplicitamente come priva di partita programmata — mai omessa in
silenzio, e mai confusa con un bye del tabellone. Creare o modificare una sede o un ufficiale di gara
avviene in [sedi e ufficiali di gara](/help/control/resources), non qui.

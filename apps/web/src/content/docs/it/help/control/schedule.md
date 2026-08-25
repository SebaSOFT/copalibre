---
title: Calendario
description: Assegna a ogni partita di una fase un orario, una sede e ufficiali di gara, visualizza in anteprima i conflitti, poi pubblica.
---

## A cosa serve questa schermata

Alle partite di una fase vengono assegnati qui un orario di inizio, una durata, una sede e ufficiali
di gara — una vista calendario e una vista elenco sullo stesso lotto. Nulla viene programmato da un
algoritmo: ogni assegnazione è una scelta propria dell'organizzatore, costruita, visualizzata in
anteprima, poi pubblicata esplicitamente.

## Campi chiave

- **Orario di inizio / durata**: quando una partita è riservata per essere giocata, e per quanto tempo
  la risorsa viene occupata — non quanto dura realmente la partita, cosa che nessuno sa in anticipo.
- **Sede / ufficiali di gara**: assegnati dall'elenco delle [sedi e ufficiali di gara](/help/control/resources)
  dell'organizzazione.

## Visualizza in anteprima prima di pubblicare

Prima che qualcosa venga pubblicato, il costruttore mostra in anteprima il lotto e visualizza ogni
conflitto — una sede o un ufficiale di gara prenotato due volte, una violazione della regola di
riposo — nominando le partite coinvolte, e nomina qualsiasi partita già pubblicata che il lotto
sposterebbe. La pubblicazione è atomica: ogni assegnazione del lotto ha effetto insieme, oppure nessuna
lo ha.

## Cosa non puoi fare qui

Riprogrammare una partita il cui risultato è già stato finalizzato viene rifiutato: il suo orario è
ora un dato registrato, non un piano, e modificarlo passa invece attraverso il flusso di correzione
tracciata. Un partecipante senza partita assegnata viene mostrato esplicitamente come senza partita
programmata — mai omesso silenziosamente, e mai confuso con un bye del tabellone.

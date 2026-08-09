---
title: Sorteggio e teste di serie
description: Cosa sono le teste di serie, i bye, e i vincoli di sorteggio che questa schermata rispetta.
---

## A cosa serve questa schermata

Costruisce il sorteggio/tabellone di una fase: assegna a ciascun partecipante una posizione iniziale
(una "testa di serie"), rispettando i vincoli dichiarati per quella disciplina/formato.

## Campi chiave

- **Testa di serie (seed)**: la posizione di un partecipante nel tabellone — determina contro chi
  gioca per primo e in quale turno potrebbe incontrare altre teste di serie alte.
- **Bye**: quando il numero di partecipanti non completa un tabellone perfetto, alcune posizioni
  "passano il turno" senza giocare. La schermata le distribuisce seguendo sempre la stessa regola,
  mai a caso.
- **Vincoli di sorteggio**: regole dichiarate (ad esempio, che due partecipanti dello stesso club non
  si affrontino al primo turno) che il sorteggio rispetta automaticamente — la schermata non
  permette di salvare un sorteggio che le violi.

## Quando può essere rifatto

Il sorteggio può essere rifatto finché la fase non è iniziata. Una volta che la fase è in corso,
rifare il sorteggio non avrebbe più senso con partite già giocate — la schermata non lo permette a
quel punto.

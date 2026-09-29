---
title: Dettaglio Statistiche Giocatore
description: Il totale torneo e il dettaglio partita per partita sul profilo pubblico del giocatore.
capabilities:
  - tournament-engine/player-statistics-drilldowns
roles:
  - viewer
  - broadcaster
---

## Panoramica

La pagina del profilo pubblico di un giocatore mostra una riga con il totale del torneo e un
dettaglio partita per partita per ogni tabella di classifica a livello persona dichiarata dalla
disciplina del torneo — uno spettatore passa da una tabella dichiarata all'altra (ad esempio
"capocannonieri" e "assist" di una disciplina) tramite un selettore etichettato, senza lasciare il
profilo.

## Totale Torneo vs. Righe Partita

- La riga **totale torneo** mostra ogni tipo di colonna dichiarato dalla tabella: valori atomici
  (collettori) ed eventuali rapporti compositi o calcolati sull'intero torneo (ad esempio, gol a
  partita).
- Ogni **riga partita** mostra solo le colonne atomiche (di tipo collettore) di quella singola
  partita — un rapporto composito o calcolato dipende da più partite e quindi non compare mai in
  una riga partita. Le righe partita sono ordinate cronologicamente per fase e numero partita, e
  identificano la partita tramite il suo numero pubblico di fase/partita, mai un identificativo
  interno.

## Quando un Giocatore Non Ha Statistiche Registrate

Un giocatore senza presenza in rosa nelle partite concluse del torneo vede uno stato vuoto
esplicito nella sezione statistiche del torneo, invece di una tabella che lasci intendere partite
con valori a zero mai disputate.

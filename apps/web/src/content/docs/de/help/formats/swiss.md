---
title: Schweizer System
description: Paarungsmechaniken, Punktegruppen, Springer (Floaters) und Freilose (Byes).
capabilities:
  - tournament-engine/tournament-fixture-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Überblick

Das Schweizer System paart Teilnehmer über mehrere Runden ohne direktes Ausscheiden. Im Gegensatz zu K.-o.-Turnieren oder Rundenturnieren (Round Robin) spielen die Teilnehmer eine festgelegte Rundenzahl gegen Gegner mit gleichem oder sehr ähnlichem Punktestand.

## Paarungsmechanik

- **Punktegruppen**: Nach der ersten Runde werden die Teilnehmer nach ihren erspielten Punkten gruppiert (z. B. 2-0, 1-1, 0-2).
- **Keine Mehrfachbegegnungen**: Zwei Kontrahenten spielen in derselben Schweizer Phase nie zweimal gegeneinander.
- **Springer (Floaters)**: Bei ungerader Spielerzahl in einer Punktegruppe springt ein Teilnehmer in die Nachbargruppe über.
- **Freilose (Byes)**: Bei ungerader Gesamtteilnehmerzahl erhält der am niedrigsten platzierte Teilnehmer ohne bisheriges Freilos ein Bye (1 Sieg mit Differenz 0).

## Punktesysteme

- `match-wins`: Wertung nach Matches (1 Punkt Sieg, 0,5 Unentschieden, 0 Niederlage).
- `game-points`: Berücksichtigt einzelne Spiel- oder Satzdifferenzen.

## Tabelle und Feinwertung

Die Tabelle nutzt Feinwertungen wie Buchholz und Sonneborn-Berger, um faire Platzierungen für Playoff-Einzüge zu ermitteln.

## Nächste Runde erzeugen

Schweizer und K.-o.-Phasen bilden jede Runde aus der vorherigen; die Runde wird daher erst erzeugt, wenn die vorige abgeschlossen ist.

- **Je Zone**: Runden, Paarungen und Ergebnisse gehören zu einer Zone. Eine Phase mit mehreren Zonen schaltet jede Zone einzeln weiter, und eine Zone paart nie Teilnehmende einer anderen Zone.
- **Wo**: Sobald die Phase gesetzt ist, bietet die Phasenansicht für jede Zone mit Schweizer System oder K.-o.-System die Aktion **Nächste Runde erzeugen**. Zonen mit anderem Format, etwa Jeder-gegen-jeden, haben sie nicht.
- **Wann sie abgelehnt wird**: Eine Zone rückt nicht vor, solange ein Spiel ihrer aktuellen Runde offen ist. Das sperrt nur diese Zone; die übrigen können weiterrücken.
- **Über die API**: `POST .../stages/{stageNumber}/rounds/next` mit `{ "zoneNumber": 2 }`. Die Zone ist Pflicht, wenn die Phase mehrere hat; eine Phase mit einer einzigen Zone braucht keinen Body.

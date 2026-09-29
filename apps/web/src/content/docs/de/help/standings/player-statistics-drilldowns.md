---
title: Spielerstatistik-Aufschlüsselung
description: Turniergesamtwert und Spiel-für-Spiel-Aufschlüsselung im öffentlichen Spielerprofil.
capabilities:
  - tournament-engine/player-statistics-drilldowns
roles:
  - viewer
  - broadcaster
---

## Übersicht

Die öffentliche Spielerprofilseite eines Turniers zeigt eine Turniergesamtzeile und eine
Spiel-für-Spiel-Aufschlüsselung für jede vom Turnierregelwerk deklarierte personenbezogene
Ranglistentabelle — ein Zuschauer wechselt über eine beschriftete Auswahl zwischen den deklarierten
Tabellen (z. B. "Torschützen" und "Vorlagen" einer Disziplin), ohne das Profil zu verlassen.

## Turniergesamtwert vs. Spielzeilen

- Die **Turniergesamtzeile** zeigt jede von der Tabelle deklarierte Spaltenart: atomare
  (Sammler-)Werte sowie jede zusammengesetzte oder berechnete Kennzahl über das gesamte Turnier
  hinweg (z. B. Tore pro Spiel).
- Jede **Spielzeile** zeigt nur die atomaren (Sammler-)Werte dieses einen Spiels — eine
  zusammengesetzte oder berechnete Kennzahl hängt von mehr als einem Spiel ab und erscheint daher
  nie in einer Spielzeile. Spielzeilen sind chronologisch nach Phase und Spielnummer geordnet und
  identifizieren das Spiel über seine öffentliche Phasen-/Spielnummer, niemals über eine interne ID.

## Wenn ein Spieler keine erfassten Statistiken hat

Ein Spieler ohne Kaderauftritt in den abgeschlossenen Spielen des Turniers sieht einen expliziten
Leerzustand im Turnierstatistik-Bereich, statt einer Tabelle, die nie stattgefundene
Nullwert-Spiele suggeriert.

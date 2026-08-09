---
title: Live-Spielkonsole
description: Was die Spielkonsole tut, und was nach dem Eintragen eines Ergebnisses nicht mehr geändert werden kann.
---

## Wofür dieser Bildschirm ist

Dies ist der Betriebsbildschirm für ein laufendes Spiel: Ereignisse und Segmente erfassen, während
sie geschehen, und das Endergebnis eintragen, wenn das Spiel endet. Was hier geschieht, wird live auf
den öffentlichen Bildschirm des Turniers übertragen.

## Wichtige Felder

- **Ereignis**: ein punktuelles Geschehen im Spiel (ein Punkt, eine Karte, eine Auswechslung),
  erfasst mit seinem genauen Zeitpunkt — es bildet die rekonstruierbare Historie des Spiels, nicht
  nur den Endstand.
- **Segment**: eine Unterteilung des Spiels mit eigener Uhr (ein Satz, eine Periode). Uhr und
  Ergebnis werden pro Segment verwaltet, nicht als eine einzige Stoppuhr für das ganze Spiel.
- **Ergebnis**: das Endergebnis des Spiels, genau einmal eingetragen. Nach dem Eintragen wird es
  nicht von diesem Bildschirm aus überschrieben — jede spätere Korrektur läuft über den
  protokollierten Korrektur-/Ersetzungsablauf, nicht durch erneutes Laden hier.

## Was nach dem Eintragen des Ergebnisses nicht möglich ist

Sobald das Spiel beendet ist, erlaubt dieser Bildschirm nicht mehr, weiter Ereignisse hinzuzufügen,
als würde das Spiel fortgesetzt, noch das Ergebnis direkt neu zu laden. Das ist beabsichtigt: es
schützt die Integrität der bereits veröffentlichten Historie.

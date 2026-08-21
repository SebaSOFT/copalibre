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

## Arbeiten mit einer unzuverlässigen Verbindung

Die Verbindung am Spielfeldrand bricht ab. Dieser Bildschirm ist genau dafür gebaut: Ein Ereignis
erfassen, die Uhr anpassen, einen Kader auswählen oder ein Spiel abschließen schreibt zuerst in eine
dauerhafte lokale Warteschlange — _bevor_ überhaupt versucht wird, es zu senden — sodass ein
Verbindungsabbruch nie etwas verloren gehen lässt, das bereits erledigt wurde.

- **Der Synchronisierungsstatus** ist immer oben am Bildschirm sichtbar: ob eine Verbindung besteht,
  wie viele Aktionen noch auf das Senden warten, und wann die letzte tatsächlich durchgegangen ist.
- **Eine wartende Aktion bleibt wartend**, nicht verloren, bei einer instabilen Verbindung, einem
  Funkloch oder selbst beim Schließen und erneuten Öffnen dieses Bildschirms — erneutes Öffnen
  nimmt das Senden alles noch Wartenden wieder auf.
- **Sobald die Verbindung zurückkehrt**, wird alles Wartende automatisch gesendet, in der
  Reihenfolge, in der es erfolgt ist.
- **Eine abgelehnte Aktion** — eine, die der Server auch live abgelehnt hätte, etwa eine
  Kaderänderung, die nach Spielende eingereicht wurde — wird deutlich mit dem Grund angezeigt,
  damit klar ist, was Aufmerksamkeit braucht. Sie blockiert nie, was danach in der Warteschlange
  steht.

Was dieser Bildschirm nicht tut: eine Eingabe oder Auswahl wiederherstellen, die nie tatsächlich
gesendet wurde. War gerade eine Bearbeitung im Gange, als die Verbindung abbrach, geht diese
spezifische Eingabe wie gewohnt verloren — nur bereits versuchte Aktionen sind geschützt.

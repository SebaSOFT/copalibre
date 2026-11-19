---
title: Live-Spielkonsole
description: Was die Spielkonsole tut, und was nach dem Eintragen eines Ergebnisses nicht mehr geändert werden kann.
capabilities:
  - live-operations/live-match-console
  - live-operations/live-match-operations
  - live-operations/realtime-events
  - tournament-engine/declared-tagging
roles:
  - referee
  - admin
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

## Die Uhr steuern

Jeder Abschnitt hat seine eigene Uhr. Welche Schaltflächen unter dem ausgewählten Abschnitt erscheinen, hängt von seinem Zustand ab:

- **Spiel starten** beginnt ein angesetztes Spiel und startet seinen ersten Abschnitt.
- **Abschnitt starten** startet einen Abschnitt, der noch nicht gelaufen ist.
- **Pausieren** und **Abschnitt beenden** erscheinen, solange ein Abschnitt läuft. Pausieren hält die Uhr an, wo sie steht; ein pausiertes Spiel läuft weiter.
- **Fortsetzen** und **Abschnitt beenden** erscheinen bei einem angehaltenen Abschnitt mit bereits verstrichener Zeit.
- **Abschnitt wieder öffnen…** erscheint bei einem beendeten Abschnitt. Die Konsole fragt nach einem Grund, setzt den Abschnitt auf Pause zurück und behält seine Zeit bei; die Uhr läuft erst wieder mit Fortsetzen.

Es läuft immer nur ein Abschnitt. Abschnitt starten und Fortsetzen werden nicht angeboten, solange ein anderer Abschnitt läuft; die Konsole nennt ihn. Pausieren oder beenden Sie diesen zuerst.

Die Abschnittsauswahl zeigt einen angehaltenen Abschnitt mit Zeit als **pausiert**. Bei einem abgeschlossenen Spiel gibt es keine Uhraktion mehr.

**Zeit korrigieren** setzt die Zeit des ausgewählten Abschnitts. Sie wird als Minuten und Sekunden (`20:50`) oder als volle Minuten (`45`) eingegeben. Der Zustand bleibt erhalten: ein laufender Abschnitt läuft weiter, ein pausierter bleibt pausiert. Bei einem abgeschlossenen Spiel ist das nicht möglich.

Diese Schaltflächen halten den Moment fest, in dem tatsächlich gepfiffen wurde. Einen falsch erfassten Wert korrigieren Sie mit Zeit korrigieren. Jede Änderung landet in derselben Prüfspur, mit wer, wann, sowie Zustand und Uhrzeit davor und danach. Das Wiedereröffnen speichert außerdem den Grund.

## Das Ereignisprotokoll lesen

Das Protokoll startet eingeklappt und zeigt die drei jüngsten Ereignisse, damit die
Erfassungssteuerung während der Arbeit auf einen Bildschirm passt. Was gerade erfasst wurde, ist
immer darunter: Einklappen nimmt alte Historie aus dem Blick, nie die letzte Bestätigung.
**Vollständigen Verlauf anzeigen** öffnet das ganze Spiel.

## Was nach dem Eintragen des Ergebnisses nicht möglich ist

Sobald das Spiel beendet ist, erlaubt dieser Bildschirm nicht mehr, weiter Ereignisse hinzuzufügen,
als würde das Spiel fortgesetzt, noch das Ergebnis direkt neu zu laden. Das ist beabsichtigt: es
schützt die Integrität der bereits veröffentlichten Historie.

## Arbeiten mit einer unzuverlässigen Verbindung

Die Verbindung am Spielfeldrand bricht ab. Dieser Bildschirm ist genau dafür gebaut: Ein Ereignis
erfassen, die Uhr anpassen, einen Kader auswählen oder ein Spiel abschließen schreibt zuerst in eine
dauerhafte lokale Warteschlange — _bevor_ überhaupt versucht wird, es zu senden — sodass ein
Verbindungsabbruch nie etwas verloren gehen lässt, das bereits erledigt wurde.

- **Ein Verbindungspunkt** ist immer oben am Bildschirm sichtbar: gefüllt, wenn eine Verbindung
  besteht, hohl, wenn nicht. Mit der Maus darauf zeigen oder ihn fokussieren zeigt, wie viele
  Aktionen noch auf das Senden warten und wann die letzte tatsächlich durchgegangen ist.
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

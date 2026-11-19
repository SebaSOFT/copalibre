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

Jedes Segment hat seine eigene Uhr. Welche Schaltflächen unter dem ausgewählten Segment erscheinen, hängt von seinem Zustand ab:

- **Spiel starten** beginnt ein angesetztes Spiel und startet sein erstes Segment.
- **Segment starten** startet ein Segment, das noch nicht gelaufen ist.
- **Pausieren** und **Segment beenden** erscheinen, solange ein Segment läuft. Pausieren hält die Uhr an, wo sie steht; ein pausiertes Spiel läuft weiter.
- **Fortsetzen** und **Segment beenden** erscheinen bei einem angehaltenen Segment mit bereits verstrichener Zeit.
- **Segment wieder öffnen…** erscheint bei einem beendeten Segment. Die Konsole fragt nach einem Grund, setzt das Segment auf Pause zurück und behält seine Zeit bei; die Uhr läuft erst wieder mit Fortsetzen.

Es läuft immer nur ein Segment. Segment starten und Fortsetzen werden nicht angeboten, solange ein anderes Segment läuft; die Konsole nennt es. Pausieren oder beenden Sie dieses zuerst.

Die Segmentauswahl zeigt ein angehaltenes Segment mit Zeit als **pausiert**. Ein geschlossenes Spiel (beendet, durch Forfait oder nicht erforderlich) bietet keine Uhraktion mehr.

**Korrigieren** setzt die Zeit des ausgewählten Segments. Sie wird im Feld **Zeit (mm:ss)** eingetragen, als Minuten und Sekunden (`20:50`) oder als volle Minuten (`45`). Der Zustand bleibt erhalten: ein laufendes Segment läuft weiter, ein pausiertes bleibt pausiert. Bei einem geschlossenen Spiel ist das nicht möglich.

Diese Schaltflächen halten den Moment fest, in dem tatsächlich gepfiffen wurde. Einen falsch erfassten Wert korrigieren Sie mit **Korrigieren**. Jede Änderung landet in derselben Prüfspur, mit wer, wann, sowie Zustand und Uhrzeit davor und danach. Das Wiedereröffnen speichert außerdem den Grund.

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

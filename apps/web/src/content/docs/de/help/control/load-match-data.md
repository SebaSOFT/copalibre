---
title: Spieldaten laden
description: Massen-/strukturierte Eingabe für ein Spiel, das ohne anwesende Live-Konsole gespielt wurde.
---

## Wofür dieser Bildschirm ist

Nicht jedes Spiel hat einen Bediener an der Konsole, während es gespielt wird. Mit diesem Bildschirm
können Sie den Kader eines Spiels, seine vollständige Ereignishistorie und sein Endergebnis gemeinsam
im Nachhinein erfassen — für einen Verein, der ein Auswärtsspiel meldet, oder einen Organisator, der
einen Rückstau an Papier-Spielberichten aufholt.

Er gilt nur für ein angesetztes Spiel ohne zuvor erfasste Aktivität. Ein Spiel, das bereits Ereignisse
oder Segmente aus einer Live-Sitzung hat, sollte stattdessen über die
[Live-Konsole](/help/control/match-console) abgeschlossen werden — eine zweite Historie über eine
bestehende Live-Historie zu laden würde mit dieser in Konflikt geraten.

## Wichtige Felder

- **Kader**: dieselbe Spielerauswahl pro Teilnehmer, die auch die Live-Konsole bietet, bis zum Absenden
  nur auf diesem Bildschirm gehalten — nichts wird für das Spiel gespeichert, bis der gesamte Stapel
  gesendet wird.
- **Abschnitte**: jede Periode/Halbzeit/jeder Satz, den das Spiel hatte, in Spielreihenfolge, jeweils
  bereits mit ihrer Dauer als abgeschlossen markiert. Hier gibt es keine Live-Uhr.
- **Ereignisse**: die vollständige Historie des Spiels, in der Reihenfolge, in der sie tatsächlich
  stattfand, jeweils mit ihrem eigenen echten Zeitstempel — nicht dem Moment, in dem Sie es gerade
  erfassen.
- **Ergebnis**: das Endergebnis des Spiels, zusammen mit allem oben Genannten gesendet.

## Eine Übermittlung, alles oder nichts

Ein Klick auf „Spieldaten senden“ sendet Kader, jedes Ereignis und das Ergebnis gemeinsam in einer
einzigen Transaktion. Ist auch nur ein Ereignis ungültig, wird nichts gespeichert — die gesamte
Übermittlung wird abgelehnt, und Ihre Eingaben bleiben auf dem Bildschirm erhalten, damit Sie den einen
fehlgeschlagenen Eintrag korrigieren und erneut senden können, statt von vorne zu beginnen.

## Import aus einer Tabelle

Der Abschnitt „Aus CSV importieren“ lädt eine Tabelle zur Überprüfung in denselben Editor oben — er
umgeht niemals den Überprüfungsschritt oder die Validierung der Übermittlung. Laden Sie die Vorlage
herunter, um das genaue Spaltenformat zu erfahren, das eine Datei benötigt.

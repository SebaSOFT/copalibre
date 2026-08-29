---
title: Korrekturen und Offline-Konflikte
description: Eine Korrektur vorab ansehen, was eine Serienkorrektur bewirkt, und warum ein in der Warteschlange stehendes Ergebnis gegen eine annullierte Begegnung erhalten bleibt, statt verworfen zu werden.
capabilities:
  - tournament-engine/result-correction-authority
  - live-operations/live-match-operations
roles:
  - admin
  - referee
---

## Warum eine Korrektur nie eine direkte Bearbeitung ist

Ein berechnetes Ergebnis kann nicht überschrieben werden. Sobald eine Begegnung abgeschlossen ist, läuft
eine Änderung stattdessen über eine geprüfte Korrektur — eine ausdrückliche Aktion, die festhält, wer sie
vorgenommen hat, wann, warum, den vorherigen Zustand und den resultierenden Zustand. Dies ist der
einzige Weg zurück zu einem abgeschlossenen Ergebnis, von der [Live-Konsole](/help/control/match-console),
den [geladenen Begegnungsdaten](/help/control/load-match-data) oder dem
[Spielplan](/help/control/schedule) aus.

## Vorschau vor dem Anwenden

Eine Korrektur zeigt ihre eigenen nachgelagerten Auswirkungen vorab an, bevor sie angewendet wird:
welche Tabellen, Übersichten und Projektionen sich ändern würden, wenn sie angewendet würde. Nichts wird
neu berechnet, bis die Korrektur ausdrücklich bestätigt wird.

Eine Korrektur schlägt nicht automatisch in eine Phase durch, die das korrigierte Ergebnis bereits
verwendet hat — ein Gruppenphasen-Ergebnis, das einen bereits gestarteten Turnierbaum speist, wird
diesen nicht stillschweigend neu mischen. Die Korrektur wird trotzdem auf den Datensatz angewendet; die
nachgelagerte Phase wird zur eigenen Prüfung des Organisators markiert, statt für ihn automatisch
umgeschrieben zu werden.

## Eine Begegnung einer Serie korrigieren

Das Korrigieren einer Begegnung einer [Serie](/help/control/series) zeigt vorab die Auswirkung auf die
gesamte Serie, nicht nur auf diese eine Begegnung — ein korrigierter Spielstand kann umkehren, welche
Seite ein Best-of anführt, oder ein Aggregat-Ergebnis ändern, und die Vorschau zeigt das, bevor die
Korrektur bestätigt wird.

## Warum ein Offline-Ergebnis in der Warteschlange abgelehnt und trotzdem behalten werden kann

Die Live-Konsole arbeitet offline weiter und sendet in der Warteschlange stehende Aktionen, sobald die
Verbindung wiederhergestellt ist. Ein in der Warteschlange stehendes Ergebnis kann beim erneuten
Verbinden abgelehnt werden — meist, weil die betreffende Begegnung durch eine Serienentscheidung
annulliert wurde, während der Bediener offline erfasste, und nie gespielt wird. Dieser Eintrag in der
Warteschlange wird nicht verworfen: Sein vollständiger Inhalt bleibt abgelehnt in der Warteschlange
erhalten, damit der Bediener beurteilen kann, ob das Ergebnis woanders hingehört — typischerweise als
Korrektur einer früheren Begegnung derselben Serie — statt das Erfasste zu verlieren. Eine Ablehnung bei
einem Eintrag blockiert nie das Abarbeiten der restlichen Warteschlange.

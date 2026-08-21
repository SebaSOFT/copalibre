---
title: Betrieb und Nachvollziehbarkeit
description: Regeln für den Spielbetrieb und die Korrektur von Turnierdaten.
---

## Spielkonsole

Erfassen Sie Ereignisse und die Uhr über eine autorisierte Konsole. Die öffentliche Projektion wird
aus dauerhaften Ereignissen aktualisiert und behält eine Version für die Wiederherstellung. Jede
Aktion wird vor dem Senden zuerst in eine lokale Warteschlange geschrieben, sodass eine
abgebrochene Verbindung sie für einen automatischen erneuten Versuch vormerkt, statt sie zu
verlieren — siehe [Live-Spielkonsole](/de/help/control/match-console/) für das vollständige
Verhalten.

## Korrekturen

Überschreiben Sie niemals ein berechnetes Ergebnis. Eine Korrektur erfordert einen Grund, einen
Verursacher und eine Auswirkungsvorschau, bevor sie die Tabelle oder nachgelagerte Phasen
beeinflusst.

## Aufstellung

Die Aufstellung stellt die von einem Teilnehmer für ein Spiel ausgewählten Spieler dar. Sie stellt
keine dauerhafte Beziehung zwischen einer Person und einem Team dar.

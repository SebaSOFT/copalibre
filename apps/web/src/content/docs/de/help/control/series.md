---
title: Mehrspielige Serien
description: Eine Serie deklarieren, was jede Auflösungsklasse bewirkt, ihre Begegnungen planen und eine Serie im öffentlichen Turnierbaum lesen.
capabilities:
  - tournament-engine/match-series
roles:
  - admin
  - referee
  - broadcaster
  - viewer
---

## Was eine Serie ist

Eine Serie entscheidet eine Paarung zwischen zwei Teilnehmern mit mehr als einer Begegnung statt mit
einer. Sie hat keinen eigenen Bildschirm — sie wird im Assistenten für die
[Turniererstellung](/help/control/tournament-authoring) deklariert, auf dem
[Spielplan](/help/control/schedule) geplant, Begegnung für Begegnung auf der
[Live-Konsole](/help/control/match-console) erfasst oder nachträglich
[geladen](/help/control/load-match-data), und im öffentlichen Turnierbaum gelesen. Eine Paarung ohne
deklarierte Serie erzeugt genau eine Begegnung und verhält sich exakt wie bisher.

## Eine Serie deklarieren

Eine Serie deklariert eine Spanne (wie viele Begegnungen sie umfassen kann) und eine Auflösungsklasse:

- **Best-of**: Die Serie endet, sobald eine Seite genug Begegnungen gewonnen hat, um die verbleibenden
  bedeutungslos zu machen. Eine Best-of-Spanne muss ungerade sein, damit eine Mehrheit immer möglich
  ist.
- **Aggregat**: Der Sieger ist, wer über alle Begegnungen zusammengerechnet insgesamt mehr erzielt hat
  — nicht, wer mehr einzelne Begegnungen gewonnen hat.
- **Punkte pro Runde**: Jede Begegnung der Serie vergibt eigene Punkte, und Sieger der Serie ist, wer
  insgesamt die meisten sammelt.

Eine Serie kann auch als auf neutralem Platz ausgetragen markiert werden, und ihre Tabelle kann jede
Begegnung einzeln zählen (Standard — jede Begegnung fügt ihren eigenen Sieg, ihr Unentschieden oder
ihre Niederlage hinzu) oder die gesamte Serie (die ganze Serie fügt ein einziges Ergebnis hinzu, egal
wie viele Begegnungen dafür nötig waren).

## Planen und spielen

Jede Begegnung der Serie erhält ihren eigenen Slot und ihre eigenen Offiziellen auf dem Bildschirm
[Spielplan](/help/control/schedule). Sobald die Serie entschieden ist — eine Seite hat sich ein Best-of
gesichert, oder es verbleiben zu wenige Runden, um das Ergebnis noch zu ändern — werden ihre restlichen
Begegnungen als nicht mehr erforderlich markiert, statt ungeplant oder abgebrochen zu erscheinen.

## Was Sie hier nicht tun können

Eine bereits gespielte und erfasste Begegnung kann nicht durch erneutes Deklarieren der Serie
"zurückgespielt" werden: Das Korrigieren einer abgeschlossenen Begegnung einer entschiedenen Serie läuft
über den [geprüften Korrekturablauf](/help/control/corrections), der ausdrücklich verhindert, dass eine
Korrektur in eine Phase durchschlägt, die das Ergebnis der Serie bereits verwendet hat.

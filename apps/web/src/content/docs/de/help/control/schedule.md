---
title: Spielplan
description: Weisen Sie jeder Begegnung einen Slot zu — eine festgelegte Startzeit, einen Austragungsort und eine Dauer — sowie die Offiziellen, die sie betreuen.
capabilities:
  - control-web/match-scheduling
  - tournament-engine/schedule-slots
roles:
  - admin
---

## Wofür dieser Bildschirm ist

Jeder Begegnung einer Phase wird hier ein Slot zugewiesen — eine Kalenderansicht und eine Listenansicht
über denselben Stapel. Ein Slot wird nicht für jede Begegnung von Hand eingegeben: Er ist eine Startzeit,
ein Austragungsort und eine Dauer, die einmal im Ressourcenpool
[Austragungsorte & Offizielle](/help/control/resources) festgelegt werden, und der Spielplan-Editor
weist einer Begegnung einen davon zu — nicht umgekehrt. Offizielle werden pro Begegnung aus demselben
Ressourcenpool aktiviert.

## Granularität der Begegnung, nicht der Paarung

Die Planung arbeitet auf Ebene der Begegnung, nicht der Paarung zwischen zwei Teilnehmern. Eine Paarung
mit nur einer Begegnung hat eine Begegnung zu platzieren; eine [Serie](/help/control/series) über fünf
hat fünf, jede mit eigenem Slot und eigenen Offiziellen — die vierte und fünfte Begegnung der Serie
können in reservierten Slots liegen, die nie gefüllt werden, wenn die Serie vorzeitig entschieden wird,
und der Editor markiert sie als nicht mehr erforderlich, statt sie ungeplant erscheinen zu lassen.

## Vorschau vor der Veröffentlichung

Bevor irgendetwas veröffentlicht wird, zeigt der Editor eine Vorschau des Stapels und jeden Konflikt —
ein doppelt gebuchter Austragungsort oder Offizieller, eine Verletzung der Ruheregel — und benennt die
betroffenen Begegnungen sowie jede bereits veröffentlichte Begegnung, die der Stapel verschieben würde.
Die Veröffentlichung ist atomar: Jede Zuweisung im Stapel tritt gemeinsam in Kraft, oder keine.

## Was Sie hier nicht tun können

Das Umplanen einer bereits abgeschlossenen Begegnung wird abgelehnt: Ihr Zeitplan ist jetzt ein
Protokolleintrag, kein Plan mehr, und eine Änderung läuft stattdessen über den
[geprüften Korrekturablauf](/help/control/corrections). Eine Begegnung ohne zugewiesenen Slot wird
explizit als nicht geplant angezeigt — nie stillschweigend weggelassen und nie mit einem Freilos
verwechselt. Das Erstellen oder Bearbeiten eines Austragungsorts oder Offiziellen erfolgt unter
[Austragungsorte & Offizielle](/help/control/resources), nicht hier.

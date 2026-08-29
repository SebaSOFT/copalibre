---
title: Auslosung und Setzung
description: Was Setzpositionen, Freilose und die Auslosungsbeschränkungen sind, die dieser Bildschirm beachtet.
capabilities:
  - tournament-engine/bracket-seeding-builder
  - tournament-engine/draw-constraints
roles:
  - admin
---

## Wofür dieser Bildschirm ist

Erstellt die Auslosung/das Bracket einer Phase: weist jedem Teilnehmer eine Startposition (eine
„Setzposition“) zu, unter Beachtung der für diese Disziplin/dieses Format deklarierten
Beschränkungen.

## Wichtige Felder

- **Setzposition (seed)**: die Setzposition eines Teilnehmers im Bracket — bestimmt, gegen wen er
  zuerst spielt und in welcher Runde er auf andere hoch gesetzte Teilnehmer treffen könnte.
- **Freilos (bye)**: wenn die Teilnehmerzahl kein perfektes Bracket ergibt, „rücken“ manche
  Positionen ohne zu spielen „vor“. Der Bildschirm verteilt sie stets nach derselben Regel, nie
  zufällig.
- **Auslosungsbeschränkungen**: deklarierte Regeln (zum Beispiel, dass zwei Teilnehmer desselben
  Vereins nicht in der ersten Runde aufeinandertreffen), die die Auslosung automatisch beachtet —
  der Bildschirm lässt keine Auslosung speichern, die sie verletzt.

## Wann sie neu gemacht werden kann

Die Auslosung kann neu gemacht werden, solange die Phase nicht begonnen hat. Sobald die Phase
läuft, würde eine erneute Auslosung mit bereits gespielten Partien keinen Sinn mehr ergeben — der
Bildschirm erlaubt dies zu diesem Zeitpunkt nicht.

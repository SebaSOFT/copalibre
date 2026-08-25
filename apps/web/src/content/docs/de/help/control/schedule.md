---
title: Spielplan
description: Weisen Sie den Begegnungen einer Phase eine Zeit, einen Austragungsort und Offizielle zu, prüfen Sie Konflikte in der Vorschau und veröffentlichen Sie dann.
---

## Wofür dieser Bildschirm ist

Den Begegnungen einer Phase werden hier eine Startzeit, eine Dauer, ein Austragungsort und Offizielle
zugewiesen — eine Kalenderansicht und eine Listenansicht über denselben Stapel. Nichts wird von einem
Algorithmus geplant: jede Zuweisung ist eine eigene Entscheidung des Organisators, erstellt, in der
Vorschau geprüft und dann explizit veröffentlicht.

## Wichtige Felder

- **Startzeit / Dauer**: wann eine Begegnung zum Spielen reserviert ist und wie lange die Ressource
  belegt wird — nicht, wie lange das Spiel tatsächlich dauert, was niemand im Voraus weiß.
- **Austragungsort / Offizielle**: zugewiesen aus der Liste der
  [Austragungsorte und Offiziellen](/help/control/resources) der Organisation.

## Vorschau vor der Veröffentlichung

Bevor etwas veröffentlicht wird, zeigt der Editor den Stapel in der Vorschau und weist jeden Konflikt
aus — einen doppelt gebuchten Austragungsort oder Offiziellen, eine Verletzung der Ruhezeitregel —
nennt dabei die betroffenen Begegnungen und nennt jede bereits veröffentlichte Begegnung, die der
Stapel verschieben würde. Die Veröffentlichung ist atomar: jede Zuweisung im Stapel tritt gemeinsam in
Kraft, oder keine tut es.

## Was Sie hier nicht tun können

Eine Begegnung umzuplanen, deren Ergebnis bereits abgeschlossen ist, wird abgelehnt: ihr Termin ist
jetzt ein Protokolleintrag, kein Plan mehr, und eine Änderung läuft stattdessen über den protokollierten
Korrekturablauf. Ein Teilnehmer ohne zugewiesene Begegnung wird explizit als ohne geplantes Spiel
angezeigt — nie stillschweigend weggelassen und nie mit einem Freilos im Bracket verwechselt.

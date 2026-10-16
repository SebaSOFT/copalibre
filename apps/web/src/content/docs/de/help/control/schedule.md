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

## Wie lange ein Spiel sein Zeitfenster belegt

Ein angesetztes Spiel belegt den Beginn seines Zeitfensters plus seine **geschätzte Dauer**: die
reguläre Spielzeit der Disziplin (zum Beispiel zwei Halbzeiten zu 25 Minuten, also 50 Minuten), mit
der turniereigenen Zahl der Spielabschnitte. Eine Disziplin ohne reguläre Spielzeit (etwa in Sätzen
gespielt) belegt das ganze Zeitfenster. Die Spielstätte bleibt zusätzlich für den Wechsel zwischen
zwei Spielen reserviert. Kurze Zeitfenster verdecken also nie einen Konflikt: Zwei 50-Minuten-Spiele
im Abstand von fünfzehn Minuten auf demselben Platz sind ein Spielstättenkonflikt.

Die Ruheregel stammt aus den [Einstellungen](/help/control/tournament-authoring) des Turniers: die
Mindestpause zwischen dem Ende eines Spiels eines Teilnehmers und dem Beginn seines nächsten. Ein
Turnier ohne Angabe wendet keine Ruheregel an.

## Ein veröffentlichtes Spiel zu ändern braucht einen Grund

Ein bereits **veröffentlichtes** Spiel zu verschieben, neu zu besetzen oder herauszunehmen fragt vor
dem Veröffentlichen nach dem Grund. Der Dialog listet jedes geänderte veröffentlichte Spiel mit alter
und neuer Zeit und Spielstätte. Geben Sie einen Grund für den ganzen Stapel an — wählen Sie einen
häufigen, einen zuletzt verwendeten oder geben Sie Ihren eigenen ein — oder markieren Sie ein Spiel
als Ausnahme mit eigenem Grund (die Schaltfläche „Anderer Grund“ der Zeile, oder mehrere Zeilen
auswählen und gemeinsam markieren). Veröffentlichen bleibt deaktiviert, bis jedes aufgeführte Spiel
abgedeckt ist. Vorheriges Zeitfenster, Spielstätte, Beginn und Offizielle bleiben mit Grund, Person
und Zeitpunkt erhalten. Ein Stapel erster Ansetzungen wird ohne Nachfrage veröffentlicht.

Mit der Tastatur: ↑/↓ wechseln zwischen Spielen, die Leertaste wählt aus, E markiert eine Ausnahme,
Enter veröffentlicht und Esc schließt: zuerst die offene Vorschlagsliste, dann den Dialog.

## Ein Spiel aus seinem Zeitfenster nehmen

„Aus dem Zeitfenster nehmen“ entfernt ein angesetztes Spiel im Rahmen des Stapels aus seinem
Zeitfenster: Die Vorschau zeigt es ohne Termin und listet die freiwerdenden Zeitfenster, damit ein
anderes Spiel in derselben Veröffentlichung eines davon übernehmen kann.

## Was Sie hier nicht tun können

Das Umplanen einer bereits abgeschlossenen Begegnung wird abgelehnt: Ihr Zeitplan ist jetzt ein
Protokolleintrag, kein Plan mehr, und eine Änderung läuft stattdessen über den
[geprüften Korrekturablauf](/help/control/corrections). Eine Begegnung ohne zugewiesenen Slot wird
explizit als nicht geplant angezeigt — nie stillschweigend weggelassen und nie mit einem Freilos
verwechselt. Das Erstellen oder Bearbeiten eines Austragungsorts oder Offiziellen erfolgt unter
[Austragungsorte & Offizielle](/help/control/resources), nicht hier.

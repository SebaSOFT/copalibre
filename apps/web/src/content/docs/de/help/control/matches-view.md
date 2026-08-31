---
title: Spielansicht
description: Eine übersichtliche Kartenliste der Spiele eines Turniers — Austragungsort, Uhr, letztes Ereignis und Tabellenkontext — auf der öffentlichen Website und im Kontrollpanel.
capabilities:
  - public-web/matches-view
  - control-web/matches-view
roles:
  - admin
  - viewer
  - broadcaster
  - referee
---

## Wofür dieser Bildschirm da ist

Unabhängig von der Struktur einer Phase — eine einzelne Gruppe, mehrere Zonen, oder eine mehrspielige
Serie — läuft es immer auf eine Liste von zu spielenden Begegnungen hinaus. Dieser Bildschirm ist genau
diese Liste, als Karten-Raster: standardmäßig das ganze Turnier, oder eingegrenzt auf eine Phase, eine
Zone/Gruppe, oder einen Status (live, bevorstehend, beendet) mit den Filtern oben. Er ergänzt den
[Turnierbaum](/help/control/tournament-authoring), statt ihn zu ersetzen — der Turnierbaum ist die
richtige Ansicht für den Fortschritt bei K.-o.-Runden; dieser Bildschirm ist die richtige Ansicht, um
Menge zu überblicken, besonders über mehrere gleichzeitige Rundenturnier-Gruppen, die ein Turnierbaum
auf keine gute Weise gleichzeitig zeigen kann.

Es gibt zwei Versionen dieses Bildschirms, die sich dieselbe Karte teilen:

- **Öffentlich** (`/{organisation}/tournaments/{turnier}/matches`) — anonym, keine Anmeldung
  erforderlich.
- **Kontrollpanel** (`.../matches-view`) — erreichbar nur für einen Organisations-Admin oder einen
  Tournament-Admin mit Berechtigung für dieses Turnier, dieselbe Berechtigung, die der Bildschirm für
  interne Tabellen bereits verlangt.

## Was jede Karte zeigt

- **Status**: live, bevorstehend oder beendet, zusammen mit einem Symbol, damit der Status nie allein
  von der Farbe abhängt.
- **Uhr**: wird nur angezeigt, solange das Spiel läuft — die aktuell verstrichene Zeit, derselbe Wert,
  den die Live-Spielkonsole liest.
- **Austragungsort**: der Name des zugewiesenen Austragungsorts, sofern die Planung bereits einen
  zugewiesen hat.
- **Letztes Ereignis**: das zuletzt erfasste Ereignis, welches auch immer es ist — diese Karte behandelt
  nie einen bestimmten Ereignistyp als Sonderfall, sodass eine Disziplin, die ein neues deklariert (eine
  Bestätigung nach Videoüberprüfung, eine Auswechslung), korrekt erscheint, ohne dass sich an diesem
  Bildschirm etwas ändert.
- **Zone/Position oder Serienstatus** — nie beides auf derselben Karte:
  - Eine Paarung in einer Zonen-/Gruppenphase ohne deklarierte Serie zeigt den Namen der Zone/Gruppe
    (wenn die Phase mehr als die Standard-Einzelgruppe deklariert) und die aktuelle Tabellenposition
    jedes Teilnehmers.
  - Eine durch eine Serie entschiedene Paarung zeigt ihren Fortschritt und, sobald entschieden, ihren
    Gesamtstand — dieselbe Serien-Darstellung, die der [öffentliche Turnierbaum](/help/control/series)
    bereits verwendet.
- **Entscheidender Faktor**: bei einem beendeten Spiel, dessen Ergebnis einen Stichentscheid-Vergleich
  benötigte, um zwei gleichstehende Tabellenzeilen zu trennen, eine Zeile, die benennt, was entschied
  (zum Beispiel „entschieden durch das direkte Torverhältnis").

## Die Zeile zum entscheidenden Faktor gegenüber der vollständigen Spur

Die Zeile zum entscheidenden Faktor auf der öffentlichen Karte ist absichtlich eine Zusammenfassung,
nicht die vollständige Begründung — sie trägt nie die übrigen Schritte oder Zwischenwerte des internen
Vergleichs. Ein Organisator mit Berechtigung über die internen Tabellen dieses Turniers (ein Admin,
oder ein Tournament-Admin mit Berechtigung dafür) sieht stattdessen die vollständige Vergleichsspur, in
der Version derselben Karte im Kontrollpanel, genau wie sie der Spur-Ausklapper des Bildschirms für
interne Tabellen bereits zeigt. Niemand sieht eine Zwischenversion: Ein Betrachter sieht entweder die
einzeilige Zusammenfassung oder die vollständige Spur, nie eine teilweise geschwärzte Version.

## Was dieser Bildschirm NICHT tut

Er ist rein lesend. Keine Karte und keine Bedienung hier ändert den Status eines Spiels, erfasst ein
Ereignis, oder bearbeitet den Spielplan — diese Aktionen bleiben der
[Live-Spielkonsole](/help/control/match-console) und dem
[Spielplan-Editor](/help/control/schedule) vorbehalten. Dieser Bildschirm dient dazu, zu überblicken,
was gerade geschieht und was bereits geschehen ist, nicht dazu, ein Spiel zu steuern.

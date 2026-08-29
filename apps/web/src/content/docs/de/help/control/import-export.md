---
title: Import und Export
description: CSV-Massenimport von Teilnehmern sowie CSV/JSON-Export von Teilnehmern, Ergebnissen, Tabellen und Turnierkonfiguration.
capabilities:
  - control-web/data-import-export
roles:
  - admin
---

## Import

Teilnehmer werden per CSV auf dem Bildschirm
[Anmeldeprüfung](/help/control/registration-review) massenhaft importiert. Jede Zeile wird geprüft,
bevor irgendetwas geschrieben wird: Eine Zeile, die die Prüfung nicht besteht, wird mit ihrer Zeilennummer
und dem Grund gemeldet, und keine Zeile wird importiert, bis die gesamte Datei entweder akzeptiert oder
korrigiert und erneut hochgeladen wird — eine teilweise importierte Datei ist kein Zustand, den dieser
Bildschirm erzeugt. Eine zuvor von derselben Installation exportierte CSV-Datei lässt sich sauber wieder
importieren, sodass ein Roundtrip einer Teilnehmerliste (in einer Tabellenkalkulation bearbeiten,
zurückbringen) ein unterstützter Weg ist, kein Zufall.

## Export

- **Teilnehmer**: Einzel- oder Mannschaftskader, nach Alias — erreichbar von der
  [Anmeldeprüfung](/help/control/registration-review).
- **Ergebnisse und Tabellen**: die berechneten Ergebnisse und die Tabelle einer Phase, nach Alias —
  erreichbar von [Tabellen](/help/control/standings).
- **Turnierkonfiguration**: das vollständige Regelwerk, Überschreibungen und benutzerdefinierte
  Skripte als JSON, vom Organisations-Dashboard aus — dasselbe Dokument, das eine neue Installation
  reimportieren könnte, um die Regeln des Turniers zu reproduzieren, nicht dessen Ergebnisse.

Jeder Export ersetzt eine interne Datenbank-ID durch den öffentlichen Alias der Entität, sodass eine
exportierte Datei nie eine ID preisgibt, die außerhalb der Installation niemand sehen sollte.

## Was Sie hier nicht tun können

Der Import von Ergebnissen oder Tabellen wird nicht unterstützt — diese werden berechnet, nicht
eingegeben, und der einzige Weg, eines nachträglich zu ändern, ist der
[geprüfte Korrekturablauf](/help/control/corrections).

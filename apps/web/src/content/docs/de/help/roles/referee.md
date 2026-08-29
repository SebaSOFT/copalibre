---
title: Schiedsrichter
description: Was die Rolle referee tun kann, was sie erbt, und was sie nicht kann.
capabilities:
  - control-web/roles-permissions
roles:
  - referee
---

## Wofür diese Rolle da ist

Ein Spiel während es läuft betreiben: Ereignisse erfassen, die Uhr steuern, Timer auflösen, und eine
Aufstellung auswählen — die Konsole, die ein Offizieller vor Ort nutzt, ohne die umgebende
Turnierverwaltung.

## Was sie tun kann

<!-- GENERATED:CAPABILITIES:START -->

- `org.operate-match`

<!-- GENERATED:CAPABILITIES:END -->

`org.operate-match` allein zu besitzen ist nicht dasselbe wie für ein bestimmtes Spiel benannt zu sein
— die Spielkonsole prüft zusätzlich eine spielbezogene Zuweisung (`MATCH_CAPABILITIES`), bevor sie
einen Befehl zulässt, eine engere Befugnis als die, die die Organisationsrolle selbst gewährt.

## Was sie erbt

Nichts — referee besitzt die Fähigkeiten keiner anderen Rolle, und keine Rolle erbt von referee.

## Was sie nicht kann

Referee kann kein finalisiertes Spielergebnis korrigieren (`org.correct-match-results` — das ist
Befugnis von admin oder tournament-admin, nach dem Spiel ausgeübt, nicht während), und besitzt keine
der Fähigkeiten zur Turniervorbereitung: keine Phasen-, Zonen-, Gruppen-, Zeitplan-, Auslosungs- oder
Anmeldebefugnis, keine Berichtsprüfung, keine Benutzer- oder Vereinsverwaltung, keine
Organisationseinstellungen.

## Bildschirme, die sie sieht

Nur was `org.operate-match` erreicht — hauptsächlich die Live-Spielkonsole. Jeder andere
Navigationseintrag des Kontrollpanels, den sie sieht, verhält sich wie bei club-admin und
tournament-admin: jeder Bildschirm außer „Rollen", da referee ebenfalls nie `org.manage-users` besitzt.

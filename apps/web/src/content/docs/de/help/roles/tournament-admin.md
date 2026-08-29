---
title: Turnieradmin
description: Was die Rolle tournament-admin tun kann, was sie erbt, und was sie nicht kann.
capabilities:
  - control-web/roles-permissions
roles:
  - tournament-admin
---

## Wofür diese Rolle da ist

Befugnis, ein Turnier zu leiten — das, was diese Zuweisung benennt — ohne organisationsweite
Reichweite. Eine Organisation, die möchte, dass jemand einen einzelnen Wettbewerb von Anfang bis Ende
leitet, und sonst nichts, verwendet diese Rolle anstelle von Admin.

## Was sie tun kann

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.manage-display-tokens`
- `org.manage-registrations`
- `org.manage-schedule`
- `org.manage-seeding`
- `org.manage-stages`
- `org.manage-tournament-data`
- `org.manage-zones-groups`
- `org.operate-match`
- `org.review-reports`
- `org.view-internal-standings`
- `org.view-internal-tables`

<!-- GENERATED:CAPABILITIES:END -->

Jede dieser Fähigkeiten ist auf das Turnier beschränkt, das die Zuweisung benennt. Handeln gegen ein
anderes Turnier innerhalb derselben Organisation wird aus Eigentümerschaftsgründen abgelehnt, genauso
wie der Vereinsbereich für club-admin durchgesetzt wird.

## Was sie erbt

Nichts. Jede Fähigkeit, die tournament-admin besitzt, besitzt sie direkt —
[Admin](/de/help/roles/admin/) besitzt ebenfalls dieselbe Menge an turnierbezogenen Fähigkeiten, ohne
Einschränkung, aber als eigene direkt deklarierte Menge statt von tournament-admin geerbt.

## Was sie nicht kann

Keine organisationsweite Befugnis: tournament-admin kann keine Benutzer einladen oder verwalten, keine
Organisationseinstellungen ändern, noch Vereine verwalten — `org.manage-users`, `org.manage-settings`
und `org.manage-clubs` sind nie in ihrer Menge enthalten. Sie kann auch kein neues Turnier erstellen
(`org.create-tournaments`) noch den Lebenszyklus eines bestehenden Turniers ändern —
veröffentlichen, archivieren, oder dessen benutzerdefinierte Skripte
(`org.manage-tournament-lifecycle`): Das bleibt admin vorbehalten, da das Erstellen oder Beenden eines
Turniers eine Entscheidung auf Organisationsebene ist, keine innerhalb des Turniers. Und sie kann auf
kein anderes Turnier einwirken als das, welches ihre Zuweisung benennt, selbst innerhalb derselben
Organisation.

## Bildschirme, die sie sieht

Jeder Bildschirm des Kontrollpanels, den die Mitglieder dieser Organisation sehen, außer „Rollen" —
genau wie [club-admin](/de/help/roles/club-admin/), und aus demselben Grund: Die Benutzerverwaltung
benötigt `org.manage-users`, das tournament-admin nie besitzt.

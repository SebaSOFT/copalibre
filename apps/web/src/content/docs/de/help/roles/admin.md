---
title: Admin
description: Was die Rolle admin tun kann, was sie erbt, und was sie nicht kann.
capabilities:
  - control-web/roles-permissions
roles:
  - admin
---

## Wofür diese Rolle da ist

Der ranghöchste Operator der Organisation selbst. Ein Admin leitet alles, was die Organisation tut: er
erstellt und veröffentlicht Turniere, lädt jeden anderen Benutzer ein und verwaltet ihn, verwaltet jeden
Verein, und betreibt Spiele, genau wie jede andere Fähigkeit der Organisation — nichts hier ist auf
einen Verein oder ein Turnier beschränkt.

## Was sie tun kann

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.create-tournaments`
- `org.manage-clubs` (geerbt von `club-admin`)
- `org.manage-display-tokens`
- `org.manage-persons`
- `org.manage-registrations`
- `org.manage-resources`
- `org.manage-schedule`
- `org.manage-seeding`
- `org.manage-settings`
- `org.manage-stages`
- `org.manage-tournament-data`
- `org.manage-tournament-lifecycle`
- `org.manage-users`
- `org.manage-zones-groups`
- `org.operate-match`
- `org.rebuild-statistics`
- `org.review-reports`
- `org.view-internal-standings`
- `org.view-internal-tables`

Zusätzlich zu den eigenen besitzt diese Rolle jede Fähigkeit, die `club-admin` besitzt, durch Vererbung
— eine dort hinzugefügte Fähigkeit erreicht diese Rolle ohne eine zweite Änderung hier.

<!-- GENERATED:CAPABILITIES:END -->

## Was sie nicht kann

Die Befugnis von Admin reicht niemals in eine andere Organisation hinein — der Admin einer zweiten
Organisation ist eine völlig andere Zuweisung, die niemand innehat, bis jemand ihn dorthin einlädt.
Admin besitzt auch keine Befugnis auf Installationsebene: Organisationen erstellen, Installations-
Super-Admins verwalten, und Disziplin- oder Turnierprofil-Module für die gesamte Installation
installieren gehören [Super-Admin](/de/help/roles/super-admin/), einer Rolle über Admin, nicht darunter.

## Bildschirme, die sie sieht

Jeder Bildschirm des Kontrollpanels der eigenen Organisation, ohne verborgenen Navigationseintrag —
Admin ist die einzige Organisationsrolle, die immer den Bildschirm „Rollen" sieht, da die
Benutzerverwaltung (`org.manage-users`) ihr selbst gehört.

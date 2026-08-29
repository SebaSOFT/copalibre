---
title: Super-Admin
description: Was die Rolle super-admin tun kann, und was sie nicht kann.
capabilities:
  - control-web/platform-administration
roles:
  - super-admin
---

## Wofür diese Rolle da ist

Der Operator der Installation selbst — eine Ebene über jeder Organisation, ohne Mitglied einer von
ihnen zu sein. Super-Admin existiert, um Organisationen zu erstellen, zu verwalten, wer sonst
Super-Admin besitzt, und die Disziplin- und Turnierprofil-Module zu installieren, die die gesamte
Installation ausführt.

Im Gegensatz zu jeder anderen Rolle auf dieser Site liegt Super-Admin vollständig außerhalb der
Organisationsfähigkeits-Zuordnung: Es ist eine Installationsrolle (`INSTALLATION_ROLES`), keine
Organisationsrolle (`ORGANIZATION_ROLES`), also hat sie keinen Eintrag in der deklarierten
Rolle-zu-Fähigkeit-Zuordnung und keine hier generierte Fähigkeitenliste — ihre Befugnis ist eine feste,
kleine Menge an Aktionen auf Installationsebene, direkt beschrieben.

## Was sie tun kann

- Eine neue Organisation erstellen, indem Alias, Anzeigename, Hauptsprache und Zeitzone benannt werden,
  und im selben Schritt ihren ersten Administrator einladen.
- Installations-Super-Admins auflisten, erstellen und entfernen, nach Principal-ID.
- In die Benutzerliste jeder Organisation eintauchen, nach Alias, um Rolle oder Status eines Benutzers
  zu ändern — ohne Mitgliedschaft in dieser Organisation zu benötigen.
- Ein Disziplin- oder Turnierprofil-Modul nach Alias installieren, mit optionalem Versionsbereich und
  optionaler alternativer Quelle; installierte Module auflisten, verifizieren, entfernen, und auf
  Updates prüfen.
- Eine neue Disziplin oder ein neues Turnierprofil über den geführten Plattform-Administrations-
  Assistenten erstellen, wodurch ein Modulpaket entsteht, das dieselbe installationsweite Befugnis dann
  installiert.

## Was sie nicht kann

Nichts reicht in die eigenen Turnierdaten einer Organisation hinein: kein Spielplan, Ergebnis oder
Anmeldung ist über diese Rolle sichtbar oder bearbeitbar. Das gehört zum eigenen Kontrollpanel jeder
Organisation, erreicht von einem [Admin](/de/help/roles/admin/), nicht von Super-Admin, der über die
Installationskonsole agiert.

## Bildschirme, die sie sieht

Den Plattform-Administrationsbildschirm, und keinen anderen Bildschirm des Kontrollpanels —
organisationsbeschränkte Bildschirme gehören zu einer Organisationsrolle, die Super-Admin nicht allein
dadurch besitzt, dass er Super-Admin ist.

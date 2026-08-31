---
title: Plattformverwaltung
description: Organisationen erstellen, Super-Admins der Installation verwalten und Disziplin-/Profilmodule installieren.
capabilities:
  - control-web/platform-administration
  - platform/default-module-catalogue
roles:
  - super-admin
---

## Wofür dieser Bildschirm ist

Dies ist die eigene Konsole der Installation, erreichbar nur als `super-admin` — eine Ebene über jeder
Organisation. Nichts hier ist auf eine einzelne Organisation beschränkt: Jede Aktion hier betrifft die
gesamte Installation.

## Organisationen

Eine neue Organisation wird hier erstellt — ihr Alias, Anzeigename, Hauptsprache und Zeitzone — und ihr
erster Administrator wird im selben Schritt per E-Mail eingeladen. Eine Organisation, die ohne
eingeladenen Administrator erstellt wird, hat niemanden, der sich anmelden und sie verwalten kann,
deshalb geschieht beides zusammen.

## Benutzer

Die Benutzerliste jeder Organisation wird über ihren Alias erreicht, sodass ein Super-Admin die Rolle
oder den Status eines Benutzers ändern kann, ohne selbst Mitglied dieser Organisation sein zu müssen.

## Super-Admins

Installations-Super-Admins werden hier aufgelistet, erstellt und entfernt. Ein Super-Admin wird per
Principal-ID erstellt — die Identität muss bereits existieren (mindestens einmal angemeldet gewesen
sein), bevor sie befördert werden kann.

## Module

Disziplin- und Turnierprofil-Module werden hier per Alias installiert, mit einem optionalen
Versionsbereich und einer optionalen alternativen Quelle für ein Modul, das nicht im Standardkatalog
enthalten ist. Installierte Module werden mit Typ, Version und Quelle aufgelistet und können überprüft
oder entfernt werden. Die Update-Prüfung vergleicht installierte Versionen mit dem, was die Quelle jedes
Moduls derzeit veröffentlicht, ohne etwas zu installieren, bevor dies angefordert wird.

## Was Sie hier nicht tun können

Nichts hier greift auf die eigenen Turnierdaten einer Organisation zu — keine Begegnung, kein Ergebnis
und keine Anmeldung ist von diesem Bildschirm aus sichtbar oder bearbeitbar. Das ist das eigene
Kontrollzentrum jeder Organisation, erreicht von einem Organisationsadministrator, nicht von einem
Super-Admin, der über diese Konsole handelt.

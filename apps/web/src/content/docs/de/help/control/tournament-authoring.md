---
title: Turniererstellung
description: Was der Turniererstellungs-Assistent konfiguriert und was jedes Feld bedeutet.
---

## Wofür dieser Bildschirm ist

Erstellt ein neues Turnier innerhalb der Organisation: Wählen Sie die Disziplin, das Format und die
Grunddaten, bevor ein Teilnehmer angemeldet ist.

## Wichtige Felder

- **Disziplin**: der Regelsatz der zu spielenden Sportart/Aktivität (Siegbedingung, Punkte,
  Segmente usw.). Es erscheinen nur auf dieser Installation installierte Disziplinen — fehlt die
  benötigte, installieren Sie sie zuerst (`copalibre module add`), bevor Sie das Turnier erstellen
  können.
- **Alias**: der öffentliche Routen-Identifikator des Turniers, eindeutig innerhalb der
  Organisation. Verwendet Kleinbuchstaben und Bindestriche; erscheint in der öffentlichen URL und
  kann danach nicht mehr frei geändert werden.
- **Format**: das für die gewählte Disziplin verfügbare Wettbewerbsformat (einfaches
  Ausscheidungsturnier, Rundenturnier usw.).

## Lebenszyklus

Ein neu erstelltes Turnier startet im Status **Entwurf**. Von dort folgt es einem linearen Pfad:
Entwurf → veröffentlicht → gestartet → beendet → archiviert. Jeder Schritt ist eine explizite
Entscheidung auf einem anderen Bildschirm, niemals etwas, das dieser Bildschirm für Sie erledigt.
Sobald **gestartet**, werden Disziplin und Turnierprofil auf der Version eingefroren, die sie zu
diesem Zeitpunkt hatten — ein laufendes Turnier ändert seine Regeln niemals auf halbem Weg.

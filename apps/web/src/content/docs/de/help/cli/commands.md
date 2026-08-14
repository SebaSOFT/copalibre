---
title: Befehlsreferenz
description: Jeder Befehl des copalibre-CLI, seine Verwendung und seine Optionen.
---

Jeder Befehl beantwortet `--help`/`-h` mit genau diesem Verwendungstext, generiert aus einer
einzigen Quelle im CLI selbst — diese Seite kann einen Befehl nicht anders beschreiben, als das CLI
ihn tatsächlich umsetzt.

## init

`copalibre init [--file <pfad>]`

Schreibt nicht geheime Standardwerte und listet die erforderlichen Geheimnisse auf.

- `--file <pfad>`: Zieldatei (Standard `.env`)

## doctor

`copalibre doctor [--check-proxy] [--proxy-url <url>]`

Validiert Konfiguration und Abhängigkeiten vor dem Start.

- `--check-proxy`: prüft zusätzlich die Reverse-Proxy-Konfiguration
- `--proxy-url <url>`: öffentliche URL zum Testen, wenn `--check-proxy` verwendet wird

## dev

`copalibre dev [--hybrid]`

Führt eine Entwicklungsumgebung aus, containerisiert oder hybrid.

- `--hybrid`: Infrastruktur in Docker, Anwendungsprozesse auf dem Host

## start

`copalibre start`

Startet PostgreSQL, führt doctor aus und startet alle Prozessrollen.

## migrate

`copalibre migrate`

Führt ausstehende Datenbankmigrationen aus.

## backup

`copalibre backup [--file <pfad>] [--retain <n>] [--dry-run]`

Erstellt ein komprimiertes **Backup-Paket** (`.tar.gz`) unter `backups/`, mit dem PostgreSQL-Dump
und einem Manifest (Datum und CopaLibre-Version). Wendet Retention an: nach einem erfolgreichen
Backup werden ältere Pakete über `--retain` hinaus gelöscht. Löscht ausschließlich Dateien, die dem
Paketnamensmuster entsprechen (`copalibre-<datum>.tar.gz`) — rührt niemals eine andere Datei unter
`backups/` an.

- `--file <pfad>`: Paketziel, innerhalb von `backups/` (Standard: ein zeitgestempelter Name)
- `--retain <n>`: nach diesem Backup zu behaltende Pakete (Standard: 5)
- `--dry-run`: druckt den Backup-Plan, ohne ihn auszuführen

Daten installierter Module (Disziplin-Deskriptoren, Turnierprofile) liegen in PostgreSQL und sind
daher im Dump enthalten. Objekt-Bytes im Objektspeicher (`object-storage-data`) liegen außerhalb des
Umfangs dieses Befehls — sichern Sie sie separat auf Infrastrukturebene, wie der Self-Hosting-Leitfaden
bereits angibt.

## restore

`copalibre restore --file <pfad> (--confirm | --dry-run) [--allow-newer-backup]`

Extrahiert ein Backup-Paket, stellt seinen PostgreSQL-Dump wieder her, führt ausstehende Migrationen
aus und bestätigt, dass das angewendete Schema mit dieser Installation übereinstimmt — alles in
einem einzigen Aufruf.

- `--file <pfad>`: wiederherzustellendes Paket, innerhalb von `backups/`
- `--confirm`: erforderlich, um die Wiederherstellung tatsächlich auszuführen
- `--dry-run`: druckt den Wiederherstellungsplan, ohne ihn auszuführen
- `--allow-newer-backup`: erlaubt die Wiederherstellung eines Pakets, das von einer neueren
  CopaLibre-Version erzeugt wurde als der aktuell laufenden (standardmäßig abgelehnt)

Nach einem erfolgreichen `pg_restore` führt `restore` automatisch `copalibre migrate` aus und öffnet
dann eine Verbindung, um zu überprüfen, dass die angewendete Schemaversion genau der entspricht, die
diese Installation erwartet (dieselbe Prüfung, die `GET /ready` verwendet) — so lässt eine
Wiederherstellung Code und Datenbank nie stillschweigend auseinanderlaufen. Schlägt die Migration
fehl, meldet `restore` dies mit seinem Exit-Code, ohne Erfolg zu behaupten; versuchen Sie es erneut
mit `copalibre migrate` und dann `copalibre doctor`.

Ein Paket, dessen Manifest eine neuere CopaLibre-Version verzeichnet als die aktuell laufende, wird
abgelehnt, bevor die Datenbank berührt wird, unter Nennung beider Versionen — aktualisieren Sie
zuerst diese Installation, oder übergeben Sie `--allow-newer-backup`, wenn Sie wirklich fortfahren
möchten.

## upgrade-check

`copalibre upgrade-check --target-version <semver>`

Prüft die Kompatibilität installierter Module und ausstehende Migrationen vor der Aktualisierung.

- `--target-version <semver>`: CopaLibre-Version, gegen die Module und Migrationen geprüft werden

Endet mit einem Exit-Code ungleich null, wenn ein installiertes Modul mit der Zielversion nicht mehr
kompatibel wäre. Siehe [Aktualisierung](/de/help/cli/updating/) für die vollständige Abfolge.

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <name> --email <email>`

Erstellt das erste Administratorkonto einer Organisation.

## module

`copalibre module <add|list|remove|verify>`

Verwaltet installierte Disziplin- und Turnierprofil-Module.

### module add

`copalibre module add <alias>[@bereich] [--source <url>] [--allow-unsatisfied-capabilities]`

Installiert ein Modul per Alias, optional auf einen Versionsbereich festgelegt.

- `--source <url>`: eine explizit aktivierte alternative Quelle anstelle der kuratierten
- `--allow-unsatisfied-capabilities`: installiert auch dann, wenn die deklarierten erforderlichen
  Fähigkeiten noch nicht erfüllt sind

### module list

`copalibre module list [--outdated]`

Listet installierte Module auf, oder nur diejenigen mit einer neueren veröffentlichten Version.

- `--outdated`: zeigt nur Module mit einer neueren veröffentlichten Version

### module remove

`copalibre module remove <alias>`

Entfernt ein installiertes Modul, auf das kein gestartetes Turnier verweist.

### module verify

`copalibre module verify`

Validiert jedes installierte Modul erneut gegen die laufende Core-Version.

### module scaffold

`copalibre module scaffold <discipline|tournament-profile> <alias> [--author <name>] [--licence <lizenz>] [--name <name>] [--source-url <url>] [--output <verzeichnis>]`

Erzeugt ein strukturell gültiges Modulpaket, um mit der Erstellung zu beginnen — ausgehend von einem
der bereits gültigen Dokumente aus dem CopaLibre-Katalog, keine blinde Vermutung des Schemas — als
getaggtes lokales Git-Repository, bereit zum Bearbeiten, Validieren und Installieren/Einreichen.

- `--author <name>`: Autor der Zuschreibung (Standard: Unknown)
- `--licence <lizenz>`: SPDX-Kennung (Standard: AGPL-3.0-only)
- `--name <name>`: Bereitstellungsname (Standard: der Alias)
- `--source-url <url>`: Quell-URL der Zuschreibung
- `--output <verzeichnis>`: wohin das Modul-Repository geschrieben wird (Standard:
  `modules/<alias>`)

### module validate-local

`copalibre module validate-local <pfad>`

Validiert ein lokales Modulpaket, ohne es zu suchen oder zu installieren — dieselbe Prüfung, die
`module add`/`module verify` bereits anwenden.

### module submit

`copalibre module submit <pfad> [--upstream <owner/repo>] [--base <branch>]`

Forkt `copalibre-modules`, kopiert das lokale Modul auf einen neuen Branch, veröffentlicht ihn und
öffnet einen Pull Request.

- `--upstream <owner/repo>`: Zielrepository (Standard: `SebaSOFT/copalibre-modules`)
- `--base <branch>`: Basis-Branch des Pull Requests (Standard: `main`)

## mcp

`copalibre mcp`

Startet einen lokalen Model-Context-Protocol-(MCP)-Server über stdio, damit eine KI CopaLibre
betreiben kann. Siehe die [Details zu MCP-Werkzeugen](/de/help/cli/mcp/).

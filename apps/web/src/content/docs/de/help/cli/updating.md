---
title: Aktualisierung
description: Der nicht destruktive Weg zur Aktualisierung des CopaLibre-Frameworks und seiner installierten Module.
capabilities: []
roles:
  - super-admin
---

## Das copalibre-CLI selbst aktualisieren

`copalibre --version` gibt die Version der installierten Binärdatei aus. Ein erneutes Ausführen des
Installationsskripts holt die neueste veröffentlichte Release und ersetzt die Binärdatei an Ort und
Stelle — es ist idempotent: prüft zuerst die installierte Version und überspringt den Download, wenn
sie bereits übereinstimmt:

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
```

Dies ersetzt nur die `copalibre`-Binärdatei. Es hat keine Auswirkung auf eine laufende Installation —
siehe unten zur Aktualisierung des Frameworks und seiner Module.

## Das Framework aktualisieren

Behalten Sie die zu `.copalibre/installation.json` passende CLI. Ein Binärtausch aktualisiert weder Marker noch Compose oder Image-Versionen. Sichern Sie PostgreSQL, Objekte, Konfiguration und Signaturschlüssel; behalten Sie die bisherigen Image-Versionen.

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

Prüfen Sie im bestehenden Installationsverzeichnis die Compose-/Konfigurationsänderungen der Zielversion und ändern Sie beide Image-Referenzen in `.env`. Behalten Sie Compose-Projekt und Volumes. Laden und prüfen Sie das Zielimage ohne Abhängigkeiten zu starten oder Migrationen anzuwenden:

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.6
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.6
```

Planen Sie nach erfolgreicher Prüfung eine Unterbrechung, stoppen Sie Anwendungsprozesse und erstellen Sie ein abschließendes Backup. Migrieren und starten Sie danach neu; bei fehlgeschlagener Migration nicht neu starten:

```bash
docker compose stop gateway web web-ssr api events worker scheduler
copalibre backup --file backups/pre-upgrade.tar.gz
docker compose run --rm migrate && docker compose up --detach --wait
docker compose run --rm doctor
```

Löschen oder ändern Sie den Marker nicht zur Umgehung der Versionsprüfung. Verwenden Sie für Schemaoperationen zwischen Versionen die expliziten Compose-Dienste oben; die neue CLI verweigert `migrate` und `upgrade-check` mit dem alten Marker. Ein neues `init`-Verzeichnis ist eine separate Installation, kein direktes Upgrade.

Nach einer Datenbankmigration ist die Auswahl älterer Images kein sicherer Rollback. Lassen Sie Schreibprozesse gestoppt und stellen Sie PostgreSQL-, Objekt- und Konfigurationsbackups in einer isolierten Installation der vorherigen Version wieder her. Prüfen Sie die Wiederherstellung vor der Verkehrsumstellung; Schreibvorgänge nach dem Backup gehen verloren.

## Upgrade nach Bereitstellungsart

Bei Compose hinter NGINX oder Caddy bleiben Proxy und Zertifikate bestehen. Nutzen Sie während der Migration Wartungsrouting und validieren/laden Sie nur geänderte Proxy-Konfiguration neu. Unter Kubernetes verwenden Sie den Zielchart mit geprüften Werten und beiden Images, führen zuerst einen Kompatibilitäts-Job aus und prüfen Migrations-/Doctor-Jobs sowie Ingress vor der Verkehrsfreigabe. Helm rollback macht Datenbankmigrationen nicht rückgängig. Detaillierte Befehle:

- [Caddy](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/caddy.md#upgrading-copalibre-behind-caddy)
- [NGINX](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/nginx.md#upgrading-copalibre-behind-nginx)
- [Kubernetes / Helm](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/enterprise-kubernetes.md#upgrading-an-existing-helm-release-safely)

## Module aktualisieren

Jede installierte Disziplin oder jedes Turnierprofil ist ein Modul, das unabhängig vom Framework
versioniert wird.

```bash
copalibre module list --outdated
```

Listet nur die installierten Module auf, die eine neuere veröffentlichte Version als die
installierte haben.

```bash
copalibre module add <alias>@<bereich>
```

Installiert eine bestimmte Version oder einen Bereich (zum Beispiel `@^2.0.0`) eines bereits
installierten Moduls — die Neuinstallation mit einer anderen Version ist die Art, ein Modul zu
aktualisieren. Ein bereits gestartetes Turnier referenziert weiterhin die Version, mit der es
erstellt wurde; die Aktualisierung eines Moduls ändert niemals rückwirkend ein laufendes Turnier.

Siehe die [Befehlsreferenz](/de/help/cli/commands/) für die restlichen Optionen von `module`.

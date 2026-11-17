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

Führen Sie `copalibre upgrade` im Installationsverzeichnis aus, mit dem CLI der Version, auf die Sie
wechseln. Sehen Sie sich zuerst an, was es tun wird; das ändert nichts:

```bash
copalibre upgrade --check
```

### Je nach Ausgangsversion

| Ihre Installation wurde erstellt von                     | Vorgehen                                                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1.2.5 oder 1.2.6                                         | `copalibre upgrade --self`, danach `copalibre upgrade --check` und `copalibre upgrade`                                 |
| 1.2.1 oder älter (dessen CLI kennt kein `upgrade`)       | Das neue CLI mit dem Installationsskript oben installieren, danach `copalibre upgrade --check` und `copalibre upgrade` |
| Ein 1.2.x-CLI hat `copalibre upgrade` bereits ausgeführt | Das neue CLI installieren und `copalibre upgrade` erneut ausführen                                                     |

Lassen Sie ein 1.2.x-CLI `copalibre upgrade` nicht allein ausführen. Es trägt die neue Version in
`.env`, `docker-compose.yml` und `.copalibre/installation.json` ein, meldet Erfolg und lässt alle
Container auf den alten Images; beim nächsten Neustart starten die neuen Images auf der alten
Compose-Datei, und das funktioniert nicht. Das neue CLI erkennt eine so hinterlassene Installation,
gleich was ihr Marker angibt, und schließt die Arbeit ab.

### Was das Upgrade tut

1. Es lädt die neuen Images herunter, während die Installation weiterläuft, damit nichts stoppt,
   falls eines fehlt.
2. Es stoppt den Stack, damit kein Schreibvorgang verloren geht, und sichert die Datenbank nach
   `backups/pre-upgrade-<von>-to-<nach>-<datum>.tar.gz`.
3. Es ersetzt `docker-compose.yml` und `deploy/gateway/Caddyfile` durch die der neuen Version, wenn
   sie noch so sind, wie eine Version sie ausgeliefert hat, und behält die bisherigen als
   `docker-compose.yml.<von>.bak` und `deploy/gateway/Caddyfile.<von>.bak`. Es aktualisiert `.env`
   (neue Einstellungen, neue Image-Tags, die unter `/api` verschobene Adresse des Schlüsselsatzes) und
   behält `.env.<von>.bak`; von Ihnen gesetzte Werte bleiben erhalten.
4. Es verschiebt die Datenbank von PostgreSQL 17 nach 18: Es stellt die Sicherung in einem neuen
   Volume (`postgresql-data`) wieder her und vergleicht die Zeilenzahl jeder Tabelle, bevor es
   weitergeht. Das 17er-Volume wird nicht angerührt.
5. Es startet die neue Version und führt `copalibre doctor` aus.
6. Sobald doctor besteht, prüft es, dass sich die Sicherung zurücklesen lässt, und entfernt dann das
   PostgreSQL-17-Volume (`postgres-data`) und das Image `postgres:17`. Mit `--keep-old-volume` bleiben
   sie erhalten; das Upgrade gibt die zwei Befehle aus, die sie später entfernen.

Der Stack ist von Schritt 2 an gestoppt, bis Schritt 5 gelingt; planen Sie das Zeitfenster nach der
Größe Ihrer Datenbank. Das Verschieben braucht freien Platz für eine zweite Kopie der Datenbank: ohne
ihn startet das Upgrade nicht. Kopieren Sie das Sicherungspaket nach dem Upgrade vom Host weg.

### Wenn Sie docker-compose.yml geändert haben

Eine Compose-Datei, die zu keiner Version passt (ein hinzugefügter Dienst, ein geänderter Wert),
bleibt, wie sie ist. Das Upgrade schreibt die Datei der neuen Version als `docker-compose.yml.new`,
meldet das und stoppt, bevor es irgendetwas anderes ändert. Übertragen Sie Ihre Änderungen in diese
Datei, ersetzen Sie `docker-compose.yml` durch das Ergebnis und führen Sie `copalibre upgrade` erneut
aus. Eine von Ihnen geänderte Gateway-Konfiguration bleibt erhalten, und das Upgrade sagt das.

### Installationen aus 1.0

1.0 hatte kein Gateway: Der Edge-Proxy erreichte `web`, `api` und `events` direkt. Seit 1.1 ist der
Dienst `gateway` der einzige Eingang, auf `COPALIBRE_PORT` (8080, wenn nicht gesetzt). Richten Sie
nach dem Upgrade Ihren Proxy auf das Gateway und setzen Sie `COPALIBRE_APP_URL` auf die Adresse, die
Browser verwenden; bestätigen Sie es mit `copalibre doctor`.

### Zurück zur vorherigen Version

Schlägt ein Schritt vor doctor fehl, legt das Upgrade die vorherigen Dateien zurück, startet die
vorherige Version auf ihrem unberührten PostgreSQL-17-Volume und meldet, warum es gestoppt hat.
Schlägt doctor fehl, läuft die neue Version weiter und das Upgrade gibt diese Schritte aus, ohne
etwas zu entfernen.

Solange das PostgreSQL-17-Volume existiert (doctor ist fehlgeschlagen, oder Sie haben
`--keep-old-volume` übergeben):

```bash
docker compose down
cp docker-compose.yml.<von>.bak docker-compose.yml
cp .env.<von>.bak .env
cp deploy/gateway/Caddyfile.<von>.bak deploy/gateway/Caddyfile   # wenn das Upgrade sie ersetzt hat
docker compose up --detach --wait
```

Das PostgreSQL-18-Volume (`<projekt>_postgresql-data`) bleibt ungenutzt; entfernen Sie es mit
`docker volume rm`, bevor Sie das Upgrade erneut versuchen, wenn Sie neu beginnen möchten.

Nachdem das Upgrade PostgreSQL 17 entfernt hat, ist das Sicherungspaket der Weg zurück. Installieren
Sie das CLI der vorherigen Version in einem neuen, leeren Verzeichnis, führen Sie dort
`copalibre init` aus, kopieren Sie das Paket in dessen `backups/` und stellen Sie es wieder her:

```bash
copalibre restore --file backups/pre-upgrade-<von>-to-<nach>-<datum>.tar.gz --confirm
```

Schreibvorgänge nach dem Upgrade gehen verloren. Ältere Images über der bereits migrierten Datenbank
zu starten, ist nie ein sicherer Weg zurück.

### Manuelles Compose-Upgrade (zwischen 2.x-Versionen)

Von einer 1.x-Installation aus verwenden Sie `copalibre upgrade`: Deren Datenbank muss nach
PostgreSQL 18 wechseln, was diese Schritte nicht tun.

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

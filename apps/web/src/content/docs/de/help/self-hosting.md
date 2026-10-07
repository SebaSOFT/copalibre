---
title: 'Erste Schritte: Self-Hosting'
description: Führen Sie CopaLibre aus dem Quellcode unter Windows, macOS oder Linux aus, und wählen Sie dann eine Reverse-Proxy- oder Kubernetes-Bereitstellungstopologie.
capabilities:
  - platform/self-hosted-deployment
roles:
  - super-admin
---

Diese Seite bringt ein frisches Checkout auf Ihrem eigenen Rechner oder Server zum Laufen und erklärt
dann die beiden unterstützten Wege, es echtem Datenverkehr auszusetzen. Für die CLI-Befehlsreferenz
siehe [Installation](/help/cli/installation/); für Backup-/Wiederherstellungs- und
Datenpersistenz-Details siehe `docs/self-hosting.md` im Repository.

## 1. Voraussetzungen, nach Plattform

Docker, Docker Compose v2 und Git sind erforderlich. Der Quellcode-Wrapper benötigt außerdem Node.js 24 und Corepack auf dem Host. Die eigenständige Binärdatei benötigt kein Node.js; siehe [Installation](/de/help/cli/installation/).

**Linux** — installieren Sie Docker Engine und das Compose-Plugin über den Paketmanager Ihrer
Distribution oder [Dockers eigenes Repository](https://docs.docker.com/engine/install/) (`docker-ce`,
`docker-compose-plugin`). Fügen Sie Ihren Benutzer der Gruppe `docker` hinzu, damit `./copalibre` kein
`sudo` benötigt.

**macOS** — installieren Sie
[Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) (Apple Silicon oder Intel).
Colima zusammen mit den eigenständigen `docker`/`docker-compose`-CLIs funktioniert ebenfalls, wenn Sie
Docker Desktop nicht ausführen möchten.

**Windows** — installieren Sie
[Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) mit aktiviertem
**WSL2-Backend**, und führen Sie jeden Befehl unten aus einer WSL2-Distribution heraus aus (Ubuntu ist
die am besten getestete), nicht direkt aus PowerShell oder `cmd.exe`. `./copalibre` ist ein
POSIX-`sh`-Skript; WSL2 gibt ihm eine echte Shell und lässt die WSL-Integration von Docker Desktop den
Daemon ohne zusätzliche Netzwerkeinrichtung dafür freigeben. Git Bash kann im Notfall
`sh copalibre <command>` ausführen, aber Volume-Mount-Pfade und Dateiberechtigungen sind unter WSL2
vorhersehbarer — bevorzugen Sie es für alles über einen schnellen lokalen Test hinaus.

## 2. Aus dem Quellcode ausführen

Bauen Sie beide Images im Repository-Stamm und initialisieren Sie anschließend ein leeres Installationsverzeichnis:

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
docker build --target runtime -t copalibre:local .
docker build --target web -t copalibre-web:local .
mkdir my-league && cd my-league
../copalibre init
```

Bearbeiten Sie vor dem Start `.env`: Setzen Sie `COPALIBRE_IMAGE=copalibre:local` und `COPALIBRE_WEB_IMAGE=copalibre-web:local` für diese Images. Sonst wählt `init` veröffentlichte Images der CLI-Version. Ersetzen Sie Entwicklungspasswörter und Bootstrap-Token; konfigurieren Sie Identität, E-Mail und öffentliche URLs. Setzen Sie `GARAGE_RPC_SECRET` mit `openssl rand -hex 32`; Compose interpoliert diesen Pflichtwert auch bei deaktiviertem optionalem Speicher.

```bash
../copalibre doctor
../copalibre start
../copalibre status
../copalibre restart
../copalibre stop
../copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

Mit copalibre status prüfen Sie Container und Gateway. copalibre restart prüft PostgreSQL und doctor, bevor es die Dienste startet. copalibre stop behält Volumes; --down entfernt Container und Netzwerke. Im Kubernetes-Modus zeigen start/stop/restart Hinweise zu Helm oder kubectl.

Das Gateway veröffentlicht HTTP unter `http://localhost:8080` (`COPALIBRE_PORT`). Compose veröffentlicht auch Dienstports; beschränken Sie deren Erreichbarkeit auf Host- und Netzwerkebene. TLS endet am vorgeschalteten Proxy.

## 3. Wählen Sie, wie Sie ihn freigeben

### Option A — Einzelhost, Reverse-Proxy am Rand

Leiten Sie den Anwendungs-Hostnamen an `gateway:80` im Compose-Netz oder an `127.0.0.1:8080` bei einem Proxy auf dem Host. Das Gateway verteilt API, Authentifizierung, SSE und Web auf derselben Origin; der Webcontainer leitet dynamische Seiten an `web-ssr`. Verwenden Sie `deploy/proxy/Caddyfile` oder `deploy/proxy/nginx.conf`, konfigurieren Sie TLS und öffentliche URLs und deaktivieren Sie SSE-Pufferung. Separate API/events-Hostnamen sind bei einer gemeinsamen Origin optional.

```bash
../copalibre doctor --check-proxy --proxy-url https://app.example/events/proxy-check
```

### Option B — Kubernetes (von K3s bis zu Enterprise-Clustern)

Für Multi-Node-, horizontal skalierte, oder auf verwalteter Infrastruktur laufende Bereitstellungen
stellt ein Helm-Chart (`deploy/helm/copalibre/`) dieselben Images, den Umgebungsvertrag, die
Gesundheitschecks und den Migrationsprozess wie die Compose-Installation bereit — die Installation mit
Standardwerten verhält sich identisch zum reinen Basis-Chart.

Führen Sie Helm im Repository-Stamm aus, nachdem Sie `my-values.yaml` mit Datenbank, Identität, E-Mail und öffentlichen URLs konfiguriert haben. Verwenden Sie eine veröffentlichte Version für beide Images; 1.2.6 ist erst nach Veröffentlichung verfügbar.

```bash
cd ..
helm show values deploy/helm/copalibre/ > my-values.yaml
```

```bash
helm install my-copalibre deploy/helm/copalibre/ -f my-values.yaml \
  --set image.repository=ghcr.io/sebasoft/copalibre --set-string image.tag=1.2.6 \
  --set web.image.repository=ghcr.io/sebasoft/copalibre-web --set-string web.image.tag=1.2.6
```

Legen Sie diese additiven, standardmäßig deaktivierten `values.yaml`-Gruppen bei Bedarf oben drauf —
keine erfordert einen Template-Fork:

- **`autoscaling`** — HPA pro Rolle (`api` nach HTTP-Anfragerate, `events` nach aktiven
  SSE-Verbindungen, `worker` nach Outbox-Warteschlangentiefe/-alter) — benötigt einen
  Custom-Metrics-Adapter (Prometheus Adapter, KEDA); keines dieser drei Signale ist eine native
  Kubernetes-Metrik.
- **`podDisruptionBudget`** und **`affinity.antiAffinity`** — Schutz vor Unterbrechungen und weiche
  Verteilung über Knoten hinweg, unabhängig vom Autoscaling.
- **`networkPolicy`** — standardmäßige Ablehnung pro Rolle, wobei `publicRoles` (Standard `api`,
  `events`, plus `web` immer) für externen Verkehr geöffnet ist.
- **`ingress`** — benötigt einen Ingress-Controller und, für automatisches TLS, cert-manager.
- **`externalSecrets`** — benötigt den External Secrets Operator; bezieht `DATABASE_URL`,
  `COPALIBRE_OBJECT_STORAGE_*`-Zugangsdaten usw. aus Ihrem echten Secret-Store statt aus einem
  einfachen `Secret`-Manifest.

Verwaltetes PostgreSQL, S3-kompatibler Objektspeicher (AWS S3, Garage, R2, B2), oder ein verwalteter
VM-Pfad (Kamal, `docs/deployment/kamal.md`) sind alles Konfiguration, keine Codeänderungen —
`packages/persistence` zielt bereits generisch darauf ab. Validieren Sie jede Chart-Änderung lokal an
einem Wegwerf-Multi-Node-Cluster, bevor Sie einen echten anfassen:

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

Vollständige Voraussetzungsliste und die gemessenen Nachweise zu Multi-Node-Failover,
Backup-Wiederherstellung und Upgrade-Sicherheit, auf denen diese Behauptung beruht:
`docs/deployment/enterprise-kubernetes.md` im Repository.

## 4. Nächste Schritte

- [Ihr erstes Turnier](/help/getting-started/) — eine Competition erstellen und veröffentlichen,
  sobald die Installation läuft.
- [Betrieb und Nachvollziehbarkeit](/help/operations/) — Spiele durchführen und Ergebnisse sicher
  korrigieren.
- [CLI-Referenz](/help/cli/commands/) — jeder `copalibre`-Unterbefehl, einschließlich `backup`,
  `restore` und `upgrade-check`.

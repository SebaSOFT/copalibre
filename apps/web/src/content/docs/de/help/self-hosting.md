---
title: 'Erste Schritte: Self-Hosting'
description: Führen Sie CopaLibre aus dem Quellcode unter Windows, macOS oder Linux aus, und wählen Sie dann eine Reverse-Proxy- oder Kubernetes-Bereitstellungstopologie.
---

Diese Seite bringt ein frisches Checkout auf Ihrem eigenen Rechner oder Server zum Laufen und erklärt
dann die beiden unterstützten Wege, es echtem Datenverkehr auszusetzen. Für die CLI-Befehlsreferenz
siehe [Installation](/help/cli/installation/); für Backup-/Wiederherstellungs- und
Datenpersistenz-Details siehe `docs/self-hosting.md` im Repository.

## 1. Voraussetzungen, nach Plattform

Jede Rolle wird als ein einziges Multi-Rollen-Docker-Image ausgeliefert, das direkt aus diesem
Repository gebaut wird — es gibt keinen separaten „Produktions-Build“-Schritt. Sie benötigen Docker,
Docker Compose v2 und Git; nichts anderes läuft auf dem Host.

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

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # schreibt nicht geheime Standardwerte in .env, listet erforderliche Geheimnisse auf
```

Bearbeiten Sie `.env`: ein starkes PostgreSQL-Passwort, ein undurchsichtiges
`COPALIBRE_BOOTSTRAP_TOKEN`, Ihre OIDC-JWKS-/Issuer-/Audience-Werte (oder den nativen
E-Mail-/Passwort-Identitätsanbieter — siehe [Rollen & Berechtigungen](/help/control/roles-permissions/)),
die öffentliche Browser-Client-ID und einen unterstützten E-Mail-Anbieter.

```bash
./copalibre doctor    # validiert die Konfiguration, bevor irgendetwas startet
./copalibre start     # docker compose up --detach --wait — baut die Images lokal
./copalibre create-admin --organization-alias my-league --organization-name "My League" \
  --email admin@example.com
```

`./copalibre start` baut standardmäßig `copalibre:local` und `copalibre-web:local` aus diesem
Checkout — genau dieser Build **ist** „aus dem Quellcode ausführen“. Richten Sie stattdessen
`COPALIBRE_IMAGE`/`COPALIBRE_WEB_IMAGE` auf ein veröffentlichtes Tag, wenn Sie lieber eine Release
ziehen als eine zu bauen.

An diesem Punkt läuft der Stack, ist aber von außerhalb des Hosts nicht erreichbar:
`docker-compose.yml` terminiert absichtlich niemals selbst TLS und legt auch keinen öffentlichen Port
offen. Wählen Sie eine der beiden Topologien unten, um ihn tatsächlich vor Nutzer zu stellen.

## 3. Wählen Sie, wie Sie ihn freigeben

### Option A — Einzelhost, Reverse-Proxy am Rand

Die einfachste unterstützte Topologie: ein einzelner Docker-Host, der Compose ausführt, mit Caddy oder
NGINX davor, das TLS terminiert und zu den internen Diensten routet. Genau dafür ist
`./copalibre start` standardmäßig gebaut, auf allen drei Plattformen oben.

1. Setzen Sie `COPALIBRE_APP_HOST`, `COPALIBRE_API_HOST` und `COPALIBRE_EVENTS_HOST` auf Ihre
   öffentlichen Hostnamen, und `ACME_EMAIL`, damit der Proxy automatisch Zertifikate anfordern kann.
2. Leiten Sie gewöhnlichen API-Verkehr an `api:3001`, SSE-Verkehr an `events:3002`, die öffentlichen
   SSR-Routen an `web-ssr:3005`, und statischen Control-/Public-Web-Verkehr an `web:4321` weiter.
   Beispielkonfigurationen:
   [`deploy/proxy/Caddyfile`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/Caddyfile)
   und [`deploy/proxy/nginx.conf`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/nginx.conf).
   Der Proxy muss Weiterleitungs-Header erhalten, SSE ungepuffert halten, und inaktive Streams
   Heartbeats überstehen lassen — das Caddy-Beispiel setzt genau dafür `flush_interval -1`.
3. Überprüfen Sie es: `./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

Das funktioniert identisch unter Linux, macOS und Windows (WSL2) — der Proxy ist nur ein weiterer
Container (oder ein Prozess auf demselben Host) vor demselben Compose-Stack.

### Option B — Kubernetes (von K3s bis zu Enterprise-Clustern)

Für Multi-Node-, horizontal skalierte, oder auf verwalteter Infrastruktur laufende Bereitstellungen
stellt ein Helm-Chart (`deploy/helm/copalibre/`) dieselben Images, den Umgebungsvertrag, die
Gesundheitschecks und den Migrationsprozess wie die Compose-Installation bereit — die Installation mit
Standardwerten verhält sich identisch zum reinen Basis-Chart.

```bash
helm install my-copalibre deploy/helm/copalibre/ \
  --set image.tag=<version> --set web.image.tag=<version>
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

Verwaltetes PostgreSQL, S3-kompatibler Objektspeicher (AWS S3, MinIO, R2, B2), oder ein verwalteter
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

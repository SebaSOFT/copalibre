---
title: Installation
description: Wie man CopaLibre von Grund auf mit dem copalibre-CLI installiert.
capabilities: []
roles:
  - super-admin
---

## Voraussetzungen

Docker und Docker Compose auf dem Host. `copalibre` ist eine eigenständige Binärdatei — keine
Node.js-Installation erforderlich. PostgreSQL und seine Client-Tools müssen ebenfalls nicht
installiert werden — sie laufen in den Containern, die `copalibre` verwaltet.

`install.sh` unterstützt Linux (x86_64/arm64), macOS (x86_64/arm64, einschließlich Apple Silicon
unter Rosetta) und Windows (x86_64).

## Schritte

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
mkdir meine-liga && cd meine-liga
copalibre init      # schreibt nicht geheime Standardwerte in .env
```

Bearbeiten Sie `.env`: das PostgreSQL-Passwort, `COPALIBRE_BOOTSTRAP_TOKEN`, OIDC
JWKS/Issuer/Audience, die Browser-Client-ID und einen E-Mail-Anbieter.

```bash
copalibre doctor    # validiert die Konfiguration, bevor irgendetwas gestartet wird
copalibre start     # startet PostgreSQL, führt doctor aus und startet alle Prozesse
copalibre create-admin --organization-alias meine-liga --organization-name "Meine Liga" --email admin@beispiel.de
```

`docker-compose.yml` beendet TLS absichtlich nicht — ein Reverse-Proxy (Caddy oder NGINX) sitzt am
Rand. Beispielkonfigurationen befinden sich unter `deploy/proxy/`; überprüfen Sie die Installation
mit `copalibre doctor --check-proxy --proxy-url https://events.beispiel/events/proxy-check`.

Vollständige Details zu persistenten Daten, Backup/Wiederherstellung und dem Reverse-Proxy:
`docs/self-hosting.md` im Repository. Die Aktualisierung der `copalibre`-Binärdatei selbst:
[Aktualisierung](/de/help/cli/updating/).

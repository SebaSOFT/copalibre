---
title: Installation
description: Wie man CopaLibre von Grund auf mit dem copalibre-CLI installiert.
---

## Voraussetzungen

Docker und Docker Compose auf dem Host. PostgreSQL und seine Client-Tools müssen nicht installiert
werden — sie laufen in den Containern, die `copalibre` verwaltet.

## Schritte

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # schreibt nicht geheime Standardwerte in .env
```

Bearbeiten Sie `.env`: das PostgreSQL-Passwort, `COPALIBRE_BOOTSTRAP_TOKEN`, OIDC
JWKS/Issuer/Audience, die Browser-Client-ID und einen E-Mail-Anbieter.

```bash
./copalibre doctor    # validiert die Konfiguration, bevor irgendetwas gestartet wird
./copalibre start     # startet PostgreSQL, führt doctor aus und startet alle Prozesse
./copalibre create-admin --organization-alias meine-liga --organization-name "Meine Liga" --email admin@beispiel.de
```

`docker-compose.yml` beendet TLS absichtlich nicht — ein Reverse-Proxy (Caddy oder NGINX) sitzt am
Rand. Beispielkonfigurationen befinden sich unter `deploy/proxy/`; überprüfen Sie die Installation
mit `./copalibre doctor --check-proxy --proxy-url https://events.beispiel/events/proxy-check`.

Vollständige Details zu persistenten Daten, Backup/Wiederherstellung und dem Reverse-Proxy:
`docs/self-hosting.md` im Repository.

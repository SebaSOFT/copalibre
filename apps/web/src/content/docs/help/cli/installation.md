---
title: Installation
description: How to install CopaLibre from scratch with the copalibre CLI.
---

## Requirements

Docker and Docker Compose on the host. There is no need to install PostgreSQL or its client
tools — they run inside the containers `copalibre` manages.

## Steps

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # writes non-secret defaults to .env
```

Edit `.env`: the PostgreSQL password, `COPALIBRE_BOOTSTRAP_TOKEN`, OIDC JWKS/issuer/audience, the
browser client ID, and one email provider.

```bash
./copalibre doctor    # validates configuration before starting anything
./copalibre start     # brings up PostgreSQL, runs doctor, and starts every process
./copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

`docker-compose.yml` deliberately does not terminate TLS — a reverse proxy (Caddy or NGINX) sits at
the edge. Example configurations live under `deploy/proxy/`; verify the installation with
`./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

Full detail on persistent data, backup/restore, and the reverse proxy: `docs/self-hosting.md` in the
repository.

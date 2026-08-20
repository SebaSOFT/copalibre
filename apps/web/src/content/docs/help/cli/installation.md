---
title: Installation
description: How to install CopaLibre from scratch with the copalibre CLI.
---

## Requirements

Docker and Docker Compose on the host. `copalibre` is a standalone binary — no Node.js install
required. There is no need to install PostgreSQL or its client tools either — they run inside the
containers `copalibre` manages.

`install.sh` supports Linux (x86_64/arm64), macOS (x86_64/arm64, including Apple Silicon under
Rosetta), and Windows (x86_64).

## Steps

```bash
curl -fsSL https://www.copalibre.app/install.sh | bash
mkdir my-league && cd my-league
copalibre init      # writes non-secret defaults to .env
```

Edit `.env`: the PostgreSQL password, `COPALIBRE_BOOTSTRAP_TOKEN`, OIDC JWKS/issuer/audience, the
browser client ID, and one email provider.

```bash
copalibre doctor    # validates configuration before starting anything
copalibre start     # brings up PostgreSQL, runs doctor, and starts every process
copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

`docker-compose.yml` deliberately does not terminate TLS — a reverse proxy (Caddy or NGINX) sits at
the edge. Example configurations live under `deploy/proxy/`; verify the installation with
`copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

Full detail on persistent data, backup/restore, and the reverse proxy: `docs/self-hosting.md` in the
repository. Updating the `copalibre` binary itself: [Updating](/help/cli/updating/).

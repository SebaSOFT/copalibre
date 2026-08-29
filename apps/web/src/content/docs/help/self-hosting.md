---
title: 'Getting started: self-hosting'
description: Run CopaLibre from source on Windows, macOS, or Linux, then choose a reverse-proxy or Kubernetes deployment topology.
capabilities:
  - platform/self-hosted-deployment
roles:
  - super-admin
---

This page gets a fresh checkout running on your own machine or server, then explains the two
supported ways to put it in front of real traffic. For CLI command reference see
[Installation](/help/cli/installation/); for backup/restore and persistent-data detail see
`docs/self-hosting.md` in the repository.

## 1. Prerequisites, per platform

Every role ships as one multi-role Docker image built straight from this repository — there is no
separate "production build" step. You need Docker, Docker Compose v2, and Git; nothing else runs on
the host.

**Linux** — install Docker Engine and the Compose plugin from your distribution's package manager
or [Docker's own repository](https://docs.docker.com/engine/install/) (`docker-ce`,
`docker-compose-plugin`). Add your user to the `docker` group so `./copalibre` doesn't need `sudo`.

**macOS** — install [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) (Apple
Silicon or Intel). Colima plus the standalone `docker`/`docker-compose` CLIs works too if you prefer
not to run Docker Desktop.

**Windows** — install [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/)
with the **WSL2 backend** enabled, and run every command below from inside a WSL2 distro (Ubuntu is
the best-tested one), not from PowerShell or `cmd.exe` directly. `./copalibre` is a POSIX `sh`
script; WSL2 gives it a real shell and lets Docker Desktop's WSL integration expose the daemon to it
with no extra networking setup. Git Bash can run `sh copalibre <command>` in a pinch, but volume
mount paths and file permissions are more predictable under WSL2 — prefer it for anything beyond a
quick local test.

## 2. Run it from source

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # writes non-secret defaults to .env, lists required secrets
```

Edit `.env`: a strong PostgreSQL password, an opaque `COPALIBRE_BOOTSTRAP_TOKEN`, your OIDC
JWKS/issuer/audience values (or the native email/password identity provider — see
[Roles & permissions](/help/control/roles-permissions/)), the public browser client ID, and one
supported email provider.

```bash
./copalibre doctor    # validates configuration before anything starts
./copalibre start     # docker compose up --detach --wait — builds the images locally
./copalibre create-admin --organization-alias my-league --organization-name "My League" \
  --email admin@example.com
```

`./copalibre start` builds `copalibre:local` and `copalibre-web:local` from this checkout by
default — that build **is** "running from source." Point `COPALIBRE_IMAGE`/`COPALIBRE_WEB_IMAGE` at
a published tag instead if you'd rather pull a release than build one.

At this point the stack is running but not reachable from outside the host: `docker-compose.yml`
deliberately never terminates TLS or exposes a public port itself. Pick one of the two topologies
below to actually put it in front of users.

## 3. Choose how to expose it

### Option A — single host, reverse proxy at the edge

The simplest supported topology: one Docker host running Compose, with Caddy or NGINX in front
terminating TLS and routing to the internal services. This is what `./copalibre start` is built for
out of the box, on any of the three platforms above.

1. Set `COPALIBRE_APP_HOST`, `COPALIBRE_API_HOST`, and `COPALIBRE_EVENTS_HOST` to your public
   hostnames, and `ACME_EMAIL` so the proxy can request certificates automatically.
2. Route ordinary API traffic to `api:3001`, SSE traffic to `events:3002`, the public SSR routes to
   `web-ssr:3005`, and static control/public web traffic to `web:4321`. Example configs:
   [`deploy/proxy/Caddyfile`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/Caddyfile)
   and [`deploy/proxy/nginx.conf`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/nginx.conf).
   The proxy must preserve forwarding headers, keep SSE unbuffered, and let idle streams survive
   heartbeats — Caddy's example sets `flush_interval -1` for exactly this reason.
3. Verify it: `./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

This works identically on Linux, macOS, and Windows (WSL2) — the proxy is just another container (or
a process on the same host) in front of the same Compose stack.

### Option B — Kubernetes (K3s through enterprise clusters)

For multi-node, horizontally-scaled, or managed-infrastructure deployments, a Helm chart
(`deploy/helm/copalibre/`) deploys the same images, environment contract, health checks, and
migration process as the Compose install — installing it with default values behaves identically to
the base chart alone.

```bash
helm install my-copalibre deploy/helm/copalibre/ \
  --set image.tag=<version> --set web.image.tag=<version>
```

Layer these additive, defaulted-off `values.yaml` groups on top as needed — none require a template
fork:

- **`autoscaling`** — per-role HPA (`api` on HTTP request rate, `events` on active SSE connections,
  `worker` on outbox queue depth/age) — needs a custom-metrics adapter (Prometheus Adapter, KEDA);
  none of these three signals are native Kubernetes metrics.
- **`podDisruptionBudget`** and **`affinity.antiAffinity`** — disruption protection and soft
  cross-node spread, independent of autoscaling.
- **`networkPolicy`** — default-deny per role, with `publicRoles` (default `api`, `events`, plus
  `web` always) opened to outside traffic.
- **`ingress`** — needs an ingress controller and, for automatic TLS, cert-manager.
- **`externalSecrets`** — needs the External Secrets Operator; sources `DATABASE_URL`,
  `COPALIBRE_OBJECT_STORAGE_*` credentials, etc. from your actual secret store instead of a plain
  `Secret` manifest.

Managed PostgreSQL, S3-compatible object storage (AWS S3, MinIO, R2, B2), or a managed VM path
(Kamal, `docs/deployment/kamal.md`) are all configuration, not code changes — `packages/persistence`
already targets them generically. Validate any chart change locally against a throwaway multi-node
cluster before touching a real one:

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

Full prerequisite list and the measured multi-node-failover, backup-restore, and upgrade-safety
evidence this claim is gated on: `docs/deployment/enterprise-kubernetes.md` in the repository.

## 4. Next steps

- [Your first tournament](/help/getting-started/) — create and publish a competition once the
  installation is up.
- [Operation and traceability](/help/operations/) — running matches and correcting results safely.
- [CLI reference](/help/cli/commands/) — every `copalibre` subcommand, including `backup`,
  `restore`, and `upgrade-check`.

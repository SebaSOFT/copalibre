## Why

CopaLibre's core value proposition is self-hosting: "self-hosted installations remain usable without
a SebaSOFT-hosted account or a mandatory third-party payment provider" (TMS-011, product invariant 5,
`../chaos-vault/50-research/copalibre-market-segment-feature-specification.md`). Phases 1–20 build a
working modular monolith, but nothing yet lets an operator actually install and run it. This phase
delivers the "Level 1: Docker Compose" rung of the deployment ladder and the administrative CLI
(`copalibre`) documented in `../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`
("Development and installation contract" and "Deployment ladder" sections) — the first point at
which CopaLibre is a real, installable product rather than a set of running processes a developer
starts by hand.

## What Changes

- Add one **multi-role Docker image** built from the phase-1 monorepo, capable of running as any
  process role (`api`, `events`, `worker`, `scheduler`, `migrate`, `doctor`) selected at container
  start, per the architecture doc's "One release, multiple process roles" table.
- Add `docker-compose.yml` **dev and prod profiles**: one host, explicit volume/backup scope, Compose
  Watch for local iteration, reverse proxy as an explicit supported boundary, external PostgreSQL /
  Redis / object storage / SMTP optional through the same configuration contract.
- Implement the `copalibre` **administrative CLI**: `init`, `doctor`, `dev` (and `dev --hybrid`),
  `start`, `migrate`, `create-admin`, `backup`, `restore`, `upgrade-check`, matching the exact
  command surface in the architecture doc's "Administrative CLI" section.
- `copalibre doctor` validates secrets, ports, DNS/public URLs, PostgreSQL, object storage, SMTP,
  reverse-proxy headers, SSE buffering/timeouts, and writable persistent paths before declaring
  readiness.
- Add **automated restore testing**: a scheduled/CI job that takes a real backup, restores it into a
  clean installation, and verifies data integrity — the architecture doc's own acceptance bar
  ("backup data restores into a clean installation and passes integrity checks").
- Add a **reverse-proxy conformance checklist** with tested example configurations for at least Caddy
  and NGINX, covering the "Reverse-proxy contract" section's required behaviors (forwarded headers,
  no SSE buffering/caching, sufficiently long SSE idle timeouts plus heartbeat support, trusted-proxy
  allowlists, graceful draining).
- Complete the CI pipeline shape started in phase 1 (`install → lint → typecheck`) by adding the
  `build` job (Docker image build) and a `deploy-smoke-test` job (Compose up + health-check probes
  against every process role's `/health` endpoint from phase 1), reaching the full pipeline shape
  `install → lint → typecheck → unit → integration → e2e → build → deploy-smoke-test`.

## Capabilities

### New Capabilities
- `self-hosted-deployment`: Docker Compose Level-1 installation, the `copalibre` administrative CLI,
  backup/restore with automated restore verification, and reverse-proxy conformance — the concrete
  realization of TMS-011.

### Modified Capabilities
(none)

## Impact

- **New files**: root `Dockerfile` (multi-role, entrypoint selects process role from an env var or
  CLI arg), `docker-compose.yml`, `docker-compose.dev.yml` (superseding phase 1's Postgres-only
  version with a full profile), `bin/copalibre` (or `apps/copalibre` as an additional NestJS CLI
  app), `docs/deployment/reverse-proxy/{caddy,nginx}.md` with tested example configs,
  `.github/workflows/ci.yml` gains `build` and `deploy-smoke-test` jobs.
- **Depends on**: every prior phase whose process role this image runs (api from phase 5, events
  from phase 10, worker/scheduler from phase 9, migrate from phase 4) being buildable; effectively
  the first phase that requires the whole stack to compile together.
- **Operational surface**: this is the first phase that produces something an operator can actually
  install. Nothing downstream of phase 1 changes runtime behavior — this phase only packages and
  operationalizes it.

# CopaLibre

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![CI](https://github.com/SebaSOFT/copalibre/actions/workflows/ci.yml/badge.svg)](https://github.com/SebaSOFT/copalibre/actions/workflows/ci.yml)

> **Self-hosted tournament management for clubs, leagues, federations, and competitive communities.**

CopaLibre runs the full lifecycle of a real competition — registrations, seeding, fixtures,
live results, standings, corrections, and public coverage — as one system you deploy and own.
No mandatory hosted account, no vendor lock-in: results and audit history stay on infrastructure
you control, under a network-copyleft license that keeps improvements to publicly-run modified
versions available to their users.

Built with NestJS + Fastify on PostgreSQL (Kysely), Astro + React for the web surfaces, and a
declarative rules engine ([`@sebasoft/neuron-js`](https://github.com/SebaSOFT/neuron-js)) for
discipline logic — shipped as a single multi-role Docker image driven by the `copalibre` CLI.

## Features

- **Tournament authoring & registration** — discipline configuration, ruleset versioning,
  registration review, and check-in.
- **Seeding & bracket builder** — lock/randomize seeds, inspect the exact bracket the fixture
  engine generated (single/double elimination, round-robin, league).
- **Explainable standings** — every ranking exposes the tiebreak comparator that decided it,
  rendered from the same trace the rules engine produced — never a hidden calculation.
- **Live match console** — real-time event recording, idempotent commands, clock/timer control,
  and audited result correction instead of silent overwrites.
- **Roles & permissions** — organization-scoped RBAC, server-enforced independent of the UI.
- **Data ownership** — reviewed CSV import/export keyed by stable aliases, not raw IDs.
- **Public coverage** — schedules, live outcomes, brackets, and standings, separate from operator
  controls.
- **Self-hosted deployment** — one Docker image runs every process role; the `copalibre` CLI
  handles init, health checks (`doctor`), start, admin bootstrap, and verified backup/restore.

## Disciplines and formats

A competition is two independently versioned, attributed JSON documents — never code — so adding
a sport is a data submission, not a patch: a **discipline** (segments, events, statistics, scoring,
available formats) and a **tournament profile** (stages, formats, points, tiebreak order). See
[`docs/MODULES.md`](docs/MODULES.md).

Seeded today: **football**, **tennis**. Supported formats: single- and double-elimination,
round-robin (single-leg and home/away), league, and placement stages (free-for-all/heats) that feed
a standings table instead of another match.

## Quickstart

```bash
curl -fsSL https://www.copalibre.app/install.sh | bash
mkdir my-league && cd my-league
copalibre init      # writes a full installation (compose file, .env, marker) into the cwd
# edit .env: PostgreSQL password, COPALIBRE_BOOTSTRAP_TOKEN, OIDC JWKS/issuer/audience,
# browser client ID, and one email provider
copalibre doctor    # validates configuration before anything starts
copalibre start     # docker compose up --detach --wait
copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

`copalibre` is a standalone binary — no Node.js install required, nothing else to run first.
`init` doesn't have to run in the directory you installed the binary into — `cd` into any
directory first (a separate data/config directory, a second installation) and run it there;
`doctor`/`start`/`migrate`/`upgrade-check` auto-detect that directory afterward from the marker
`init` writes, the same way `.git` marks a checkout. `copalibre init --module-dev` additionally
sets up a `modules-dev/` bind mount for developing a discipline/tournament-profile module against
a running instance — see [`docs/MODULES.md`](docs/MODULES.md).

Managing an installation from a machine with no database access — including installing or
upgrading the CLI after Docker is already running — works the same way: generate a personal access
token from the control panel's preferences screen, then `copalibre login --api-url
https://api.example`. `statistics-rebuild` and `module add/list/remove/verify` then run over an
authenticated HTTP connection.

`docker-compose.yml` does not terminate TLS by design — put Caddy or NGINX at the edge (example
configs in [`deploy/proxy/`](deploy/proxy/)) and verify it with
`copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

### Contributor / module-author checkout

Building CopaLibre itself, or authoring a module against its own source, needs a full checkout —
the same commands, run through the checkout's own `./copalibre` wrapper instead of the installed
binary:

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init
./copalibre doctor
./copalibre start
./copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

See [`AGENTS.md`](AGENTS.md) for the full contributor guide.
Full walkthrough, backup/restore, and persistent-data details: [`docs/self-hosting.md`](docs/self-hosting.md).

## Development

Yarn 4 workspaces monorepo. Applications live in `apps/` (`api`, `web`, `events`, `worker`,
`scheduler`, `migrate`, `doctor`, `copalibre` CLI); framework-free domain and infrastructure code
lives in `packages/` (`domain`, `rules`, `persistence`, `tournament-engine`, `contracts`,
`design-tokens`, `routing`, `realtime`, `auth`, `module-catalogue`).

```bash
yarn install --immutable
yarn typecheck
yarn lint
yarn test
yarn test:integration   # requires PostgreSQL via DATABASE_URL
yarn test:e2e
```

See [`AGENTS.md`](AGENTS.md) for the full contributor guide (conventions, testing strategy,
authentication contract). Every change is planned and tracked as an OpenSpec proposal in
[`openspec/`](openspec/) before implementation — read the active change before editing.

## Documentation

- [`docs/self-hosting.md`](docs/self-hosting.md) — deployment, persistent data, backup/restore
- [`docs/MCP.md`](docs/MCP.md) — `copalibre mcp`, its tool set, and how an AI agent connects
- [`docs/MODULES.md`](docs/MODULES.md) — discipline and tournament-profile authoring
- [`docs/AUTH.md`](docs/AUTH.md) — JWT/OIDC authentication contract
- [`docs/TESTING.md`](docs/TESTING.md) — testing conventions
- [`docs/deployment/reverse-proxy/`](docs/deployment/reverse-proxy/) — Caddy and NGINX examples
- `/help/` and `/help/api-reference/` on a running instance — operator help and the interactive,
  fully static OpenAPI reference (no live-API or internet dependency)

## Roadmap

Near-term direction: broadcast/venue TV surfaces, participant reporting and disputes, competition
lifecycle and archival, community module distribution, and Kubernetes deployment (k3s and
enterprise) alongside the existing Docker Compose ladder. Every change is planned as an OpenSpec
proposal before implementation — see [`openspec/specs/`](openspec/specs/) for the accepted,
currently-implemented capability baseline.

## Contributing

Issues and discussions are open for questions, bug reports, and proposals. Read
[`AGENTS.md`](AGENTS.md) first — it covers the monorepo conventions, the OpenSpec workflow, and
what a pull request needs (tests, contract regeneration, coverage) before review.

## License

CopaLibre is licensed under the [GNU Affero General Public License v3.0](LICENSE).

If you modify CopaLibre and offer the modified version for use over a network, AGPL-3.0 requires
that users of that modified version can receive its corresponding source code. Read the full
license text before distributing or deploying modified versions.

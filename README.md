# CopaLibre

<img src="copalibre-logo.svg" alt="CopaLibre" width="96" height="96" />

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![CI](https://github.com/SebaSOFT/copalibre/actions/workflows/ci.yml/badge.svg)](https://github.com/SebaSOFT/copalibre/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/SebaSOFT/copalibre)](https://github.com/SebaSOFT/copalibre/releases)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![Discussions](https://img.shields.io/github/discussions/SebaSOFT/copalibre)](https://github.com/SebaSOFT/copalibre/discussions)

> **Self-hosted tournament management for clubs, leagues, federations, and competitive communities.**

CopaLibre runs the full lifecycle of a real competition — registrations, seeding, fixtures,
live results, standings, corrections, and public coverage — as one system you deploy and own.
No mandatory hosted account, no vendor lock-in: results and audit history stay on infrastructure
you control, under a network-copyleft license that keeps improvements to publicly-run modified
versions available to their users.

Built with NestJS + Fastify on PostgreSQL (Kysely), Astro + React for the web surfaces, and a
declarative rules engine ([`@sebasoft/neuron-js`](https://github.com/SebaSOFT/neuron-js)) for
discipline logic — shipped as a single multi-role Docker image driven by the `copalibre` CLI.

## Get Started

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
mkdir my-league && cd my-league && copalibre init
# edit .env — see the comments copalibre init writes into it
copalibre doctor && copalibre start
copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

Full walkthrough, remote management, TLS, and the contributor checkout: see Full walkthrough below.

### Full walkthrough

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
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

Day-two operations run through the same binary: `backup`/`restore` a compressed,
retention-managed data packet, and `upgrade-check` to verify module and migration compatibility
before moving a running installation to a newer version non-destructively (`copalibre start`
applies pending migrations automatically once you do). `copalibre mcp` runs a local stdio MCP
server so an AI agent can drive the same operations — see [`docs/MCP.md`](docs/MCP.md). The full
command reference, generated from the CLI's own metadata and checked at build time against every
shipped command, lives at `/help/cli/commands/` on a running instance.

Prefer Kubernetes over Docker Compose? A Helm chart ([`deploy/helm/copalibre/`](deploy/helm/copalibre/))
covers that path too — see `/help/self-hosting.md`'s Option B on a running instance for the
`helm install` walkthrough and autoscaling caveats.

`docker-compose.yml` does not terminate TLS by design — put Caddy or NGINX at the edge (example
configs in [`deploy/proxy/`](deploy/proxy/)) and verify it with
`copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

#### Contributor / module-author checkout

Building CopaLibre itself, or authoring a module against its own source, needs a full checkout —
the same commands, run through the checkout's own `./copalibre` wrapper instead of the installed
binary:

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
mkdir my-league && cd my-league
../copalibre init
../copalibre doctor
../copalibre start
../copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

`init` writes into the current directory, same as the downloaded binary — running it from the
checkout root itself would collide with the checkout's own `docker-compose.yml`.

See [`AGENTS.md`](AGENTS.md) for the full contributor guide.
Full walkthrough, backup/restore, and persistent-data details: [`docs/self-hosting.md`](docs/self-hosting.md).

## Features

- **Tournament authoring & registration** — discipline configuration, per-event rule authoring,
  ruleset versioning, registration review, check-in, and zone/group tournament structures with
  cross-group promotion.
- **Seeding & bracket builder** — lock/randomize seeds, inspect the exact bracket the fixture
  engine generated (single/double elimination, round-robin, league, bracket-groups, gauntlet,
  swiss, custom DAG brackets, and multi-round FFA brackets).
- **Match scheduling** — assign venue, time, and officials to a stage's fixtures from a calendar
  view; venues and officials managed as their own control-panel resources.
- **Multi-match series** — declare a stage's crosses as a best-of/aggregate series instead of a
  single match, with each game scheduled in its own slot, series-aware result correction, and
  standings accounted at the series or match grain per organizer choice.
- **Explainable standings** — every ranking exposes the tiebreak comparator that decided it,
  rendered from the same trace the rules engine produced — never a hidden calculation.
- **Live match console** — real-time event recording, idempotent commands, clock/timer control,
  and audited result correction instead of silent overwrites.
- **Offline-resilient by design** — every console action writes ahead to a durable client-side
  queue before it's ever sent, so a dropped connection at the pitch never loses a recorded event, a
  clock adjustment, or a finalization. The queue survives a hard refresh and drains automatically
  the moment connectivity returns, replaying each action through the same validation a live one
  goes through — no separate reconciliation logic, no silently lost work.
- **Public leaderboards, match reports, and player careers** — tournament-wide statistic tables,
  per-match event timelines and rosters, and a player's cross-tournament history, reusing the
  same standings/statistics engine driving the control panel.
- **Matches view** — a filterable card list of a tournament's matches (venue, clock, latest event,
  zone/series context), on the public site as a one-line tiebreak summary and, for an authorized
  organizer, the full standings comparator trace behind it.
- **Roles & permissions** — organization-scoped RBAC, server-enforced independent of the UI.
- **Audit trail** — every mutation, refused attempt, and sensitive read is recorded centrally
  against a declared action vocabulary and reviewable from its own control-panel screen.
- **Data ownership** — reviewed CSV import/export keyed by stable aliases, not raw IDs, plus a
  one-document JSON export of a tournament's full configuration (never results or personal data).
- **Public coverage** — schedules, live outcomes, brackets, and standings, separate from operator
  controls.
- **Platform administration** — an installation-wide super-admin console creates organizations and
  installs, verifies, and removes modules; organization admins see their own storage usage.
- **Self-hosted deployment** — one Docker image runs every process role; the `copalibre` CLI
  handles init, health checks (`doctor`), start, admin bootstrap, and verified backup/restore.

## Disciplines and formats

A competition is two independently versioned, attributed JSON documents — never code — so adding
a sport is a data submission, not a patch: a **discipline** (segments, events, statistics, scoring,
available formats) and a **tournament profile** (stages, formats, points, tiebreak order). Author
either by hand, through a guided control-panel wizard, or programmatically via an AI agent talking
to `copalibre mcp`'s discipline-authoring contract. See [`docs/MODULES.md`](docs/MODULES.md).

Seeded today: **football**, **tennis**, and **battle-royale**. Supported duel formats:
`single-elimination`, `double-elimination` (with bracket reset), `round-robin` (single-leg and
home/away), `league`, `bracket-groups` (GSL 4-player dual tournament), `gauntlet` (stepladder
ascending bracket), `swiss` (Dutch pairing system), and `custom-bracket` (declarative DAG).
Supported placement formats: `free-for-all`, `heats`, `ffa-bracket`, `ffa-bracket-groups`, and
`ffa-league` (multi-division). Supported tiebreak scopes: `overall`, `head-to-head`, and
`match-losses`, evaluated alongside Strength-of-Schedule metrics (Buchholz, Median-Buchholz,
Sonneborn-Berger), progressive cumulative scores, and audited forfeit handling.

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
- [`docs/deployment/kamal.md`](docs/deployment/kamal.md) — deploying the same container images to
  plain managed VMs over SSH with Kamal, an alternative to the Kubernetes/Compose path
- [`docs/deployment/enterprise-kubernetes.md`](docs/deployment/enterprise-kubernetes.md) — HA,
  autoscaling, and the evidence gate behind an "enterprise-ready" claim
- [`docs/deployment/community-modules.md`](docs/deployment/community-modules.md) — publishing and
  installing community discipline/profile modules
- [`docs/MCP.md`](docs/MCP.md) — `copalibre mcp`, its tool set, and how an AI agent connects
- [`docs/MODULES.md`](docs/MODULES.md) — discipline and tournament-profile authoring
- [`docs/AUTH.md`](docs/AUTH.md) — JWT/OIDC authentication contract
- [`docs/TESTING.md`](docs/TESTING.md) — testing conventions
- [`docs/i18n-glossary.md`](docs/i18n-glossary.md) — domain-term glossary and content-accuracy
  review workflow for translated interface strings
- [`docs/BROADCAST-TV.md`](docs/BROADCAST-TV.md) — the `/tv/` kiosk/overlay surface and
  device-token pairing
- [`docs/deployment/reverse-proxy/`](docs/deployment/reverse-proxy/) — Caddy and NGINX examples
- [`CHANGELOG.md`](CHANGELOG.md) — release history, generated from commit history
- `/help/` and `/help/api-reference/` on a running instance — operator help and the interactive,
  fully static OpenAPI reference (no live-API or internet dependency)

## Roadmap

`openspec/changes/` is gitignored — every proposal, active or archived, lives only in a local
checkout, never in this file. Enumerating specific proposals here is what went stale last time: every
item this section listed turned out to already be implemented and archived. Run `openspec list` in a
checkout to see what is actually active right now.

Every change is planned as an OpenSpec proposal before implementation — see
[`openspec/specs/`](openspec/specs/) for the accepted, currently-implemented capability baseline, which
_is_ committed and is the durable record of what has shipped.

## Contributing

Issues and discussions are open for questions, bug reports, and proposals. Read
[`AGENTS.md`](AGENTS.md) first — it covers the monorepo conventions, the OpenSpec workflow, and
what a pull request needs (tests, contract regeneration, coverage) before review.

## License

CopaLibre is licensed under the [GNU Affero General Public License v3.0](LICENSE).

If you modify CopaLibre and offer the modified version for use over a network, AGPL-3.0 requires
that users of that modified version can receive its corresponding source code. Read the full
license text before distributing or deploying modified versions.

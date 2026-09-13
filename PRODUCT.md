# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Register

product

## Users

**Primary.** Tournament operators working a live match under time pressure, usually at the venue and
often on an unreliable connection. They record events, control the clock, and finalize or correct
results. "Tournament operator" is a job, not a role in the taxonomy: it is performed by an `admin`,
a `tournament-admin`, or a `referee` at the live match console.

**The real role taxonomy** (`packages/domain/src/aggregates/organization-access.ts`), which interface
copy and permission surfaces must use verbatim:

- Installation scope — `super-admin`: creates organizations; installs, verifies, and removes modules.
- Organization scope — `admin` (organization-wide, inherits `club-admin`), `club-admin` (scoped to one
  club), `tournament-admin` (scoped to exactly one tournament, a declared subset of `admin`'s
  tournament-operational capabilities, never organization-wide), `referee`, `broadcaster` (no direct
  capabilities), `viewer`.

**First-class for design work:** installation super-admins, organization admins, club admins,
tournament admins, tournament operators, referees, and broadcast/TV operators.

**Real but not driving interaction design:** module authors (discipline and tournament-profile JSON,
by hand, via the control-panel wizard, or through `copalibre mcp`); self-hosting sysadmins, whose
surface is the `copalibre` CLI and its generated help rather than the panel; and public spectators,
who consume accurate tournament state without shaping operator interaction design.

## Product Purpose

CopaLibre gives organizers a self-hosted tournament-management system whose behavior follows each
competition's declared discipline and rules. It runs the full lifecycle of a real competition —
registration, seeding, fixtures, scheduling, live results, standings, corrections, and public
coverage — as one system the operator deploys and owns. Success means operators can make explicit,
informed decisions while every consequential mutation remains authorized, auditable, and traceable.

## Positioning

Claims a neighboring product could not truthfully copy:

- **A competition is data, not code.** A discipline (segments, events, statistics, scoring, available
  formats) and a tournament profile (stages, formats, points, tiebreak order) are two independently
  versioned, attributed JSON documents. Adding a sport is a data submission, not a patch.
- **Explainable standings.** Every ranking exposes the tiebreak comparator that decided it, rendered
  from the same trace the rules engine produced — never a hidden calculation.
- **Ownership without a vendor.** No mandatory hosted account and no lock-in: results and audit
  history stay on infrastructure the operator controls, under AGPL-3.0 network copyleft.
- **Offline resilience as a design property.** Every console action writes ahead to a durable
  client-side queue before it is sent, survives a hard refresh, and drains through the same validation
  a live action goes through — no separate reconciliation path, no silently lost work.
- **Traceability as an invariant.** A mutation affecting tournament state carries its authorization,
  audit record, and durable outbox event in the same transaction.

## Operating Context

- **Live venue operation.** Matches are operated pitch-side under time pressure. Dropped connectivity
  is an expected condition, not an error case.
- **Three distinct web surfaces.** The operator control panel (React); the public coverage site
  (server-rendered Astro, which must remain complete with JavaScript unavailable); and the `/tv/`
  broadcast kiosk and overlay surface, paired by device token and reviewed against neutral, green
  chroma, bright football field, and dark basketball court backdrops.
- **Deployment.** One multi-role Docker image driven by the `copalibre` CLI — `init`, `doctor`,
  `start`, `create-admin`, `migrate`, `backup`/`restore`, `upgrade-check` — over Docker Compose or a
  Helm chart. TLS is terminated by an external proxy by design.
- **Remote day-two operations.** From a machine without database access, a personal access token
  generated in the panel's preferences screen authorizes `statistics-rebuild` and
  `module add/list/remove/verify` over HTTP. `copalibre mcp` exposes the same operations to an AI agent.
- **Self-contained documentation.** Operator help and a fully static OpenAPI reference are served from
  the running instance at `/help/` and `/help/api-reference/`, with no live-API or internet dependency.
- **Eight interface languages**, complete: English, Spanish, Portuguese, French, Italian, German,
  Russian, Chinese.

## Capabilities and Constraints

**Capabilities.** Tournament authoring and registration with ruleset versioning, registration review,
check-in, and zone/group structures with cross-group promotion; a seeding and bracket builder over
single/double elimination, round-robin, league, bracket-groups, gauntlet, swiss, custom DAG brackets,
and multi-round FFA brackets; match scheduling against venues and officials managed as their own
resources; multi-match series declared at the stage level, with series-aware correction and
organizer-chosen standings grain; a live match console with real-time event recording, idempotent
commands, clock control, and audited correction; explainable standings and statistics; public
leaderboards, match reports, and cross-tournament player careers; organization-scoped RBAC; a central
audit trail of every mutation, refused attempt, and sensitive read; alias-keyed CSV import/export and
a JSON export of a tournament's configuration (never results or personal data); and an
installation-wide platform-administration console.

**Shipped competition data.** `packages/module-catalogue/` holds the installable JSON modules:
disciplines `football` and `tennis`, and tournament profiles `copa-eliminacion`,
`grupos-y-playoff`, and `liga-ida-vuelta`. `packages/domain/src/modules/` additionally carries
in-code descriptors for `football`, `tennis`, `battle-royale`, and `swimming`; only the catalogue
JSON is installed through `apps/seed`. Do not describe a descriptor as a shipped module.

**Constraints that bind future work.**

- Sport behavior is expressed through `DisciplineDescriptor` data and rules. Never hardcode
  sport-specific UI or controller logic; a live-operations flow renders each discipline's own one-tap
  events from its config. Any sport named during design work illustrates the pattern, not the target.
- Authorization is enforced server-side, independent of whatever the UI shows or hides.
- Public and broadcast surfaces must be durable and complete without JavaScript.
- Identifiers are UUIDs; public aliases are lowercase kebab-case. Personal data is not exposed
  unnecessarily.
- Domain packages stay framework-free.

**Domain language.** `roster` means the selected players of one entrant in one match, and nothing
else. `team membership` means a persistent person-team relation; it is never called a roster or a
lineup.

**Settled product facts.** There is no hosted or commercial tier. Self-hosted under AGPL-3.0 is the
whole offering — no pricing, no plans, no paid support tier, nothing planned. Future work must never
imply one exists or is coming.

## Brand Commitments

- The name is **CopaLibre**. SebaSOFT is the publishing organization, but its identity is an
  anti-reference here, not an asset to borrow (see below).
- Logo: `copalibre-logo.svg`, at the repository root and in `apps/web/public/`.
- Licensed AGPL-3.0. Source at `github.com/SebaSOFT/copalibre`.
- Discipline logic runs on the declarative rules engine `@sebasoft/neuron-js`.
- Interface copy must remain complete across all eight supported languages.

## Brand Personality

Precise, composed, broadcast-ready. Interface language is direct and operational, with enough visual
energy to communicate live state without becoming theatrical or distracting.

## Anti-references

CopaLibre must not resemble SebaSOFT's cyberpunk-wireframe identity: no Cyberpunk Yellow, CP2077 or
DATA_BLOB vocabulary, TRON grids, scanlines, ornamental glow, or dense science-fiction decoration. It
also avoids generic SaaS card grids, color-only state, sport-specific assumptions, and automation that
silently makes consequential organizer decisions.

## Evidence on Hand

Repository artifacts only:

- The installable discipline and tournament-profile modules in `packages/module-catalogue/`
  (football, tennis; copa-eliminacion, grupos-y-playoff, liga-ida-vuelta).
- The logo, and the design system recorded in `DESIGN.md` plus `.impeccable/design.json`.
- Operator, public, and TV components in the local Storybook workbench
  (`yarn workspace @copalibre/web storybook`) — local review only, not hosted, not built in CI.
- The static OpenAPI reference and operator help served by a running instance.
- Documentation under `docs/`, including review evidence in `docs/reviews/` and
  `docs/SCREEN-STORY-REVIEW.md`.

**Absences future work must not fabricate.** There are no deployments, customers, reference
installations, testimonials, case studies, benchmarks, press mentions, user counts, or adoption
figures. None may be invented, implied, or illustrated with a plausible-looking placeholder. The
enterprise-readiness documentation describes an evidence gate; it is not a citable result set.

## Product Principles

- Make operator state and next action legible at a glance.
- Preserve explicit human control over consequential decisions.
- Express sport behavior through discipline data, never hardcoded interface assumptions.
- Keep every status understandable without relying on color or motion alone.
- Prefer durable, JavaScript-independent output on public and broadcast surfaces.

## Accessibility & Inclusion

Support keyboard operation, visible focus, non-color state cues, reduced motion, and usable layout at
200% zoom — the token generator names 188px as its narrowest reference width, and German at that width
is the worst case for nearly every component. Interactive targets must meet the platform's tokenized
minimum size, and translated interface copy must remain complete across all eight supported languages.

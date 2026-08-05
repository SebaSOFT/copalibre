## Why

An installation starts empty. Phase 0009 seeded a football and a tennis discipline, but as
TypeScript functions inside `packages/domain/src/modules/` — compiled code, reachable only from other
code. A module is *data*: `../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md`
states the engine "uses versioned JSON descriptors instead of sport-specific hardcoded configuration",
and 0009 made that literal by giving the descriptor a JSON Schema validated with ajv. A default
catalogue expressed as functions contradicts the format every other module must satisfy, and it
cannot be inspected, diffed, copied as a starting point, or shipped to an operator who has never run
`yarn build`.

The second module kind fares worse: **no tournament profile ships at all**. The only profile in the
repository is `fixtureProfile()` in `packages/domain/src/test-support/`, a test fixture. So a fresh
installation has disciplines but no reusable competition shape — an operator must author a league or a
cup from nothing before running a first tournament, even though
`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md` lists a `seed` role for
"explicit bootstrap/development data" precisely so an installation can arrive usable.

`0036-community-module-distribution` covers *third-party* modules: a package format, a Git install
path, import validation. It says nothing about what ships in the box, and its importer has no
first-party catalogue to prove itself against.

## What Changes

- **The default catalogue becomes JSON on disk**: the seeded discipline descriptors move from
  TypeScript builders to versioned JSON documents distributed with the release, validated by the same
  `DISCIPLINE_DESCRIPTOR_SCHEMA` a submitted module faces. The TypeScript builders remain only where a
  test needs to vary a document.
- **Default tournament profiles ship for the first time**, as JSON: discipline-neutral competition
  shapes that resolve by capability rather than naming a discipline — a two-leg league, a single-
  elimination cup, and a groups-then-playoff shape — each declaring its `stages`, `points` and
  capability-referencing `tiebreak` chain.
- **A JSON Schema for `TournamentProfile`**, which does not exist: 0009 added the descriptor schema
  only. A profile arriving as data needs the same structural gate before anything types it.
- **A `seed` role** matching the architecture's release-artifact table: reads the catalogue, validates
  every document, and installs it through the existing audited repository path, in one transaction —
  never automatically in production, per that table's "on demand" qualifier.
- **Identity and re-seeding semantics**: a catalogue document is identified by `alias` + `version`,
  and the installation assigns the UUIDv7 `descriptorId`/`profileId` at seed time. Re-seeding an
  already-installed `alias@version` is a no-op rather than a duplicate or an overwrite; a new version
  installs alongside its predecessors, consistent with 0008's rule that a new module version never
  invalidates what a started tournament compiled against.
- **BREAKING** for callers of `footballDescriptor()`/`tennisDescriptor()`/`seededDescriptors()` — the
  catalogue is loaded rather than constructed. Nothing is published, and the only callers are tests.

## Capabilities

### New Capabilities
- `default-module-catalogue`: the first-party discipline and profile documents shipped with a release,
  their on-disk format and identity rules, and the validated, audited, idempotent seeding path that
  installs them.

### Modified Capabilities
- `tournament-profile`: a profile becomes a schema-validated wire document, not only an in-memory
  type, and a set of first-party profiles exists for a tournament to instantiate.

## Impact

- **Depends on**: `0009-discipline-driven-results` (the descriptor JSON Schema and the seeded
  documents this change relocates), `0008-extensible-module-foundation` (attribution, versioning,
  capability binding), `0004-persistence-postgres-outbox-audit` (the audited repository path the
  seeder writes through).
- **Enables**: `0030-deployment-docker-compose-cli` (a fresh install arrives usable, and `copalibre
  init` has something to seed) and `0036-community-module-distribution` (the community importer and
  the first-party seeder validate the same documents through the same code, so the catalogue is the
  importer's first real fixture).
- **Sequencing**: numbered `0035` to avoid renumbering a planned roadmap, but it belongs **before**
  `0028` and `0034` in implementation order. Resequencing is the owner's call.
- **Affected files**: `packages/domain/src/modules/` (TypeScript builders → JSON documents plus a
  profile schema in `packages/domain/src/profiles/`), a new catalogue directory shipped with the
  release, a loader/seeder outside `packages/domain` (which stays framework-free and performs no
  I/O), and `apps/` for the `seed` role.
- **Explicitly out of scope**: the module *package* format with media assets, the Git install path,
  and the module-repository CI workflow — all `0034`. This change ships first-party content and the
  seeding path, not a distribution channel.

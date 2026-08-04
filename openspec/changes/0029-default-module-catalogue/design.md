## Context

See proposal.md — Why. Three constraints shape the approach:

- **`packages/domain` performs no I/O.** It is framework-free by architecture rule and today imports
  nothing from `node:fs`. It owns the types and the ajv schemas; it cannot own a directory reader.
- **The release artifact already names the role.**
  `../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md` lists `seed` — "Explicit
  bootstrap/development data | On demand, never automatic in production" — alongside `migrate`,
  `doctor` and `worker`. This change fills a slot the architecture reserved, it does not invent one.
- **0034 will import the same documents.** `0036-community-module-distribution` validates a submitted
  module against the artifact schema and the rule registry before importing it. If the first-party
  seeder validates differently, the catalogue stops being proof that the format works.

## Goals / Non-Goals

**Goals:**

- One validation path for a module document, whether it ships with the release or arrives from a
  contributor.
- A catalogue an operator can read, copy and edit without a toolchain.
- Seeding that is safe to run twice, and safe to run against an installation whose modules an
  operator has since edited.

**Non-Goals:**

- The module *package* format (manifest, media assets, `requiresCopalibre` range) and the Git install
  path — `0034`.
- A module authoring UI. The Discipline Profile Editor is its own phase.
- Migrating already-installed modules between versions. A new version installs alongside; whether a
  running tournament may move to it is 0008's frozen-module question, already answered there.

## Decisions

### The catalogue is a directory of documents, shipped in a workspace package

`packages/module-catalogue/` holds `disciplines/*.json` and `profiles/*.json` plus a thin loader that
reads them from disk and validates each through `@copalibre/domain`'s schemas. It depends on `domain`
and on nothing else, so the seeder, the 0034 importer and tests all consume one module.

**Rejected: JSON imported into `packages/domain` via import attributes.** It keeps everything in one
package, but it puts the catalogue inside a package whose whole point is to be data-free and
dependency-free, and it makes every consumer of `@copalibre/domain` carry the catalogue. It also
drags `resolveJsonModule` and Jest ESM JSON handling into the build for no gain.

**Rejected: a top-level `modules/` directory read by path.** Simplest to look at, but nothing in the
workspace owns it, packaging it into the release becomes a separate concern, and tests resolve it by
walking relative paths from wherever they happen to run.

### Seeding is a role, not a migration step

`apps/seed` matches the architecture table. It is a separate entrypoint from `apps/migrate` precisely
because the table separates them: schema is per release and automatic, bootstrap data is on demand.
Making seeding a migration would make it automatic in production, which that table forbids in as many
words.

The seeder writes through the existing repositories inside one `withTransaction`, so the audit record
and outbox event a seeded module produces are indistinguishable from an operator-installed one. A
document that fails validation aborts before the first write.

### Identity: `alias` + `version` on disk, UUIDv7 assigned at seed time

A catalogue document carries `alias` (kebab-case, the naming convention's URL-safe identifier) and
`version` (semver). The installation assigns `descriptorId`/`profileId` when it installs the document,
because `../chaos-vault/30-processes/decisions/2026-07-28-copalibre-naming-conventions.md` makes
UUIDv7 an installation-local identifier that never appears in a URL — a UUID baked into a file
shipped to every installation is a global identifier pretending to be a local one, and it collides
the moment two installations exchange data.

Idempotency therefore keys on `(alias, version)`: present → skip, absent → install. This also gives
the "operator edited an installed module" case the right answer for free — the version is present, so
the seeder does not touch it.

**Rejected: a fixed UUIDv7 per shipped module.** Re-seeding becomes a primary-key check rather than a
lookup, which is marginally simpler, at the cost of the identifier contract above.

**Consequence:** `discipline_descriptors` and `tournament_profiles` need `alias` recorded and a
uniqueness constraint on `(alias, version)`. That is a migration this change owns.

### The profile schema mirrors the descriptor schema

`TOURNAMENT_PROFILE_SCHEMA` lives beside `DISCIPLINE_DESCRIPTOR_SCHEMA` in
`packages/domain/src/profiles/`, written in the same draft-07 vocabulary against the same ajv
instance, and reuses the rule-script sub-schema `0009` registered for `winConditionOverride`. Two
module kinds, one validation style.

### Which profiles ship

Three, chosen to cover the shapes the MVP formats support without implying a discipline:

| Alias | Stages | Why it earns a slot |
|---|---|---|
| `liga-ida-vuelta` | one `round-robin-home-away` | The default league; exercises two-leg scheduling |
| `copa-eliminacion` | one `single-elimination` | The default knockout; no points table at all |
| `grupos-y-playoff` | `round-robin` then `single-elimination` | The only shipped multi-stage shape, and the one that proves stage-to-stage qualification is configuration rather than code |

Each declares its tiebreak chain by capability (`primary-scoring`, `defensive-record`), so binding
resolves it per discipline. `grupos-y-playoff` depends on the stage-qualification rules from
`0010-stage-qualification-and-seeding`; if this change is implemented before that one, it ships the
two single-stage profiles and adds the third with 0010.

## Risks / Trade-offs

- **The catalogue and the schema drift apart silently.** → A test validates every shipped document
  against the schema, so a schema change that invalidates the catalogue fails CI rather than an
  operator's first install.
- **A third-party module claiming a first-party alias.** → Prevented upstream, not reconciled
  downstream: catalogue aliases are **reserved names**, and the module-repository pull-request
  validation `0036-community-module-distribution` defines refuses a submission claiming one before it
  is ever accepted into the catalogue repository. The reservation list is the catalogue itself, which
  this change exports so that workflow can read it rather than maintain a second copy.

  A second gate sits in the CLI: `0034` refuses to install over an alias already held under different
  attribution, which covers the one remaining path — a module from an allow-listed alternate source,
  the opt-in escape hatch that phase keeps for private and air-gapped installations.

  The seeder's own check is therefore defense in depth rather than the primary control, and it is
  still worth having: it runs against whatever state the database is actually in, including one
  produced by an older CLI or by direct database access. When it fires, the seeder refuses the
  affected document, names the alias and its conflicting attribution, and installs nothing from that
  run — the same treatment a document failing validation gets. Silently skipping would leave the
  operator with an installation whose `football` is not the `football` the documentation describes.
- **Three profiles is a guess about what operators want.** → Adding one later is a JSON file and a
  test, not a code change. That cheapness is the point of the format.
- **Moving off the TypeScript builders touches 0009's tests.** → The builders stay available for
  tests that need to vary a document (`fixtureDescriptor`-style overrides); only the *shipped* content
  moves to JSON.

## Open gates

- **Tenant vs organization terminology** (open in the naming-conventions decision record): a seeded
  module is installation-wide, not organization-scoped, so this change does not touch the question and
  **defers** it.
- **Whether a catalogue module may be edited in place by an operator** rather than copied to a new
  alias: **deferred** to the Discipline Profile Editor phase. This change only guarantees that
  seeding never overwrites what it finds.
- **Object storage for module media** (`0034` ingests logos and backgrounds into S3-compatible
  storage): the shipped catalogue is **text-only for now**, deliberately, so this change needs no
  storage adapter. Whether first-party modules eventually ship media is **deferred** to 0034.

## Open Questions

- Whether `apps/seed` should also seed a development organization and admin user, or only modules.
  `copalibre create-admin` already exists in the CLI list, which argues for modules only — but the
  architecture's `seed` role says "bootstrap/development data" without qualifying it. Answerable when
  `0028` defines the install flow, without changing this change's specs or tasks.

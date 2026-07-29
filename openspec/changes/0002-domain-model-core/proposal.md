## Why

Every later phase — persistence, the API, the tournament engine, live match operations, both
frontends — needs a single, authoritative, framework-free definition of what a tournament *is*:
organizations, disciplines, rulesets, participants, fixtures, matches, and the events recorded
against them. Without `packages/domain` existing first, phases 3+ would each invent ad hoc types
and the product's core invariants (deterministic competition logic, versioned/inherited
configuration, no direct overwrite of a result) would have no single place to be enforced or tested.

The domain hierarchy, mutation classification, and event/segment model are already decided in
`../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-
authority.md` ("Configuration ownership and profile editors", "Mutation and lifecycle policy", and
"Match segments and discipline events" sections). Identifier and casing rules come from
`../chaos-vault/30-processes/decisions/2026-07-28-copalibre-naming-conventions.md`. This proposal
implements those decisions as TypeScript; it does not invent new domain rules.

## What Changes

- Implement `packages/domain` as **pure, framework-free TypeScript** — per
  `copalibre-platform-architecture.md`'s "Nest boundary" rule, this package (and `packages/rules`)
  must not import `@nestjs/*` or `fastify`.
- Add the **configuration hierarchy** as four related aggregate/value types:
  `DisciplineDescriptor` (reusable per-sport/title profile: participant types, roster constraints,
  segment types, event definitions, statistics, scoring inputs, available formats, notification-rule
  capabilities, UI metadata, defaults) → `TournamentRuleset` (selects a versioned descriptor,
  constrains/overrides only supported properties for one tournament) → `StageConfiguration`
  (refines rules for one phase) → `MatchRuleset` (resolved, immutable, versioned snapshot used to
  generate/operate a match).
- Implement the **override/merge contract**: every configurable field is explicitly
  `inherited` | `replaced` | `merged-by-named-strategy` | `forbidden-to-override`; unspecified deep
  merges are rejected at compile/validation time, not silently allowed.
- Implement an **effective-ruleset compiler**: given a `DisciplineDescriptor` + permitted overrides
  down the chain, produce one validated, immutable effective ruleset — this is the single function
  both fixture generation (phase 6) and the runtime engine will call; it must not be duplicated later.
- Add `Organization`, `Tournament`, `Participant`/`Team`/`Roster`/`Entrant`, `Stage`, `Fixture`,
  `Match`, `Segment` (game/set/map/half/quarter/period/lap/round/timed-interval/other named unit —
  never hardcoded to one sport), and an append-only `Event` log entity (timestamped fact: event
  definition reference, segment reference, occurrence order/time, affected side/participant,
  validated payload).
- Add the **mutation-class** enum `safe | requires_rebuild | blocked_after_results` as a first-class
  type attached to every configuration field's metadata — this is a product contract per the source
  doc, not UI-only guidance.
- Add **event category** as a presentation/accounting classification (`positive` | `negative` |
  `neutral`) on event definitions, explicitly separate from any score/statistic/penalty/state effect
  (which is configured on the event definition itself, never implied by category).
- Add `UUIDv7` and `Alias` value objects: `UUIDv7` generates/validates RFC 9562 v7 identifiers only
  (never v4/ULID); `Alias` validates kebab-case, URL-safe, scope-unique human-readable identifiers
  ("alias", never "slug" — `../chaos-vault/30-processes/decisions/2026-07-28-copalibre-naming-
  conventions.md`).
- Domain types use **camelCase** properties (the API/wire casing rule) since `packages/persistence`
  (phase 4) owns the mapping to snake_case DB columns — the domain layer never speaks snake_case.

## Capabilities

### New Capabilities
- `tournament-domain-model`: framework-free TypeScript domain layer providing the discipline/
  ruleset/stage/match configuration hierarchy, the override/merge and mutation-classification
  contracts, core tournament aggregates (organization, tournament, participant, stage, fixture,
  match, segment, event log), and the UUIDv7/alias identifier value objects that every other package
  and app builds on.

### Modified Capabilities
(none)

## Impact

- **New files**: `packages/domain/src/{descriptors,rulesets,aggregates,events,identifiers}/**`,
  `packages/domain/src/index.ts` (public surface), replacing the phase-1 placeholder.
- **Consumers unblocked**: `packages/rules` (phase 3, decision layer operates on these types),
  `packages/persistence` (phase 4, repositories persist/hydrate these aggregates),
  `apps/api` (phase 5+, controllers accept/return DTOs derived from these types via
  `packages/contracts`), the tournament engine (phase 6).
- **No runtime behavior yet**: no database, no HTTP surface — this package is a library consumed
  in-process by later phases, not a deployable unit itself.
- **Explicit open items carried forward, not resolved here** (per `copalibre-naming-conventions.md`):
  the "tenant" vs. "organization" terminology duplication, and camelCase leaks inside otherwise-
  kebab-case design-token dot-paths — neither affects the domain-layer type names chosen in this
  phase, but both remain open for a future naming-conventions follow-up before public API freeze.

## Context

`packages/domain` is the first real code phase after the phase-1 scaffold. It has no dependencies on
any other package. Every subsequent phase depends on it. See proposal.md for motivation; the
governing product decisions live in `../chaos-vault/30-processes/decisions/2026-07-27-copalibre-
tournament-engine-mvp-and-result-authority.md`.

## Goals / Non-Goals

**Goals:**
- One compiled effective-ruleset function that phases 3 (rules), 6 (fixture generation), and 8 (live
  match ops) all call — never re-implemented.
- Domain types are the only place mutation-class and override rules are defined; UI and API layers
  query them, never duplicate them.

**Non-Goals:**
- No persistence, no Kysely, no SQL — that is `packages/persistence` (phase 4). This package defines
  shapes and invariants only; it does not know how to load or save them.
- No Neuron-JS integration — that is `packages/rules` (phase 3), which *consumes* these domain types
  but is not itself part of the domain package.
- No concrete `DisciplineDescriptor` content for real sports/esports titles (football, VALORANT,
  etc.) — this phase defines the *shape* of a descriptor; populating real descriptors is downstream
  product content work, not architecture.

## Decisions

**Three separate JSON layers stay separate, per the source decision doc.** Domain configuration
(this package), decision rules (`packages/rules`, phase 3), and operational facts (the `Event` log
defined here) are deliberately three different concerns even though all three are ultimately
persisted as JSON/relational data. Mixing them — e.g. letting a `DisciplineDescriptor` embed
executable rule logic — would let a tournament editor rewrite history or embed unvalidated logic.
This package only defines configuration and facts; it exposes typed extension points that
`packages/rules` fills, but never executes anything itself.

**The effective-ruleset compiler lives in `packages/domain`, not `packages/rules`.** Compiling
`DisciplineDescriptor + overrides → MatchRuleset` is pure structural validation (is this override
permitted, does this merge strategy exist) with no decision-evaluation semantics — it belongs next to
the types it validates. `packages/rules` calls the compiled `MatchRuleset` as an input, it does not
produce one.

**Mutation class is per-field metadata, not a separate rules table.** Attaching `safe |
requires_rebuild | blocked_after_results` directly to each field's type definition (rather than a
side lookup table) means the classification cannot drift out of sync with the field it describes,
and TypeScript's type system can enforce that every configurable field declares one.

**Segments and events are named, not enumerated.** The domain does not hardcode `Half | Period | Set`
as a closed union — segment types are discipline-declared strings validated against the active
`DisciplineDescriptor`'s segment-type registry. Alternative considered: a closed enum covering common
sports — rejected because it would force a code change for every new discipline, contradicting the
"multi-discipline, not sport-shaped" product principle from `copalibre/README.md`.

## Risks / Trade-offs

- [Risk] A framework-free package with no persistence is easy to over-abstract speculatively (e.g.
  building generic "plugin" extension points nobody uses yet). → Mitigation: this phase implements
  only the 6 MVP-relevant structures named in the source decision doc; no additional abstraction
  layers.
- [Risk] The override/merge validator is exactly the kind of logic that's easy to get subtly wrong
  (e.g. allowing a merge where only replace was declared). → Mitigation: task list requires
  exhaustive unit tests per merge-strategy combination, not just happy-path coverage.
- [Risk] Defining `Organization`/`Tournament` here before `packages/persistence` exists means the
  eventual DB schema (phase 4) must map cleanly onto these shapes. → Mitigation: keep domain types
  free of any ID-generation or default-value side effects, so mapping to snake_case columns in phase
  4 is pure structural translation, not behavior reconciliation.

## Open Questions

- The first standard tiebreak parameter catalogue and default comparator order per competition type
  is explicitly still open per the source decision doc ("The remaining open decision is the first
  standard parameter catalogue..."). This does not block this phase — the domain layer defines the
  comparator-pipeline *shape*, not its default content — but phase 3 or phase 6 must resolve it
  before the tiebreak engine ships real defaults.
- Whether `Organization` and a future multi-tenant "tenant" concept are the same entity or two
  related entities is explicitly unresolved in `copalibre-naming-conventions.md`. This phase treats
  `Organization` as the only tenancy boundary; revisit if a future phase needs cross-organization
  tenancy.

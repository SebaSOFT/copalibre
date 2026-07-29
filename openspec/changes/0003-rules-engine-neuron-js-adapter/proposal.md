## Why

CopaLibre's product invariants require **deterministic, explainable** competition logic: the same
rules and inputs must reproduce the same outcome, and every standing must show which rule resolved a
tie. Hardcoded `if/else` tiebreak and eligibility logic cannot satisfy the "explainable rankings"
principle from `copalibre/README.md`, and re-implementing a rules engine from scratch would ignore
the already-published, already-decided tool for this: `@sebasoft/neuron-js` (confirmed as a real,
maintained package this session — see `../neuron-js/README.md`), explicitly named as CopaLibre's
decision runtime in `../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-
mvp-and-result-authority.md` ("Neuron-JS decision layer" section).

This phase builds the adapter package that lets CopaLibre's domain layer (phase 2) express tiebreak,
eligibility, advancement, and notification rules as versioned, auditable Neuron-JS decisions instead
of scattered conditional code.

## What Changes

- Implement `packages/rules` as a **framework-free TypeScript adapter** around `@sebasoft/neuron-js`
  (no `@nestjs/*`/`fastify` import, same boundary rule as `packages/domain`).
- Add a **typed registry of permitted actions, conditions, and parameters**: a `DisciplineDescriptor`
  (phase 2) may reference these by stable identifier only — it cannot inject arbitrary executable
  code. This is the mechanism that keeps rule authorship declarative and safe for a self-hosted,
  multi-tenant product.
- Implement the **tiebreak comparator pipeline**: an ordered sequence of declared, auditable
  accounting parameters, each with a stable identifier, value type, aggregation scope/calculation
  rule, comparison direction (`higher_wins` | `lower_wins` | explicit ordered-value comparator), and
  missing/invalid/equality-value behavior. The engine evaluates comparators in sequence until a tie
  resolves.
- Implement **eligibility and lineup checks** as Neuron-JS rule documents evaluated against
  participant/roster facts.
- Implement **advancement and state-transition guards**: deterministic rules that decide whether a
  match/stage outcome permits progressing to the next stage, consuming the domain layer's
  `MatchRuleset` and recorded `Event` log as inputs.
- Implement **event-triggered notification rules**: scope (match/segment/team/participant/other),
  input predicate (event type/category + payload condition), aggregation (count/sum/duration/
  sequence/other reducer), threshold/comparator, trigger semantics (threshold-crossing, every
  qualifying event, or bounded repeat/cooldown), and an in-console notification action (severity,
  title/message template, target role, contextual values). Delivery must be idempotent so a
  reconnect/refresh/recalculation never duplicates an alert for the same threshold crossing.
- Implement the **explanation-trace contract**: every decision evaluation retains its ruleset
  version, input facts, output, and a human-inspectable explanation trace — this is what phase 16's
  Standings & Explainable Tiebreakers screen renders directly, so trace structure must be stable and
  serializable.
- Keep decision rules (this package) strictly separate from domain configuration (phase 2) and
  operational facts (the `Event` log, also phase 2) — this package only evaluates, it never mutates
  domain state.

## Capabilities

### New Capabilities
- `rules-engine`: a `@sebasoft/neuron-js`-backed adapter providing a typed, registry-scoped action/
  condition/parameter vocabulary, a tiebreak comparator pipeline, eligibility/advancement guards,
  event-triggered notification rules, and a versioned, auditable explanation-trace contract for every
  decision evaluated.

### Modified Capabilities
(none)

## Impact

- **New files**: `packages/rules/src/{registry,tiebreak,eligibility,advancement,notifications,trace}/**`,
  `packages/rules/src/index.ts`, replacing the phase-1 placeholder.
- **New dependency**: `@sebasoft/neuron-js` (published npm package, MIT-licensed per
  `../neuron-js/README.md`'s license badge — compatible with CopaLibre's AGPL posture the same way
  shadcn/ui and Radix are, per `copalibre-platform-architecture.md`'s license section).
- **Depends on**: `packages/domain` (phase 2) for `DisciplineDescriptor`, `MatchRuleset`, `Event`,
  and participant/roster types.
- **Consumers unblocked**: `0006-tournament-engine-fixtures-mvp-formats` (phase 6, standings/tiebreak
  calculation), `0008-live-match-operations-result-authority` (phase 8, advancement guards and
  notification rules), `0016-standings-bracket-builder-control` (phase 16, renders this package's
  explanation trace verbatim in the UI — a later contract test must assert UI trace equals engine
  trace).
- **Explicit open item carried forward, not resolved here**: "the first standard parameter catalogue
  and default comparator order for each supported competition type" is still open per the source
  decision doc. This phase ships the comparator-pipeline mechanism and its typed shape; populating
  real default catalogues per competition type is deferred to phase 6, where the 6 MVP formats are
  implemented against real fixtures.

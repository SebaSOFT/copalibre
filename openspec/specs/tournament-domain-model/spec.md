# tournament-domain-model Specification

## Purpose
Provides the single, framework-free source of truth for what a tournament, its configuration, and
its recorded facts are, so every consuming package and app shares identical domain rules instead of
re-deriving them.
## Requirements
### Requirement: Framework-free domain package
`packages/domain` SHALL contain no import of `@nestjs/*` or `fastify`, so it can be consumed by any
process role (`api`, `worker`, `events`, `scheduler`) and by future non-Node consumers without
pulling in an HTTP framework.

#### Scenario: Domain package has no framework dependency
- **WHEN** the dependency graph of `packages/domain` is inspected
- **THEN** it contains no `@nestjs/*` or `fastify` package

### Requirement: Configuration inheritance hierarchy
The domain SHALL model configuration as `DisciplineDescriptor → TournamentRuleset →
StageConfiguration → MatchRuleset`, where each level may only override fields the level above
explicitly marks as overridable.

#### Scenario: Compiling an effective ruleset from a valid override chain
- **WHEN** a `TournamentRuleset` overrides only fields its `DisciplineDescriptor` marks `replaced` or `merged`
- **THEN** the effective-ruleset compiler produces one validated `MatchRuleset` recording the descriptor and ruleset versions it was compiled from

#### Scenario: Rejecting an override of a forbidden field
- **WHEN** a `TournamentRuleset` attempts to override a field its `DisciplineDescriptor` marks `forbidden-to-override`
- **THEN** compilation fails with a validation error identifying the offending field

#### Scenario: Rejecting an unspecified deep merge
- **WHEN** an override targets a field with no declared merge strategy
- **THEN** compilation fails rather than silently deep-merging

### Requirement: Mutation classification on configuration fields
Every configurable field SHALL declare a mutation class of `safe`, `requires_rebuild`, or
`blocked_after_results`, queryable by any consumer before applying a change.

#### Scenario: Blocked mutation after a result exists
- **WHEN** a caller attempts to change a `blocked_after_results` field on a `TournamentRuleset` that already has at least one recorded match result
- **THEN** the domain layer rejects the mutation outside the audited correction workflow

#### Scenario: Safe mutation applies without side effects
- **WHEN** a caller changes a field classified `safe`
- **THEN** the domain layer applies it without invalidating any existing fixture or result

### Requirement: Discipline-agnostic segment and event model
The domain SHALL represent match subdivisions as generic `Segment`s (game, set, map, half, quarter,
period, lap, round, timed interval, or another named unit declared by the discipline) and SHALL
represent recorded facts as timestamped `Event`s referencing an event definition, a segment, and a
validated payload, with a `positive` | `negative` | `neutral` category that affects presentation only.

#### Scenario: Event category does not imply a score effect
- **WHEN** an event with category `negative` is recorded and its event definition declares no score effect
- **THEN** the match score is unchanged by recording that event

#### Scenario: Recording an event validates its payload against its definition
- **WHEN** an event is recorded whose payload does not satisfy its event definition's schema
- **THEN** the domain layer rejects the event before it is appended to the event log

### Requirement: UUIDv7 and alias identifiers
The domain SHALL identify every persistent entity with a UUIDv7 value object and expose a
human-readable `Alias` value object for organizations, tournaments, and participants, distinct from
the UUIDv7 identifier.

#### Scenario: UUIDv7 generation is time-ordered
- **WHEN** two identifiers are generated in sequence
- **THEN** the second UUIDv7 sorts after the first under standard lexicographic UUID comparison

#### Scenario: Alias rejects non-kebab-case input
- **WHEN** an `Alias` is constructed from a string containing uppercase letters, spaces, or underscores
- **THEN** construction fails validation

#### Scenario: Alias uniqueness is scope-aware
- **WHEN** an organization alias and a tournament alias are compared
- **THEN** the domain enforces organization aliases as globally unique per installation and tournament aliases as unique only within their organization

### Requirement: Attribution on publishable artifacts
`DisciplineDescriptor` and `TournamentProfile` SHALL each carry an attribution block naming the
author, the source URL, and the licence.

#### Scenario: A third-party module states its licence
- **WHEN** a discipline authored outside the project is inspected
- **THEN** its author, source URL and licence are readable from the artifact itself

### Requirement: Semantic versioning of publishable artifacts
Discipline and profile versions SHALL be semantic versions, identifying a release rather than
expressing a compatibility contract.

#### Scenario: Version ordering is well defined
- **WHEN** two versions of one discipline are compared
- **THEN** precedence follows semantic-version ordering

### Requirement: Win condition is discipline-declared and override-governed
The win condition SHALL be a discipline-declared configurable field whose override permission
determines whether a tournament profile may replace it.

#### Scenario: A profile replaces an overridable win condition
- **WHEN** a discipline marks its win condition `replaced` and a profile substitutes timed scoring
- **THEN** the compiled ruleset carries the profile's win condition

#### Scenario: A locked win condition cannot be replaced
- **WHEN** a discipline marks its win condition `forbidden` and a profile attempts to replace it
- **THEN** compilation fails identifying the offending field

### Requirement: Started tournaments freeze their modules
A tournament SHALL have a `started` status, entered through a validated transition, after which its
discipline and profile versions cannot change.

#### Scenario: Starting the first match starts the tournament
- **WHEN** the first match of a tournament begins
- **THEN** the tournament status becomes `started`

#### Scenario: The start transition validates its preconditions
- **WHEN** a tournament is started with unsatisfied required capabilities and no explicit override
- **THEN** the transition is refused, naming the unsatisfied requirements

#### Scenario: A module version change is refused after start
- **WHEN** a caller attempts to change the discipline or profile version of a started tournament
- **THEN** the change is refused as `blocked_after_results`, directing the caller to the audited
  correction workflow

### Requirement: The outcome type carries per-side statistics
`RecordedOutcome` SHALL model a side as an entrant with a map of declared statistic values and an
optional placement, and SHALL permit any number of sides.

#### Scenario: A duel outcome and a placement outcome use one type
- **WHEN** a two-sided football result and an eight-sided heat result are both recorded
- **THEN** both are expressible as the same outcome type without a discipline-specific variant

### Requirement: A stored result is readable without its discipline module
The persisted result SHALL retain the statistic codes it was recorded under, so standings remain
readable after the discipline module version that defined them is retired.

#### Scenario: A retired module does not break a finished tournament
- **WHEN** the discipline descriptor version a finished tournament used is deleted
- **THEN** the tournament's stored outcomes and materialised standings still resolve and render

### Requirement: The win condition is a script, not an enumerated string
`DisciplineDescriptor.winCondition` SHALL be a rule script, and a tournament profile SHALL be able
to replace it only where the descriptor's field policy permits.

#### Scenario: A profile overrides a permitted win condition
- **WHEN** a discipline permits overriding its win condition and a profile substitutes a timed-race
  condition for a competition-race condition
- **THEN** the compiled ruleset carries the profile's condition and records the override in the
  audit trail

#### Scenario: A profile cannot override a locked win condition
- **WHEN** a profile attempts to replace a win condition whose field policy forbids override
- **THEN** compilation fails identifying the locked path

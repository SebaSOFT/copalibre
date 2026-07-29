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


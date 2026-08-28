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
explicitly marks as overridable. This applies uniformly to every overridable field, including the win
condition (see the win-condition requirement below): a field policy of `merged` SHALL always mean an
actual merge by the declared strategy, never a silent full replacement, regardless of which override
path resolves that field.

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
discipline and profile versions cannot change. This freeze applies for every status reachable only
through `started` — `finished` and `archived` included — not to `started` alone.

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

#### Scenario: A module version change is refused on an archived tournament
- **WHEN** a caller attempts to change the discipline or profile version of an `archived` tournament
- **THEN** the change is refused the same way it would be for a `started` or `finished` tournament,
  because archiving never lifts a freeze that already applied

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

#### Scenario: A profile merges a win condition where policy declares a merge strategy
- **WHEN** a discipline marks its win condition `merged` with a declared strategy and a profile supplies
  an override
- **THEN** the effective win condition is the result of applying that strategy to the discipline's win
  condition and the profile's override — never the profile's override standing in wholesale for the
  discipline's

#### Scenario: A win-condition merge that can't apply its declared strategy fails explicitly
- **WHEN** a win condition's declared merge strategy cannot apply to the discipline's and profile's
  values (e.g. an `append-list` strategy where neither value is an array)
- **THEN** resolving the effective win condition fails, naming the field, rather than falling back to
  either value silently

### Requirement: A submitted rule script is validated against what the runtime demands
The descriptor schema SHALL accept only rule scripts the evaluation runtime can execute, so a module
cannot pass installation and fail when a rule is first reached.

#### Scenario: A rule omitting its condition or action list is refused at installation
- **WHEN** a submitted module declares a rule without a `conditions` or `actions` array
- **THEN** installation fails naming the rule, rather than accepting the module and failing at
  evaluation time

#### Scenario: An empty list is accepted, because it means something
- **WHEN** a submitted module declares a rule with an empty `conditions` array
- **THEN** it installs, and the rule fires unconditionally as specified

### Requirement: The competition and participation hierarchies are explicit
The domain SHALL model the competition hierarchy — organization, tournament, season, stage, zone,
group, fixture, match, segment — and the participation hierarchy — club, team, person, and a person's
membership in a team — as distinct levels, rather than collapsing ones that later phases key on.

#### Scenario: A stage belongs to an edition, not to the competition as a whole
- **WHEN** a tournament is run in more than one season
- **THEN** each season carries its own stages, and neither edition's structure is confused with the
  other's

#### Scenario: A human and a membership are separate identities
- **WHEN** a person plays for more than one team
- **THEN** the person is one identity and each membership is another, so a fact can be attributed to
  either

#### Scenario: A level nothing populates is not silently collapsed
- **WHEN** a competition is created without an explicit edition
- **THEN** the season exists with one implicit edition rather than the stage attaching to the
  tournament, so every reader sees one shape

#### Scenario: A zone groups a stage's entrants without merging into the stage itself
- **WHEN** a stage is split into more than one zone (e.g. "Zona Norte" and "Zona Sur")
- **THEN** each zone is its own addressable level, distinct from the stage and from any other zone,
  and a question about one zone's fixtures never silently includes another's

#### Scenario: A group is the round-robin pool a group-type phase needs
- **WHEN** a zone in a round-robin-type stage is split into more than one group
- **THEN** each group's fixtures and standings are computed independently, and no fixture is generated
  between entrants of different groups

#### Scenario: A stage with no explicit zone or group still has one of each
- **WHEN** a stage's fixtures are generated without an operator ever creating a zone or a group
- **THEN** the stage has exactly one implicit zone and that zone exactly one implicit group, and every
  reader — old or new — sees the same fixture graph and standings it would have before zones and groups
  existed

### Requirement: A match states that it was never required
The match status vocabulary SHALL carry a terminal value meaning the match was generated and scheduled
but is no longer needed, distinct from both a match awaiting play and a match that concluded. A match
in that state SHALL accept no lifecycle command and SHALL contribute nothing to accounting, and the slot
it had occupied SHALL remain readable from the fact that anulled it, even though it no longer holds it.

#### Scenario: A status vocabulary that says what happened
- **WHEN** the status of a match anulled by an early series decision is read
- **THEN** it states the not-required value, distinguishable without inference from a match still to be
  played and from a match that finished

#### Scenario: A lifecycle command against a not-required match is refused
- **WHEN** any match lifecycle command is issued against a not-required match
- **THEN** it is refused, and the match's status is unchanged

### Requirement: A series declaration is part of the configuration hierarchy
The series a fixture is settled by SHALL be declared through the existing configuration inheritance
hierarchy — discipline descriptor, tournament ruleset, stage configuration — and SHALL resolve by the
same precedence every other configuration field resolves by. A discipline whose competitions are
conventionally decided over several matches SHALL be able to declare that as its default, and a
tournament or a stage SHALL be able to override it.

#### Scenario: A discipline default is overridden by a stage
- **WHEN** a discipline declares a two-match aggregate series by default and a stage declares a
  best-of-five
- **THEN** the effective configuration for that stage is the best-of-five, by the precedence the
  hierarchy already defines

#### Scenario: A tournament with no series declaration anywhere
- **WHEN** no level of the hierarchy declares a series
- **THEN** the effective configuration settles every fixture by a single match

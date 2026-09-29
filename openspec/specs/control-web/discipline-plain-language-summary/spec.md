# control-web/discipline-plain-language-summary Specification

## Purpose
Translates a `DisciplineDescriptor`'s segments, rules, and events into plain-language text instead
of raw JSON, so an operator who did not author the discipline can understand its configuration
without reading the underlying document — including which events can change a match's result and
who each event applies to.

## Requirements

### Requirement: Segments are described in plain language
The summary SHALL render each of a discipline's segment types as a plain-language sentence stating
its name, whether it runs a clock, and its default duration when timed. It SHALL NOT render the
segment type as a JSON object or field-by-field key/value list.

#### Scenario: A timed segment shows its default duration
- **WHEN** the summary renders a segment type with `timed: true` and a `defaultDurationSeconds` value
- **THEN** it states, in prose, that the segment runs a clock and what its default duration is

#### Scenario: An untimed segment omits duration language
- **WHEN** the summary renders a segment type with `timed: false`
- **THEN** it states that the segment has no clock and never mentions a duration for it

### Requirement: Rule fields are described in plain language
For each field a discipline's `RulesetConfig` and `ConfigFieldPolicies` declare, the summary SHALL
show a human-readable name and, in prose, what its override permission and mutation class mean for
an organizer, instead of the field's raw dot-path and policy object.

#### Scenario: A field carries an author-declared label
- **WHEN** a configured field's `FieldPolicy` declares a `label`
- **THEN** the summary shows that label instead of the field's dot-path

#### Scenario: A field carries no author-declared label
- **WHEN** a configured field's `FieldPolicy` declares no `label`
- **THEN** the summary derives a readable name from the field's dot-path rather than showing the
  dot-path itself or omitting the field

#### Scenario: A forbidden field is explained as locked
- **WHEN** a configured field's override permission is `forbidden`
- **THEN** the summary states, in plain language, that the field cannot be changed per tournament

#### Scenario: A requires-rebuild field is explained
- **WHEN** a configured field's mutation class is `requires_rebuild`
- **THEN** the summary states, in plain language, that changing it requires rebuilding the
  tournament

### Requirement: Events state whether they can change the match result
For every event a discipline declares, the summary SHALL visually distinguish events that can change
a match's result from events that cannot, determined solely by whether `EventDefinition.effects`
contains an effect of kind `score`, `statistic`, or `match-state`. The summary SHALL NOT use
`EventDefinition.category` to make this determination.

#### Scenario: An event with a score effect is marked as result-affecting
- **WHEN** an event's `effects` include an effect of kind `score`
- **THEN** the summary marks that event as one that can change the match's result

#### Scenario: An event with only a timed-penalty effect is not marked as result-affecting
- **WHEN** an event's `effects` include only effects of kind `timed-penalty`, `tag`, or
  `roster-role-snapshot`, and none of kind `score`, `statistic`, or `match-state`
- **THEN** the summary does not mark that event as one that changes the match's result

#### Scenario: A negative-category event without a scoring effect is not marked as result-affecting
- **WHEN** an event's `category` is `negative` and its `effects` contain no effect of kind `score`,
  `statistic`, or `match-state`
- **THEN** the summary does not mark that event as result-affecting, regardless of its category

### Requirement: Events state who they apply to
For every event a discipline declares, the summary SHALL state, in plain language, whether the event
applies to a team, to a person, or to no specific actor, derived from
`EventDefinition.actorRequirement`.

#### Scenario: A side-scoped event is described as applying to the team
- **WHEN** an event's `actorRequirement` is `side`
- **THEN** the summary states that the event applies to the team

#### Scenario: A person-scoped event is described as applying to a player
- **WHEN** an event's `actorRequirement` is `person` or `person-or-staff`
- **THEN** the summary states that the event applies to a player (or, for `person-or-staff`, a
  player or staff member)

#### Scenario: An actorless event states no specific actor
- **WHEN** an event's `actorRequirement` is `none`
- **THEN** the summary states that the event does not apply to a specific team member or team

### Requirement: The summary is discipline-agnostic
The summary SHALL render correctly for any discipline solely from its `DisciplineDescriptor` data,
using no discipline-specific branching, hardcoded sport name, or hardcoded event/segment/statistic
code.

#### Scenario: Two unrelated disciplines both render without discipline-specific code
- **WHEN** the summary renders descriptors for two disciplines with disjoint segment types, event
  codes, and rule fields
- **THEN** both render correctly through the same component logic, with no discipline name or code
  referenced in that logic

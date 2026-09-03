# discipline-driven-results Specification

## Purpose
Makes the recorded result model belong to the discipline rather than to the engine: a match records
the statistics its discipline declares, for any number of sides, and declares in a script how it is
won — so a nested-scoring discipline (tennis) and a non-duel discipline (battle royale, swimming)
are both expressible without engine changes.

## Requirements

### Requirement: A result records the statistics the discipline declares
A recorded outcome SHALL carry, per side, values keyed by the statistic codes the bound discipline
declares, rather than a single fixed score. A discipline MAY additionally declare **collectors**,
which aggregate recorded facts over the competition and actor hierarchies without changing what a
result records.

#### Scenario: A discipline scoring at several levels records all of them
- **WHEN** a tennis match is recorded in which one side won 2 sets to 1 and 18 games to 14
- **THEN** the outcome carries that side's `matches-won`, `sets-won`, `sets-lost`, `games-won` and
  `games-lost` values, and the standings expose every one of them

#### Scenario: A statistic the discipline does not declare is rejected
- **WHEN** a result is submitted carrying a statistic code the bound discipline does not declare
- **THEN** the submission is rejected identifying the unknown code, rather than being silently stored

#### Scenario: Declaring a collector changes nothing a result records
- **WHEN** a discipline adds a collector to a descriptor
- **THEN** the shape of a recorded outcome is unchanged, and results written before the collector
  existed remain valid

### Requirement: Standings aggregate by the declared aggregation mode
Accounting SHALL fold each declared statistic across an entrant's outcomes using that statistic's own
declared aggregation mode, and SHALL NOT assume any statistic code.

#### Scenario: Sum and max aggregate differently in one discipline
- **WHEN** a discipline declares one statistic aggregated as `sum` and another as `max`, and an
  entrant has three recorded outcomes
- **THEN** the first statistic is the total across the three and the second is the highest of the
  three

#### Scenario: No statistic is produced that the discipline did not declare
- **WHEN** standings are computed for a discipline that declares no `points` statistic
- **THEN** no `points` value appears in the standings rows

### Requirement: A result may have more than two sides
A recorded outcome SHALL accept any number of sides, and accounting SHALL process every side.

#### Scenario: An eight-lane heat is accounted in full
- **WHEN** a placement match with eight sides is recorded
- **THEN** all eight entrants receive their aggregated statistics in the stage standings

#### Scenario: A placement is recorded alongside statistics
- **WHEN** a placement match result assigns each side a finishing position
- **THEN** each side's placement is stored and available to the standings ranking

### Requirement: A discipline declares its win condition as a script
A discipline SHALL declare how a match is won as a rule script over the core-provided action
registry, and the registry SHALL NOT be extendable by a module.

#### Scenario: A nested, margin-sensitive win condition is expressible
- **WHEN** a discipline declares that a set is won at 6 games with a 2-game margin, that 6-6 goes to
  a tiebreak of 7 points with a 2-point margin, and that a match is the first to 2 sets with no
  margin
- **THEN** a 7-6, 6-7, 6-4 result closes the match for the side that took two sets

#### Scenario: A module referencing an unknown action fails validation
- **WHEN** a submitted discipline module's win-condition script references an action the core
  registry does not provide
- **THEN** module validation rejects it naming the unknown action, and the module is not installed

### Requirement: Segment thresholds are observable as events
Progress toward closing a segment or a match SHALL be emitted as events that notification rules can
subscribe to, without a mechanism dedicated to any one discipline.

#### Scenario: Match point raises a subscribable event
- **WHEN** a side reaches a state one scoring unit away from satisfying the match win condition
- **THEN** a segment-threshold event is emitted carrying which side and which threshold, and an
  existing notification rule can trigger on it

### Requirement: Every recorded event may carry an optional operator note

A recorded event SHALL support an optional free-text note, independent of the discipline that
defines the event and independent of the event's `payloadSchema`.

#### Scenario: An operator records a note with an event

- **WHEN** an operator records an event and supplies a note
- **THEN** the note is persisted alongside the event and reads back unchanged

#### Scenario: A note is available regardless of discipline

- **WHEN** any discipline's event is recorded, whether or not that discipline declares anything about
  notes in its own document
- **THEN** the optional note field is available on the recording request

### Requirement: A per-side outcome SHALL support an independent result reason

Each side/entrant's recorded outcome MAY carry an optional `resultReason`, independent of every
other side/entrant's own reason in the same match; the system SHALL NOT require a single reason to
apply to every side of a match.

#### Scenario: A free-for-all match records different reasons per competitor

- **WHEN** a placement-format match finishes with one competitor disqualified and the rest finishing
  normally
- **THEN** the disqualified competitor's outcome carries `resultReason: 'disqualified'` and the
  others' outcomes are unaffected, each independently

#### Scenario: An omitted reason means an ordinarily played result

- **WHEN** a side's outcome carries no `resultReason`
- **THEN** it is read as an ordinarily played result, identical to every result recorded before this
  requirement existed

### Requirement: Statistic and tag effects support target attribution

An `EventDefinition`'s declared `effects` SHALL support target attribution for `statistic` and `tag` effects, allowing a single recorded event to modify statistics and tags for actors other than the primary acting participant.

#### Scenario: A statistic effect targets an opposing side
- **WHEN** an event declares an effect `{ kind: 'statistic', statisticCode: 'goals-against', delta: 1, awardTo: 'every-other-side' }`
- **THEN** the fold applies the statistic delta of +1 to the opponent's side rather than the acting side

#### Scenario: A statistic effect targets a person named in the event payload
- **WHEN** an event declares an effect `{ kind: 'statistic', statisticCode: 'assists', delta: 1, awardTo: { payloadField: 'assistedBy' } }`
- **THEN** when an event is recorded with `payload.assistedBy: 'person-123'`, the fold awards the +1 assist delta to `'person-123'`

#### Scenario: A tag effect targets a person named in the event payload
- **WHEN** an event declares a tag effect `{ kind: 'tag', tagCode: 'eliminated', action: 'applied', target: { payloadField: 'victimId' } }`
- **THEN** recording the event produces a `tag_facts` row with `actorId: payload.victimId` and `action: 'applied'`

#### Scenario: An undeclared payloadField in an effect is rejected during descriptor validation
- **WHEN** an event effect references a `payloadField` that is not declared in the event's `payloadSchema.properties`
- **THEN** module distribution validation rejects the discipline descriptor with an informative validation error

### Requirement: Recorded match events snapshot active segment elapsed clock

The event recording system SHALL automatically snapshot the active segment's `elapsedSeconds` onto the `RecordedEvent` when an event occurs in a timed segment.

#### Scenario: Event recorded in an active timed segment captures elapsed seconds
- **WHEN** an operator records an event while a match segment with `elapsedSeconds: 842` is active
- **THEN** the persisted `RecordedEvent` carries `segmentElapsedSeconds: 842`

#### Scenario: Event recorded in a non-timed segment omits elapsed seconds
- **WHEN** an event is recorded in a non-timed segment (e.g. tennis set) with no active running clock
- **THEN** the persisted `RecordedEvent` has `segmentElapsedSeconds: null` or omitted

### Requirement: Discipline descriptors declare own-goal and counter-goal event mechanics

A discipline descriptor SHALL support declaring an `own-goal` event definition whose effects award score to the opposing side while attributing statistics to the faulting player and team.

#### Scenario: An own goal awards a point to the opponent
- **WHEN** an `own-goal` event is recorded for a player of Team A
- **THEN** the match score awards +1 point to Team B (`awardTo: 'every-other-side'`), increments `goals-against` for Team A, and increments `player-own-goals` for the player

### Requirement: Discipline descriptors and tournament rulesets declare table layouts

A `DisciplineDescriptor` and a `TournamentRuleset` SHALL support declarative `tableLayouts` defining the columns, sources, formats, multi-column sorting, and qualification filters for standings and ranking views across match, stage, schedule, and tournament contexts.

#### Scenario: A discipline declares custom table layouts
- **WHEN** a discipline descriptor declares a `tableLayouts` array containing `group-phase` and `player-ranking` table definitions
- **THEN** descriptor validation accepts the layout definitions and registers them for projection evaluation

#### Scenario: A tournament ruleset overrides a discipline table layout
- **WHEN** a tournament ruleset specifies `tableLayouts` modifying column order or enabling optional statistical columns
- **THEN** the tournament's effective configuration adopts the tournament's table layout overrides

#### Scenario: A table layout referencing an undeclared collector is rejected
- **WHEN** a table layout column declares `source: { kind: 'collector', code: 'unknown-code' }` and that collector code is not declared in the discipline
- **THEN** descriptor validation rejects the document with an error identifying the missing collector

#### Scenario: A shipped discipline declares a real, tournament-wide player leaderboard
- **WHEN** `football-descriptor.ts` declares a `tableLayouts` entry with `entityGranularity: 'person'`,
  `target: 'tournament'`, and a `collector`-sourced column summing the `goals-for` statistic per player
- **THEN** descriptor validation accepts it, and projecting it against a tournament's recorded events
  produces a ranked list of players by total goals across every stage — the first shipped descriptor to
  exercise the `tableLayouts` mechanism with real content rather than an illustrative example

### Requirement: A discipline-defined event may offer explicitly declared outcomes

An `EventDefinition` MAY declare `workflow: { kind: 'outcome-choice', options: [...] }`. A match-control
console SHALL expose those options after operator selects workflow-bearing definition. The preliminary
selection is console interaction metadata, not separately persisted event; console SHALL record only
chosen outcome as ordinary event validated against its own definition.

#### Scenario: Selecting an outcome records only selected final event
- **WHEN** operator selects workflow-bearing definition and then selects one declared outcome option
- **THEN** console records selected outcome definition once, with no persisted preliminary event or
  workflow linkage

#### Scenario: Workflow outcome is not dependent on preliminary record
- **WHEN** operator records definition that is listed as a workflow option without first selecting its
  workflow-bearing definition
- **THEN** event records successfully under its own validation rules

#### Scenario: Operator abandons an outcome choice
- **WHEN** operator opens workflow outcome choices and does not select an outcome
- **THEN** no event is recorded from preliminary selection

### Requirement: Outcome workflow preserves event occurrence time and requires explicit attribution

Console SHALL capture occurrence time when operator first selects workflow-bearing definition and use that
time for chosen outcome. Workflow SHALL NOT copy, derive, or preselect actor, side, person, victim,
goalkeeper, deflecting person, or secondary payload fields for outcome; outcome uses ordinary explicit
console attribution controls and its own declared payload schema.

#### Scenario: Outcome keeps preliminary-selection time
- **WHEN** operator selects workflow-bearing definition, spends time selecting an outcome or entering
  notes, and then records outcome
- **THEN** recorded outcome's occurrence time equals time preliminary definition was selected, not time
  outcome confirmation completed

#### Scenario: Workflow does not infer outcome attribution
- **WHEN** preliminary selection included a selected side, person, victim, or secondary payload field
- **THEN** workflow does not copy or derive those values specifically for chosen outcome, and outcome
  receives only attribution operator explicitly supplies through its ordinary controls

#### Scenario: Deflected outcome needs no named player
- **WHEN** a future discipline declares outcome representing deflected or missed attempt
- **THEN** generic workflow requires neither `deflectedToPersonId` nor any player-specific deflection
  attribution; descriptor decides only its own independently declared payload and effects

### Requirement: A discipline may declare what its fields and options mean
A discipline descriptor MAY declare, for each field, statistic, format, event definition and closed-set
option it introduces, a short description of what that declaration causes during a competition. The
description SHALL be optional: a descriptor that declares none SHALL remain valid and SHALL behave
identically to one authored before descriptions existed.

A declared description SHALL be carried with the declaration wherever the descriptor is read, so a
surface rendering the field never has to source the explanation from anywhere else.

#### Scenario: A descriptor declaring descriptions validates
- **WHEN** a discipline descriptor declares a description on a statistic and on each option of a closed
  set
- **THEN** the descriptor validates and the descriptions are readable from the loaded descriptor

#### Scenario: A descriptor declaring no descriptions still validates
- **WHEN** a discipline descriptor authored before descriptions existed is loaded
- **THEN** it validates unchanged and every field reports no description rather than an empty one

#### Scenario: A description travels with its declaration
- **WHEN** any surface reads a descriptor field that declares a description
- **THEN** the description is available from that field, not from a separate lookup the surface has to
  perform against a catalogue of its own

### Requirement: Match result score presentation
Every surface that displays a finalized match's score (control-web, public-web, TV/broadcast surfaces,
table projections) SHALL present the discipline's declared primary score value, not an arbitrary key of
the recorded `statistics` map. A finalized match's score presentation SHALL be independent of the
iteration order of its stored statistics.

#### Scenario: A community discipline whose primary score statistic is not alphabetically or
positionally first in its statistics map
- **WHEN** a match is finalized with `statistics` containing `wins`, `losses`, `played`, and `points-for`
  in any order
- **THEN** every surface presenting that match's score SHALL show the value of `points-for` (or the
  discipline's declared equivalent), never the value of an unrelated statistic such as `wins`

#### Scenario: Score matches the match's own recorded event history
- **WHEN** a match's event timeline records scoring events summing to a given total for each side
- **THEN** the displayed score for that match SHALL equal that total for each side

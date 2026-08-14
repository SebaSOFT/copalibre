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


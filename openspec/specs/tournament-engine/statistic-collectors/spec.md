# statistic-collectors Specification

## Purpose
Turns a statistic from something a phase computes into something a discipline declares: an
aggregation of recorded facts over the competition hierarchy and the actor hierarchy, answerable at
any granularity on either, and stored in a shape that does not change when a new one is invented.
## Requirements
### Requirement: The hierarchies a statistic is collected over are core-owned
The system SHALL publish the granularities of the competition hierarchy and of the actor hierarchy, and a
module SHALL NOT introduce a level of its own.

#### Scenario: A collector names a granularity on each hierarchy
- **WHEN** a discipline declares a collector naming a published granularity on both axes
- **THEN** the declaration validates and the collector is evaluated at that grain

#### Scenario: A level the hierarchy does not publish is refused
- **WHEN** a declaration names a level outside the published set
- **THEN** it is refused, naming the unknown granularity and listing the published ones

#### Scenario: A level no phase populates yet reads as inert
- **WHEN** a collector is grained at a published granularity that nothing populates
- **THEN** the declaration is reported as inert rather than accepted as if it would produce numbers

### Requirement: A statistic is declared, not implemented
A discipline SHALL be able to add a statistic by declaring a collector — what it watches, how it
aggregates, and its grain — without a core release and without changing any stored shape.

#### Scenario: A discipline counts something nobody anticipated
- **WHEN** a discipline declares a collector over an event code it defines, grained per person per match
- **THEN** the totals are produced and readable, with no new column, table or document shape

#### Scenario: A collector may aggregate another collector
- **WHEN** a collector declares another collector as its source
- **THEN** it aggregates that collector's output rather than re-reading the event log

### Requirement: Reading one step coarser is the whole of rolling up
A collector's total SHALL be readable at every level above its grain on both axes, without the
discipline declaring the relationship between a level and the one above it.

#### Scenario: A team's total is its players' total, read higher
- **WHEN** a collector grained per person is read at the team level
- **THEN** it reports what those persons produced for that team, with nothing declared to relate them

#### Scenario: A club's numbers cross the tournaments it entered
- **WHEN** a club's total is read at the organization level
- **THEN** it spans every tournament the club's teams entered, because an enrollment binds an actor to
  a competition rather than being a granularity on either

#### Scenario: A collector is not readable above the level it declares as its ceiling
- **WHEN** a collector declares how far up it may be read and a caller asks above that
- **THEN** the read is refused rather than answered with a number the discipline did not sanction

### Requirement: Aggregation states how each measure combines
The system SHALL aggregate a measure by the operation that measure permits, and SHALL recompute
rather than combine where combining would be wrong.

#### Scenario: Counts and sums combine by adding
- **WHEN** a counted or summed collector is read one step coarser
- **THEN** the value is the sum of the values below it

#### Scenario: An average is recomputed from the grain
- **WHEN** an averaged collector is read one step coarser over groups of different sizes
- **THEN** the value is computed from the underlying samples, not from the mean of the means

#### Scenario: Extremes combine as extremes
- **WHEN** a maximum or minimum is read one step coarser
- **THEN** the value is the extreme of the values below it, not their sum

### Requirement: Accumulation frequency is the grain, and no figure is discarded
A collector's grain SHALL determine how often a figure is kept, and every coarser figure SHALL be an
aggregation of the finer ones, so no accumulation boundary discards a recorded number.

#### Scenario: Two event codes accumulate as one count
- **WHEN** a discipline declares one collector naming two event codes, and one of each is recorded
- **THEN** the collector reads two

#### Scenario: A code no collector names accumulates nowhere
- **WHEN** a discipline declares a collector for one infraction and none for another, and both occur
- **THEN** only the declared one advances a total

#### Scenario: A figure kept per period and the figure for the whole match coexist
- **WHEN** a collector is grained inside a segment and the match is read
- **THEN** each segment's figure remains readable and the match figure is their aggregate, with
  neither discarding the other

#### Scenario: A count toward a sanction does not reset a career
- **WHEN** a rule counts toward a threshold from the last recorded consequence
- **THEN** the window belongs to the rule, and the actor's total across the competition is unaffected
  by having crossed it

#### Scenario: Crossing a threshold is a rule's business, not a collector's
- **WHEN** a collector's total reaches a threshold a rule watches
- **THEN** the rule raises the consequence, and the collector itself neither suspends nor notifies

### Requirement: Every stored total is derived from a recorded fact
A total SHALL be produced by aggregating facts, and an adjustment SHALL be recorded as a fact rather
than written to the total, so the projection stays rebuildable from the log.

#### Scenario: A declared increment moves a total
- **WHEN** an event definition or a script declares an adjustment to a collector
- **THEN** the total moves by the declared amount, and re-aggregating the same facts reproduces it

#### Scenario: A hand adjustment carries a name and a reason
- **WHEN** an operator corrects a miscounted total
- **THEN** the adjustment is recorded with the actor, the reason and the amount, and the total follows
  from that record rather than from a direct write

#### Scenario: A total cannot be set from outside
- **WHEN** any caller attempts to write a stored total directly
- **THEN** there is no such path, so rebuilding the projection from the log can never lose a number

#### Scenario: An appearance counts without an event
- **WHEN** a person is named in a match's roster and records nothing during it
- **THEN** a collector counting appearances still counts one for them

### Requirement: Totals survive correction and recomputation
Stored totals SHALL be derived from recorded facts such that a correction leaves no total the facts
do not support, and recomputation never double-counts.

#### Scenario: A corrected result rewrites the totals it touched
- **WHEN** a result is superseded through the audited correction workflow
- **THEN** the affected totals are recomputed from the corrected facts rather than adjusted in place

#### Scenario: Replaying the log produces the same totals
- **WHEN** the same facts are aggregated twice
- **THEN** the totals are identical, and nothing is counted a second time

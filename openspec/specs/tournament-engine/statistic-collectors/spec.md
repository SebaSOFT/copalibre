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

### Requirement: A collector threshold rule is authorable ruleset config, delivered as a notification

A tournament's ruleset config MAY declare collector-threshold rules — a collector, an actor
granularity, a comparator/value threshold, and a window — evaluated as events are recorded, with each
crossing delivered as a notification over the same realtime channel other match notifications use.
Crossing a threshold SHALL NOT itself apply any suspension, block, or other enforcement.

#### Scenario: A career-window rule fires once and does not reset

- **WHEN** a rule with a `since-last-consequence` window fires because an actor's collector total
  crosses the threshold
- **THEN** a notification is raised, the rule's own consumed-window resets, and the actor's
  underlying collector total is unaffected by the firing

#### Scenario: Crossing the threshold enforces nothing by itself

- **WHEN** a collector-threshold rule fires
- **THEN** no roster, lineup, or match operation is blocked or altered as a result — only a
  notification is raised, matching `declared-tagging`'s "a tag states what is true and enforces
  nothing" principle applied to this rule type

### Requirement: A collector folds by default when its match finalizes, or live when it declares so

Every declared `StatisticCollector` SHALL fold on `match.finalized`/`result.superseded` by default. A
collector MAY declare a live cadence, in which case it SHALL also fold inside the same transaction
that records each fact it watches, so its total is current before the match ends.

#### Scenario: A collector with no declared cadence folds only at match end

- **WHEN** a discipline declares a collector without a cadence field
- **THEN** its total updates when the match finalizes or a result is superseded, and not before

#### Scenario: A collector declaring a live cadence updates within the recording transaction

- **WHEN** a collector declares a live cadence and a fact it watches is recorded
- **THEN** its stored total reflects that fact before the recording transaction commits

### Requirement: A rebuild command recomputes every collector's totals from source facts

The system SHALL provide an idempotent rebuild operation that recomputes every `statistic_totals` row
from source facts, scoped to an organization or a single tournament, safe to run at any time without
producing different totals than the event-driven fold path would have produced.

#### Scenario: Rebuilding an organization reproduces its event-driven totals exactly

- **WHEN** every collector in an organization has already folded via the normal event-driven path,
  and the rebuild command runs for that organization
- **THEN** every `statistic_totals` row is unchanged by the rebuild

#### Scenario: Rebuilding populates totals for facts recorded before the fold engine existed

- **WHEN** finalized matches exist with no corresponding `statistic_totals` rows
- **THEN** the rebuild command produces the rows those matches' facts support, identical to what the
  event-driven path would have produced had it been running at the time

### Requirement: A collector may require a tag, checked when the fact is folded

A discipline or tournament MAY declare a collector that only counts a fact from an actor carrying a
named tag, evaluated against the tag's state as of the fact's occurrence, at fold time. The resulting
total SHALL be a plain, pre-computed value — reading it SHALL NOT join against tag state.

#### Scenario: Only tagged actors' facts count

- **WHEN** a collector declares `requiresTag` naming a tag, and two actors record the same event, one
  carrying the tag and one not
- **THEN** the collector's total reflects only the tagged actor's contribution

#### Scenario: Reading the total requires no tag lookup

- **WHEN** a tag-filtered collector's total is read from `statistic_totals`
- **THEN** the read is a plain lookup by its stored key, identical in shape and cost to any other
  collector's total

#### Scenario: An undeclared tag reference is refused

- **WHEN** a collector's `requiresTag` names a tag code the same discipline/tournament document does
  not declare
- **THEN** module validation refuses the document, naming the unresolved tag code

### Requirement: An event-sourced collector may specify an actor extraction source

A discipline or tournament MAY declare an event-sourced `StatisticCollector` that extracts its target actor from an explicit source (`'primary'`, `'every-other-side'`, or `{ payloadField: string }`), evaluated at fold time. The resulting total SHALL be aggregated against the extracted actor identity at the collector's declared granularity.

#### Scenario: A collector aggregates against a payload-specified actor
- **WHEN** a collector declares `source: { kind: 'event', definitionCodes: ['kill'], actorSource: { payloadField: 'victimId' } }`
- **THEN** recorded `kill` events contribute to the `deaths` figure keyed to `payload.victimId` rather than `event.personId`

#### Scenario: An omitted actor source defaults to the primary actor
- **WHEN** an event-sourced collector omits the `actorSource` field
- **THEN** it resolves the primary actor (`event.personId` and `event.side`), retaining exact backward compatibility with all existing collectors

#### Scenario: An opposing side actor source resolves to the opponent
- **WHEN** a team-granularity collector declares `actorSource: 'every-other-side'` and an event is recorded for a side in a match
- **THEN** the folded figure accumulates against the opposing entrant side(s) in that match

#### Scenario: A missing payload field in an event produces no candidate figure
- **WHEN** an event-sourced collector targets an optional `payloadField` that is absent from a recorded event's payload
- **THEN** the fold safely ignores that event for that specific collector without error and without producing an empty key

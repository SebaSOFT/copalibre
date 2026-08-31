# tournament-engine/schedule-slots Specification

## Purpose
TBD - created by archiving change 0157-schedule-at-match-grain. Update Purpose after archive.

## Requirements

### Requirement: A schedule is a range of time cut into slots over one or more venues
A schedule SHALL declare a start instant, an end instant, a slot length in minutes, a changeover in
minutes, and the venues it runs at. It SHALL belong to an organization rather than to a tournament or a
stage, so one schedule can hold matches of several competitions. A schedule SHALL name at least one
venue; one naming none generates nothing and SHALL be refused.

#### Scenario: A schedule spanning several venues is accepted
- **WHEN** an operator declares a schedule over three venues
- **THEN** it is stored with all three, and its grid covers each of them

#### Scenario: A schedule at a single venue is accepted
- **WHEN** an operator declares a schedule over one venue
- **THEN** it is stored and behaves identically to a multi-venue one, with a grid one venue wide

#### Scenario: A schedule with no venue is refused
- **WHEN** an operator declares a schedule naming no venue
- **THEN** the write is refused, naming the reason, and no schedule is stored

#### Scenario: Two schedules may overlap
- **WHEN** two schedules cover the same venue over overlapping hours
- **THEN** both are stored, and the overlap alone is not reported as a conflict

### Requirement: A schedule generates its slots, one per venue per step
Creating a schedule SHALL generate its slots: one for each venue, at each step through the range. Slots
SHALL be laid out one slot length apart plus one changeover, and the changeover SHALL NOT follow the last
slot — so the number of slots per venue is the largest `n` for which
`n × slotMinutes + (n − 1) × turnaroundMinutes` fits within the range. A trailing remainder too short for
a whole slot SHALL NOT become a slot, and a changeover SHALL NOT be occupiable.

#### Scenario: The last slot needs no changeover after it
- **WHEN** a schedule runs twelve hours with ninety-minute slots and a fifteen-minute changeover
- **THEN** it generates seven slots per venue, because seven slots and six changeovers fill the range
  exactly, and an eighth would need more time than the range holds

#### Scenario: A remainder too short for a slot is not a slot
- **WHEN** a schedule's range leaves time after the last whole slot that is shorter than one slot length
- **THEN** that remainder generates no slot, and no match can be placed in it

#### Scenario: The grid covers every venue
- **WHEN** a schedule over three venues generates seven slots each
- **THEN** twenty-one slots exist, and each names the venue it belongs to

### Requirement: A slot states its start, and reads its length and place from elsewhere
A slot SHALL record which schedule and which venue it belongs to and when it starts. Its length SHALL be
read from its schedule and its place from its venue, so neither is stored twice and neither can disagree
with its source.

#### Scenario: A slot's window is its start and its schedule's slot length
- **WHEN** a slot of a ninety-minute schedule is read
- **THEN** its window runs ninety minutes from its own start, taken from the schedule rather than stored
  on the slot

#### Scenario: A slot's place is its venue's
- **WHEN** a slot's location is read
- **THEN** it is the address recorded on its venue, and changing that address changes what the slot
  reports without touching the slot

### Requirement: A schedule cannot be reshaped while its slots hold matches
Changing a schedule's range, slot length, or changeover regenerates its grid, and SHALL be refused while
any of its slots holds a match. Removing a venue SHALL be refused while any of that venue's slots holds a
match. Adding a venue SHALL always be allowed, because it adds slots and alters none.

#### Scenario: Reshaping an occupied schedule is refused
- **WHEN** an operator changes the end instant of a schedule one of whose slots holds a match
- **THEN** the change is refused, naming the occupied slots, and the schedule and its grid are unchanged

#### Scenario: Reshaping an empty schedule succeeds
- **WHEN** an operator changes the slot length of a schedule whose slots are all empty
- **THEN** the grid is regenerated to the new shape

#### Scenario: Adding a venue is always allowed
- **WHEN** an operator adds a venue to a schedule whose existing slots hold matches
- **THEN** the change is accepted, the new venue's slots are generated empty, and no existing slot or
  assignment is altered

#### Scenario: Removing an occupied venue is refused
- **WHEN** an operator removes a venue whose slots hold matches
- **THEN** the change is refused and the schedule is unchanged

### Requirement: A match occupies exactly one slot, and a slot holds as many as its venue allows
A match SHALL be assigned to at most one slot. A slot SHALL hold no more matches than its venue's
declared concurrent capacity, and that capacity SHALL be counted across every schedule at once, since two
overlapping schedules put matches at the same venue at the same moment.

#### Scenario: A match cannot be placed in two slots
- **WHEN** a match already assigned to a slot is assigned to another
- **THEN** it occupies the new slot only, never both

#### Scenario: A venue's capacity admits concurrent matches
- **WHEN** a venue declaring a capacity of three has three matches placed in one of its slots
- **THEN** all three are accepted

#### Scenario: A venue over capacity is refused across schedules
- **WHEN** a match is placed in a slot of one schedule while the same venue already holds its full
  capacity at that moment through a slot of a different, overlapping schedule
- **THEN** the assignment is rejected as a venue conflict naming the matches involved

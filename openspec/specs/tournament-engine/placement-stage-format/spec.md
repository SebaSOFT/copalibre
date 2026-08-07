# placement-stage-format Specification

## Purpose
Adds the free-for-all and heats stage formats, so battle-royale esports, swimming and any
placement-scored discipline can run a stage that qualifies entrants into a later duel stage — without
extending the advancement graph beyond duels.

## Requirements
### Requirement: Free-for-all and heats are generatable stage formats
The engine SHALL generate placement matches for a free-for-all stage, in which all entrants compete
on one table, and for a heats stage, in which entrants are divided into parallel groupings per round.

#### Scenario: A free-for-all round is generated
- **WHEN** a free-for-all stage of twenty entrants and three rounds is generated
- **THEN** three placement matches are produced, each containing all twenty entrants

#### Scenario: A heats round divides entrants into groupings
- **WHEN** a heats stage of thirty-two entrants with a lobby size of sixteen is generated for one round
- **THEN** two placement matches of sixteen entrants each are produced and every entrant appears
  exactly once in the round

### Requirement: Placement matches participate in no advancement edge
A generated placement match SHALL NOT be referenced as the source of another match's slot.

#### Scenario: Advancement never traverses a placement match
- **WHEN** a tournament combines a placement stage with a later elimination stage
- **THEN** no elimination match sources a slot from a placement match, and the later stage is
  populated through the stage qualification contract instead

### Requirement: Lobby allocation is a constrained, reproducible draw
Distributing entrants across parallel groupings SHALL use the constrained draw, honouring declared
separation and distribution constraints, and SHALL be reproducible from a recorded seed.

#### Scenario: A separation constraint holds within a lobby
- **WHEN** a separation constraint on `region` is declared and a heats round is allocated
- **THEN** no lobby contains two entrants sharing that region

#### Scenario: Allocation replays identically
- **WHEN** a heats stage's allocation is replayed with its recorded seed and unchanged inputs
- **THEN** every entrant lands in the same lobby as originally allocated

### Requirement: Lobby composition rotates between rounds
A multi-round heats stage SHALL re-allocate entrants for each round rather than repeating the
previous round's composition, while remaining reproducible from the stage seed.

#### Scenario: Successive rounds differ
- **WHEN** a heats stage of four rounds is generated
- **THEN** lobby composition differs between rounds and the whole stage is still reproducible from
  the one recorded stage seed

### Requirement: A discipline may declare placement points
A descriptor SHALL be able to declare a placement-to-points mapping, applied by the engine when a
placement result is recorded and exposed as an ordinary statistic.

#### Scenario: Placement points combine with performance statistics
- **WHEN** a battle-royale discipline declares placement points and also declares `frags`, and a
  lobby result is recorded
- **THEN** each entrant's placement points and frags are both aggregated into the stage standings and
  are both available to the qualification cut

#### Scenario: Placement points are read by comparators with no special case
- **WHEN** a qualification cut ranks by placement points
- **THEN** the comparator reads them as it reads any other statistic, and the trace names them

### Requirement: A placement stage produces no bracket layout
Generating a placement stage SHALL produce no bracket-layout data, so no surface can attempt to draw
one as a tree.

#### Scenario: No bracket layout exists to attempt
- **WHEN** a placement stage is generated
- **THEN** its matches carry no advancement edges and no bracket-layout data, and the stage is
  expressible only as a ranked table

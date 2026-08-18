## MODIFIED Requirements

### Requirement: Deterministic fixture generation
Given the same entrant list, seed assignment, and format, the engine SHALL generate the identical
fixture graph on every run. This holds per group: two entrants in different groups of the same stage
never generate a fixture between them, and generation for one group is independent of every other
group's entrant list, seed assignment, and result.

#### Scenario: Repeated generation is identical
- **WHEN** fixtures are generated twice from the same entrant list, seeds, and format
- **THEN** both generated fixture graphs are structurally identical, including bye placement

#### Scenario: Grouped generation never crosses group boundaries
- **WHEN** a stage's zone is split into more than one group
- **THEN** every generated fixture's two entrants (or every placement match's slots) belong to the
  same group, and no fixture is ever generated between entrants of different groups

## ADDED Requirements

### Requirement: A stage with no explicit zone or group still generates unchanged

Fixture generation SHALL resolve a stage's implicit zone and that zone's implicit group when an
operator has created neither, and generation through that implicit pair SHALL be indistinguishable
from generation before zones and groups existed.

#### Scenario: Duel format generation is unaffected by the implicit default
- **WHEN** each of the six duel formats is generated for a stage with no explicit zone or group
- **THEN** the generated fixture graph is byte-for-byte identical to what the same entrant list, seed
  order, and format produced before zones and groups existed

#### Scenario: Placement format generation is unaffected by the implicit default
- **WHEN** either placement format is generated for a stage with no explicit zone or group
- **THEN** the generated fixture graph is byte-for-byte identical to what the same entrant list and
  format produced before zones and groups existed

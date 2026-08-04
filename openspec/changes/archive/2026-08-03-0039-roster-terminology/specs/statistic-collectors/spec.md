## MODIFIED Requirements

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

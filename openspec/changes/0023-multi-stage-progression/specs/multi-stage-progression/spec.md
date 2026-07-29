## Purpose

Connects one completed tournament stage's standings to the next stage's seeding, so multi-stage
formats (e.g. group stage into knockout playoffs) advance deterministically and auditably — TMS-012.

## ADDED Requirements

### Requirement: Configurable advancement rules
A stage SHALL declare, as versioned configuration, how many participants advance and by which
standings ranking, into which seed positions of the next stage.

#### Scenario: Top N by standings advance to declared seeds
- **WHEN** a stage configured to advance the top 2 per group completes with final standings
- **THEN** exactly the top 2 ranked participants per group are placed into the next stage's
  configured seed positions

### Requirement: Stage completion gates next-stage generation
The next stage's fixtures SHALL NOT be generated until the prior stage is marked complete and its
advancement output is resolved.

#### Scenario: Next stage blocked on incomplete prior stage
- **WHEN** an operator attempts to generate the next stage's fixtures while the prior stage still has
  unresolved matches
- **THEN** the system rejects the request and identifies which matches remain unresolved

### Requirement: Advancement preview without commitment
An operator SHALL be able to preview which participants would currently advance from an in-progress
stage without generating or committing the next stage's fixtures.

#### Scenario: Preview does not mutate state
- **WHEN** an operator requests an advancement preview mid-stage
- **THEN** the preview reflects current standings and no next-stage fixture or seed assignment is
  created as a result

### Requirement: Cross-stage correction is blocked once the next stage has started
A correction to a completed stage's results that would change advancement outcomes SHALL be blocked
from automatic propagation once the next stage has started matches, pending an authorized resolution,
consistent with the single-stage correction policy.

#### Scenario: Correction after next stage starts requires authorized resolution
- **WHEN** an authorized correction to a completed prior stage would change which participants
  advanced, and the next stage already has recorded results
- **THEN** the correction's propagation into the next stage is blocked and requires an explicit
  authorized resolution before it takes effect

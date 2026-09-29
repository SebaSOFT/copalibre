# tournament-engine/tournament-completion-overview Specification

## Purpose
Answers "how much of this tournament is done" as an aggregate match-status count, surface-agnostic,
reusing the same definition of a resolved match the stage-completion gate already establishes rather
than inventing a second one.

## Requirements

### Requirement: Completion counts use the platform's existing definition of resolved
A tournament or stage completion summary SHALL count a match as resolved only when its status is
`finalized` or `forfeited`, matching `validateStageCompletion`'s existing definition, and SHALL report
`totalMatches`, `resolvedMatches`, and separate counts for `live` and `scheduled` matches.

#### Scenario: A stage with a mix of statuses is counted correctly
- **WHEN** a stage has finalized, forfeited, live, and scheduled matches
- **THEN** the completion summary counts finalized and forfeited matches together as resolved, and
  reports live and scheduled counts separately from the resolved count

#### Scenario: A stage with no matches yet reports zero, not an error
- **WHEN** a stage has no generated fixtures yet
- **THEN** the completion summary reports zero for every count rather than an error or omission

### Requirement: A tournament-wide summary rolls up every stage
A tournament-wide completion summary SHALL be the sum of every one of its stages' resolved and total
match counts, and SHALL also be available broken down per stage.

#### Scenario: A multi-stage tournament's summary sums its stages
- **WHEN** a tournament has multiple stages, each with its own match counts
- **THEN** the tournament-wide summary's totals equal the sum of every stage's own counts, and each
  stage's own counts remain individually available

### Requirement: A completion summary is shown on both the public and control tournament views
Both the public tournament overview page and the control tournament view SHALL show the tournament's
completion summary, presented as a labeled figure (never a bare number with no label) resolved through
each surface's own declared tokens.

#### Scenario: A spectator sees the tournament's completion state
- **WHEN** a visitor opens a tournament's public overview page
- **THEN** the page shows the tournament's completion summary as a labeled figure

#### Scenario: An organizer sees the tournament's completion state
- **WHEN** an organizer opens the tournament's control view
- **THEN** the view shows the tournament's completion summary as a labeled figure, consistent with the
  platform's existing stat-tile presentation

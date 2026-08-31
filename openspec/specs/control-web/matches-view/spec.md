# control-web/matches-view Specification

## Purpose
Gives an organizer authorized to view internal standings a single, scannable card-grid overview of a
tournament's matches, read-only, reusing the same scope model as the public matches view — a whole
tournament, a stage, a zone/group, or a series — while surfacing the full internal
standings-comparator trace where the public surface only summarizes it.

## Requirements

### Requirement: The matches view requires the same authority the internal standings screen requires
The control-web matches view SHALL be reachable only by a subject holding `org.view-internal-standings`
for the tournament being viewed — an organization admin (unscoped), or a tournament-admin whose
assignment names this tournament — the same authority `StandingsController`'s existing internal
standings/trace endpoints already require. A tournament-admin scoped to a different tournament SHALL
be refused, not shown a narrowed view of this one.

#### Scenario: An organization admin reaches the matches view for any of the organization's tournaments
- **WHEN** an organization admin opens the matches view for any tournament in their organization
- **THEN** the request succeeds

#### Scenario: A tournament-admin reaches the matches view for their own tournament
- **WHEN** a tournament-admin whose assignment names tournament A opens the matches view for tournament A
- **THEN** the request succeeds

#### Scenario: A tournament-admin is refused for a different tournament
- **WHEN** a tournament-admin whose assignment names tournament A requests the matches view for
  tournament B
- **THEN** the request is refused with an authorization error, not a narrowed or summarized view

#### Scenario: A role holding no internal-standings authority is refused
- **WHEN** a referee, broadcaster, viewer, or club-admin requests the matches view
- **THEN** the request is refused with an authorization error

### Requirement: The control-web matches view shares the public view's scoping and card content
The control-web matches view SHALL list matches by the same scope model as the public matches view
(tournament, stage, zone/group, or series) and SHALL show the same base card content — state, clock,
venue, latest recorded event, and zone/position-or-series context.

#### Scenario: A stage-scoped view matches the public one's scoping rules
- **WHEN** an authorized organizer opens the matches view scoped to one stage
- **THEN** only that stage's matches are shown, the same scoping the public matches view applies

### Requirement: An authorized viewer sees the full comparator trace, not just the deciding-factor summary
A card for a finalized, tiebreak-decided match SHALL show the full internal standings-comparator
trace to any viewer who reached this screen, exactly as the existing internal trace endpoint returns
it — no further per-match narrowing, since reaching this screen at all already required
`org.view-internal-standings` for this tournament.

#### Scenario: A tiebreak-decided match shows its full trace
- **WHEN** an authorized organizer views a finalized, tiebreak-decided match's card
- **THEN** the card shows the full internal comparator trace, exactly as the existing internal trace
  endpoint returns it

#### Scenario: A match with no tiebreak shows no trace
- **WHEN** an authorized organizer views a finalized match whose result required no tiebreak
  comparison
- **THEN** the card shows no trace content

### Requirement: The matches view offers no operational action
The control-web matches view SHALL be read-only: no card or control on this screen SHALL change a
match's state, record an event, or otherwise mutate tournament data. Navigating away to the match
console or schedule screen is the only path to an operational action.

#### Scenario: No action mutates state from this screen
- **WHEN** an organizer interacts with any control on the matches view
- **THEN** no request that mutates match, schedule, or standings state is made from this screen

### Requirement: The matches view is scoped to its tournament
The control-web matches view SHALL only show matches belonging to the tournament being viewed.

#### Scenario: Cross-tournament isolation
- **WHEN** an organizer views the matches view for tournament A
- **THEN** no match belonging to a different tournament appears in the list

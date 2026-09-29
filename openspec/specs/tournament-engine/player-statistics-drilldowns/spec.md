# tournament-engine/player-statistics-drilldowns Specification

## Purpose
Provide one player’s declared statistics at tournament and completed-match scopes by reusing the
same folded figures, column definitions, and presentation values as public player rankings.

## Requirements

### Requirement: A declared player-ranking layout can be projected for one player

The system SHALL read an effective person-granularity player-ranking layout for a named player in
one tournament and return a tournament-total row plus one row for each finalized match in which the
player is recorded on a match roster, ordered chronologically by stage and match number. The
tournament-total row SHALL expose every non-rank declared column — collector, composite, and
computed — with the same raw values, formatted values, computed expressions, composite values, and
zero-value display rules as the corresponding leaderboard. Each match row SHALL expose only the
layout's collector-kind columns, computed from that match's own figures; composite and computed
columns are aggregate ratios or expressions that depend on more than one match and SHALL NOT appear
on a match row. Ranking filters and rank position SHALL NOT suppress or alter a named player's
statistic rows.

#### Scenario: A player’s tournament total agrees with the leaderboard
- **WHEN** a player appears in a tournament-wide player-ranking layout and their profile requests
  that layout
- **THEN** the profile's tournament-total row has the same non-rank cells as that player's leaderboard row,
  including its composite and computed columns

#### Scenario: Match rows carry only atomic statistics
- **WHEN** a player has recorded roster appearances in two finalized matches under a layout with
  goal and assist collectors plus a goals-per-match composite column
- **THEN** the drilldown returns one row for each match containing that match's own goal and assist
  counts, and omits the goals-per-match column from both match rows

#### Scenario: A player without a recorded roster has no inferred statistics
- **WHEN** a person is not named in any finalized match roster of the requested tournament
- **THEN** the drilldown returns no tournament-total or match statistic rows, even if the person
  has organization-level career history

### Requirement: Player statistic drilldowns remain within declared public scope

A player drilldown SHALL resolve only an effective person-granularity player-ranking layout of the
published tournament named by the request. It SHALL reject a missing, non-person, or undeclared
layout and SHALL not expose figures from another tournament, unpublished tournament, or a match
outside that tournament. Each match row SHALL carry only the public match identity needed to link
to its public report.

#### Scenario: A non-player layout is refused
- **WHEN** a request names a group-phase or team-ranking layout for a player drilldown
- **THEN** the request returns not found without returning table figures

#### Scenario: An unpublished tournament has no drilldown
- **WHEN** an anonymous visitor requests player statistics through an unpublished tournament path
- **THEN** the request returns not found and includes no player or match figures

# tournament-engine/player-statistics-drilldowns Specification

## Purpose
Provide one player’s declared statistics at tournament and completed-match scopes by reusing the
same folded figures, column definitions, and presentation values as public player rankings.

## Requirements

### Requirement: A declared player-ranking layout can be projected for one player

The system SHALL read an effective person-granularity player-ranking layout for a named player in
one tournament and return a tournament-total row plus one row per finalized match in which the
player is on a match roster, ordered by stage and match number. The total row SHALL expose every
non-rank column as the leaderboard does; a match row SHALL expose only collector columns, from that
match's own figures. Ranking filters and rank position SHALL NOT suppress or alter a named player's
rows.

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

#### Scenario: The total row matches the leaderboard

- **WHEN** the total row is read
- **THEN** its collector, composite and computed columns carry the same raw values, formatted
  values, computed expressions, composite values and zero-value display rules as the leaderboard

#### Scenario: Why match rows omit ratios

- **WHEN** a match row is read
- **THEN** composite and computed columns do not appear, because they are aggregate ratios or
  expressions depending on more than one match

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

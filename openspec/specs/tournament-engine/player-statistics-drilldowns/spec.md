# tournament-engine/player-statistics-drilldowns Specification

## Purpose
Provide one player’s declared statistics at tournament and completed-match scopes by reusing the
same folded figures, column definitions, and presentation values as public player rankings.

## Requirements

### Requirement: A declared player-ranking layout can be projected for one player

The system SHALL read an effective person-granularity player-ranking layout for one player in
one tournament and return a tournament-total row plus one row per finalized match whose roster
names the player, ordered by stage number, then public match ordinal. The total row SHALL expose
every non-rank column as the leaderboard does; a match row SHALL expose only collector columns, from
that match's own figures. Ranking filters and rank position SHALL NOT suppress or alter a named
player's rows.

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

#### Scenario: Three group games are three distinct rows in stage order

- **WHEN** a player played group-stage matches 1, 13 and 25 and quarter-final 1 of the next stage,
  none of them a series
- **THEN** the rows read stage 1 match 1, stage 1 match 13, stage 1 match 25 and stage 2 match 1, in
  that order, and not stage 1 match 1 three times

### Requirement: Player statistic drilldowns remain within declared public scope

A player drilldown SHALL resolve only an effective person-granularity player-ranking layout of the
published tournament named by the request. It SHALL reject a missing, non-person, or undeclared
layout and SHALL not expose figures from another tournament, unpublished tournament, or a match
outside that tournament. Each match row SHALL carry only the public match identity needed to link
to its public report and that match's public summary.

#### Scenario: A non-player layout is refused
- **WHEN** a request names a group-phase or team-ranking layout for a player drilldown
- **THEN** the request returns not found without returning table figures

#### Scenario: An unpublished tournament has no drilldown
- **WHEN** an anonymous visitor requests player statistics through an unpublished tournament path
- **THEN** the request returns not found and includes no player or match figures

#### Scenario: A row carries no internal match key
- **WHEN** a match row is read
- **THEN** it holds the stage number and public ordinal, and no internal match, fixture or entrant
  identifier

### Requirement: A drilldown match row links to the report its number names

A drilldown match row's `matchNumber` SHALL be the match's public ordinal within its stage, the
number at which that match's public report is served, derived from the same stage order the report
route uses.

#### Scenario: Following a row reaches the same match
- **WHEN** a client opens `stages/{stageNumber}/matches/{matchNumber}` from a drilldown row
- **THEN** the report served is the match whose figures that row carries

### Requirement: A drilldown match row summarizes its match

A drilldown match row SHALL carry the match's scheduled time, the player's side, the opponent's
name, abbreviation and club alias when one exists, and the player's side's and the opponent's final
scores.

#### Scenario: A finished group game
- **WHEN** a Club Hispano player's row for the 1–2 away win at Lomas de Rivadavia is read
- **THEN** the row carries side `away`, opponent "Lomas de Rivadavia" with its abbreviation, own
  score 2 and opponent score 1, and the match's scheduled time

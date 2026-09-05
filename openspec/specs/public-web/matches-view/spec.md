# public-web/matches-view Specification

## Purpose
Gives an anonymous spectator a single, scannable card-grid view of a tournament's matches — live,
upcoming, and finished — at whatever scope they're looking at (a whole tournament, one stage, one
zone/group, or one series), generalizing the "list of matches to play" every phase structure already
reduces to, richer than the existing live dashboard and ticker cards.

## Requirements

### Requirement: Matches view lists every match in its requested scope
The public matches view SHALL show every match belonging to the requested scope — a tournament, one
of its stages, one zone/group within a stage, or the games of one series — and no match outside it.
A cross settled by a series SHALL appear as one card representing the series, not one card per game.

#### Scenario: Tournament scope shows every stage's matches
- **WHEN** an anonymous visitor opens the matches view with no stage, zone, or series filter
- **THEN** matches from every stage of the tournament are shown

#### Scenario: Stage scope excludes other stages
- **WHEN** the matches view is scoped to one stage
- **THEN** only that stage's matches are shown, and no match from another stage appears

#### Scenario: Zone scope excludes other zones in the same stage
- **WHEN** the matches view is scoped to one zone/group within a stage that declares more than one
- **THEN** only that zone's matches are shown

#### Scenario: A series-settled cross is one card
- **WHEN** the matches view lists a cross settled by a multi-match series
- **THEN** it appears as a single card, not as one card per game in the series

### Requirement: The matches view is filterable by state
The public matches view SHALL let a visitor filter the shown matches by state — all, live, upcoming,
or final — without changing the requested scope.

#### Scenario: Filtering to live narrows the list
- **WHEN** a visitor selects the "live" filter
- **THEN** only matches currently in progress are shown, within the same scope

### Requirement: A live match's card shows its running clock
A card for a match currently in progress SHALL show its current clock value. A card for a match that
is upcoming or already final SHALL show no clock value at all, rather than a stale or zero one.

#### Scenario: A live match shows elapsed time
- **WHEN** a match in the matches view is in progress
- **THEN** its card shows the same clock value the live dashboard would show for that match

#### Scenario: An upcoming match shows no clock
- **WHEN** a match in the matches view has not started
- **THEN** its card shows no clock value

### Requirement: A match card names its venue when one is assigned
A card SHALL name the match's assigned venue when the schedule has assigned one, and SHALL omit the
venue line entirely — never a placeholder — when none is assigned.

#### Scenario: A scheduled match shows its venue
- **WHEN** a match has a venue assigned through scheduling
- **THEN** its card names that venue

#### Scenario: An unscheduled match omits the venue line
- **WHEN** a match has no venue assigned
- **THEN** its card shows no venue line, not an empty or placeholder one

### Requirement: A match card shows its latest recorded event generically
A card for a match with at least one recorded event SHALL show that latest event's description and
the moment it occurred, whatever discipline event type it is — the card SHALL NOT special-case any
specific event code, so a discipline that declares a new event type appears correctly with no card
change required. A card for a match with no recorded event SHALL show no event line at all.

#### Scenario: The latest event is shown regardless of its type
- **WHEN** a match's most recently recorded event is any event type its discipline declares
- **THEN** the card shows that event's description and timing, without the card needing to know that
  specific event code in advance

#### Scenario: A match with no events shows no event line
- **WHEN** a match has no recorded events yet
- **THEN** its card shows no event line, not a placeholder

### Requirement: A card shows zone/position context or series context, never both
A card for a cross belonging to a zone/group stage that declares no series SHALL show that zone/group
name and the entrant's current standings position within it. A card for a cross settled by a series
SHALL show the series' progress/aggregate state instead of a position, per the existing series
rendering rules — never both a bare position and series state on the same card.

#### Scenario: A group-stage match shows its zone and position
- **WHEN** a card represents a cross in a zone/group stage with no series declared
- **THEN** the card shows the zone/group name and each entrant's current standings position

#### Scenario: A series cross shows series state, not a position
- **WHEN** a card represents a cross settled by a series
- **THEN** the card shows the series' progress and, where resolved, its aggregate state, and shows no
  standings position

### Requirement: A finalized match states its deciding factor without exposing the full trace
A card for a finalized match whose result required a tiebreak comparator to separate two standings
rows SHALL show one line naming the deciding factor (for example, "decided by head-to-head goal
difference"). It SHALL NOT expose the full internal comparator trace, its intermediate values, or any
line beyond the single deciding-factor statement. A card for a finalized match whose result required
no tiebreak comparison SHALL show no deciding-factor line.

#### Scenario: A tiebreak-decided match names its deciding factor
- **WHEN** a finalized match's outcome caused a tiebreak comparator to separate two standings rows
- **THEN** its card states the deciding factor in one line

#### Scenario: A match with no tiebreak involved shows no deciding-factor line
- **WHEN** a finalized match's outcome required no tiebreak comparison
- **THEN** its card shows no deciding-factor line

#### Scenario: The deciding-factor line never carries the full trace
- **WHEN** a card's deciding-factor line is rendered
- **THEN** it contains only the single stated factor, none of the internal trace's other steps or
  intermediate values

### Requirement: The matches view respects tournament and stage publication state
An anonymous visitor requesting the matches view for an unpublished tournament, or scoped to a stage
number that does not exist in the tournament, SHALL receive a not-found response exposing no
operational data, matching the existing bracket page's publication contract.

#### Scenario: An unpublished tournament is not exposed
- **WHEN** an anonymous visitor requests the matches view for a tournament the organizer has not
  published
- **THEN** the site returns a not-found response and exposes no operational data about it

### Requirement: The matches view stays discipline-agnostic
The matches view SHALL NOT render any UI element specific to a single discipline or game on its
shared template, matching the same constraint the live dashboard and bracket already hold to.

#### Scenario: No discipline-specific widget appears
- **WHEN** the matches view is rendered for any discipline
- **THEN** it contains no discipline-specific visualization outside of data explicitly modeled as
  generic (team names, scores, venue, clock, the latest event's own description, series/zone state)

### Requirement: Match state on a card is never conveyed by color alone
Every state indicator on a matches-view card SHALL pair its color with a non-color cue (icon and/or
text label), matching the same constraint the bracket view already holds to.

#### Scenario: A live badge carries a text label
- **WHEN** a match card shows its live/upcoming/final state
- **THEN** the indicator pairs a color with an icon or text label, not color alone

### Requirement: Stage layout matches its format
A stage's public presentation SHALL use a layout appropriate to its actual tournament format:
elimination formats render as a bracket tree; non-elimination formats (round-robin and similar) render
as a compact by-round match grid.

#### Scenario: A finished round-robin stage
- **WHEN** a visitor views a stage whose format is round-robin (or round-robin-single-leg)
- **THEN** the page SHALL render the compact by-round match grid, never an elimination-bracket tree with
  empty connector space

#### Scenario: A finished single-elimination stage
- **WHEN** a visitor views a stage whose format is single-elimination
- **THEN** the page SHALL render the bracket tree, populated with real entrant names and scores for every
  materialized round

### Requirement: Finalized match scheduling banner suppression
A finalized match view SHALL NOT display placeholder banners indicating that a schedule or official assignment is pending.

#### Scenario: Viewing a finalized match
- **WHEN** a spectator navigates to a match detail view for a match with status FINAL
- **THEN** the view SHALL NOT render "Schedule not yet available" or "Schedule has not yet been published" notices

### Requirement: Rank badge micro-typography and spacing
Rank badges rendered within standings or match summary cards SHALL maintain visual separation from team names and score figures.

#### Scenario: Displaying rank badges in standings
- **WHEN** a standings row or card displays a rank indicator badge adjacent to team text or scores
- **THEN** the badge SHALL be separated by at least 6px of spacing and not visually crowd adjacent digits

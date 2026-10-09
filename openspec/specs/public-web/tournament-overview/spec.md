# tournament-overview Specification

## Purpose

Gives an anonymous spectator a tournament overview page that renders its match list and, once the
tournament is decided, its outcome, entirely through CopaLibre's owned presentation components rather
than page-local markup.

## Requirements

### Requirement: Overview match entries use owned presentation components
Every match entry on the tournament overview page SHALL render through the same owned card, badge,
and timestamp components the matches list (`public-web/matches-view`) already uses, rather than
page-local markup. A match's scheduled or kicked-off time SHALL render as a localized, human-readable
timestamp, never as a raw machine timestamp format.

#### Scenario: Overview match entry shows a localized timestamp
- **WHEN** the tournament overview page renders a scheduled or completed match
- **THEN** the match's date and time render through the shared timestamp component, localized to the
  page's active language, and no raw ISO-8601 string is visible to the spectator

#### Scenario: Overview match entry carries a state badge
- **WHEN** the tournament overview page renders a match that is live, upcoming, or finished
- **THEN** the match entry shows a state badge consistent in shape and treatment with the same state's
  badge on the matches list and match detail pages

### Requirement: Completed multi-zone tournament surfaces a champions podium
When a tournament is finished and its public winners projection resolves more than one final zone,
the tournament overview page SHALL show a podium section before or alongside the standings table.
Each zone SHALL identify every declared champion and any explicitly resolved runner-up and third
place. The page SHALL NOT invent a missing rank.

#### Scenario: Completed multi-zone tournament shows a podium per zone
- **WHEN** a spectator opens the overview of a completed tournament whose playoff stage resolved
  multiple zones
- **THEN** the page shows one podium entry per resolved zone, naming every champion and each
  explicitly resolved lower rank

#### Scenario: Shared title has no runner-up
- **WHEN** a zone's championship ends with multiple declared champions and no runner-up
- **THEN** the podium names all co-champions at rank one and does not fabricate rank two

#### Scenario: Duel bracket has no third-place result
- **WHEN** a zone resolves its final but has no explicit third-place ranking
- **THEN** the podium names its champion and runner-up without assigning third place to a semifinal loser

#### Scenario: In-progress tournament shows no podium
- **WHEN** a spectator opens the overview of a tournament that has not reached completed status, or
  whose final stage has not yet resolved a zone's placements
- **THEN** the page shows no podium section for that zone, rather than an incomplete or placeholder one

#### Scenario: Single-zone tournament shows no podium
- **WHEN** a spectator opens the overview of a completed tournament whose structure never resolved more
  than one final zone
- **THEN** the page shows no podium section, since the existing standings table already states the
  single outcome

### Requirement: A tournament decided partly by forfeit is classified finished
The public tournament overview's "finished" status SHALL account for a forfeited match as resolved,
the same as a finalized one, and SHALL NOT let a `not-required` match block a "finished"
classification. A tournament is finished only once every match that is not `not-required` is either
`finalized` or `forfeited`.

#### Scenario: A tournament decided partly by forfeit shows as finished
- **WHEN** a spectator opens the overview of a tournament where every match is finalized or forfeited,
  with at least one forfeited
- **THEN** the page shows the tournament's finished state, not a live or upcoming default

### Requirement: Real-time public score ticker reactivity
The public tournament overview page's score ticker SHALL live-patch its match entries from the
tournament's public Server-Sent Events stream, reactively updating scores and live/final status
without requiring a manual page reload, while remaining fully correct and complete without JavaScript.

#### Scenario: Live goal updates ticker reactively
- **WHEN** a spectator is viewing the public tournament overview page and a goal is scored in an
  active match shown on the ticker
- **THEN** that match's score figure updates immediately with a brief pulse highlight, without
  reloading the page, and no other ticker entry changes

#### Scenario: No JavaScript fallback preserves full server-rendered ticker
- **WHEN** a visitor navigates to the tournament overview with JavaScript disabled or blocked
- **THEN** the server-rendered score ticker displays the match scores recorded at request time with no
  empty state or missing elements

#### Scenario: Background tab reconnection and catch-up
- **WHEN** a spectator leaves the tournament tab in the background for 10 minutes and then returns
- **THEN** the score ticker reconnects to the SSE stream and resynchronizes the latest match states
  immediately

### Requirement: Hierarchical Zone Presentation for Heterogeneous Stages
The public stage overview view (`/stages/[stage]`) SHALL present a hierarchical layout with distinct sections for each zone of the stage. Each zone section SHALL resolve and render the visual presentation component matching that zone's effective format:
- Elimination formats (`single-elimination`, `double-elimination`, `gauntlet`, `bracket-groups`, `custom-bracket`) SHALL render an interactive bracket tree.
- Round-robin and league formats (`round-robin`, `league`, `round-robin-single-leg`, `round-robin-home-away`, `swiss`, `ffa-league`) SHALL render a matches grid accompanied by that zone's standings table.
The stage header SHALL provide quick navigation anchors or tabs allowing spectators to jump between zones.

#### Scenario: Stage renders bracket tree for elimination zones and standings table for round-robin zones
- **WHEN** a spectator visits a stage containing Zone 1 (single-elimination), Zone 2 (single-elimination), and Zone 3 (round-robin)
- **THEN** Zone 1 and Zone 2 render bracket knockout trees
- **AND** Zone 3 renders a match schedule grid and a points standings table
- **AND** spectators can switch or scroll between the three zones within the same stage page

#### Scenario: TV dashboard highlights zone format accurately
- **WHEN** the TV display kiosk presents matches or rankings for a zone
- **THEN** it renders the layout component (bracket view or standings ticker) corresponding to that specific zone's effective format

### Requirement: Tournament progress is shown per stage, zone and group
The tournament page's progress card SHALL show an overall bar and one bar per stage, and for a stage with zones or groups one bar per zone or group, each labelled with its name and its played and total counts. Every bar SHALL have a text alternative and SHALL NOT convey state by colour alone. The card SHALL size to its content and SHALL NOT span the page width when it has little to show.

#### Scenario: A staged tournament shows nested progress
- **WHEN** a tournament has a group stage of six groups and a cup stage of three zones
- **THEN** the card shows the overall bar, one bar for each stage and one bar for each group and zone with its counts

#### Scenario: A tournament with no matches stays unmeasured
- **WHEN** the tournament has no matches
- **THEN** the card states that progress is unmeasured and shows no bar

### Requirement: A connection alert appears only when the live connection fails
The tournament page SHALL NOT show an informational note describing normal behaviour. It SHALL show a status notice only while its live connection is lost or its data is known to be stale, and SHALL remove the notice when the connection recovers.

#### Scenario: Normal operation shows no note
- **WHEN** the live connection is healthy or the page is rendered without JavaScript
- **THEN** no connection note is shown

#### Scenario: A lost connection is announced and cleared
- **WHEN** the live connection drops and later recovers
- **THEN** a status notice appears while it is down and disappears when it recovers

### Requirement: The ruleset section lists every effective rule, not only overrides
The ruleset section SHALL list each rule field the tournament's discipline declares with a printable value with its effective value, whether the value is the discipline default or the tournament's override. A tournament that overrides nothing SHALL still list its defaults. The section SHALL NOT render empty when the discipline declares labelled fields.

#### Scenario: A tournament on defaults shows its rules
- **WHEN** a tournament has no overrides and its discipline declares labelled rule fields
- **THEN** the section lists those fields with their default values

#### Scenario: An override replaces its default
- **WHEN** a tournament overrides one field
- **THEN** that field shows the effective value and the others show their defaults

### Requirement: The public bracket draws the dependencies between matches
An elimination zone's bracket SHALL draw a visible connector from every match to the match its winner advances to, and from a classification match's feeding round to it, without relying on colour and without JavaScript.

#### Scenario: A quarter-final is connected to its semi-final
- **WHEN** a zone's bracket is shown
- **THEN** each quarter-final has a connector to the semi-final its winner plays

#### Scenario: Connectors print
- **WHEN** the page is printed
- **THEN** the connectors are still drawn

### Requirement: A knockout bracket is drawn as two halves meeting at the final
A single-elimination zone's bracket SHALL draw the final in the middle, the match that feeds one side of it with its own earlier rounds on the left reading left to right, and the one that feeds the other side with its rounds on the right reading right to left, each match centred between the two that feed it.

#### Scenario: Two halves meet at the final
- **WHEN** a cup with quarter-finals, semi-finals and a final is shown on a desktop viewport
- **THEN** each semi-final sits on its own side with its two quarter-finals beside it, and the final stands between them

### Requirement: A narrow screen draws a reduced match card
Below the tablet breakpoint the bracket SHALL be drawn with a reduced card showing each side's abbreviation and score and a state mark, small enough that a split bracket's columns fit a phone's width, and each card SHALL be one link to the match report whose accessible name states both sides and the score.

#### Scenario: A phone shows the compact bracket
- **WHEN** a three-round cup is shown at 390 px
- **THEN** the compact drawing is shown instead of the full one, every match is a one-link card, and the page does not scroll sideways

### Requirement: The API computes the precedence of an elimination
For every recorded side of a knockout game the API SHALL state the earlier game it came from and whether it won or lost there, taken from the games the entrants played; a tied game SHALL be settled by where each side went next.

#### Scenario: A drawn quarter-final still links forward
- **WHEN** a quarter-final ended level and one side then plays a semi-final while the other plays a placement game
- **THEN** the first side is stated as the winner of that quarter-final and the other as its loser

### Requirement: Classification games appear in the bracket
Every persisted fixture of an elimination zone SHALL appear in that zone's bracket. A classification game — third place, fifth place, a placement round — SHALL be listed beneath the bracket under the label of what it decides, and SHALL NOT be drawn in the bracket.

#### Scenario: A cup with twelve fixtures shows twelve matches
- **WHEN** a zone has quarter-finals, semi-finals, a 5th–8th round, a final and three placement games
- **THEN** the bracket shows its seven matches and the five placement games are listed beneath it, each under its own label

#### Scenario: A zone without roles renders as before
- **WHEN** a zone's fixtures carry no role
- **THEN** its bracket renders from the generated structure only

### Requirement: The match page shows its zone's whole bracket
The match page SHALL show the complete bracket of the match's zone with the current match highlighted, SHALL NOT cap its height, and SHALL scroll horizontally only when the bracket is wider than its container.

#### Scenario: Nothing is cut off
- **WHEN** a match page of a three-round zone is opened on a desktop viewport
- **THEN** every match of the zone is fully visible without vertical scrolling inside the bracket panel

#### Scenario: The current match is marked
- **WHEN** the match page is shown
- **THEN** the bracket highlights that match with a non-colour indicator

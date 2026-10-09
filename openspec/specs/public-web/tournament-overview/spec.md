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

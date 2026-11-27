# match-report Specification

## Purpose

Gives a spectator a match report page whose officials, rosters, and event timeline sections render
in the page's active language and with humanized timestamps, matching the rest of the public surface.

## Requirements

### Requirement: Match report sections render localized text
The match report page's officials, rosters, and event timeline sections SHALL render every label,
heading, and empty-state message from the active language's message catalogue, never as a literal
string fixed to one language.

#### Scenario: Non-English locale shows translated section content
- **WHEN** a spectator views the match report page in a locale other than English
- **THEN** the officials, rosters, and event timeline sections' headings and empty-state messages
  render in that locale, matching the rest of the page

#### Scenario: An empty section states its own reason in the active language
- **WHEN** a match report section has no data yet (no published schedule, no recorded events, no
  rosters)
- **THEN** its empty-state message renders from the message catalogue in the active language, not as
  a fixed English sentence

### Requirement: Match report timestamps are humanized
Every timestamp the match report page's officials, rosters, and event timeline sections render SHALL
display through the same humanized, localized timestamp treatment the rest of the public surface uses,
never as a raw machine timestamp format.

#### Scenario: Event timeline entry shows a humanized time
- **WHEN** the event timeline section renders a recorded match event
- **THEN** its timestamp renders humanized and localized to the active language, and no raw ISO-8601
  string is visible to the spectator

### Requirement: The match page uses the shared content width and panel
The match page SHALL use the same public content container as the tournament page, never the narrower reading container, and SHALL present its officials, rosters and timeline sections in the site's chamfered panel. From the desktop breakpoint up, those sections MAY share the width in columns composed from the same panels.

#### Scenario: No special column
- **WHEN** the match page and the tournament page are opened at the same desktop width
- **THEN** their content areas have the same width

#### Scenario: Desktop width is used
- **WHEN** the match page is opened at 1440 px
- **THEN** its content area is as wide as the tournament page's, not limited to the reading width

#### Scenario: Sections are chamfered
- **WHEN** the match page renders officials, rosters and timeline
- **THEN** each section uses the chamfered panel

### Requirement: Roles and event names are shown in the page language
Roster roles, official roles and timeline event names SHALL be resolved from the bound discipline descriptor's labels in the page's language, falling back through the language, the tournament's primary language and the descriptor's first label, and SHALL NOT show a raw code while a label exists.

#### Scenario: A Spanish page shows Spanish labels
- **WHEN** the page language is Spanish and the descriptor has Spanish labels
- **THEN** the timeline shows each event's Spanish label and the roster shows each role's Spanish label

#### Scenario: A missing language falls back
- **WHEN** the descriptor has no label in the page language
- **THEN** the label of the fallback chain is shown and never the raw code

### Requirement: The match page names its competition context

The match page subtitle and breadcrumb SHALL name the match's stage by its organizer name, its zone and its group when they are explicit, and its round by its place in the stage graph (final, semi-final, quarter-final, placement place or range), else by round number. The match number SHALL be secondary. Two matches of one stage SHALL NOT share the same context line.

#### Scenario: Two finals in two cups

- **WHEN** a spectator opens the Copa Oro final and then the Copa Bronce final of the same stage
- **THEN** one reads "Copas · Copa Oro · Final" and the other "Copas · Copa Bronce · Final", each followed by its match number

#### Scenario: A placement semi-final names its range

- **WHEN** a spectator opens a 5th-to-8th placement semi-final of Copa Oro
- **THEN** its context reads "Copas · Copa Oro · Semifinal 5º al 8º puesto", not "Ronda 1"

#### Scenario: A group match names its group

- **WHEN** a spectator opens a round-one match of Grupo A in the group stage
- **THEN** its context reads "Fase de grupos · Grupo A · Ronda 1"

### Requirement: A knockout match page states what is at stake

The match page of a match in a stage graph SHALL state where its winner and its loser go, naming each target match by its context and its scheduled start when published, or the place or title the match settles. A match with no outgoing edge and no settled place SHALL show no such statement.

#### Scenario: A quarter-final names both targets

- **WHEN** a spectator opens a Copa Oro quarter-final whose winner plays a semi-final and whose loser plays a 5th-to-8th semi-final
- **THEN** the page states both targets with their context and, when scheduled, their date and time

#### Scenario: A final names the title

- **WHEN** a spectator opens the Copa Oro final
- **THEN** the page states that the match decides the Copa Oro champion

### Requirement: A drawn knockout result names the side that advanced

When a finalized match in a stage graph has level scores and a recorded winner, the match report hero and its bracket node SHALL mark the winner with text that it advanced, not by colour alone. A match won on the score SHALL show no such mark.

#### Scenario: A 3–3 quarter-final

- **WHEN** a quarter-final finished 3–3 and its recorded winner went on to the semi-final
- **THEN** the hero and the bracket node mark that side as advancing in the page language

### Requirement: The match page shows match counters and active timed penalties
The public match page scoreboard SHALL show each effective match counter per side in the page language. While the match is live it SHALL also show each active timed penalty with its side and remaining time, counting down without a reload. A finished match SHALL show only match-scope counters.

#### Scenario: A live match page
- **WHEN** a spectator opens a live rink-hockey match with three home team fouls and one away timeout
- **THEN** the scoreboard shows "Faltas de equipo 3" for home and the timeout counter for away, in the
  page language

#### Scenario: An active suspension counts down
- **WHEN** a timed penalty of 120 seconds is active for the away side
- **THEN** the scoreboard shows the away side's penalty and its remaining time decreasing each second

#### Scenario: A finished match keeps its totals
- **WHEN** the match has finished
- **THEN** match-scope counters show their final values and segment-scope counters are not shown

### Requirement: The match page scoreboard keeps both sides on one row at every width

The public match page scoreboard SHALL keep the home side, the divider and the away side on one row at every viewport width, with the two scores facing each other across the divider. A long team name SHALL wrap inside its own side and SHALL NOT move the other side to another line or cause horizontal scrolling.

#### Scenario: Long names on a phone
- **WHEN** a match between "Club Andes" and "Deportivo Sur" is opened at 390x844
- **THEN** both scores are on the same line, the home score left of the divider and the away score right of it, and the page has no horizontal scroll

#### Scenario: Desktop keeps the side-by-side scoreboard
- **WHEN** the same match is opened at 1440x900
- **THEN** each team name sits beside its score, and the scoreboard reads home name, home score, divider, away score, away name on one line

### Requirement: Timeline entries state the side, the game time and the running score
Each timeline entry SHALL identify the side it belongs to, SHALL state its game time as the segment's descriptor label and number plus the elapsed time in that segment when recorded, and every event that changes the score SHALL show the score after it. The API SHALL compute the score after each event from the recorded events; the time of day MAY remain as secondary text.

#### Scenario: Equal shirt numbers on both teams
- **WHEN** both teams have a player with shirt #7 and one of them scores
- **THEN** the timeline entry shows which side scored, not only "#7" and the player's name

#### Scenario: A goal reads in game time
- **WHEN** a goal was recorded 8 minutes into the first half of a rink-hockey match on a Spanish page
- **THEN** its entry reads "Tiempo 1 · 08:00" and shows the score after the goal

#### Scenario: A result entered without events
- **WHEN** a match's result was entered with no scoring events
- **THEN** the timeline shows no running score and the header shows the final score

### Requirement: The timeline marks where each segment ends
The timeline SHALL mark the start of each segment with its descriptor label and number and the end of each completed segment with the score of that segment, from the match's recorded segment scores.

#### Scenario: Half-time score
- **WHEN** a finished match ended its first half 1–4
- **THEN** the timeline shows a marker after the first half's last event reading the end of the first segment and 1–4

### Requirement: An upcoming match shows each side's registered squad
Before a match-day roster is recorded for a team side, the match page SHALL list that team's registered players, labelled as the registered squad and noting that the match-day list is confirmed at kickoff, applying the same person-visibility rules as the roster. A recorded match-day roster SHALL replace it.

#### Scenario: Teams known, roster not yet recorded
- **WHEN** a spectator opens an upcoming match between two registered teams whose rosters the console has not recorded
- **THEN** each side lists its registered players under the registered-squad heading instead of saying the rosters are unavailable

#### Scenario: A hidden person stays hidden
- **WHEN** a registered player asked not to be published
- **THEN** the registered squad shows that player the same way the roster shows a hidden person

### Requirement: Rosters are ordered by shirt number and show on-field state only while live
Roster and registered-squad lists SHALL be ordered by shirt number ascending, members without a number last ordered by name in the page locale. The on-field column SHALL be shown only while the match is live.

#### Scenario: A finished match has no on-field column
- **WHEN** a spectator opens a finished match
- **THEN** the rosters show no on-field column, and members appear in shirt-number order

#### Scenario: A live match shows who is on the rink
- **WHEN** a spectator opens a live match
- **THEN** the rosters show the on-field state as folded from recorded substitutions

### Requirement: The match header identifies each side by its crest
The match header SHALL show each side's club emblem next to its name when the side's club has one, with the shared client-side fallback, and SHALL keep the name and abbreviation as text.

#### Scenario: Crests on the scoreboard
- **WHEN** a spectator opens a match between two clubs with emblems
- **THEN** both crests appear in the header next to the team names

### Requirement: A match page offers its stream link when one is set
When the organizer attached a stream link to a match, the match page SHALL show a localized watch link that opens it in a new page without passing the referrer. A match without a stream link SHALL show no watch link.

#### Scenario: Watching a match
- **WHEN** a match has a stream link and a spectator opens its page in Spanish
- **THEN** the header shows "Ver transmisión", which opens the link in a new page

### Requirement: A live match page leads with its timeline and rosters
While a match is live, its page SHALL present the timeline and rosters before the officials and the bracket. An upcoming or finished match page SHALL present the bracket before officials, rosters and timeline.

#### Scenario: Following a match in progress
- **WHEN** a spectator opens a match that is live
- **THEN** the timeline comes right after the header, then the rosters, then officials and the bracket

### Requirement: Each game of a series has its own match page

The public match page SHALL show one game of a fixture played as a series, selected by a `game` query parameter (the first game when absent), with that game's status, roster, timeline and stream link. When the fixture has more than one game the page SHALL offer a link to each game, and the bracket SHALL link each played or in-progress game of a series to its page.

#### Scenario: Opening game 2 of a best-of-3
- **WHEN** a visitor opens the match page of a best-of-3 fixture with `?game=2`
- **THEN** the page shows game 2's status and stream link, and the game switcher marks game 2 as current

#### Scenario: Reaching a game from the bracket
- **WHEN** a visitor activates the second game segment of a series in the bracket
- **THEN** the browser opens that fixture's match page with `?game=2`

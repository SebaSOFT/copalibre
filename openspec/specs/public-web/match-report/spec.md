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

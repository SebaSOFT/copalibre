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
The match page SHALL use the same content width as the other public pages and SHALL present its officials, rosters and timeline sections in the site's chamfered panel.

#### Scenario: No special column
- **WHEN** the match page and the tournament page are opened at the same desktop width
- **THEN** their content areas have the same width

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

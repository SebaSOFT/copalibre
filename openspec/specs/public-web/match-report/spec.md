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

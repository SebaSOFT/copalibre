# standings-table Specification

## Purpose

Gives a spectator a standings table, its competition-history modal, and the player profile page it
links to, that render every label and empty-state message in the active language.

## Requirements

### Requirement: Standings table and its history modal render localized text
The standings table component, including its competition-history modal (table headers and empty
state), SHALL render every label and message from the active language's message catalogue, never as a
literal string fixed to one language — regardless of whether that text is produced by template markup
or by script-generated HTML.

#### Scenario: History modal shows translated column headers
- **WHEN** a spectator opens a player's competition-history modal from the standings table in a locale
  other than English
- **THEN** the modal's column headers and, if the player has no history, its empty-state message render
  in that locale

### Requirement: Player profile page chrome is localized
The player profile page's own chrome, including its return-to-tournament link, SHALL render from the
active language's message catalogue.

#### Scenario: Non-English locale shows a translated return link
- **WHEN** a spectator views a player profile page in a locale other than English
- **THEN** the return-to-tournament link's text renders in that locale, not as a fixed English phrase

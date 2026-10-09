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

### Requirement: Tabs and club filters change the view without moving the page
Activating a standings tab or a club filter on a public table SHALL update the shown table in place, SHALL record the choice in the URL query string, SHALL NOT scroll the page, and SHALL remain operable by keyboard with its selected state exposed to assistive technology. Without JavaScript each control SHALL be a link to the same page in that state.

#### Scenario: A filter does not scroll
- **WHEN** a viewer scrolled down to the table activates a club filter
- **THEN** the table shows that club's rows and the scroll position is unchanged

#### Scenario: The choice is addressable
- **WHEN** a club filter is active
- **THEN** reloading the same URL shows the same filtered table

### Requirement: Abbreviated column headers explain themselves
Every abbreviated column header of a public table SHALL expose the column's full label on hover and keyboard focus and to assistive technology, and the table SHALL list the abbreviations in a legend visible without hovering. The wording SHALL come from the discipline's own data (a long header, or the label of the statistic the column counts, or the headers of the columns a computed column is made of) in the page's language, never from platform-side terms.

#### Scenario: A header expands on focus
- **WHEN** a viewer focuses an abbreviated header
- **THEN** its full label is announced and shown

#### Scenario: A legend is always visible
- **WHEN** a table has abbreviated headers
- **THEN** a legend naming each abbreviation is visible below the table

### Requirement: Club filter chips are a compact, emblem-bearing control
Club filter chips SHALL be visibly smaller than the page's primary buttons, SHALL carry the chamfer treatment, SHALL show the club's emblem with the club's monogram when the emblem is missing, and SHALL show their selected state by more than colour.

#### Scenario: A chip shows its emblem or monogram
- **WHEN** a club has an emblem, or has none
- **THEN** its chip shows the emblem, or the monogram

#### Scenario: Chips do not compete with primary actions
- **WHEN** chips and a primary button are on the same page
- **THEN** the chips are smaller than the button

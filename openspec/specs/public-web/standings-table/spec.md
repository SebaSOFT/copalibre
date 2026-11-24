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
Every abbreviated column header of a public table SHALL expose the column's full label in a popover from an information icon beside the header and to assistive technology, and the table SHALL list the abbreviations in a legend visible without hovering. The wording SHALL come from the discipline's own data (a long header, or the label of the statistic the column counts, or the headers of the columns a computed column is made of) in the page's language, never from platform-side terms.

#### Scenario: A header expands from its icon
- **WHEN** a viewer taps, clicks, hovers or activates by keyboard the information icon of an abbreviated header
- **THEN** its full label is shown, and the column's sort order does not change

#### Scenario: A header expands on focus
- **WHEN** a viewer focuses an abbreviated header
- **THEN** its full label is announced, and focusing its information icon lets the viewer open it

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

### Requirement: Public standings expose promotion-plan bands

Public group-phase team and club table projections SHALL include configured band ranges from a saved
promotion plan. They SHALL attach band labels and seed numbers to rows only after qualification order
is resolved. Without a saved plan, they SHALL omit promotion data.

#### Scenario: A saved plan has resolved qualification order

- **WHEN** a spectator requests a stage table after the promotion plan resolves
- **THEN** the response contains the configured bands and each qualified row's band label and seed

#### Scenario: A saved plan has unresolved qualification order

- **WHEN** a spectator requests a stage table while the qualification cut remains tied or incomplete
- **THEN** the response contains the configured band ranges but no row-level seed tags

#### Scenario: No promotion plan exists

- **WHEN** a spectator requests a stage table without a saved promotion plan
- **THEN** the response contains no promotion bands or row-level promotion fields

### Requirement: Public standings present promotion bands and export them

The standings table SHALL render one rail and legend entry per supplied promotion band, each band in its own categorical colour beside its name, and show a qualification column and an order column only for rows with resolved promotion data. The legend SHALL state each band's range in that same order. Its CSV export SHALL retain the table scope and include band and seed columns when promotion bands are supplied.

#### Scenario: CSV exports a plan-backed table

- **WHEN** a spectator downloads a CSV for a plan-backed standings table
- **THEN** the export includes configured band and seed values for resolved rows and leaves unresolved
  row values empty

#### Scenario: CSV safely encodes user-controlled cells

- **WHEN** a standings cell begins with a spreadsheet formula character
- **THEN** the CSV export escapes the cell before download

#### Scenario: The legend range matches the visible order

- **WHEN** a plan bands entries 1–8 to Copa Oro, 9–16 to Copa Plata and 17–24 to Copa Bronce, and the
  team ranked 16th in the table has plan order 17
- **THEN** that row's order column shows 17, its tag names Copa Bronce, and the legend reads "Copa
  Bronce · orden 17–24", so no legend range contradicts a row

#### Scenario: Bands are told apart without colour

- **WHEN** a table shows three bands
- **THEN** each band's rail and tag use a different categorical colour and every rail stands beside the
  band's name

### Requirement: The player dialog shows stored text as text

The player dialog SHALL show every value it receives as literal text. No tournament name, team name, abbreviation, role, nationality, statistic label or statistic value SHALL be interpreted as markup, whatever it contains.

#### Scenario: Team name holding markup

- **WHEN** a spectator opens the dialog for a player whose team name holds an image tag with an event handler
- **THEN** the dialog shows those characters as text, creates no image, and runs no handler

#### Scenario: Every field holding markup

- **WHEN** each text field of the profile holds markup
- **THEN** the dialog body contains only the elements it always builds, and every field reads as sent

#### Scenario: Ordinary profile

- **WHEN** a spectator opens the dialog for a player with statistics and history
- **THEN** the dialog shows the same sections, tags, table and classes as before

#### Scenario: No history

- **WHEN** the player has no statistics or no recorded history
- **THEN** the dialog shows its localized empty messages

#### Scenario: Failed load

- **WHEN** the profile request fails
- **THEN** the dialog shows its localized error message

### Requirement: Public web code adds no unreviewed HTML sink

The automated checks SHALL fail when web application code assigns HTML to an element or injects it through a framework, unless that use is listed with the reason it is safe.

#### Scenario: New sink

- **WHEN** a source file under `apps/web/src` gains an `innerHTML` assignment, `insertAdjacentHTML`, `document.write`, `dangerouslySetInnerHTML` or an unlisted `set:html`
- **THEN** the check fails and names the file and line

### Requirement: The player dialog reads the public profile from the API

The player dialog SHALL request the profile from the API's public profile path on the app origin. It SHALL NOT depend on a
route served by the web app, or on an API origin given at runtime.

#### Scenario: Spectator opens the dialog

- **WHEN** a spectator opens a player from the standings table
- **THEN** the browser requests `/organizations/{organization}/tournaments/{tournament}/persons/{person}/public/profile` on the same origin and the dialog shows the response

#### Scenario: Profile is not available

- **WHEN** the API answers 404 because the person does not exist or is hidden from the public
- **THEN** the dialog shows its existing error state

### Requirement: The public player profile does not depend on the caller

A successful public player profile response SHALL be publicly cacheable for 60 seconds and SHALL be the same with or without credentials. An error response SHALL NOT be publicly cacheable.

#### Scenario: Successful response

- **WHEN** a client reads a visible profile
- **THEN** the response carries `Cache-Control: public, max-age=60`

#### Scenario: Request with credentials

- **WHEN** a client reads the same profile with and without an access token
- **THEN** the two response bodies are identical

#### Scenario: Hidden person

- **WHEN** a client reads a profile the tournament does not show publicly
- **THEN** the API answers 404 without `Cache-Control: public`

### Requirement: The standings CSV link is served on the app origin

Every public standings CSV download link SHALL be a path on the app origin under the API path prefix. It SHALL NOT contain the API's internal address.

#### Scenario: Link in a Compose installation

- **WHEN** the web role runs with `COPALIBRE_API_INTERNAL_URL` set to `http://api:3001` and a spectator opens a stage page
- **THEN** the download link starts with `/api/organizations/` and the browser receives the CSV

### Requirement: The player dialog shows localized statistic labels and roles

The player dialog SHALL show each statistic's label in the page language when the profile carries a localized label, falling back to the stored label, and SHALL show the competition role with the same localized role names the player page uses.

#### Scenario: Spanish dialog

- **WHEN** a spectator on a Spanish page opens a player whose profile carries `localizedLabel.es` "Goles" and the role `player`
- **THEN** the dialog shows "Goles" and "Jugador"

#### Scenario: Unknown role

- **WHEN** the profile carries a role the catalogue does not name
- **THEN** the dialog shows the role as stored, as literal text

### Requirement: A stage with several groups shows one standings table per group

A public standings presentation of a stage whose table projection holds more than one group segment SHALL render one table per group, headed by the group's name and in segment order, on the stage page, the tournament overview and the TV standings. Shared controls (club filter, CSV export, legends) SHALL appear once per stage, not per group.

#### Scenario: Six groups on the stage page

- **WHEN** a spectator opens a group stage whose projection holds segments Grupo A to Grupo F
- **THEN** the page shows six tables headed Grupo A to Grupo F, each ranking its own four entrants, and
  one club filter and one CSV link after them

#### Scenario: A single group keeps one table

- **WHEN** a stage's projection holds one segment
- **THEN** one table without a group heading is shown

### Requirement: A knockout stage page shows no league table

A public stage page, or a zone of a mixed stage, laid out as a bracket SHALL NOT render a group-phase standings table. A placement stage rendered as a ranked table keeps its table.

#### Scenario: Cups drawn as brackets

- **WHEN** a spectator opens a stage of three cups drawn as brackets
- **THEN** the page shows the brackets and no table ranking the 24 entrants on their knockout games

### Requirement: The player dialog summarizes the profile and leads to it

The player dialog SHALL show the player's club and shirt number for the current tournament and the
selected layout's tournament totals, and SHALL offer a link to the player's full public profile with
the same layout selected.

#### Scenario: From the statistics table to the profile
- **WHEN** a spectator opens a player from the player-statistics table and follows the dialog's
  profile link
- **THEN** the full profile opens with the layout the table was showing

#### Scenario: Dialog header
- **WHEN** the dialog opens for a player whose latest roster gives number 3 for Club Hispano
- **THEN** its header shows Club Hispano and number 3 next to the player's name

### Requirement: A player table can be searched by name

A public person-granularity table SHALL offer a name search, carried in the URL's query string and
applied by the server, that keeps each matching row's tournament-wide rank, and SHALL apply the same
filter in place when scripts run.

#### Scenario: Search without scripts
- **WHEN** a visitor with scripts off submits "moreno" in the player-statistics search
- **THEN** the page reloads with the query in the URL and lists only rows whose player name matches,
  each with its tournament-wide rank

#### Scenario: Accent-insensitive search
- **WHEN** a visitor searches "leon"
- **THEN** rows naming "León" match

### Requirement: A player table shows the shirt number

A public person-granularity table SHALL show a number column before the player column, holding the
number from the player's most recent finalized roster in the tournament, blank when none is
recorded.

#### Scenario: Number column
- **WHEN** a visitor reads the player-statistics table
- **THEN** each row shows the player's latest roster number before the name

### Requirement: The sorted column is indicated

A public table SHALL mark the column it is sorted by with a visible direction indicator and expose
the same state to assistive technology.

#### Scenario: Sorted by goals
- **WHEN** the player table is sorted by goals descending
- **THEN** the goals header shows a descending indicator and carries `aria-sort="descending"`

### Requirement: A fraction with nothing attempted follows the zero-value display

A fraction cell whose numerator and denominator are both zero SHALL render as its layout's zero-value
display, never as "0/0".

#### Scenario: No direct free kicks taken
- **WHEN** a player has taken no direct free kick
- **THEN** the free-kick fraction cell renders as the layout's zero display, the same as an
  unrecorded goal count

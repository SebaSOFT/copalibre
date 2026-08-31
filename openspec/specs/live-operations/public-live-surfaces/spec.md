# public-live-surfaces Specification

## Purpose
Gives anonymous spectators a near-real-time view of an in-progress competition — a live match
dashboard and a read-only bracket — that stay informative if the live connection drops and never
rely on color alone to communicate match or result state.

## Requirements

### Requirement: Live competition dashboard reflects current match state
The public live dashboard SHALL show the current live match's clock, score, and series progress, and
SHALL update this view when the public SSE channel emits a relevant event, without a full page
reload. The dashboard's initial (pre-SSE) state SHALL be fetched server-side, per request, from the
tournament's real current match state — never from fixture/sample data — so the page is already
correct before any script runs, and so a live match started after the site was last built is visible
immediately.

#### Scenario: Score update arrives over SSE
- **WHEN** the public SSE channel emits a `match.updated` event with a new score for the currently displayed live match
- **THEN** the dashboard's score display updates to the new value without a page reload

#### Scenario: Dashboard remains usable if SSE is unavailable
- **WHEN** the public SSE connection cannot be established
- **THEN** the dashboard still renders the last known server-rendered match state instead of a blank or broken page

#### Scenario: Dashboard reflects a match with no live activity
- **WHEN** the requested tournament currently has no match in progress
- **THEN** the dashboard renders without a fabricated live match, rather than showing sample match data

### Requirement: Bracket view never encodes result state by color alone
Every winner/loser or match-state indicator in the public bracket view SHALL pair its color with a
non-color cue (icon and/or text label). The bracket's structure and match state SHALL be fetched
server-side, per request, from the stage's real recorded fixtures and results — never from fixture/
sample data — so any published stage of any published tournament is reachable, not only one hardcoded
stage.

#### Scenario: Winner row has a redundant cue
- **WHEN** a completed match's winner is displayed in the bracket
- **THEN** the winner's row shows both a distinct color and a check-circle icon (or equivalent text label)

#### Scenario: Legend does not rely on color alone
- **WHEN** the bracket page's result legend is rendered
- **THEN** each legend entry shows a text label alongside its color swatch

#### Scenario: An unpublished stage or tournament is not exposed
- **WHEN** an anonymous visitor requests the bracket page for a stage whose tournament the organizer
  has not published, or for a stage number that does not exist in the tournament
- **THEN** the public site returns a not-found response and exposes no operational data about it

### Requirement: Unresolved bracket rounds are clearly marked pending
A bracket round whose participants are not yet determined SHALL render as a distinct pending/TBD
state rather than an empty or misleading slot.

#### Scenario: Grand Final before semifinals complete
- **WHEN** the semifinal round has not yet produced both finalists
- **THEN** the Grand Final node renders in a visually distinct pending/TBD state, not as an empty slot indistinguishable from a rendering error

### Requirement: Public live surfaces stay discipline-agnostic
The live dashboard and bracket view SHALL NOT render UI elements specific to a single discipline or
game (e.g. a first-person-shooter minimap) on the shared public template.

#### Scenario: Discipline-specific widget is absent from the shared template
- **WHEN** the live dashboard is rendered for any discipline
- **THEN** it contains no discipline-specific visualization outside of data explicitly modeled as generic (team names, scores, series state)

### Requirement: A placement stage is rendered as a ranked table
A public or control surface SHALL render a placement stage as a ranked table with per-round detail,
and SHALL NOT attempt a bracket layout for it.

#### Scenario: A heats stage renders as a leaderboard
- **WHEN** a surface renders a stage whose format is `free-for-all` or `heats`
- **THEN** it presents the stage table and each round's lobbies, because the stage has no tree to draw

#### Scenario: The rendering contract exists to be consumed
- **WHEN** a client reads the published contract for a placement stage
- **THEN** the ranked-table shape is part of it, rather than being inferred from the absence of
  bracket data

### Requirement: Each bracket match card links to that match's report page

Every match card rendered in the public bracket view SHALL link to that match's public report page
(`/{organization}/tournaments/{tournament}/stages/{stageNumber}/matches/{matchNumber}`), whether or
not the match's entrants are already determined.

#### Scenario: A played match's card links to its report
- **WHEN** an anonymous visitor views the bracket page and a match card shows a completed result
- **THEN** the card links to that match's report page, which shows the same result and its full event
  timeline

#### Scenario: An undetermined match's card still links
- **WHEN** a bracket round's participants are not yet determined (rendered pending/TBD per the
  existing requirement)
- **THEN** the card still links to that match's report page, which renders correctly for a not-yet-
  played match

### Requirement: A cross settled by a series is rendered as a series
Public live surfaces SHALL render a cross settled by a series as one cross showing its series state —
matches won by each side, the match in progress, and the matches still to play — rather than as
unrelated matches. The series state SHALL be legible without color alone and SHALL carry a text
equivalent for assistive technology.

#### Scenario: A best-of-five shows its full span from the start
- **WHEN** a spectator views a best-of-five series after one match has been played
- **THEN** all five positions are shown, one marked won, one marked in progress or next, and the
  remainder marked still to play, so the spectator can see how many are left

#### Scenario: A two-legged tie shows its aggregate
- **WHEN** a spectator views a two-match aggregate series after both matches are finalized
- **THEN** the summed score across both matches is shown alongside each individual match score, and the
  side that advanced is named

#### Scenario: Series state does not rely on color
- **WHEN** a spectator views a series with color unavailable
- **THEN** which matches are won, in progress and still to play remains distinguishable from text and
  shape alone

#### Scenario: A single-match cross is unchanged
- **WHEN** a spectator views a cross settled by a single match
- **THEN** it renders exactly as it does today, with no series indication

### Requirement: A series cross states what it is waiting for
The bracket view SHALL mark a cross whose series is undecided as pending, naming the series score, and
SHALL NOT show a winner for a cross whose series has not resolved. A match that will not be played
because the series ended early SHALL be shown as no longer required rather than as pending forever.

#### Scenario: An undecided series does not advance on the bracket
- **WHEN** a best-of-five stands at two matches to one
- **THEN** the cross is marked pending, states the two-to-one series score, and the downstream cross
  shows no entrant from it

#### Scenario: An unplayed game states that it will not be played
- **WHEN** a spectator views the fifth game of a series decided in four
- **THEN** it is shown as no longer required, distinguishable from a game that is merely upcoming

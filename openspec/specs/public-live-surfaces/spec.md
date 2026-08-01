# public-live-surfaces Specification

## Purpose
Gives anonymous spectators a near-real-time view of an in-progress competition — a live match
dashboard and a read-only bracket — that stay informative if the live connection drops and never
rely on color alone to communicate match or result state.
## Requirements
### Requirement: Live competition dashboard reflects current match state
The public live dashboard SHALL show the current live match's clock, score, and series progress, and
SHALL update this view when the public SSE channel emits a relevant event, without a full page
reload.

#### Scenario: Score update arrives over SSE
- **WHEN** the public SSE channel emits a `match.updated` event with a new score for the currently displayed live match
- **THEN** the dashboard's score display updates to the new value without a page reload

#### Scenario: Dashboard remains usable if SSE is unavailable
- **WHEN** the public SSE connection cannot be established
- **THEN** the dashboard still renders the last known server-rendered match state instead of a blank or broken page

### Requirement: Bracket view never encodes result state by color alone
Every winner/loser or match-state indicator in the public bracket view SHALL pair its color with a
non-color cue (icon and/or text label).

#### Scenario: Winner row has a redundant cue
- **WHEN** a completed match's winner is displayed in the bracket
- **THEN** the winner's row shows both a distinct color and a check-circle icon (or equivalent text label)

#### Scenario: Legend does not rely on color alone
- **WHEN** the bracket page's result legend is rendered
- **THEN** each legend entry shows a text label alongside its color swatch

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


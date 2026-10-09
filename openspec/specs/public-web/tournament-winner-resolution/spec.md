# tournament-winner-resolution Specification

## Purpose

Lets public tournament projections resolve a champion when classification fixtures share a terminal round by reconstructing championship lineage from persisted fixtures and recorded outcomes.

## Requirements

### Requirement: A terminal-round classification match does not block champion resolution

When a single- or double-elimination terminal stage's deepest round contains more than one finalized match, the system SHALL first reconstruct the championship path from the generated bracket structure and persisted match outcomes, then resolve the winner or winners from the uniquely identified championship match. The public response SHALL include all championship entrants in an additive `champions` array while retaining the existing singular `champion` field for compatibility.

#### Scenario: Final and classification match share a round

- **WHEN** a terminal stage's deepest round contains a finalized championship match and a finalized third-place or classification match
- **AND** the generated bracket structure and recorded outcomes uniquely map the championship match to a persisted fixture
- **THEN** the zone's champion resolves from the championship match, not from a classification match

#### Scenario: Legacy single-elimination fixtures have one outcome-lineage final

- **WHEN** a single-elimination terminal stage cannot be mapped uniquely to its generated bracket
- **AND** exactly one finalized fixture in the deepest round has two entrants whose every finalized match in their respective latest prior round in that zone is a win by that entrant
- **THEN** the zone's champion resolves from that fixture's recorded result

#### Scenario: Multiple latest prior wins identify a legacy final

- **WHEN** a single-elimination terminal stage cannot be mapped uniquely to its generated bracket
- **AND** one entrant in a deepest-round fixture has multiple finalized matches in their latest prior round
- **AND** that entrant won all those matches, the opponent's latest prior-round matches were also all wins by that opponent, and exactly one deepest-round fixture meets this condition
- **THEN** the zone resolves that fixture as its championship match

#### Scenario: A uniquely identified single-elimination final is tied

- **WHEN** a finalized championship fixture is uniquely identified by graph reconstruction or the constrained single-elimination outcome-lineage fallback
- **AND** both recorded scores are present and equal
- **AND** the result has no recorded winner
- **THEN** both finalists are returned in `champions`, the legacy `champion` field contains the first entrant in fixture order, and `runnerUp` is absent

#### Scenario: A tied classification fixture is not a shared championship

- **WHEN** a tied finalized fixture is not the uniquely identified championship fixture
- **THEN** its entrants are not returned as champions because of that draw

#### Scenario: The public tournament page displays every co-champion

- **WHEN** a resolved zone response includes multiple entrants in `champions`
- **THEN** the public tournament page displays each entrant as a champion
- **AND** does not display those co-champions as runners-up

#### Scenario: The public page supports older winner responses

- **WHEN** a resolved zone response omits `champions`
- **THEN** the public tournament page displays the existing singular `champion` field

#### Scenario: Legacy outcome lineage is incomplete or ambiguous

- **WHEN** the generated bracket cannot be mapped uniquely and an entrant's latest prior round contains an unrecorded result, a loss, or a draw, or zero or multiple deepest-round candidates satisfy the outcome-lineage rule
- **THEN** the zone's champion remains unresolved

#### Scenario: Persisted bracket cannot be reconstructed uniquely

- **WHEN** multiple finalized matches share the deepest round and the generated bracket structure cannot be mapped uniquely to persisted fixtures and outcomes
- **AND** the constrained single-elimination outcome-lineage fallback does not identify exactly one candidate
- **THEN** the system reports the zone's champion as unresolved rather than guessing

#### Scenario: Double-elimination graph cannot be reconstructed

- **WHEN** a double-elimination terminal stage cannot be mapped uniquely to the generated grand-final or reset path
- **THEN** the system reports the zone's champion as unresolved without applying the single-elimination fallback

### Requirement: Several lineage candidates resolve to the entrants that never lost in the zone
When the outcome-lineage reading of a single-elimination zone leaves more than one deepest-round candidate for the championship fixture, the system SHALL keep only the candidates whose two entrants have no lost finalized match in that zone and SHALL resolve the zone from the single survivor. When no candidate or more than one candidate survives, the zone SHALL resolve no champion and SHALL NOT affect any other zone.

#### Scenario: A final and a fifth-place game share the deepest round
- **WHEN** a cup zone's deepest round holds the final, a third-place game and a fifth-place game
- **AND** both the final and the fifth-place game pass the latest-prior-round win test
- **AND** only the final's two entrants have never lost a finalized match in the zone
- **THEN** the zone's champion resolves from the final

#### Scenario: The data cannot single out one fixture
- **WHEN** zero or several deepest-round fixtures have two entrants who never lost
- **THEN** that zone resolves no champion and the other zones of the stage still resolve

#### Scenario: Every decided zone of the last stage is listed
- **WHEN** a finished tournament's last stage has three elimination zones whose finals are decided
- **THEN** the overview's winners list one entry per zone, each with its own champion

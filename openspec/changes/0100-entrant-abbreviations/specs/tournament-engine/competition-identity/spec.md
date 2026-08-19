## ADDED Requirements

### Requirement: An entrant carries a tournament-scoped, guaranteed-distinct abbreviation

An entrant SHALL be able to carry a short label, in the same format as a club's or team's own
abbreviation, distinct from every other entrant's label within the same tournament. This is a separate
guarantee from a club's or team's own abbreviation, which remains organizer-chosen and
collision-tolerant exactly as before — an entrant's label is what a tournament-scoped surface (a group
table, a bracket cell, a match header) shows, and it is resolved automatically, as a default, only when
nothing usable was explicitly supplied.

#### Scenario: An unambiguous name resolves automatically on registration
- **WHEN** a team registers for a tournament and no other registered entrant's label would collide
  with a candidate derived from its name
- **THEN** the entrant registers with that label already set, with no separate step required

#### Scenario: A colliding name registers without a label, flagged for an officer
- **WHEN** a team's derived candidate label matches an entrant already registered in the same
  tournament
- **THEN** the entrant registers successfully with no label set, and appears among the tournament's
  entrants still needing one, rather than the system inventing a second candidate on its own

#### Scenario: A usable explicitly supplied label is never overridden by derivation
- **WHEN** a registration request or CSV-import row supplies a label that has valid format and is free
  within the tournament
- **THEN** that label is stored exactly as given, and no derived candidate is computed or considered

#### Scenario: An unusable registration label falls back to one derived proposal
- **WHEN** a registration request or CSV-import row supplies an empty, malformed, or tournament-colliding
  label
- **THEN** the system treats that input as absent and tries its ordinary derived candidate once; if that
  candidate is also unavailable, the entrant registers without a label and needs officer resolution

#### Scenario: A set label changes only through an explicit, audited request
- **WHEN** an officer sets a new valid, tournament-free label for an entrant at any tournament lifecycle
  point
- **THEN** the label changes, its prior and resulting states are audited, and no automatic derivation runs

#### Scenario: A duplicate label is refused, not merely reported
- **WHEN** an officer explicitly sets an entrant's label to one another entrant in the same tournament
  already carries
- **THEN** the request is refused, naming the conflict — unlike a club's or team's own abbreviation,
  where a shared value is reported but never refused

#### Scenario: The same label is legal across different tournaments
- **WHEN** two entrants in two different tournaments carry the identical label
- **THEN** neither registration nor label change is affected by the other tournament's usage

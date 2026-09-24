# tournament-overview Specification

## Purpose

Gives an anonymous spectator a tournament overview page that renders its match list and, once the
tournament is decided, its outcome, entirely through CopaLibre's owned presentation components rather
than page-local markup.

## Requirements

### Requirement: Overview match entries use owned presentation components
Every match entry on the tournament overview page SHALL render through the same owned card, badge,
and timestamp components the matches list (`public-web/matches-view`) already uses, rather than
page-local markup. A match's scheduled or kicked-off time SHALL render as a localized, human-readable
timestamp, never as a raw machine timestamp format.

#### Scenario: Overview match entry shows a localized timestamp
- **WHEN** the tournament overview page renders a scheduled or completed match
- **THEN** the match's date and time render through the shared timestamp component, localized to the
  page's active language, and no raw ISO-8601 string is visible to the spectator

#### Scenario: Overview match entry carries a state badge
- **WHEN** the tournament overview page renders a match that is live, upcoming, or finished
- **THEN** the match entry shows a state badge consistent in shape and treatment with the same state's
  badge on the matches list and match detail pages

### Requirement: Completed multi-zone tournament surfaces a champions podium
When a tournament is finished and its public winners projection resolves more than one final zone,
the tournament overview page SHALL show a podium section before or alongside the standings table.
Each zone SHALL identify every declared champion and any explicitly resolved runner-up and third
place. The page SHALL NOT invent a missing rank.

#### Scenario: Completed multi-zone tournament shows a podium per zone
- **WHEN** a spectator opens the overview of a completed tournament whose playoff stage resolved
  multiple zones
- **THEN** the page shows one podium entry per resolved zone, naming every champion and each
  explicitly resolved lower rank

#### Scenario: Shared title has no runner-up
- **WHEN** a zone's championship ends with multiple declared champions and no runner-up
- **THEN** the podium names all co-champions at rank one and does not fabricate rank two

#### Scenario: Duel bracket has no third-place result
- **WHEN** a zone resolves its final but has no explicit third-place ranking
- **THEN** the podium names its champion and runner-up without assigning third place to a semifinal loser

#### Scenario: In-progress tournament shows no podium
- **WHEN** a spectator opens the overview of a tournament that has not reached completed status, or
  whose final stage has not yet resolved a zone's placements
- **THEN** the page shows no podium section for that zone, rather than an incomplete or placeholder one

#### Scenario: Single-zone tournament shows no podium
- **WHEN** a spectator opens the overview of a completed tournament whose structure never resolved more
  than one final zone
- **THEN** the page shows no podium section, since the existing standings table already states the
  single outcome

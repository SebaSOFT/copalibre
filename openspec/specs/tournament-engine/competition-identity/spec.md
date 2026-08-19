# competition-identity Specification

## Purpose
Gives a competition the three identities it has been missing: the edition a tournament is being run
as, the human behind a player, and the discipline a team plays.

## Requirements

### Requirement: A season is an edition of a tournament
A tournament SHALL represent the recurring competition and a season one running of it, with stages
belonging to the season, so editions relate to one another as data rather than as similar names.

#### Scenario: Two editions of one competition are the same tournament
- **WHEN** a competition is run in two consecutive years
- **THEN** both are seasons of one tournament, and a question spanning them is answerable without
  comparing names

#### Scenario: The distinctive name is composed, not stored
- **WHEN** a surface displays a competition's full name
- **THEN** it is composed from the tournament and the season, so the relation between editions
  survives however the name is written

#### Scenario: A competition that has only ever run once still has a season
- **WHEN** a tournament is created without anyone naming an edition
- **THEN** it carries one season, so nothing downstream needs to handle a stage with no season

### Requirement: A person is distinct from their membership in a team
The system SHALL represent the human and their membership in a team separately, and one person SHALL
be able to hold several memberships at once.

#### Scenario: One human plays for two teams
- **WHEN** the same person is registered for a club's football team and its futsal team
- **THEN** both memberships exist under one person, and totals attributed to the person cover both

#### Scenario: A person is recognised rather than duplicated
- **WHEN** a person already known to the organization is entered again under the same natural key
- **THEN** they are recognised as the same person rather than created a second time

#### Scenario: A person may exist before anyone has their document
- **WHEN** a person is registered without a natural key
- **THEN** the registration succeeds, and supplying the key later does not create a second person

### Requirement: A natural key is personal data
A person's natural key SHALL be scoped to the organization that holds it, readable only where policy
allows, and unique on a normalised form.

#### Scenario: Two spellings of one document are one person
- **WHEN** the same identity number is entered with different punctuation or spacing
- **THEN** it is recognised as the same key, rather than creating a second person

#### Scenario: Reading a fixture does not reveal a document
- **WHEN** a surface that may read public competition data requests a person
- **THEN** the natural key is not among what it receives

### Requirement: A team names the discipline it plays
A team SHALL declare its discipline, so a club fielding sides in several disciplines is expressible
and a roster constraint applies to the right one.

#### Scenario: One club, two sides, two disciplines
- **WHEN** a club registers a football team and a futsal team
- **THEN** the two are distinguishable, and each is bound by its own discipline's roster constraints

### Requirement: A club and a team carry a short label for constrained surfaces
A club SHALL be able to carry an abbreviation of uppercase letters, digits and single interior
spaces, and a team SHALL be able to override its club's, so a bracket cell, a scoreboard and a
broadcast lower third show the same short name rather than each truncating the full one differently.

The abbreviation SHALL NOT be derived from the name, and SHALL NOT be substituted when absent.

#### Scenario: A long name gets the short label its organizer chose
- **WHEN** a club named "Casa de Italia" is given the abbreviation "C I"
- **THEN** every constrained surface shows "C I", and nothing derived it from the name

#### Scenario: Two sides of one club are distinguishable
- **WHEN** "Talleres de Mendoza" enters two teams in one tournament
- **THEN** each team may carry its own abbreviation, "TLL A" and "TLL B", overriding the club's

#### Scenario: A team without one falls through to its club
- **WHEN** a team carries no abbreviation and its club carries "TLL"
- **THEN** the team reads as "TLL"

#### Scenario: Absent everywhere stays absent
- **WHEN** neither a team nor its club carries an abbreviation
- **THEN** the read reports none, and what a surface shows instead is that surface's decision

#### Scenario: A malformed abbreviation is refused before it is stored
- **WHEN** an abbreviation carries lowercase letters, punctuation, or a double space
- **THEN** it is refused with the reason stated, and no row is written

#### Scenario: A collision is reported and nothing is refused
- **WHEN** two teams in one competition carry the same abbreviation
- **THEN** it is reported as a finding for the organizer, and neither team is prevented from
  competing

### Requirement: A club is reachable by a path identifier that may be suggested
A club SHALL be able to carry an alias, unique within its organization, and the system SHALL be able
to suggest one from the club's name — which the abbreviation is deliberately never derived from,
because an alias is a transformation and an abbreviation is a choice. Every suggestion the system
offers SHALL itself be a valid alias — never a value that would fail the same validation an organizer's
own input is subject to.

#### Scenario: An alias is suggested from the name
- **WHEN** a club named "Club Atlético San Martín" is created without an alias
- **THEN** it is given `club-atletico-san-martin`, folded and lowercased with no judgement applied

#### Scenario: A second club of the same name is offered a suffix
- **WHEN** an organization already has a club whose alias is `talleres-de-mendoza`
- **THEN** a second club of that name is offered `talleres-de-mendoza-2` rather than refused

#### Scenario: What the organizer typed wins over what would be suggested
- **WHEN** an organizer supplies an alias
- **THEN** it is validated and stored as given, and nothing is suggested over it

#### Scenario: A near-maximum-length name still gets a valid suggested suffix
- **WHEN** a club's folded name is already at the platform's alias length limit, and an organization
  already has a club whose alias equals that full-length base
- **THEN** the second club is offered a suggestion that still satisfies the length limit, not a
  suggestion that exceeds it

### Requirement: A person may declare a nationality

A person SHALL be able to carry an optional nationality, stored as an ISO 3166-1 alpha-2 country code.
A person without one is valid and unaffected by every existing requirement.

#### Scenario: A person is registered with a nationality
- **WHEN** a person is registered supplying a nationality code
- **THEN** the code is stored and returned on every subsequent read of that person

#### Scenario: A person is registered without a nationality
- **WHEN** a person is registered with no nationality supplied
- **THEN** registration succeeds and the person's nationality reads as absent, not a default or a guess

#### Scenario: An invalid country code is refused
- **WHEN** a nationality is supplied that is not a valid ISO 3166-1 alpha-2 code
- **THEN** the write is rejected, naming the invalid code

### Requirement: A person may carry an optional photo

A person SHALL be able to carry an optional photo, stored as an object-storage reference rather than
inline bytes. A person without one is valid; every surface that displays a person's photo SHALL show a
placeholder rather than a broken image or an empty gap.

#### Scenario: A photo is attached to a person
- **WHEN** an operator uploads a photo for a person
- **THEN** the person's photo reference is stored and resolvable to the uploaded image on every
  subsequent read

#### Scenario: A person's photo is replaced
- **WHEN** an operator uploads a new photo for a person who already has one
- **THEN** the stored reference is replaced and the previous image is no longer referenced from that
  person

#### Scenario: A person with no photo shows a placeholder
- **WHEN** a person's profile is displayed and no photo was ever uploaded
- **THEN** a placeholder image renders in its place, distinguishable from a real photo

### Requirement: A club may carry an optional emblem

A club SHALL be able to carry an optional emblem (crest/shield), stored as an object-storage reference.
A club without one is valid; every surface that displays a club's emblem SHALL show a placeholder
rather than a broken image or an empty gap.

#### Scenario: An emblem is attached to a club
- **WHEN** an organizer uploads an emblem for a club
- **THEN** the club's emblem reference is stored and resolvable to the uploaded image on every
  subsequent read

#### Scenario: A club with no emblem shows a placeholder
- **WHEN** a club's emblem is displayed and none was ever uploaded
- **THEN** a placeholder image renders in its place, distinguishable from a real emblem

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

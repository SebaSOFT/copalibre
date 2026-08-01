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


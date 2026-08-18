## MODIFIED Requirements

### Requirement: The competition and participation hierarchies are explicit
The domain SHALL model the competition hierarchy — organization, tournament, season, stage, zone,
group, fixture, match, segment — and the participation hierarchy — club, team, person, and a person's
membership in a team — as distinct levels, rather than collapsing ones that later phases key on.

#### Scenario: A stage belongs to an edition, not to the competition as a whole
- **WHEN** a tournament is run in more than one season
- **THEN** each season carries its own stages, and neither edition's structure is confused with the
  other's

#### Scenario: A human and a membership are separate identities
- **WHEN** a person plays for more than one team
- **THEN** the person is one identity and each membership is another, so a fact can be attributed to
  either

#### Scenario: A level nothing populates is not silently collapsed
- **WHEN** a competition is created without an explicit edition
- **THEN** the season exists with one implicit edition rather than the stage attaching to the
  tournament, so every reader sees one shape

#### Scenario: A zone groups a stage's entrants without merging into the stage itself
- **WHEN** a stage is split into more than one zone (e.g. "Zona Norte" and "Zona Sur")
- **THEN** each zone is its own addressable level, distinct from the stage and from any other zone,
  and a question about one zone's fixtures never silently includes another's

#### Scenario: A group is the round-robin pool a group-type phase needs
- **WHEN** a zone in a round-robin-type stage is split into more than one group
- **THEN** each group's fixtures and standings are computed independently, and no fixture is generated
  between entrants of different groups

#### Scenario: A stage with no explicit zone or group still has one of each
- **WHEN** a stage's fixtures are generated without an operator ever creating a zone or a group
- **THEN** the stage has exactly one implicit zone and that zone exactly one implicit group, and every
  reader — old or new — sees the same fixture graph and standings it would have before zones and groups
  existed

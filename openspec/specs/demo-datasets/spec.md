# demo-datasets Specification

## Purpose
Defines committed demo tournaments that give a development installation realistic data, and the
explicit seed command that loads them without touching startup, migrations or production behaviour.

## Requirements

### Requirement: Demo datasets are committed, validated data

The repository SHALL contain each demo dataset as a directory holding one `dataset.json`, its image
assets, and a `source.md` naming the origin URL, the capture date and the attribution of third-party
material. Every dataset SHALL validate against a published JSON Schema before it can be loaded or
merged.

#### Scenario: A dataset passes validation

- **WHEN** the dataset validator runs over `panamericano-clubs-2025`'s directory
- **THEN** it reports no errors, every alias is lowercase kebab-case, and every cross-reference resolves to an entity in the same file

#### Scenario: A malformed dataset is rejected

- **WHEN** a dataset contains an alias with uppercase letters, a reference to an entity that does not
  exist, or an emblem path that does not exist on disk
- **THEN** validation fails and names the offending file, field and value

#### Scenario: Provenance is mandatory

- **WHEN** a dataset directory has no `source.md`
- **THEN** validation fails

### Requirement: The Panamericano club championship dataset

The repository SHALL ship a dataset with alias `panamericano-clubes-2025` representing the
Campeonato Panamericano Clubes Senior Varones 2025/26: 24 clubs, six round-robin groups (A to F),
the Copa Oro, Copa Plata and Copa Bronce bracket stages, all 72 played games with their final
scores, dates, times and venues, scorer events, and the rostered players of every team. It SHALL use
the `rink-hockey` discipline.

#### Scenario: Structure matches the source

- **WHEN** the dataset is loaded
- **THEN** the tournament has six groups whose members total 24 entrants, three cup stages, and 72
  fixtures with recorded results

#### Scenario: Emblems are present

- **WHEN** the dataset is loaded
- **THEN** each club has its emblem and the tournament has its emblem, and the public pages render
  them

### Requirement: Jornadas, venues and the schedule are loaded

The Panamericano dataset SHALL carry each game's jornada (group games) or bracket round (cup games) as
a round number, its venue as a venue entity, and its kickoff date and time. Loading SHALL create the
venues, one published schedule whose slots are the games' venue and kickoff times, and SHALL assign
every match to its slot, so the schedule views and the public match list show the real programme.

#### Scenario: Group games sit in their jornada

- **WHEN** the dataset is loaded
- **THEN** each group's games are in rounds 1 to 3 as published, and the matches view groups them by
  jornada

#### Scenario: Every match has a slot

- **WHEN** the dataset is loaded
- **THEN** each of the 72 matches is assigned to a schedule slot at its published venue and time, and
  the schedule is published

#### Scenario: Venues are shared

- **WHEN** two games are played at the same venue
- **THEN** they reference one venue, not two

#### Scenario: Referees become officials

- **WHEN** a game report lists referees
- **THEN** each referee exists once as an official under a fully generated name and is assigned to
  that game's slot

### Requirement: Player surnames are pseudonymised

A committed dataset SHALL NOT contain the real surname of any natural person who appears as a player
or official. A deterministic scrambler SHALL replace each player's surname before it is written to
any committed file and SHALL leave players' given names unchanged. Officials (referees) SHALL be
replaced entirely, given name and surname, because the source prints their names inconsistently. The
same source SHALL always produce the same pseudonyms, and no two distinct people on the same team
SHALL end up with the same full name. Real club names, results, scores, dates and venues are
retained.

#### Scenario: Given names are kept

- **WHEN** a source player "ACIAR, ROBERTO MATIAS" is pseudonymised
- **THEN** the committed name keeps "Roberto Matias" and carries a generated surname in place of "Aciar"

#### Scenario: Deterministic output

- **WHEN** the scraper is run twice against the same cached source
- **THEN** both runs produce byte-identical `dataset.json` files

#### Scenario: No real surnames are committed

- **WHEN** the committed dataset is searched for any real player surname from the raw cache
- **THEN** no match is found outside club and venue names

#### Scenario: Surnames are not reversible from the dataset

- **WHEN** a reader has only the committed dataset
- **THEN** they cannot recover a real surname from a generated one

#### Scenario: Full names stay unique within a team

- **WHEN** two players on one team would end up with the same given names and generated surname
- **THEN** the scrambler disambiguates them

#### Scenario: Officials are wholly replaced

- **WHEN** a referee's name is printed with the surname in the given-name position or without a comma
- **THEN** no part of the real name appears in the dataset

#### Scenario: Statistics survive

- **WHEN** a player is pseudonymised
- **THEN** that player's dorsal number, nationality, team and goal and assist totals are unchanged

### Requirement: Loading is explicit and idempotent

A demo dataset SHALL be loaded only by an explicit `demo` command of the seed application. Neither
migrations nor application startup SHALL load or alter demo data. Loading SHALL happen in one
transaction and SHALL be safe to repeat.

#### Scenario: First load

- **WHEN** an operator runs the demo command for `panamericano-clubes-2025` on an empty installation
- **THEN** the organization, clubs, teams, players, tournament, stages, fixtures and results are
  created and the command reports what was installed

#### Scenario: Repeat load

- **WHEN** the same command is run again
- **THEN** nothing is duplicated, nothing is overwritten, and the command reports the dataset as
  already present

#### Scenario: Failure leaves nothing behind

- **WHEN** a load fails part-way
- **THEN** no partial organization, tournament or uploaded object remains

#### Scenario: Startup stays clean

- **WHEN** the application or migrations run against an empty database
- **THEN** no demo data exists afterwards

### Requirement: The rink-hockey prerequisite is checked

Loading a dataset that names a discipline SHALL first verify that the discipline descriptor is
installed at the required version, and SHALL NOT install modules itself.

#### Scenario: Descriptor missing

- **WHEN** the demo command runs and `rink-hockey` is not installed
- **THEN** it exits non-zero before writing anything and tells the operator how to install the module

### Requirement: Scraping is polite and reproducible

The scraper SHALL cache every raw response on disk and reuse the cache on re-runs, SHALL limit its
request rate, SHALL identify itself, and SHALL be run only by a developer on demand. Raw cached
responses SHALL NOT be committed.

#### Scenario: Cache reuse

- **WHEN** the scraper is re-run with a populated cache
- **THEN** it makes no network requests

#### Scenario: CI is offline

- **WHEN** the CI test suites run
- **THEN** none of them contact the source site

### Requirement: A development command loads a dataset

The `copalibre` CLI SHALL provide a development command that loads a named demo dataset into the
running development stack, and that lists the datasets available. The command SHALL refuse to run when
the development infrastructure is not reachable and SHALL refuse non-development targets, so it cannot
load demo data into an installation.

#### Scenario: Load into the dev stack

- **WHEN** a developer runs `copalibre dev demo panamericano-clubes-2025` with the development stack up
- **THEN** the dataset is loaded, and the emblems it uploaded are served by the running API

#### Scenario: Listing

- **WHEN** a developer runs `copalibre dev demo --list`
- **THEN** every available dataset alias is printed with its name and nothing is written

#### Scenario: Stack not running

- **WHEN** the development infrastructure is not up
- **THEN** the command exits non-zero before loading anything and says how to start it

#### Scenario: Never against an installation

- **WHEN** the command is run in a directory configured as a production Compose or Kubernetes
  installation
- **THEN** it refuses and exits non-zero

#### Scenario: Emblems survive rebuilds

- **WHEN** the dev API container is rebuilt after a dataset was loaded
- **THEN** the emblems still render, because dev object storage is the shared Garage service

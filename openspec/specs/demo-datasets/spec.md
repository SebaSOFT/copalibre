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

- **WHEN** the dataset is loaded without a cutoff
- **THEN** the tournament has six groups whose members total 24 entrants, three cup stages, and 72
  fixtures with recorded results

#### Scenario: Structure survives a cutoff

- **WHEN** the dataset is loaded with a cutoff
- **THEN** the tournament still has six groups totalling 24 entrants, three cup stages and 72 fixtures,
  each assigned to its slot, and only the games played before the cutoff have recorded results

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
running development stack, and that lists the datasets available. The command SHALL accept an anchor
date (`--anchor`) and a cutoff (`--played-until`) and pass them to the load unchanged. The command
SHALL refuse to run when the development infrastructure is not reachable and SHALL refuse
non-development targets, so it cannot load demo data into an installation.

#### Scenario: Load into the dev stack

- **WHEN** a developer runs `copalibre dev demo panamericano-clubes-2025` with the development stack up
- **THEN** the dataset is loaded, and the emblems it uploaded are served by the running API

#### Scenario: Load a tournament happening now

- **WHEN** a developer runs `copalibre dev demo panamericano-clubes-2025 --anchor today --played-until now`
  with the development stack up
- **THEN** the dataset is loaded starting today, with the games that already finished played and the
  rest scheduled

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

### Requirement: The Panamericano dataset carries an organization emblem
The Panamericano dataset SHALL include an organization emblem image, SHALL declare it in the dataset document and its schema, SHALL name its origin in `source.md`, and loading the dataset SHALL attach it to the organization so the public organization page shows it.

#### Scenario: The organization header shows the emblem
- **WHEN** the dataset is loaded and the organization page is opened
- **THEN** the organization header shows the emblem instead of the placeholder

#### Scenario: Loading stays idempotent
- **WHEN** the dataset is loaded twice
- **THEN** the organization has one emblem

### Requirement: A demo dataset can be anchored to a chosen date

A demo load SHALL accept an anchor date, either a calendar date or `today`. The dataset's first game
day moves to that date. Every game keeps its local kickoff time and its distance in days from the
first game day, both read in the dataset organization's time zone, so day gaps and a daylight-saving
change are preserved. `today` SHALL mean the current date in that time zone. Without an anchor, games
keep their published dates.

#### Scenario: The first game day lands on the anchor

- **WHEN** `panamericano-clubes-2025` is loaded anchored to `2026-10-17`
- **THEN** the games published for 2 November 2025 are scheduled on 17 October 2026 at their published
  local times, and the games published for 8 November 2025 are scheduled on 23 October 2026

#### Scenario: Today is the organization's date

- **WHEN** a dataset is loaded anchored to `today` at an instant when it is already the next day in UTC
  but still the current day in the organization's time zone
- **THEN** the first game day is the organization's current local date, not the UTC date

#### Scenario: No anchor keeps the published dates

- **WHEN** a dataset is loaded without an anchor
- **THEN** every game is scheduled at its published local date and time

#### Scenario: A malformed anchor is refused before writing

- **WHEN** the anchor is neither `today` nor a valid `YYYY-MM-DD` date
- **THEN** the command exits non-zero, names the value it could not read, and writes nothing

### Requirement: A demo dataset can be played only up to a cutoff

A demo load SHALL accept a cutoff, either an ISO-8601 instant or `now`. A game counts as played only
when its nominal finish is at or before the cutoff. A played game loads with its result, events and
match roster. Every other game SHALL keep its published slot and officials, and SHALL have no result,
no events and no match roster. Without a cutoff, every game is played.

#### Scenario: Games after the cutoff are left to play

- **WHEN** a dataset anchored to `today` is loaded with a cutoff of `now` in the middle of its
  second game day
- **THEN** the games that finished before now have results and events, and every later game is
  scheduled in its slot, published, with its officials and without a result

#### Scenario: A game still in progress at the cutoff is not played

- **WHEN** a game kicked off before the cutoff but its nominal finish is after it
- **THEN** the game has no result, so it can be started from the live console rather than appearing
  finalized with a recorded time in the future

#### Scenario: No cutoff plays every game

- **WHEN** a dataset is loaded without a cutoff
- **THEN** every game has its published result, exactly as before this requirement existed

#### Scenario: A malformed cutoff is refused before writing

- **WHEN** the cutoff is neither `now` nor a valid ISO-8601 instant
- **THEN** the command exits non-zero, names the value it could not read, and writes nothing

### Requirement: A demo cup loads as a persisted bracket fed by a confirmed qualification

Each cup of a demo dataset SHALL load as a persisted fixture graph. Every quarter-final side SHALL be a
qualifier position of a promotion plan from the groups, and every later side a `winner-of` or
`loser-of` edge to the game its entrant came from. The qualification SHALL be confirmed only when every
group game is played, and later sides SHALL resolve through the same writer a recorded result uses. A
drawn cup game that fed a later one SHALL record as its winner the entrant who played on.

#### Scenario: Cup quarter-finals are undecided while groups are unfinished

- **WHEN** the cutoff falls before the last group game finishes
- **THEN** every cup's quarter-finals load assigned to their published slots, each side naming its
  qualifier position and no entrant, and the qualification is not confirmed

#### Scenario: A semi-final waits on its own quarter-finals only

- **WHEN** the cutoff falls after every group game and after one quarter-final of the Copa Oro but
  before the other quarter-final feeding the same semi-final
- **THEN** that semi-final has the first quarter-final's winner on one side and the other side still
  undecided, naming the quarter-final it waits on

#### Scenario: A full load reproduces the published brackets

- **WHEN** the dataset is loaded without a cutoff
- **THEN** every cup game has the published entrants and score, and the brackets read the same as the
  published ones

#### Scenario: A drawn quarter-final advances who played on

- **WHEN** a quarter-final was drawn and one of its entrants played the semi-final it feeds
- **THEN** that entrant is recorded as the quarter-final's winner and appears in the semi-final

### Requirement: The load report states how the dataset was shaped

The load report SHALL state the anchor date applied, the cutoff, the number of matches finalized,
and the number of fixtures loaded with undecided entrants. A load without either flag SHALL report
the published dates and every match finalized.

#### Scenario: The report names the shaping

- **WHEN** a dataset is loaded with an anchor and a cutoff
- **THEN** the report prints the first game day, the cutoff, how many matches were finalized, whether
  the qualification was confirmed, and how many fixtures have undecided entrants

# public-web/club-page Specification

## Purpose
Gives a parent or fan who follows one club a single public page per tournament with that club's identity,
status, next match, standing, results, squad and knockout path, and a tournament club index that leads
to it. Club pages are addressed by club alias, never by an identifier.

## Requirements

### Requirement: A published tournament serves a club index

A published tournament SHALL serve `/{organization}/tournaments/{tournament}/clubs`, with its locale
variants. It lists every club with an entrant in the tournament, each with crest, name, abbreviation
and its current status in the tournament, and each linked to its club page. Every club carries an
alias, so every listed club is linked.

#### Scenario: Opening the index
- **WHEN** a visitor opens the club index of a tournament with 24 clubs
- **THEN** the page lists the 24 clubs, each linked to its club page

#### Scenario: A club whose alias was backfilled
- **WHEN** a club had no alias before the upgrade that backfilled one
- **THEN** the index lists it linked to its club page under the backfilled alias

#### Scenario: A club without an alias
- **WHEN** a club reaches the page without an alias, which the API contract no longer allows
- **THEN** the index still lists it, without a link, rather than failing the page

### Requirement: A club with an alias has a tournament club page

A published tournament SHALL serve `/{organization}/tournaments/{tournament}/clubs/{clubAlias}` for
each club with an entrant in it, and SHALL answer with the public not-found page for an alias that
names no such club.

#### Scenario: Unknown alias
- **WHEN** a visitor opens a club path whose alias belongs to no club in the tournament
- **THEN** the site answers 404 with the page-not-found composition

#### Scenario: No UUID in the path
- **WHEN** any public link to a club page is generated
- **THEN** its path identifies the club by alias only

### Requirement: The club page states the club's identity and status

A club page SHALL show the club's crest, name and abbreviation, its band and seed when the tournament
declares a promotion plan, and its current status in the tournament in words.

#### Scenario: A club in a cup semi-final
- **WHEN** a visitor opens Club Hispano's page while it waits for its Copa Oro semi-final
- **THEN** the header shows its crest, name, "HIS", "Copa Oro · Siembra 2", and a status naming Copa
  Oro and the semi-final

#### Scenario: Champion
- **WHEN** a club won the last knockout round of its stage and has no later match
- **THEN** the status reads as champion of that stage

#### Scenario: Eliminated in the group phase
- **WHEN** the tournament has a knockout stage and the club has no match in it
- **THEN** the status reads as eliminated in the group phase

#### Scenario: Group phase without a knockout stage
- **WHEN** the tournament has no knockout stage yet
- **THEN** the status reads as group phase

### Requirement: The club page shows the club's next match

A club page SHALL show the club's next live or scheduled match with its date and time in the
organization's time zone, its opponent or the undecided side's source, its venue when assigned and a
link to its report, and SHALL show no such block when none remains.

#### Scenario: Next match
- **WHEN** Club Hispano's next match is the semi-final against Lomas de Rivadavia on 23 Nov at 18:00
  at Aldo Cantoni
- **THEN** the club page shows that match with that date, time and venue, linked to its report

### Requirement: The club page shows the club's standing and results

A club page SHALL show the club's standing in its current or last group-format stage, marking the
club's row, and SHALL list the club's finished matches in date order, each with its group or round,
opponent, score and outcome in text, linked to its report.

#### Scenario: Group results
- **WHEN** a visitor opens the page of a club that played three group games
- **THEN** the page lists the three results with opponent, score and a won, drawn or lost label, each
  linked to its report, and shows the club's standing row marked

#### Scenario: A level match settled by a deciding factor
- **WHEN** a finished match is level on score and has a winner after the deciding factor or series
- **THEN** the club's result reads as won or lost, never as drawn, using the winner the API reports

### Requirement: The club page lists the club's squad

A club page SHALL list the club's players from the tournament's first person-granularity player
layout filtered to the club, each with shirt number when recorded, name linked to the public
profile, appearances and the layout's primary statistic, and SHALL respect each person's public
visibility.

#### Scenario: Squad
- **WHEN** a visitor opens Club Hispano's page
- **THEN** its 12 players are listed with appearances and goals, each name linked to the player's
  profile

#### Scenario: Hidden person
- **WHEN** a squad member is hidden from public pages
- **THEN** the squad does not show that person's name or link

### Requirement: The club page shows the club's knockout path

When the club has knockout matches, its club page SHALL list them in round order with their round
names and SHALL link to the stage page with the club's path pre-selected.

#### Scenario: Path link
- **WHEN** a visitor follows the knockout path link from Club Hispano's page
- **THEN** the stage page opens at the club's cup with Club Hispano's path highlighted

### Requirement: Club pages are listed in the sitemap

The sitemap SHALL list the club index and each club page of every published tournament, with their
locale variants.

#### Scenario: Sitemap entries
- **WHEN** `sitemap.xml` is generated for a published tournament with 24 aliased clubs
- **THEN** it lists the club index and 24 club pages, each with every locale variant

### Requirement: The club index is grouped by the declared bands

When the tournament declares bands, the club index SHALL list its clubs in one group per declared band,
in the declared band order, each group headed by the band name, with clubs alphabetical inside it.
Clubs that no declared band has taken SHALL form a final group headed as unassigned. A tournament that
declares no band SHALL list its clubs in one alphabetical list without headings.

#### Scenario: Index grouped by band
- **WHEN** a visitor opens the club index of a tournament whose promotion plan declares Copa Oro, Copa Plata
  and Copa Bronce, with Club Hispano and Atlético Bello in Copa Oro and Tiro Federal in Copa Plata
- **THEN** the index shows the Copa Oro group first with Atlético Bello before Club Hispano, then the
  Copa Plata group, then the Copa Bronce group, and clubs with no band in a final unassigned group

#### Scenario: No declared band
- **WHEN** the tournament declares no band
- **THEN** the index is one alphabetical list with no group headings

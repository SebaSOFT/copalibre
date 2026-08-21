# public-web-shell Specification

## Purpose
Delivers CopaLibre's anonymous, spectator-facing tournament pages as a fast, cacheable, mostly-static
site that stays usable without JavaScript and is indexable only on its intended public routes.

## Requirements

### Requirement: Organization-scoped tournament overview page
The public site SHALL serve a tournament overview page at `/{organization}/tournaments/{tournament}`
showing tournament identity, schedule/format facts, a standings preview, and rules access, matching
the B1 reference layout. This page SHALL be rendered per request from the current backend state for
the requested organization/tournament alias pair, rather than pre-rendered ahead of time from a fixed
set of aliases — any published tournament reachable through the public-read API SHALL be reachable
through this page without a site rebuild.

#### Scenario: Visiting a published tournament's overview
- **WHEN** an anonymous visitor requests `/{organization}/tournaments/{tournament}` for a published tournament
- **THEN** the page renders the tournament's name, discipline, format, standings preview, and a rules download link

#### Scenario: Unpublished tournament is not exposed
- **WHEN** an anonymous visitor requests the overview page for a tournament the organizer has not published
- **THEN** the public site returns a not-found response and exposes no operational data about it

#### Scenario: A newly created tournament is reachable without a rebuild
- **WHEN** an organizer publishes a new tournament after the public site was last built
- **AND** an anonymous visitor requests that tournament's overview page
- **THEN** the page renders that tournament's real data, not a 404 and not another tournament's data

#### Scenario: An unknown organization or tournament alias 404s
- **WHEN** an anonymous visitor requests `/{organization}/tournaments/{tournament}` for an alias pair
  that does not exist
- **THEN** the public site returns a not-found response

### Requirement: Public pages function without JavaScript
Core public content (tournament identity, schedule, standings, rules) SHALL be present in the
server-rendered HTML and readable with JavaScript disabled; JavaScript SHALL only add live
enhancement (e.g. the score ticker, live standings refresh).

#### Scenario: No-JS baseline
- **WHEN** the tournament overview page is requested with JavaScript execution disabled
- **THEN** tournament identity, schedule facts, and the standings preview table are still present in the rendered HTML

### Requirement: Sitemap includes only public canonical routes
The site SHALL generate `sitemap.xml` from public canonical routes only, excluding `/control/**`,
`/tv/**`, and `/events/**`.

#### Scenario: Control and TV routes absent from sitemap
- **WHEN** `sitemap.xml` is generated
- **THEN** it contains no `/control/` or `/tv/` prefixed URL

### Requirement: Control and TV surfaces are non-indexable
`robots.txt` SHALL disallow `/control/**` and `/tv/**`, and pages under those prefixes SHALL carry a
`noindex` directive as a second layer of defense.

#### Scenario: robots.txt disallows control routes
- **WHEN** `robots.txt` is fetched
- **THEN** it contains a `Disallow: /control/` rule

### Requirement: Alias rename preserves inbound links
Renaming an organization or tournament alias SHALL cause the previous scoped path to 301-redirect to
the new canonical scoped path, and a redirect SHALL never resolve into a different organization's
route even if the old alias string collides.

#### Scenario: Old tournament URL redirects after rename
- **WHEN** a tournament's alias is changed from `spring-cup-2026` to `spring-cup-26`
- **AND** a visitor requests the old path `/{organization}/tournaments/spring-cup-2026`
- **THEN** the response is a 301 redirect to `/{organization}/tournaments/spring-cup-26`

#### Scenario: Redirect does not leak across organizations
- **WHEN** organization A previously used alias `spring-cup-2026` and later renamed it
- **AND** organization B independently registers a tournament with alias `spring-cup-2026`
- **THEN** requests to `/{organization-A}/tournaments/spring-cup-2026` redirect only within organization A's scope, never to organization B's tournament

### Requirement: Public routes carry a locale prefix, primary locale excepted

Every public canonical route SHALL be available in each of the platform's supported interface
languages that have populated content, as a `/{locale}/{organization}/...` prefixed variant, except
the primary locale (English), which SHALL remain unprefixed at
`/{organization}/tournaments/{tournament}` and its public children. Interface chrome (navigation,
footer, section headings, status labels) SHALL render in the variant's own language; organizer-entered
content (tournament names, participant names, organization names) is never translated. A route's
locale variant is resolved from the request path at the time it is served — for a route that is
rendered per request against live backend data, this resolution SHALL happen on every request rather
than being limited to a fixed, pre-generated set of locale/alias combinations.

#### Scenario: English is served unprefixed

- **WHEN** an anonymous visitor requests `/{organization}/tournaments/{tournament}`
- **THEN** the page renders with English interface chrome and no locale prefix in the URL

#### Scenario: A non-primary locale is served under its prefix

- **WHEN** an anonymous visitor requests `/es/{organization}/tournaments/{tournament}` for a
  tournament that also has an English variant
- **THEN** the page renders the same tournament's data with Spanish interface chrome, and organizer-
  entered names render identically to the English variant

#### Scenario: The document language attribute matches the served locale

- **WHEN** any public page is requested
- **THEN** its `<html lang>` attribute matches the locale actually served, never a value hardcoded
  independent of the requested variant

### Requirement: Sitemap advertises every locale variant of a public route

`sitemap.xml` SHALL include an entry for each locale variant of each public canonical route it
advertises, not only the primary-locale entry.

#### Scenario: A route with two locale variants produces two sitemap entries

- **WHEN** `sitemap.xml` is generated for a public route that has both English and Spanish variants
- **THEN** it contains a `<url>` entry for the unprefixed English path and a separate entry for the
  `/es/`-prefixed path

### Requirement: Public-web chrome is available in all eight supported interface languages

The public-web message catalog SHALL have populated content for every language in the
platform's supported-language contract (English, Spanish, French, Portuguese, Italian, German,
Russian, Mandarin Chinese), not just English and Spanish, with a reachable locale-prefixed static
variant of every public page for each.

#### Scenario: Every supported language has a reachable public-page variant

- **WHEN** the public-web site is built
- **THEN** each of the eight supported languages' variant of every public page builds successfully and
  is reachable — English unprefixed, the other seven under their `/{locale}/` prefix

#### Scenario: Every catalog carries the same key set as the English source

- **WHEN** the public-web message catalogs are inspected
- **THEN** each of the seven non-English catalogs has exactly the same set of message IDs as
  `public-messages.en.ts`, with no empty translation values

### Requirement: Public web surfaces render discipline-tailored table layouts

Public spectator pages SHALL render standings and leaderboards according to the tournament's effective table layout definitions.

#### Scenario: Public spectator views stage standings
- **WHEN** a public visitor opens a tournament's standings page
- **THEN** the table displays the discipline's declared columns and pre-sorted ranking order, server-rendered from the effective table layout without client-side column filtering

### Requirement: Per-match public report page

The public site SHALL serve a per-match report page at
`/{organization}/tournaments/{tournament}/stages/{stageNumber}/matches/{matchNumber}`, keyed by the
stage number and match's stage-scoped sequential number, showing the match header
(competition/stage/round identity, both entrants, current score,
status, scheduled date/time and venue when a schedule exists), the officials assigned to it, each side's
roster as recorded, and the full event timeline in match order. This page SHALL be rendered per request
from current backend state, matching the existing overview page's "reachable without a site rebuild"
guarantee.

#### Scenario: Visiting a finished match's report
- **WHEN** an anonymous visitor requests the report page for a finalized match
- **THEN** the page renders the match header with final score, the officials who were assigned, both
  sides' recorded rosters, and every recorded event in order

#### Scenario: Visiting an upcoming match's report
- **WHEN** an anonymous visitor requests the report page for a scheduled match that has not started
- **THEN** the page renders the header with scheduled date/time and venue and any assigned officials,
  and shows the roster and event timeline sections as not yet available, rather than 404ing or omitting
  them from the page entirely

#### Scenario: An unknown stage or match number 404s
- **WHEN** an anonymous visitor requests a stage number or stage-scoped match number that does not
  exist for the given organization/tournament alias pair
- **THEN** the public site returns a not-found response

#### Scenario: An unpublished tournament's match report is not exposed
- **WHEN** an anonymous visitor requests a match report for a tournament the organizer has not
  published
- **THEN** the public site returns a not-found response, matching the existing overview page's
  unpublished-tournament behavior

### Requirement: Officials assigned to a fixture are shown on its match report

The match report page SHALL show every official assigned via the fixture's published schedule, each
with their declared role, for a match already played or still upcoming.

#### Scenario: An upcoming match's assigned officials are visible before kickoff
- **WHEN** a fixture has a published schedule naming two officials with roles `referee` and
  `table-official`
- **THEN** the match report for that (not-yet-played) match lists both officials with their roles

#### Scenario: A finished match still shows who officiated it
- **WHEN** a match has been finalized and its fixture's schedule named assigned officials
- **THEN** the match report continues to show those officials, unaffected by the match's completed
  status

#### Scenario: An unpublished schedule shows no officials, distinguishably from none assigned
- **WHEN** a fixture's schedule exists but has not been published
- **THEN** the match report shows the schedule as not yet published, rather than presenting an empty
  officials list indistinguishably from a published schedule with none assigned

### Requirement: The event timeline renders labels from the bound discipline descriptor

The match report's event timeline SHALL label each recorded event using the tournament's bound
`DisciplineDescriptor`'s own `EventDefinition.label`, and SHALL group a workflow-linked foul and its
outcome event as one visual unit when the discipline declares that relationship, rendering every other
event individually.

#### Scenario: A goal event is labeled from the discipline descriptor
- **WHEN** the event timeline includes a recorded `goal` event for a discipline that declares
  `label: 'Goal'` on that event definition
- **THEN** the timeline entry displays "Goal", not the raw definition code

#### Scenario: A foul and its declared outcome render as one unit
- **WHEN** the event timeline includes a foul event whose definition declares a `workflow` naming a
  subsequently recorded outcome event as one of its options, and that outcome event is present in the
  same match's log
- **THEN** the two events render together as one visual unit rather than two unrelated timeline entries

#### Scenario: An event with no declared workflow renders individually
- **WHEN** the event timeline includes an event whose definition declares no `workflow`
- **THEN** it renders as its own, independent timeline entry

### Requirement: A public, tournament-wide table route serves any declared table layout across every stage

The public site SHALL serve a tournament-wide table projection for any layout the tournament's
discipline declares, at a public route requiring no admin authentication, mirroring the existing public
stage-scoped table route's reachability guarantee (no site rebuild required, published tournaments
only).

#### Scenario: A public visitor views a tournament-wide leaderboard
- **WHEN** an anonymous visitor requests the public tournament-wide table route for a layout code the
  tournament's discipline declares (e.g. a top-scorers leaderboard)
- **THEN** the response carries every row across every stage of the tournament, in the layout's declared
  columns and default sort, identical in shape to the equivalent admin-only route's response

#### Scenario: An unknown layout code 404s
- **WHEN** an anonymous visitor requests the tournament-wide table route with a layout code the
  tournament's discipline does not declare
- **THEN** the public site returns a not-found response

#### Scenario: An unpublished tournament's tables are not exposed
- **WHEN** an anonymous visitor requests a tournament-wide table for a tournament the organizer has not
  published
- **THEN** the public site returns a not-found response

### Requirement: A table projection may be filtered to one club's entrants

Both the public tournament-wide table route and the existing public stage-scoped table route SHALL
accept an optional `clubId` query parameter; when present, the response SHALL include only rows for
entrants resolved to that club, and SHALL NOT alter the layout's declared columns, sort order, or
ranking computation.

#### Scenario: Filtering a leaderboard to one club
- **WHEN** a table projection is requested with `clubId` naming a club fielding three of the
  tournament's registered entrants
- **THEN** the response's rows are limited to those three entrants' players, ranked exactly as they
  would be within the unfiltered table (rank numbers reflect standing in the full table, not
  renumbered within the filtered subset)

#### Scenario: An absent clubId returns every entrant
- **WHEN** a table projection is requested with no `clubId` parameter
- **THEN** the response is unchanged from this route's behavior before the parameter existed

#### Scenario: A clubId matching no entrant returns an empty row set, not an error
- **WHEN** a table projection is requested with a `clubId` that fields no entrant in this tournament
- **THEN** the response carries the layout's columns and an empty `rows` array, rather than a 404 or
  other error

### Requirement: Public player profile popup

The public site SHALL serve a per-person competition profile, reachable from wherever a player's name
is rendered on a public page, showing display name, nationality flag, photo or placeholder, computed
age when set, competition history (every tournament and team the person has been entered under, within
the person's organization), and career statistic totals aggregated across every tournament, per
discipline. The photo, or its placeholder, SHALL render inside the platform's standard 4:5 framed-image
presentation.

#### Scenario: Visiting a player's public profile
- **WHEN** an anonymous visitor opens a player's name on a public page
- **THEN** the profile shows the player's display name, nationality flag if set, photo or placeholder
  inside the standard framed presentation, computed age if a birth date is set, their competition
  history, and their career statistic totals

#### Scenario: A player with no career statistics still has a valid profile
- **WHEN** a player's discipline declares no organization-granularity collector, or the player has none
  accumulated yet
- **THEN** the profile renders with an empty career-statistics section rather than an error

#### Scenario: Career totals are grouped by discipline
- **WHEN** a player has competed in tournaments under two different disciplines within the same
  organization
- **THEN** each discipline's career totals are shown separately, never combined into one number

#### Scenario: An unknown person 404s
- **WHEN** an anonymous visitor requests a profile for a person id that does not exist, or that
  belongs to a different organization than the requested public path
- **THEN** the public site returns a not-found response

### Requirement: Organization-scoped tournament listing page

The public site SHALL serve an organization page at `/{organization}`, showing the organization's name
and emblem, a featured block for its current or most recent tournament, every published tournament for
that organization — name, discipline, status, and season/dates — and a grid of the organization's clubs.
The page SHALL be reachable without already knowing a specific tournament's alias, and SHALL be rendered
per request from current backend state, matching the existing overview page's "reachable without a site
rebuild" guarantee. Every emblem shown on this page, and every placeholder shown in its place, SHALL
render inside the platform's standard 4:5 framed-image presentation.

The previously served path `/{organization}/tournaments` SHALL NOT be served.

#### Scenario: Visiting an organization's tournament listing
- **WHEN** an anonymous visitor requests `/{organization}`
- **THEN** the page shows the organization's name and emblem, inside the standard framed presentation,
  and lists every published tournament for that organization, with name, discipline, status, and
  season/dates for each

#### Scenario: An unpublished tournament is not listed
- **WHEN** an organization has both published and unpublished tournaments
- **THEN** the listing includes only the published ones

#### Scenario: An unknown organization 404s
- **WHEN** an anonymous visitor requests the page for an organization alias that does not exist
- **THEN** the public site returns a not-found response

#### Scenario: The former listing path is no longer served
- **WHEN** an anonymous visitor requests `/{organization}/tournaments`
- **THEN** the public site returns a not-found response

#### Scenario: The featured block names the live tournament
- **WHEN** an organization has a tournament whose status is `live`
- **THEN** the featured block names that tournament

#### Scenario: The featured block falls back to the most recent tournament
- **WHEN** an organization has no live tournament
- **THEN** the featured block names its most recent tournament by date

#### Scenario: An organization with no tournaments shows no featured block
- **WHEN** an organization has no published tournaments
- **THEN** no featured block is rendered, and the listing is empty rather than an error

#### Scenario: The club grid shows the organization's clubs
- **WHEN** an organization has registered clubs
- **THEN** the page shows each club with its name, abbreviation, and emblem inside the standard framed
  presentation, rendering a placeholder for a club with no emblem, inside the same presentation

#### Scenario: An organization with no emblem shows a placeholder
- **WHEN** an organization has no emblem
- **THEN** the header renders a placeholder, inside the standard framed presentation, rather than a
  broken image or an empty gap

### Requirement: A finished tournament's listing card shows its winner and runner-up, per zone

A finished tournament's entry on the listing page SHALL show its champion and runner-up, one pair per
zone of its terminal phase — a single, unlabeled pair when the terminal phase has only the implicit
default zone, and one labeled pair per zone when it declares more than one. Winner/runner-up SHALL be
determined from the zone's own final match result (duel formats) or final standings (placement
formats), not a separately stored value.

#### Scenario: A single-zone tournament shows one winner pair
- **WHEN** a finished tournament's terminal phase has only the implicit default zone
- **THEN** the listing card shows exactly one champion and one runner-up, unlabeled

#### Scenario: A multi-zone terminal phase shows every zone's own winner
- **WHEN** a finished tournament's terminal phase declares two zones (e.g. "Copa Oro" and
  "Copa Plata")
- **THEN** the listing card shows two labeled champion/runner-up pairs, one per zone

#### Scenario: A duel-format zone's winner comes from its final match
- **WHEN** a zone's terminal round is a single-elimination final with a recorded result
- **THEN** the winning entrant is shown as champion and the losing entrant as runner-up

#### Scenario: A placement-format zone's winner comes from its final standings
- **WHEN** a zone's format is round-robin or league
- **THEN** the entrant ranked first in that zone's final standings is shown as champion and the entrant
  ranked second as runner-up

#### Scenario: An unfinished tournament shows no winner
- **WHEN** a tournament's status is not `finished`
- **THEN** its listing card shows no champion or runner-up, regardless of how far its terminal phase has
  progressed

### Requirement: A table projection's club filter is reachable from the page and addressable in the URL

The public table surfaces SHALL provide a control that applies the club filter the table routes already
accept, and SHALL carry the selected club in the page URL so a filtered table is linkable. Where a club
emblem is rendered beside a row, activating it SHALL apply that club's filter. Selecting all clubs SHALL
clear the filter.

#### Scenario: Filtering a leaderboard from the page
- **WHEN** a visitor selects a club on a public table view
- **THEN** the table shows only that club's rows, and the page URL carries the selected club

#### Scenario: A linked filtered table renders filtered
- **WHEN** a visitor opens a public table URL that names a club
- **THEN** the table renders filtered to that club without further interaction

#### Scenario: Activating a club emblem filters to that club
- **WHEN** a visitor activates a club emblem rendered beside a table row
- **THEN** the table filters to that club

#### Scenario: Clearing the filter restores every entrant
- **WHEN** a visitor selects all clubs
- **THEN** the table shows every row, and the URL no longer names a club

#### Scenario: Rank numbers are whole-table ranks under a filter
- **WHEN** a table is filtered to one club
- **THEN** each row's rank number is its standing in the full table, not renumbered within the filtered
  subset

#### Scenario: A club with no entrants renders an empty state
- **WHEN** a visitor filters to a club fielding no entrant in this tournament
- **THEN** the page renders an explicit empty state rather than an error

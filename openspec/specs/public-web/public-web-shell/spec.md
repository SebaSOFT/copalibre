# public-web-shell Specification

## Purpose
Delivers CopaLibre's anonymous, spectator-facing tournament pages as a fast, cacheable, mostly-static
site that stays usable without JavaScript and is indexable only on its intended public routes.
## Requirements
### Requirement: Organization-scoped tournament overview page
The public site SHALL serve a tournament overview page at `/{organization}/tournaments/{tournament}`
showing tournament identity, schedule/format facts, a standings preview, and rules access, matching
the B1 reference layout.

#### Scenario: Visiting a published tournament's overview
- **WHEN** an anonymous visitor requests `/{organization}/tournaments/{tournament}` for a published tournament
- **THEN** the page renders the tournament's name, discipline, format, standings preview, and a rules download link

#### Scenario: Unpublished tournament is not exposed
- **WHEN** an anonymous visitor requests the overview page for a tournament the organizer has not published
- **THEN** the public site returns a not-found response and exposes no operational data about it

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
languages that have populated content, as a `/{locale}/{organization}/...` prefixed static variant,
except the primary locale (English), which SHALL remain unprefixed at
`/{organization}/tournaments/{tournament}` and its public children. Interface chrome (navigation,
footer, section headings, status labels) SHALL render in the variant's own language; organizer-entered
content (tournament names, participant names, organization names) is never translated.

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

### Requirement: Public-web chrome is available in all seven supported interface languages

The public-web message catalog (0055) SHALL have populated content for every language in the
platform's supported-language contract (English, Spanish, French, Portuguese, Italian, German,
Russian), not just English and Spanish, with a reachable locale-prefixed static variant of every public
page for each.

#### Scenario: Every supported language has a reachable public-page variant

- **WHEN** the public-web site is built
- **THEN** each of the seven supported languages' variant of every public page builds successfully and
  is reachable — English unprefixed, the other six under their `/{locale}/` prefix

#### Scenario: Every catalog carries the same key set as the English source

- **WHEN** the public-web message catalogs are inspected
- **THEN** each of the six non-English catalogs has exactly the same set of message IDs as
  `public-messages.en.ts`, with no empty translation values


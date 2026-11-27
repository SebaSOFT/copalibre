# public-web/organization-club-history Specification

## Purpose
Gives a fan who follows one club across seasons a single public page per club in an organization, listing the tournaments the club has played there, its titles and podium places, and links to its page in each tournament. The page is addressed by organization and club alias, never by an identifier.

## Requirements

### Requirement: An organization club page summarizes a club across tournaments
Every club with an alias SHALL have a public page at `/{organization}/clubs/{clubAlias}` showing its
identity, the organization's published tournaments in which it has a team entrant (newest first, each
linking to the tournament club page), and its podium places in finished ones. Draft tournaments SHALL
never appear. An unknown alias SHALL answer `404`.

#### Scenario: The page lists the club's tournaments with links
- **WHEN** a visitor opens `/{organization}/clubs/club-hispano`
- **AND** Club Hispano has team entrants in the published tournaments `apertura-2025` and `apertura-2026`
- **THEN** both are listed, `apertura-2026` first, each linking to `/{organization}/tournaments/{tournament}/clubs/club-hispano`

#### Scenario: A podium place appears as an honour
- **WHEN** Club Hispano won the finished tournament `apertura-2025`
- **THEN** the honours section lists it as champion of `apertura-2025`, and the tournament row shows the same place

#### Scenario: A draft tournament never appears
- **WHEN** Club Hispano has a team entrant in a draft tournament
- **THEN** that tournament is neither listed nor counted

#### Scenario: An unknown club answers not found
- **WHEN** a visitor opens `/{organization}/clubs/no-existe`
- **THEN** the response is 404

### Requirement: The organization page links each aliased club to its organization club page
On the organization page, a club card whose club has an alias SHALL link to the organization club
page, whether or not the club plays an in-progress tournament. A club without an alias SHALL render
without a link or card affordance.

#### Scenario: A club with no in-progress tournament still links
- **WHEN** Club Hispano has an alias and plays no in-progress tournament
- **THEN** its card on the organization page links to `/{organization}/clubs/club-hispano`

### Requirement: The organization club page is listed in the sitemap
The sitemap SHALL list the organization club page of every aliased club, in every supported locale.

#### Scenario: The sitemap carries organization club pages
- **WHEN** the sitemap is fetched for an organization with an aliased club `club-hispano`
- **THEN** it contains `/{organization}/clubs/club-hispano` and its locale-prefixed variants

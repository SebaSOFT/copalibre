# url-routing-contract Specification

## Purpose
Guarantees every surface (public, control, TV, SSE) that shows the same tournament resource derives
its URL from one shared, pure-function module instead of inventing per-surface routing logic, so
cross-surface navigation is always correct by construction.

## Requirements

### Requirement: URL builder accepts only alias/number identity
The URL-builder module SHALL accept exactly `{ organizationAlias, tournamentAlias, stageNumber?,
roundNumber?, matchNumber?, participantAlias?, viewMode?, locale? }` and SHALL reject a database
UUID, internal tenant ID, or unscoped tournament alias as input for tournament route generation.

#### Scenario: Builder rejects a raw UUID
- **WHEN** the builder is called with a UUID in place of `tournamentAlias`
- **THEN** it throws a validation error instead of producing a URL

#### Scenario: Builder produces the canonical public path
- **WHEN** the builder is called with `{ organizationAlias: "acme-esports", tournamentAlias: "spring-cup-2026" }` and no surface prefix
- **THEN** it returns `/acme-esports/tournaments/spring-cup-2026`

### Requirement: Surface derivation by prefix substitution only
Given a resource's public path, the builder SHALL derive its `/control/**`, `/tv/**`, and
`/events/public/**` equivalents by prefix insertion or substitution alone, without an additional
lookup or API call.

#### Scenario: Control path derived from public path
- **WHEN** the builder is asked for the control-surface URL of the same tournament used in the public-path scenario
- **THEN** it returns `/control/acme-esports/tournaments/spring-cup-2026` using the identical alias tuple

### Requirement: Query parameters carry only transient view state
The builder SHALL place `mode`, `locale`, filters, pagination, and sort into query parameters only,
and SHALL never encode resource identity in a query parameter.

#### Scenario: Overlay mode is a query parameter, not a path segment
- **WHEN** the builder is asked for the TV overlay variant of a match route
- **THEN** it returns `/tv/{organization}/tournaments/{tournament}/matches/{match}?mode=overlay`

### Requirement: The canonical organization path is served by a page

The canonical public path the URL builder produces for an input naming only an organization —
`/{organization}` — SHALL be served by the public site. The builder SHALL express that path exactly one
way: no separate listing discriminator SHALL produce a distinct organization-scoped listing path.

#### Scenario: Building an organization path
- **WHEN** the canonical URL builder is given only an organization alias
- **THEN** it returns `/{organization}`, and that path is served

#### Scenario: There is no second way to express the organization path
- **WHEN** the routing contract is inspected for an organization-scoped listing discriminator
- **THEN** none exists, and no input produces `/{organization}/tournaments`

### Requirement: Organization aliases exclude reserved names

The system SHALL reject a new organization whose alias is a reserved name: a Control route name, a top-level route name, a supported language code, or a security name. Other alias scopes SHALL NOT be restricted by this list, because they never occupy a top-level path.

#### Scenario: Route name

- **WHEN** an installation is bootstrapped with the organization alias `login`
- **THEN** the request is rejected, no organization is created, and the error says the alias is reserved

#### Scenario: Security name

- **WHEN** an installation is bootstrapped with the organization alias `constructor` or `administrator`
- **THEN** the request is rejected and no organization is created

#### Scenario: Reserved name inside a longer alias

- **WHEN** an installation is bootstrapped with the organization alias `login-fc`
- **THEN** the organization is created

#### Scenario: Same word in another scope

- **WHEN** a tournament is created with the alias `platform`
- **THEN** the tournament is created

### Requirement: Alias format is an allowlist

Every alias SHALL contain only lowercase ASCII letters, digits and single inner hyphens, within the length limit. Validation SHALL accept nothing outside that format, so markup, quotes, path separators, percent encoding, control characters and non-ASCII look-alikes never reach a URL or a query as an alias.

#### Scenario: Attack payloads

- **WHEN** an alias holds a script tag, a SQL injection string, a path traversal, percent encoding, a `javascript:` URL, a trailing newline or a Cyrillic look-alike
- **THEN** validation rejects it for every alias scope

### Requirement: Diagnostics report an existing reserved alias

`copalibre doctor` SHALL warn when an organization already holds a reserved alias, naming the organization, and SHALL NOT change it or fail the run.

#### Scenario: Organization predates the list

- **WHEN** an organization holds the alias `platform` and `copalibre doctor` runs
- **THEN** the report carries a warning naming that organization, and the organization still loads

### Requirement: The reserved list follows the routes

A new top-level route or Control route name SHALL fail the automated tests until it is in the reserved list.

#### Scenario: New route

- **WHEN** a top-level page, public directory, gateway prefix or Control route name is added without a reserved entry
- **THEN** the test suite fails and names it

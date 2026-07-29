## Purpose

Guarantees every surface (public, control, TV, SSE) that shows the same tournament resource derives
its URL from one shared, pure-function module instead of inventing per-surface routing logic, so
cross-surface navigation is always correct by construction.

## ADDED Requirements

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

# help-and-api-docs Specification

## Purpose

Provides self-hosted operators and API integrators with documentation and an interactive,
statically-generated API reference, without depending on a live API fetch at build or runtime and
without shipping an unvalidated pre-1.0 documentation framework unchecked.

## Requirements

### Requirement: Starlight integration is validated by a build-test gate before adoption

The Starlight integration SHALL be validated by an explicit spike with go/no-go criteria (navigation
works, static build succeeds, CSS isolation holds against public/control styling) before any
production documentation content is authored on top of it.

#### Scenario: Spike failure blocks adoption

- **WHEN** the Starlight spike fails any of its go/no-go criteria
- **THEN** production documentation content is not authored on Starlight, and the documented Next.js+Nextra fallback is proposed as a separate change instead

#### Scenario: Spike success unblocks the rest of this capability

- **WHEN** the Starlight spike passes all go/no-go criteria
- **THEN** the remaining `/help/**` and `/help/api-reference/` work in this capability proceeds

### Requirement: OpenAPI reference is a static, versioned artifact

The `/help/api-reference/` route SHALL render from a versioned OpenAPI artifact generated during CI
and copied into the static build, and SHALL NOT fetch a live API at build time or at runtime to
obtain the OpenAPI document.

#### Scenario: Reference works with the API offline

- **WHEN** the documentation site is built and served with no running API instance reachable
- **THEN** `/help/api-reference/` still renders the full reference correctly

### Requirement: Try It is disabled by default

The interactive API reference's "Try It" request-execution feature SHALL be disabled by default.

#### Scenario: No live request is possible without explicit enablement

- **WHEN** a visitor opens `/help/api-reference/` on a default installation
- **THEN** no mechanism to execute a live API request against any host is available

### Requirement: No secrets or internal hosts in static documentation

Static documentation and the generated OpenAPI artifact SHALL NOT contain access tokens, internal
hostnames, private paths, or production example credentials.

#### Scenario: Generated artifact is free of secrets

- **WHEN** the OpenAPI artifact is generated during CI
- **THEN** a scan for token-shaped strings, internal hostnames, and known credential patterns finds none

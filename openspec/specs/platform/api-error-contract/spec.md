# platform/api-error-contract Specification

## Purpose
Defines `apps/api`'s uniform HTTP error-response shape: which exceptions may surface their own
message to a client, and which must always fall back to a generic one, so an internal error can
never leak implementation detail regardless of environment.

## Requirements

### Requirement: Only recognized typed errors surface their own message
`apps/api` SHALL surface an unhandled exception's own `message` in its HTTP response only when that
exception is a declared `HttpException`, or an instance of one of this project's own typed error
base classes. Any other exception SHALL receive a generic `"Internal server error"` message,
regardless of what properties it happens to carry.

#### Scenario: A declared domain/persistence/rules/engine error surfaces its own message
- **WHEN** a request handler throws an instance of one of this project's typed error base classes
- **THEN** the HTTP response's `message` is that error's own, developer-authored message, and its
  `errorCode` is derived from that error's own declared code

#### Scenario: An unrelated internal error never leaks its own message
- **WHEN** a request handler encounters an unhandled exception that is not an `HttpException` and
  not an instance of one of this project's typed error base classes — including one that happens to
  carry an unrelated string `code` property, such as a filesystem or database-driver error
- **THEN** the HTTP response's `message` is the generic `"Internal server error"`, never that
  exception's own message or any of its internal details

#### Scenario: This behavior does not depend on environment
- **WHEN** the scenario above occurs in a production deployment or in local development
- **THEN** the response is identical — the generic message is used in both, not gated by
  `NODE_ENV` or any other environment signal

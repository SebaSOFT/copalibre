# api-auth-contract Specification

## Purpose
Gives every CopaLibre client (public web, control web, CLI, future mobile/PWA/MCP) one documented,
versioned, authenticated way to reach the backend, so no client surface invents its own auth or
data-shape conventions.
## Requirements
### Requirement: JWT Bearer validation via JWKS
The API SHALL validate every authenticated request's JWT against a controlled JWKS, rejecting any
token with an invalid signature, disallowed algorithm, wrong issuer/audience, or expired/not-yet-
valid timestamp.

#### Scenario: Token signed with an unapproved algorithm is rejected
- **WHEN** a request presents a JWT with `alg: none` or another unapproved algorithm
- **THEN** the API rejects the request with 401 and does not evaluate any policy

#### Scenario: Expired token is rejected
- **WHEN** a request presents a JWT whose `exp` claim is in the past
- **THEN** the API rejects the request with 401

#### Scenario: Wrong audience is rejected
- **WHEN** a request presents a validly-signed JWT whose `aud` does not match this API's expected audience
- **THEN** the API rejects the request with 401

### Requirement: Four security planes share one transport, differ by policy
Public read, Authenticated interaction, Admin/control, and Integration requests SHALL all use the
same Bearer-token transport (or no token, for Public read); they SHALL differ only in the
authorization policy applied after authentication, never in transport or protocol.

#### Scenario: Participant token cannot access another participant's record
- **WHEN** a request carries a valid JWT scoped to Participant A
- **AND** the request targets Participant B's own registration or match-report resource
- **THEN** the API rejects the request with 403 regardless of the token's validity

#### Scenario: Public read requires no token
- **WHEN** a request targets a published public projection endpoint with no Authorization header
- **THEN** the API serves the response without requiring authentication

### Requirement: Access token never required in a URL
The API SHALL accept the access token only via the `Authorization: Bearer` header; it SHALL NOT
accept an access or refresh token as a query parameter for any endpoint.

#### Scenario: Token passed as a query parameter is ignored
- **WHEN** a request presents an otherwise-valid token as `?access_token=...` with no Authorization header
- **THEN** the API treats the request as unauthenticated

### Requirement: Generated, versioned OpenAPI artifact
The API SHALL produce a versioned OpenAPI document during build that is contract-linted and checked
for breaking changes before being published for client-code generation or documentation.

#### Scenario: Breaking change to a published endpoint fails the build
- **WHEN** a pull request removes a required response field from a previously-published API version
- **THEN** the breaking-change check fails and blocks the build

#### Scenario: Generated client types match the OpenAPI document
- **WHEN** `packages/contracts` types are regenerated from the current OpenAPI artifact
- **THEN** the generated types compile against every existing controller's actual request/response shapes

### Requirement: Access JWT held only in memory on browser clients
Browser clients SHALL hold the access JWT in memory only; they SHALL NOT persist a long-lived
access JWT to `localStorage` or any other durable browser storage.

#### Scenario: Page reload requires reauthentication in strict stateless mode
- **WHEN** the strict stateless browser mode is active and the page is reloaded
- **THEN** the client has no access token available and must reauthenticate, with no token recoverable from `localStorage`


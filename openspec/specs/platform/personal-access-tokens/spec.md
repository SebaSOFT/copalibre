# personal-access-tokens Specification

## Purpose

Manages the generation, storage, validation, and revocation of long-lived API/MCP tokens.

## Requirements

### Requirement: Personal Access Token (PAT) Generation

The system MUST allow authenticated users to generate long-lived, revocable Personal Access Tokens
from the preferences screen. A generated PAT's scopes MUST NOT exceed the requesting caller's own
current scopes, and MUST NOT include any installation-level privileged scope regardless of whether
the caller holds that scope.

#### Scenario: User generates a new PAT

- **WHEN** an authenticated user requests a new PAT
- **THEN** the system displays the cleartext token exactly once and stores its hash, expiration
  date, and associated principal ID in the database.

#### Scenario: User requests a subset of their own scopes

- **WHEN** an authenticated user requests a PAT whose `scopes` are a subset of (or equal to) the
  scopes on their own currently authenticated session
- **THEN** the system creates the PAT with exactly the requested scopes.

#### Scenario: User omits scopes

- **WHEN** an authenticated user requests a PAT without specifying `scopes`
- **THEN** the system defaults the PAT's scopes to the caller's own current session scopes.

#### Scenario: User requests a scope they do not hold

- **WHEN** an authenticated user requests a PAT whose `scopes` include a scope not present on their
  own currently authenticated session
- **THEN** the system rejects the request with a 403 and creates no token.

#### Scenario: Any caller requests an installation-privileged scope

- **WHEN** any authenticated user — including one whose own session already carries an
  installation-level privileged scope such as `copalibre.super-admin` — requests a PAT whose
  `scopes` include that privileged scope
- **THEN** the system rejects the request with a 403 and creates no token, regardless of the
  caller's own authority.

### Requirement: PAT Validation

The system MUST validate incoming API requests authenticated with a PAT.

#### Scenario: API request with a valid PAT

- **WHEN** a client makes a request using a valid, unexpired, and unrevoked PAT
- **THEN** the system authenticates the request with the permissions of the user who generated it.

### Requirement: PAT Revocation

The system MUST allow users to revoke PATs they have generated.

#### Scenario: User revokes an active PAT

- **WHEN** a user revokes a PAT from the preferences screen
- **THEN** the system marks the token as revoked in the database and rejects any subsequent
  requests using it.

### Requirement: Security-driven Personal Access Token invalidation

The system SHALL allow an authorized operator to invalidate every currently active Personal Access
Token through an explicit security cutover. The operation SHALL revoke the selected credentials and
write an audit record for each affected credential in one transaction, without exposing raw tokens
or token hashes.

#### Scenario: Confirmed security cutover

- **WHEN** an authorized operator explicitly confirms the security cutover
- **THEN** every Personal Access Token that is active at execution time is marked revoked, each
  revocation has audit evidence, and subsequent requests using those tokens are rejected.

#### Scenario: Cutover without explicit confirmation

- **WHEN** an operator invokes the cutover without its required confirmation
- **THEN** the system changes no credentials and reports that confirmation is required.

#### Scenario: Repeated security cutover

- **WHEN** the cutover is executed after all active Personal Access Tokens were already revoked
- **THEN** the system reports zero newly revoked credentials and does not alter prior revocation or
  audit data.

#### Scenario: Credential material remains secret

- **WHEN** the cutover completes or fails
- **THEN** its output, logs, and audit records contain neither a raw token nor a token hash.

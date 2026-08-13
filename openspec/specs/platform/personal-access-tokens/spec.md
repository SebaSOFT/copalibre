# personal-access-tokens Specification

## Purpose

Manages the generation, storage, validation, and revocation of long-lived API/MCP tokens.

## Requirements

### Requirement: Personal Access Token (PAT) Generation

The system MUST allow authenticated users to generate long-lived, revocable Personal Access Tokens
from the preferences screen.

#### Scenario: User generates a new PAT

- **WHEN** an authenticated user requests a new PAT
- **THEN** the system displays the cleartext token exactly once and stores its hash, expiration
  date, and associated principal ID in the database.

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

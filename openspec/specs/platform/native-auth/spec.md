# native-auth Specification

## Purpose

Manages local identity, password hashing, and user credential lifecycle (login, forgot password,
email updates, account linking).

## Requirements

### Requirement: Native Password Authentication

The system MUST support creating and verifying native user passwords securely. Login, installation
bootstrap, and password-reset requests MUST be rate-limited per source IP across all API replicas
to bound automated credential-guessing and repeated-bootstrap attempts.

#### Scenario: User logs in with local credentials

- **WHEN** a user provides a valid email and correct password on the native login screen
- **THEN** the system issues a valid JWT and authenticates the user.

#### Scenario: Existing OIDC user links local password

- **WHEN** a user who previously registered via OIDC establishes a local password
- **THEN** the system links the local password hash to their existing `identity_principals` record,
  allowing them to log in via either method.

#### Scenario: Login attempts within the rate limit succeed normally

- **WHEN** a source IP submits login attempts at or below the configured per-window limit across
  all API replicas
- **THEN** the system evaluates each attempt normally (accepting valid credentials, rejecting
  invalid ones) without additional throttling behavior.

#### Scenario: Login attempts exceeding the rate limit are rejected

- **WHEN** a source IP exceeds the configured per-window limit of login attempts across one or
  more API replicas
- **THEN** the system rejects further attempts from that IP with a 429 response until the window
  resets, without evaluating the submitted credentials.

#### Scenario: Installation bootstrap attempts exceeding the rate limit are rejected

- **WHEN** a source IP exceeds the configured per-window limit of requests to the installation
  bootstrap endpoint across one or more API replicas
- **THEN** the system rejects further attempts from that IP with a 429 response until the window
  resets.

### Requirement: Password Reset Flow

The system MUST provide a secure mechanism to reset forgotten passwords. Password-reset requests
MUST be rate-limited per source IP.

#### Scenario: User requests a password reset

- **WHEN** a user requests a password reset for a valid email
- **THEN** the system generates a secure, expiring token and sends a reset link to the email.

#### Scenario: User submits a new password with a valid token

- **WHEN** a user provides a new password along with a valid, unexpired reset token
- **THEN** the system updates their password hash and invalidates the token.

#### Scenario: Password-reset requests exceeding the rate limit are rejected

- **WHEN** a source IP exceeds the configured per-window limit of password-reset requests (either
  the request-a-reset or submit-a-new-password step)
- **THEN** the system rejects further attempts from that IP with a 429 response until the window
  resets.

### Requirement: Secure Email Change Flow

The system MUST support changing the primary email address securely.

#### Scenario: User initiates an email change

- **WHEN** a user requests to change their email from the preferences screen
- **THEN** the system sends a verification link to the new email and a notification to the old
  email.

#### Scenario: User confirms the new email

- **WHEN** a user clicks the verification link for the new email
- **THEN** the system updates the email in the database and immediately invalidates all active
  sessions (forcing a logout).

### Requirement: Native login token issuance
The native login endpoint (`POST /auth/login`) SHALL issue tokens signed with asymmetric RSA (`RS256`) using the installation's private key, verified against the local or configured JWKS. When a user authenticates within the scope of an organization, the issued JWT SHALL include the RFC 9068 registered `org` claim containing the organization's unique ID.

#### Scenario: Asymmetric JWT verification of native login token
- **WHEN** a client presents a bearer token obtained from `POST /auth/login` to any authenticated API route
- **THEN** `JwtAuthGuard` and `TokenVerifier` validate the token against the JWKS without `disallowed-algorithm` or 401 Unauthorized errors.

#### Scenario: Organization-scoped guard resolution for local users
- **WHEN** a local principal with an active organization assignment accesses an organization-scoped endpoint (`/organizations/:alias/*`)
- **THEN** `OrganizationAccessGuard` successfully matches the token's `org` claim and resolves the user's role assignment without 403 Forbidden errors.

### Requirement: Local identity principal creation
When a principal is created via native registration or local bootstrap (`copalibre create-admin`), the persistence layer SHALL ensure that `oidc_subject_id` is initialized to the principal's `principal_id` so subsequent subject lookups resolve reliably across all authentication guards.

#### Scenario: Role assignment check for native principal
- **WHEN** an authenticated route checks permissions for a native principal
- **THEN** `IdentityPrincipalRepository.findByOidcSubject` returns the matching principal record and its associated permissions.

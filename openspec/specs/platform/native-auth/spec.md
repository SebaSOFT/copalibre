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

### Requirement: Invitation acceptance screen is fully localized and centered
The administrator invitation acceptance screen (`/invitations/accept`) SHALL resolve its document
language, page title, and form vocabulary through the active locale's message catalogue across all
supported languages, and SHALL render its authentication card with balanced viewport centering.

#### Scenario: Sighted visitor accepts invitation in non-English locale
- **WHEN** an administrator opens an invitation link with a non-English language preference
- **THEN** the document language attribute, document title, and all form labels and validation
  messages appear in that configured language

#### Scenario: Authentication layout centers on wide viewports
- **WHEN** an administrator views the invitation acceptance screen on a desktop viewport
- **THEN** the authentication card is horizontally centered or balanced within the main content area
  rather than pinned against the left edge

### Requirement: Native session silent renewal
The API SHALL provide `POST /auth/refresh`, which accepts a native session's `HttpOnly`
`copalibre_refresh_token` cookie, validates it as unexpired and unconsumed, issues a fresh
short-lived access JWT, and rotates the refresh cookie (the presented token can never be presented
again). The refresh token SHALL be transported only via that `HttpOnly`, `SameSite=Strict` cookie —
never in a JSON response body, and never written to any browser storage a script can read.

#### Scenario: Successful native session renewal
- **WHEN** a client sends `POST /auth/refresh` with a valid, unexpired, unconsumed refresh cookie
- **THEN** the API returns a new access JWT in the response body
- **AND** sets a new refresh cookie, rotated
- **AND** the previously-presented refresh token can no longer be used

#### Scenario: A missing, expired, or already-consumed refresh token is rejected
- **WHEN** a client sends `POST /auth/refresh` with no cookie, an expired one, or one already
  consumed by an earlier refresh
- **THEN** the API rejects the request with 401 Unauthorized and issues no new token

### Requirement: Native session logout revokes the refresh cookie
The API SHALL provide `POST /auth/logout`, which revokes the presented refresh token (if any) and
clears the refresh cookie, regardless of whether a cookie was presented.

#### Scenario: Logout revokes an active refresh token
- **WHEN** a client sends `POST /auth/logout` with a valid refresh cookie
- **THEN** the API revokes that token, so a later `POST /auth/refresh` with it fails
- **AND** the response clears the refresh cookie

#### Scenario: Logout with no cookie still succeeds
- **WHEN** a client sends `POST /auth/logout` with no refresh cookie present
- **THEN** the API returns success rather than an error

### Requirement: OIDC session silent renewal
An OIDC-authenticated control-web session SHALL renew itself with no stored refresh token and no
operator interaction, by requesting a fresh authorization code from the identity provider with
`prompt=none` in a hidden iframe. This is the only session mechanism this requirement applies to —
a native session renews per the requirements above instead, never via this path.

#### Scenario: The identity provider still has an active session
- **WHEN** an OIDC session's access token is within 120 seconds of its own expiry
- **AND** the identity provider's own session is still active
- **THEN** the client obtains a fresh access token with no visible interruption to the operator

#### Scenario: The identity provider has no active session
- **WHEN** a silent renewal attempt's hidden iframe receives an error (or times out with no
  response) from the identity provider
- **THEN** the client clears the local session and redirects to
  `/control/login?returnTo=<path>&reason=session_expired`

### Requirement: Silent renewal is opt-in per deployment
A deployment SHALL enable silent renewal (of either mechanism) only when `runtime-config.json`
declares `sessionMode: "pragmatic-persistent"`. Absent or any other value SHALL leave today's
behavior unchanged: no background renewal, and a page reload requires reauthentication.

#### Scenario: A deployment that says nothing about session mode gets no silent renewal
- **WHEN** `runtime-config.json` has no `sessionMode` field, or a value other than
  `"pragmatic-persistent"`
- **THEN** the client schedules no background renewal timer and attempts no renewal on a 401

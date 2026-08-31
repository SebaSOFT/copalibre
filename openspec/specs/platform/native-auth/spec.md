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

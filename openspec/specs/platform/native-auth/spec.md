# native-auth Specification

## Purpose

Manages local identity, password hashing, and user credential lifecycle (login, forgot password,
email updates, account linking).

## Requirements

### Requirement: Native Password Authentication

The system MUST support creating and verifying native user passwords securely.

#### Scenario: User logs in with local credentials

- **WHEN** a user provides a valid email and correct password on the native login screen
- **THEN** the system issues a valid JWT and authenticates the user.

#### Scenario: Existing OIDC user links local password

- **WHEN** a user who previously registered via OIDC establishes a local password
- **THEN** the system links the local password hash to their existing `identity_principals` record,
  allowing them to log in via either method.

### Requirement: Password Reset Flow

The system MUST provide a secure mechanism to reset forgotten passwords.

#### Scenario: User requests a password reset

- **WHEN** a user requests a password reset for a valid email
- **THEN** the system generates a secure, expiring token and sends a reset link to the email.

#### Scenario: User submits a new password with a valid token

- **WHEN** a user provides a new password along with a valid, unexpired reset token
- **THEN** the system updates their password hash and invalidates the token.

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

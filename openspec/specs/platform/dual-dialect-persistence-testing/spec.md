# dual-dialect-persistence-testing Specification

## Purpose

Provide fast isolated persistence feedback locally without weakening PostgreSQL production verification.

## Requirements

### Requirement: Explicit local persistence test profile
The system SHALL select the persistence test profile from `COPALIBRE_TEST_DIALECT`. It MUST default to PostgreSQL when unset and MUST reject unknown values before a test creates or mutates a database.

#### Scenario: SQLite profile selected
- **WHEN** a developer runs an eligible persistence test with `COPALIBRE_TEST_DIALECT=sqlite`
- **THEN** the test receives an isolated SQLite database without requiring `DATABASE_URL`

#### Scenario: PostgreSQL profile selected by default
- **WHEN** a developer runs a persistence integration test without `COPALIBRE_TEST_DIALECT`
- **THEN** the test uses PostgreSQL from `DATABASE_URL`

### Requirement: Dialect capability boundaries
The system SHALL identify tests and operations that require PostgreSQL semantics, including production migrations, row-lock concurrency, transactional outbox behavior, and PostgreSQL-specific SQL. It MUST fail an incompatible SQLite test before it executes a misleading assertion.

#### Scenario: PostgreSQL-only test under SQLite
- **WHEN** a PostgreSQL-only integration suite is invoked with `COPALIBRE_TEST_DIALECT=sqlite`
- **THEN** the suite fails with an error that identifies PostgreSQL as required

### Requirement: Portable repository feedback
The system SHALL provide an SQLite schema and result mapping sufficient for eligible repository tests to execute their declared behavior, including UUID values, timestamps, JSON payloads, foreign keys, uniqueness, and transactional writes.

#### Scenario: Repository test uses ephemeral SQLite state
- **WHEN** an eligible repository test creates domain records and reads them back under SQLite
- **THEN** all state is isolated to that test database and JSON values retain their object or array shape

### Requirement: PostgreSQL remains release verification
The system SHALL retain PostgreSQL integration tests in CI and release verification. SQLite success MUST NOT satisfy or replace PostgreSQL migration, locking, audit, outbox, or concurrency coverage.

#### Scenario: CI validation
- **WHEN** CI runs persistence integration verification
- **THEN** it runs the PostgreSQL profile regardless of any SQLite fast-test job

### Requirement: Central local test configuration
The system SHALL load local test environment values from an ignored `.env.test` file and provide a versioned `.env.test.example`. An environment variable supplied by CI or the invoking shell MUST take precedence over the file value.

#### Scenario: Local PostgreSQL integration command
- **WHEN** a developer runs the documented integration command after creating `.env.test` from its example
- **THEN** the command receives `DATABASE_URL` without an inline environment assignment

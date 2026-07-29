## 1. Schema and migrations

- [ ] 1.1 Add Kysely + `pg` to `packages/persistence`
- [ ] 1.2 Define the migration file format and runner used by `apps/migrate`
- [ ] 1.3 Write initial migrations for tenants/organizations, domain aggregate tables, versioned configuration tables
- [ ] 1.4 Write migrations for `audit_log`, `outbox_events`, `event_cursors`, `projection_versions`
- [ ] 1.5 Add a `schema_version` table and migration to track applied migration state
- [ ] 1.6 Add UUIDv7 generation helper shared by all insert paths

## 2. Repositories

- [ ] 2.1 Implement Organization/Club repository
- [ ] 2.2 Implement Tournament + Ruleset-hierarchy repository (DisciplineDescriptor/TournamentRuleset/StageConfiguration/MatchRuleset)
- [ ] 2.3 Implement Participant/Team/Roster repository
- [ ] 2.4 Implement Stage/Fixture/Match/Segment/Event-log repository
- [ ] 2.5 Wire each repository to call phase-2 domain invariant validation before any write
- [ ] 2.6 Implement the audit-write helper used by every mutating repository method
- [ ] 2.7 Implement the outbox-write helper used by every mutating repository method

## 3. Transaction boundary

- [ ] 3.1 Implement a `withTransaction` wrapper that guarantees domain mutation + audit + outbox commit or roll back together
- [ ] 3.2 Enforce (via lint rule or code review checklist) that no repository method writes an audit or outbox row outside `withTransaction`

## 4. apps/migrate

- [ ] 4.1 Replace phase 1's stub with a real entrypoint: apply pending migrations, print applied version, exit
- [ ] 4.2 Add `--down` one-step revert support
- [ ] 4.3 Add `apps/api` readiness-check query against `schema_version`, refusing to serve traffic on mismatch

## 5. Unit tests

- [ ] 5.1 Unit test the camelCase-to-snake_case mapping helper for every repository
- [ ] 5.2 Unit test UUIDv7 generation format/version bits

## 6. Integration tests (against real PostgreSQL via phase 1's docker-compose.dev.yml)

- [ ] 6.1 Test: domain mutation + audit + outbox commit atomically
- [ ] 6.2 Test: rollback discards all three together
- [ ] 6.3 Test: migration up/down round-trips cleanly on a scratch database
- [ ] 6.4 Test: running `apps/migrate` twice with no new migrations is a no-op
- [ ] 6.5 Test: `apps/api` readiness check fails against an unmigrated database
- [ ] 6.6 Test: repository rejects a write that violates a phase-2 domain invariant before touching the database
- [ ] 6.7 Test: audit history for an aggregate returns entries in chronological order with correct actor/timestamp

## 7. CI wiring

- [ ] 7.1 Add a `postgres` service container to `.github/workflows/ci.yml`
- [ ] 7.2 Add an `integration-tests` job (needs `install`) that starts Postgres, runs `apps/migrate`, then runs `packages/persistence`'s integration test suite, extending `.github/workflows/ci.yml` created in phase 1

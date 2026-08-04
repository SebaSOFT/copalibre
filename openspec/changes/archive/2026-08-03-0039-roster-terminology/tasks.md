## 1. Implementation

- [x] 1.1 Replace match-selection domain types, validation names, capability values, findings, and documentation from `lineup` to `roster`; distinguish the eligible player pool from a selected roster.
- [x] 1.2 Add reversible migration `0004-roster-terminology` to rename `match_lineups` to `match_rosters` and rewrite persisted `match.select-lineup` capabilities.
- [x] 1.3 Update Kysely schema, API controllers and DTOs, worker/statistics references, and generated OpenAPI/client contracts to use the canonical roster vocabulary.
- [x] 1.4 Rename registration-review and participant self-service membership routes, models, UI labels, and copy so they use `team membership` rather than `roster`.
- [x] 1.5 Bump the OpenAPI major version and regenerate committed API and contract artifacts.

## 2. Unit tests

- [x] 2.1 Update domain, rules, statistics, worker, and web unit tests to use `Roster` for match selection and `team membership` for membership state.
- [x] 2.2 Add regression coverage proving a duplicate player remains refused, an ineligible player remains reported, and configured roster-size findings retain their behavior after the rename.

## 3. Integration tests

- [x] 3.1 Extend migration integration coverage to prove `0004-roster-terminology` preserves match roster rows and rewrites legacy match-assignment capabilities in PostgreSQL and SQLite.
- [x] 3.2 Update API integration coverage for `match.select-roster`, `match_rosters` attribution validation, and renamed team-membership routes.
- [x] 3.3 Verify rollback restores the legacy table and capability through the existing one-step migration rollback harness.

## 4. E2E tests

- [x] 4.1 Update Playwright control tests so registration review presents team-member details and never calls them a roster.
- [x] 4.2 Add or update match-console browser coverage to consume `match.select-roster` without changing authorization behavior.

## 5. CI wiring

- [x] 5.1 Confirm `.github/workflows/ci.yml` `unit-tests`, `integration-tests`, and `e2e-tests` jobs execute the renamed suites through their existing workspace test commands; extend the relevant step only if discovery does not include them.

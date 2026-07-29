## 1. Domain model

- [ ] 1.1 Add lifecycle state field (draft/published/in_progress/completed/archived) to the Tournament and Circuit aggregates in `packages/domain`
- [ ] 1.2 Implement the legal-transition table and a guard that rejects illegal transitions
- [ ] 1.3 Add a one-time backfill migration in `apps/migrate` assigning existing tournaments their correct current lifecycle state

## 2. Archival

- [ ] 2.1 Implement the archive action (completed → archived transition) in `apps/api`
- [ ] 2.2 Add the shared "active only" query filter in `packages/persistence`, used by every listing/dashboard endpoint
- [ ] 2.3 Confirm an archived tournament's own public canonical URL still resolves (no route removal)

## 3. Retention and deletion

- [ ] 3.1 Add operator-configurable retention-period setting per organization
- [ ] 3.2 Add a scheduled retention-eligibility check in `apps/scheduler` that only marks eligibility, never deletes
- [ ] 3.3 Surface retention-eligible archived tournaments as a queue/notification in control-web
- [ ] 3.4 Implement the explicit, operator-initiated deletion action, blocked until retention period has elapsed

## 4. Export eligibility

- [ ] 4.1 Confirm phase 19's CSV export path accepts archived tournaments as a valid export target with no code change required (verification task, not new code, if the export path is already state-agnostic)
- [ ] 4.2 Add a regression test if the export path currently filters by an "active" assumption that would need removing

## 5. Unit tests

- [ ] 5.1 Unit test the legal-transition table (every legal transition succeeds, every illegal one is rejected)
- [ ] 5.2 Unit test retention-eligibility calculation against the configured retention period

## 6. Integration tests

- [ ] 6.1 Integration test: archiving a tournament removes it from active-listing queries while its detail/export endpoints remain fully functional
- [ ] 6.2 Integration test: deletion attempt before retention period elapses is rejected
- [ ] 6.3 Integration test: deletion after retention period elapses succeeds only via explicit operator action, never via the scheduled eligibility check itself
- [ ] 6.4 Integration test: CSV export of an archived tournament returns the same data set it would have before archival

## 7. E2E tests

- [ ] 7.1 E2E: operator archives a completed tournament from control-web, confirms it disappears from the active dashboard (phase 14's A1) and its public page still resolves
- [ ] 7.2 E2E: operator views the retention-eligible queue and performs an explicit deletion action

## 8. CI wiring

- [ ] 8.1 Add the competition-lifecycle unit, integration, and e2e tests to the existing `unit`/`integration`/`e2e` jobs in `.github/workflows/ci.yml`

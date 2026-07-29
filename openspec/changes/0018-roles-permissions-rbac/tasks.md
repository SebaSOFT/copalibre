## 1. Domain and persistence

- [ ] 1.1 Add role assignment entity (organization, user, role, status) to `packages/domain`
- [ ] 1.2 Add Kysely repository and migration for role assignments and audit records in `packages/persistence`

## 2. API policy layer

- [ ] 2.1 Implement role/ownership guard decorators in `apps/api` resolving against `org`/`scp` JWT claims
- [ ] 2.2 Require every controller route to declare an explicit guard (deny-by-default); add a CI check that fails on any undecorated route
- [ ] 2.3 Implement resource-ownership checks for participant-scoped endpoints (own registration/roster/results only)
- [ ] 2.4 Implement role-change endpoint with audit-record write in the same transaction

## 3. Invite flow

- [ ] 3.1 Implement invite-by-email endpoint accepting role and initial status
- [ ] 3.2 Implement invite acceptance provisioning the selected role/status

## 4. A7 control UI

- [ ] 4.1 Build user table (avatar-initials, per-row role selector, Active/Inactive toggle, edit/delete actions)
- [ ] 4.2 Build "Add Recipient" invite modal (email, role select, initial-status toggle)
- [ ] 4.3 Wire deactivation to immediately reflect in the UI and block further action for that user

## 5. Unit tests

- [ ] 5.1 Unit test guard logic: role-in-org-A does not grant access in org-B
- [ ] 5.2 Unit test resource-ownership check logic against fixture participant/operator identities

## 6. Integration tests (adversarial)

- [ ] 6.1 Integration test: participant token requests another participant's private data → 403
- [ ] 6.2 Integration test: participant token requests an operator-only endpoint → 403
- [ ] 6.3 Integration test: inactive user's authenticated request is rejected
- [ ] 6.4 Integration test: role change produces an audit record with actor/timestamp/prior/resulting role
- [ ] 6.5 Integration test: a route with no guard decorator fails the CI deny-by-default check

## 7. E2E tests

- [ ] 7.1 Playwright: admin invites a user with `referee` role, verify user appears with correct role after acceptance
- [ ] 7.2 Playwright: admin deactivates a user, verify their session is subsequently blocked
- [ ] 7.3 Playwright: attempt to reach an admin-only route as a `viewer`-role user and verify it is blocked in the UI and rejected server-side

## 8. CI wiring

- [ ] 8.1 Add a `guard-coverage` check job to `.github/workflows/ci.yml` (task 2.2's deny-by-default lint), and add this capability's Jest/integration/Playwright specs to the existing `unit-tests`, `integration-tests`, and `e2e-tests` jobs' test globs

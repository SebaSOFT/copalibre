## 1. Tournament Setup Wizard shell

- [ ] 1.1 Build the 4-step stepper component (Name → Discipline → Format → Window) with connecting progress bar
- [ ] 1.2 Build Back/Continue footer navigation with per-step validation gating

## 2. Discipline and format steps

- [ ] 2.1 Fetch available `DisciplineDescriptor`s from the API for the Discipline step
- [ ] 2.2 Fetch the MVP format list from the API for the Format step (do not hardcode client-side)
- [ ] 2.3 Filter the Format step's options to formats the selected discipline declares as supported
- [ ] 2.4 Build the Window step: region, capacity, Public Registration Open toggle, Requires Check-in toggle, with helper text

## 3. Tournament creation and mutation classification

- [ ] 3.1 Implement wizard submission creating a `TournamentRuleset` recording the descriptor version used
- [ ] 3.2 Implement client-side mutation-classification feedback (blocking dialog for `blocked_after_results` edits) as a UX layer, not the enforcement authority
- [ ] 3.3 Confirm the API independently rejects a `blocked_after_results` edit regardless of client state

## 4. Registration Review table

- [ ] 4.1 Build the registrations table with breadcrumb-style context header
- [ ] 4.2 Build the status filter (All/Pending/Accepted/Refused)
- [ ] 4.3 Build row checkboxes and bulk Approve/Deny/Export actions
- [ ] 4.4 Build the expandable accordion row (keyboard-focusable) with contact/roster/experience detail and Message/Revoke actions
- [ ] 4.5 Build pagination footer

## 5. Check-in and eligibility lock

- [ ] 5.1 Implement check-in-window-closed detection sourced from tournament domain state
- [ ] 5.2 Block roster/eligibility edit actions in the UI once check-in is closed for a checked-in entrant, with an explanatory message
- [ ] 5.3 Confirm the API independently rejects the same edit if attempted via a stale UI state

## 6. Audit wiring

- [ ] 6.1 Implement bulk actions as per-registration API calls (or a batch endpoint producing per-registration audit records)
- [ ] 6.2 Confirm each approve/deny/check-in action produces its own audit entry with actor, timestamp, prior/resulting state

## 7. Unit tests

- [ ] 7.1 Wizard unit tests: format options are filtered correctly per selected discipline
- [ ] 7.2 Wizard unit tests: MVP-only format list is rendered (no extra formats injected)
- [ ] 7.3 Registration review unit tests: bulk selection state and per-row checkbox behavior
- [ ] 7.4 Registration review unit tests: eligibility-lock UI state renders correctly before/after check-in window closes

## 8. Integration tests

- [ ] 8.1 Integration test: wizard submission creates a `TournamentRuleset` recording the correct descriptor version
- [ ] 8.2 Integration test: attempting a `blocked_after_results` edit after a result exists is rejected by the API
- [ ] 8.3 Integration test: bulk approve of 3 of 10 registrations produces exactly 3 accepted registrations and 3 audit entries
- [ ] 8.4 Integration test: roster edit attempt after check-in window closes is rejected server-side
- [ ] 8.5 Integration test: registration list for tournament A never includes tournament B's registrations

## 9. E2E tests (Playwright)

- [ ] 9.1 E2E: complete the wizard end-to-end and confirm the tournament appears on the organization dashboard
- [ ] 9.2 E2E: filter, bulk-select, and bulk-approve registrations, confirming the table updates correctly
- [ ] 9.3 E2E: expand a registration row and revoke a registration, confirming an audit entry is created

## 10. CI wiring

- [ ] 10.1 Add this phase's unit and integration tests to the existing `unit-tests`/`integration-tests` jobs in `.github/workflows/ci.yml`
- [ ] 10.2 Add this phase's Playwright specs to the existing `e2e-tests` job in `.github/workflows/ci.yml`

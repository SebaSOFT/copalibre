## 1. Import validation pipeline

- [ ] 1.1 Implement CSV parsing and schema validation against the active discipline/tournament schema in `apps/api`
- [ ] 1.2 Route validation above a size threshold through `apps/worker`; emit progress via SSE
- [ ] 1.3 Build row-level error reporting (actionable messages, not generic parse failures)
- [ ] 1.4 Implement reviewed-preview endpoint returning validated/invalid rows without committing

## 2. Import commit

- [ ] 2.1 Implement single-transaction commit of all reviewed rows plus audit record
- [ ] 2.2 Reject commit attempts referencing a stale/unreviewed preview (preview must match what is being confirmed)

## 3. Export

- [ ] 3.1 Implement CSV export of participants/results/standings keyed by alias
- [ ] 3.2 Verify export requires no SebaSOFT-hosted service dependency

## 4. UI

- [ ] 4.1 Add CSV upload + row-level preview/error review UI to the A3 Registration Review screen
- [ ] 4.2 Add export trigger/download UI to the A1 Organization Dashboard screen

## 5. Unit tests

- [ ] 5.1 Unit test CSV schema validation against fixture valid/invalid rows
- [ ] 5.2 Unit test row-level error message generation

## 6. Integration tests

- [ ] 6.1 Integration test: mixed valid/invalid CSV commits nothing until corrected
- [ ] 6.2 Integration test: import commit writes an audit record with actor/timestamp/row identity
- [ ] 6.3 Integration test: export output round-trips through import without data loss (fidelity test)
- [ ] 6.4 Integration test: malformed CSV (unparsable) is rejected cleanly with an actionable error, not a crash

## 7. E2E tests

- [ ] 7.1 Playwright: upload a valid CSV, review preview, confirm, verify data appears
- [ ] 7.2 Playwright: upload a CSV with invalid rows, verify row-level errors shown and nothing committed
- [ ] 7.3 Playwright: export data, re-import the exported file, verify round-trip fidelity end-to-end

## 8. CI wiring

- [ ] 8.1 Add this capability's Jest/integration/Playwright specs to the existing `unit-tests`, `integration-tests`, and `e2e-tests` jobs' test globs in `.github/workflows/ci.yml`

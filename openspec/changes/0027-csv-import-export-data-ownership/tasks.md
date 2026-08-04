## 1. Import validation pipeline

- [x] 1.1 Implement CSV parsing and schema validation against the active discipline/tournament schema in `apps/api`, selecting individual-participant or team row shapes from declared configuration and rejecting match-roster input
- [x] 1.2 Route every CSV validation through the durable `apps/worker` relay; reject uploads over 4 MiB and emit progress via SSE
- [x] 1.3 Build row-level error reporting (actionable messages, not generic parse failures)
- [x] 1.4 Implement reviewed-preview endpoint returning validated/invalid rows without committing

## 2. Import commit

- [x] 2.1 Implement single-transaction commit of all reviewed rows plus audit record
- [x] 2.2 Reject commit attempts referencing a stale/unreviewed preview (preview must match what is being confirmed)

## 3. Export

- [x] 3.1 Implement separate CSV exports of participants/results/standings keyed by alias; only participant export conforms to the re-import schema
- [x] 3.2 Verify export requires no SebaSOFT-hosted service dependency

## 4. UI

- [x] 4.1 Add CSV upload + row-level preview/error review UI to the A3 Registration Review screen
- [x] 4.2 Add export trigger/download UI to the A1 Organization Dashboard screen

## 5. Unit tests

- [x] 5.1 Unit test CSV schema validation against fixture valid/invalid rows
- [x] 5.2 Unit test row-level error message generation

## 6. Integration tests

- [x] 6.1 Integration test: mixed valid/invalid CSV commits nothing until corrected
- [x] 6.2 Integration test: import commit writes an audit record with actor/timestamp/row identity
- [x] 6.3 Integration test: export output round-trips through import without data loss (fidelity test)
- [x] 6.4 Integration test: malformed CSV (unparsable) is rejected cleanly with an actionable error, not a crash

## 7. E2E tests

- [x] 7.1 Playwright: upload a valid CSV, review preview, confirm, verify data appears
- [x] 7.2 Playwright: upload a CSV with invalid rows, verify row-level errors shown and nothing committed
- [x] 7.3 Playwright: export data, re-import the exported file, verify round-trip fidelity end-to-end

## 8. CI wiring

- [x] 8.1 Add this capability's Jest/integration/Playwright specs to the existing `unit-tests`, `integration-tests`, and `e2e-tests` jobs' test globs in `.github/workflows/ci.yml`

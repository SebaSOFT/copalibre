## 1. Display-token mechanism

- [ ] 1.1 Add a display-token table (device-scoped, route-bound, revocation flag) to `packages/persistence`
- [ ] 1.2 Add an operator-authenticated display-token issuance endpoint in `apps/api`
- [ ] 1.3 Add an operator-authenticated display-token revocation endpoint in `apps/api`
- [ ] 1.4 Add display-token validation guard in `apps/events` for the SSE requests this surface makes
- [ ] 1.5 Document the on-device provisioning method (launch-URL path segment or config file — not `localStorage`)

## 2. Kiosk routes

- [ ] 2.1 Build `/tv/{organization}/tournaments/{tournament}` full-rotation view
- [ ] 2.2 Build `/tv/{organization}/tournaments/{tournament}/matches/{match}` pinned view
- [ ] 2.3 Apply title-safe/action-safe margins and viewing-distance-appropriate type sizing
- [ ] 2.4 Remove all pointer/keyboard/dismiss-dependent UI from this route family

## 3. Overlay mode

- [ ] 3.1 Implement `?mode=overlay` rendering a transparent background with no chrome
- [ ] 3.2 Verify chroma-key compatibility (test capture in OBS or equivalent)

## 4. Reliability engineering

- [ ] 4.1 Wire the shared reconnect/backoff client from phase 10 into `/tv/**`, suppressing any visible error/retry UI
- [ ] 4.2 Implement "last known good projection" fallback rendering during a reconnect window
- [ ] 4.3 Audit and remove any code path that assumes `localStorage` persists across a power-cycle
- [ ] 4.4 Add a device-health heartbeat surfaced in control-web's A1 dashboard (not on the kiosk screen itself)

## 5. Organizer branding

- [ ] 5.1 Add an organizer accent-color and logo slot layered over `packages/design-tokens`, non-overriding for state colors
- [ ] 5.2 Add a test asserting live/upcoming/destructive/positive-result colors remain unchanged under any organizer branding input

## 6. Unit tests

- [ ] 6.1 Unit test display-token issuance/revocation logic (scope binding, revocation flag behavior)
- [ ] 6.2 Unit test the branding-override guard (task 5.2's underlying logic)

## 7. Integration tests

- [ ] 7.1 Integration test: a revoked display token is rejected by the `apps/events` SSE guard on the next request
- [ ] 7.2 Integration test: an operator revoking one device's token does not affect another device's token or any person's JWT

## 8. E2E tests

- [ ] 8.1 E2E: kiosk route renders and silently recovers when the underlying SSE connection is forcibly dropped mid-session
- [ ] 8.2 E2E: overlay-mode chroma-key visual test (background is transparent/keyable, no chrome present)
- [ ] 8.3 E2E: device power-cycle simulation (clear all browser storage, reload) resumes rendering the assigned route without a login prompt

## 9. Soak testing (scheduled, not per-PR)

- [ ] 9.1 Add a scheduled workflow `tv-soak-test.yml` running a `/tv/**` route in a headless browser for a multi-day window, measuring memory over time
- [ ] 9.2 Add a shorter accelerated proxy version (2-hour run, tighter growth threshold) as the per-PR-eligible signal
- [ ] 9.3 Fail the scheduled job (and alert) on detected unbounded memory growth

## 10. CI wiring

- [ ] 10.1 Add `tv-surfaces` unit/integration test step to the existing `unit`/`integration` jobs in `.github/workflows/ci.yml`
- [ ] 10.2 Add the accelerated soak-proxy test (task 9.2) to the `e2e` job in `.github/workflows/ci.yml`
- [ ] 10.3 Add the new scheduled `tv-soak-test.yml` workflow (task 9.1), separate from the per-PR `ci.yml`, mirroring phase 21's `backup-restore-drill.yml` pattern

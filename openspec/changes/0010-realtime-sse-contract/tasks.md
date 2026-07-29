## 1. Public SSE stream

- [ ] 1.1 Implement `GET /events/public/{organization}/tournaments/{tournament}` with correct SSE response headers
- [ ] 1.2 Implement event envelope construction (camelCase fields) from `packages/persistence` outbox rows
- [ ] 1.3 Implement public payload sanitization so only intentionally published data is ever included
- [ ] 1.4 Implement per-IP and per-resource connection limits and bounded replay depth

## 2. Cursor-based replay

- [ ] 2.1 Implement `Last-Event-ID` parsing and replay-from-cursor logic
- [ ] 2.2 Implement replay-window-expired detection and the "fetch complete current projection" signal
- [ ] 2.3 Implement heartbeat comment frames sized to survive the documented reverse-proxy idle timeout

## 3. Authenticated SSE (Fetch streaming)

- [ ] 3.1 Implement `GET /events/control/{organizationAlias}` requiring `Authorization: Bearer` header
- [ ] 3.2 Implement JWT validation reuse from `0005-api-auth-jwt-openapi-contract`'s guard layer
- [ ] 3.3 Implement `Last-Event-ID` support on the authenticated path identical to the public path

## 4. Shared client library

- [ ] 4.1 Implement SSE wire-format parsing over a Fetch `ReadableStream`
- [ ] 4.2 Implement reconnection with exponential backoff
- [ ] 4.3 Implement heartbeat/timeout detection on the client
- [ ] 4.4 Implement cursor persistence across reconnects
- [ ] 4.5 Implement access-token renewal hook for the authenticated path
- [ ] 4.6 Implement abort-controller-based teardown
- [ ] 4.7 Implement recoverable-vs-fatal error classification

## 5. Long-polling fallback

- [ ] 5.1 Implement `GET /api/events?after=<cursor>&wait=<seconds>` reusing the SSE replay-resolution logic
- [ ] 5.2 Implement bounded long-poll wait with graceful timeout response (empty batch, same cursor)

## 6. Unit tests

- [ ] 6.1 Event-envelope construction unit tests (snake_case outbox row -> camelCase envelope)
- [ ] 6.2 Client-library reconnect/backoff state-machine unit tests
- [ ] 6.3 Recoverable-vs-fatal error classification unit tests

## 7. Integration tests

- [ ] 7.1 Integration test: reconnect within replay window replays all missed events in order
- [ ] 7.2 Integration test: reconnect after replay window expiry receives the fetch-complete-projection signal, not a silent partial replay
- [ ] 7.3 Integration test: public stream never includes unpublished tournament data
- [ ] 7.4 Integration test: long-poll and SSE reconnect return identical events for the same cursor (shared replay logic verified)
- [ ] 7.5 Integration test against a representative buffering reverse-proxy config: confirms events are not batched/delayed beyond the documented tolerance

## 8. E2E tests (Playwright)

- [ ] 8.1 E2E: authenticated client connects, receives a live update, disconnects, reconnects, and resumes without gap
- [ ] 8.2 E2E: assert no access token or refresh credential ever appears in any request URL, browser history entry, or network-panel query string during an authenticated SSE session
- [ ] 8.3 E2E: public stream connection works with no `Authorization` header present at all

## 9. CI wiring

- [ ] 9.1 Add `apps/events` unit tests to the existing `unit-tests` job in `.github/workflows/ci.yml`
- [ ] 9.2 Add this phase's integration tests (including the reverse-proxy buffering test) to the `integration-tests` job introduced in `0009-worker-scheduler-async-jobs`
- [ ] 9.3 Add a new `e2e-realtime` job to `.github/workflows/ci.yml` running the Playwright reconnect/no-token-leak specs, following the `e2e-tests` job shape already used for `apps/web`

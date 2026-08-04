## Why

The Live Match Operations Console is the highest-stakes screen in CopaLibre: it is where a referee
or table official commits facts that become part of an immutable ledger. The result-authority policy
in `../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md`
permits no direct overwrite of a finalized outcome. That policy is only real when the console and
its supporting API make the authoritative state, audited commands, and correction boundary visible.

## What Changes

- Add a protected, authoritative console read model containing match state, resolved score/statistics,
  active segment and elapsed time, event history, active timers, eligible attribution data, discipline
  presentation metadata, and current subject capabilities. It is the only source the console uses to
  initialize or recover its state.
- Extend match-control with audited manual clock/period adjustment and timer resolution commands.
  The commands record actor, prior state, resulting state, and the match-scoped capability that
  authorized them, as required by the "Operations console and event authority" section of
  `../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md`.
- Make match finalization server-idempotent through a persisted client idempotency key. A retried
  request returns its original outcome, while a key reused with a different request is rejected.
- Publish an authoritative, versioned match projection after every console mutation through the
  existing durable outbox/SSE contract, so optimistic UI reconciles against server calculation rather
  than trusting client state.
- Permit an active organization `admin` or `referee` to reach match control only when that identity
  also holds the independently granted capability for that specific match. Organization role never
  substitutes for match assignment.
- Build the A4 control view: circular match clock, live score, discipline-aware event palette,
  conditional event flow, timers, filtered Event Ledger, irreversible finalize dialog, and stale-data
  handling. Tactical tiles show only measured telemetry; an unavailable metric is labelled unavailable
  rather than fabricated.
- Keep the plain-text log-note footer as a note field, never a command-execution console, following
  the corrected A4 reference at `../copalibre-design-system-fixed/a4-live-match-operations-console/code.html`.

## Capabilities

### New Capabilities
- `live-match-console`: a referee/table-official console and its supporting authoritative contracts
  for operating a specific match through discipline configuration, audited commands, and reconciled
  live state.

### Modified Capabilities
(none)

## Impact

- **API/domain/persistence**: `apps/api` match-control endpoints and DTOs, match-operation domain
  commands, persistent idempotency, audit/outbox records, OpenAPI contract, and authoritative SSE
  projections.
- **New UI**: `apps/web` `/control/{organization}/tournaments/{tournament}/matches/{match}` React
  control surface using the existing Fetch-authenticated SSE channel.
- **Consumes**: `0014-live-match-operations-result-authority`, discipline event definitions, `0018`
  realtime events, `0026` organization roles and match assignments, and design tokens including
  `.cl-inline-alert`.
- **Integrity and security critical**: duplicate finalization, stale optimistic state, unauthorized
  match commands, and fabricated telemetry are release blockers.

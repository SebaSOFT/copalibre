## Context

This change builds the operator UI and the narrow match-control contract extensions it needs. Phase
`0014` supplies the append-only event log, correction workflow, match assignments, audit, and
outbox; `0018` supplies authenticated Fetch-based SSE. The current match-state response cannot
render the console or reconcile it after a mutation, and its command surface lacks clock adjustment,
timer resolution, and server idempotency. The A4 mockup at
`../copalibre-design-system-fixed/a4-live-match-operations-console/code.html` and the live-console
workflow in `../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md`
define the intended interaction shape.

## Goals / Non-Goals

**Goals:**
- The console initializes and recovers from one authoritative, capability-aware match projection.
- Every mutable operation is both match-capability checked and auditable; a role alone never grants
  match authority.
- A finalize retry cannot create a second commit or produce ambiguous client state.
- The browser reconciles every optimistic update with an authoritative projection delivered through
  durable SSE or by refetching the console projection.

**Non-Goals:**
- No scoring, aggregation, or timer semantics are invented in the UI; the domain descriptor and
  rules engine remain authoritative.
- No generic command-execution surface or direct result overwrite is added.
- No telemetry collector is introduced. Tiles consume existing measured telemetry only and render an
  explicit unavailable state when no source exists.

## Decisions

**Use one protected console projection rather than assembling mutable state from public reads.** It
returns match status, resolved result/statistics, current segment and elapsed time, running timers,
event history, eligible attribution data, active discipline presentation metadata, and the caller's
independently granted capabilities. It is readable by an active `admin` or `referee` only after
organization membership and match assignment are both checked. Public projections remain sanitized
and do not acquire operator data.

**Model clock adjustment, period selection, and timer resolution as explicit audited commands.**
They are not client-side edits to elapsed-time counters. Each validates current match/segment state,
enforces the matching capability, records prior and resulting state, and emits the next authoritative
projection. A timer resolution must correspond to a discipline-declared resolution path; the console
cannot invent a universal "dismiss" behavior.

**Finalize uses an `Idempotency-Key` supplied by the client and persisted atomically with the command.**
The server stores a request fingerprint and result with the key. An equal retry returns the stored
outcome; reuse with a different fingerprint returns a conflict. This remains necessary even though
the UI disables its button, because transport retries and concurrent requests bypass browser state.

**SSE carries a versioned authoritative projection for console mutations.** The durable outbox emits
a match-scoped projection event after event entry, clock commands, timer resolution, and finalization.
The console accepts only a newer projection version; if it misses or cannot reconcile one before a
named timeout derived from the SSE heartbeat, it refetches the projection and shows stale state until
recovery. Polling is not a steady-state substitute.

**Organization role admits an operator to the control plane; assignment grants the action.** Active
`admin` and `referee` identities may reach the match-control policy, but `match.record-event`,
`match.control-clock`, `match.select-lineup`, `match.resolve-timer`, and `match.finalize` each still
require their own grant for the current match. This realizes `0026`'s statement that referee is
necessary but not sufficient.

**Telemetry tiles never display invented operational figures.** A tile has a measurement and source
when integration provides one; otherwise it displays unavailable. This keeps stream quality and
audience numbers distinct from match facts and avoids dashboards that imply observability does not
exist.

## Risks / Trade-offs

- [Risk] A console projection exposes operator-only roster or capability data through public reads. →
  Mitigation: a separate protected projection route and contract tests proving public endpoints remain
  sanitized.
- [Risk] An idempotency record survives a failed command and makes retries appear successful. →
  Mitigation: persist the key, fingerprint, and stored response in the same transaction as the command;
  rollback leaves no completed record.
- [Risk] A configuration error offers an invalid event or timer transition. → Mitigation: backend
  descriptor/state validation remains authoritative and errors are rendered without retaining an
  optimistic mutation.
- [Risk] SSE delay causes a misleading local score. → Mitigation: bounded reconciliation timeout,
  projection refetch, and visible stale-state indicator.

## Migration Plan

1. Add domain, persistence, API, OpenAPI, and SSE contracts with unit and integration coverage.
2. Add the control route behind authenticated operator access and exercise it against fixture
   descriptors.
3. Roll back the UI route independently if needed; finalized results and idempotency records remain
   durable facts, and corrections continue through the existing correction workflow.

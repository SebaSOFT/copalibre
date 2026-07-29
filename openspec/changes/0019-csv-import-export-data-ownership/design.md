## Context

This phase implements TMS-010 from `copalibre-market-segment-feature-specification.md`, one of the
six capabilities the MVP feature spec calls out as required together for the release gate. It sits on
top of phase 4's persistence/audit layer and phase 2's domain validation.

## Goals / Non-Goals

**Goals:**
- No import ever partially commits — it is all-or-nothing after explicit review, or nothing.
- Exports are portable: stable-alias-keyed, re-importable, and require no hosted account.

**Non-Goals:**
- No support for arbitrary external format adapters (e.g. importing from a specific competitor's
  export format) in this phase — CSV against CopaLibre's own schema only. Format-specific adapters
  are a possible future extensibility surface, not MVP scope.
- No real-time collaborative import review (e.g. multiple operators reviewing the same upload
  simultaneously) — single-operator review flow only.

## Decisions

**Large imports route through the worker, not the request handler.** Consistent with the
architecture doc's "Asynchronous work is durable" principle: user-facing requests must not hide
unbounded work. A CSV upload triggers validation synchronously up to a size threshold; above that
threshold, validation and the reviewable preview are produced asynchronously via `apps/worker`, with
the operator polling/subscribing (SSE, phase 10) for preview readiness. Alternative considered:
always-synchronous validation — rejected for large rosters/federation-scale imports where validation
could exceed reasonable request timeouts.

**Import commit is a single domain transaction, matching the outbox pattern.** All rows commit in one
database transaction with the audit record, same as any other domain mutation (phase 4's pattern) —
not a row-by-row loop that could partially fail mid-way.

**Export keys on alias, never raw UUIDv7.** Directly enforces the naming-conventions decision
(`copalibre-naming-conventions.md`): UUIDs never appear in a URL, and by extension should not be the
primary reference in operator-facing exported data either, since exports are meant to be
human-portable and re-importable.

## Risks / Trade-offs

- [Risk] Large CSV validation could still be slow even asynchronously, frustrating operators waiting
  for a preview. → Mitigation: emit progress via SSE (phase 10) rather than a silent black box.
- [Risk] A schema mismatch between export and import (e.g. export format drifts from what import
  accepts) breaks the "re-importable" promise. → Mitigation: round-trip fidelity is an explicit test
  requirement (task list), not just a documentation claim.

## Migration Plan

N/A — new capability, no prior import/export mechanism exists.

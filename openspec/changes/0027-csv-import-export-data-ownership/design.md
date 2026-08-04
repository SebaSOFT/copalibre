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

**Every import routes through the worker, never the request handler.** The API accepts at most 4 MiB
and durably publishes an import-validation job through the existing outbox/worker relay; validation
and the reviewable preview are produced asynchronously, with progress delivered through SSE. This
avoids a second execution model and satisfies the architecture's "asynchronous work is durable"
principle. Alternative considered: synchronous validation below a threshold — rejected because it
makes correctness, progress, and failure recovery depend on file size.

**Import schema is selected by the active tournament and discipline.** A descriptor/tournament
configuration declares the accepted row shape and its target: individual participant or team. The
parser validates configuration rather than hardcoding sport-specific columns; an undeclared shape is
reported as a preview error, not guessed.

**Roster is the match-selection term, not a participant import target.** A `player` is a person's
membership in a team; a `roster` is the selected set of eligible players who will play a particular
match. Roster selection belongs to live match operations and is deliberately outside this change.
CSV participant imports can create or correct individual participants and teams, but never alter a
match roster or team membership.

**Import commit is a single domain transaction, matching the outbox pattern.** All rows commit in one
database transaction with the audit record, same as any other domain mutation (phase 4's pattern) —
not a row-by-row loop that could partially fail mid-way.

**Export keys on alias, never raw UUIDv7.** Directly enforces the naming-conventions decision
(`copalibre-naming-conventions.md`): UUIDs never appear in a URL, and by extension should not be the
primary reference in operator-facing exported data either, since exports are meant to be
human-portable and re-importable. Participant export alone is accepted by the import pipeline to
correct participant records; results and standings remain read-only calculated exports.

## Risks / Trade-offs

- [Risk] Large CSV validation could still be slow even asynchronously, frustrating operators waiting
  for a preview. → Mitigation: emit progress via SSE (phase 16) rather than a silent black box.
- [Risk] A schema mismatch between export and import (e.g. export format drifts from what import
  accepts) breaks the "re-importable" promise. → Mitigation: round-trip fidelity is an explicit test
  requirement (task list), not just a documentation claim.

## Migration Plan

Migration `0005-csv-import-export` adds a durable import-session record. It stores source CSV up to
the configured 4 MiB limit, target participant type, source hash, validation status, and a
serializable preview. The API publishes only the session identifier to the outbox; raw CSV and
row-level data do not travel in a durable-event payload. The worker owns status/progress updates and
the API owns reviewed commit in one transaction. The migration is reversible and validated on both
PostgreSQL and SQLite.

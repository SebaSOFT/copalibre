## Context

Phase 2 defines framework-free domain aggregates; phase 3 defines decision logic. Neither package
knows about storage. This design covers how `packages/persistence` turns those in-memory aggregates
into durable, auditable Postgres rows without leaking storage concerns back into `domain` or
`rules` (architecture doc: "`domain` and `rules` do not import Nest or Fastify" — by extension they
must not import Kysely either).

## Goals / Non-Goals

**Goals:**
- One transaction boundary per mutation: domain change + audit + outbox, always together.
- Repositories are the only path to Postgres; nothing else in the monorepo issues raw SQL.
- Migrations are explicit, reviewable, and applied by exactly one controlled process role.

**Non-Goals:**
- No HTTP surface, no auth — that's phase 5.
- No outbox *consumption* (worker relay, projection recalculation) — that's phase 9. This phase only
  guarantees the outbox row exists reliably; phase 9 owns reading it.
- No object storage / media adapter — out of scope for this phase.

## Decisions

**Kysely, not a full ORM (e.g. TypeORM, Prisma).** Explicit architectural rule: "do not make ORM
lifecycle hooks the source of tournament integrity." Kysely is a typed query builder, not an ORM —
it has no entity lifecycle hooks, no implicit cascades, no hidden N+1 query generation. Every write
is an explicit, reviewable SQL statement. Alternative considered: Prisma — rejected because its
migration engine and client codegen model encourage schema-first modeling that fights the
domain-first approach phase 2 already committed to, and its lifecycle hooks are exactly the
"implicit integrity" pattern the architecture doc warns against.

**Snake_case schema, camelCase domain — mapping owned entirely by this package.** Rather than
configuring Kysely's naming plugin to auto-convert everywhere (which hides the boundary), each
repository explicitly maps its aggregate's camelCase fields to snake_case columns in one place. This
keeps the mapping auditable and matches the SSE contract's own explicit statement that `packages/
persistence` owns the camelCase-wire-to-snake_case-column mapping for outbox events.

**One outbox table, not per-aggregate outbox tables.** A single `outbox_events` table (rather than
one per aggregate type) keeps phase 9's relay logic simple — one poll loop, one dead-letter table —
at the cost of a slightly wider table. Alternative considered: per-aggregate outbox tables for
narrower indexes — rejected; CopaLibre's write volume does not justify the added relay complexity
this session.

**Repository-enforced invariants, not database constraints alone.** Domain invariants from phase 2
(e.g. effective-ruleset compilation validity) are checked in the repository layer before any SQL
runs, in addition to whatever database-level constraints exist. Database constraints alone cannot
express CopaLibre's richer invariants (e.g. "unspecified deep merges are prohibited" for ruleset
overrides), so the repository is the enforcement point; database constraints are a defense-in-depth
backstop, not the primary mechanism.

## Risks / Trade-offs

- [Risk] A single wide `outbox_events` table could become a write hotspot under high match-event
  volume. → Mitigation: index on `(created_at, consumed_at)` for phase 9's poll query now, and
  revisit partitioning only if measured load requires it — no premature optimization.
- [Risk] Repository-layer invariant checks duplicate some logic already expressed in phase 2's
  domain package. → Mitigation: repositories call phase 2's validation functions directly rather
  than reimplementing them; the repository only adds the transaction/persistence wrapper.
- [Risk] `apps/migrate` running "one controlled job per release" could be skipped by an operator
  running `apps/api` directly against an unmigrated database. → Mitigation: `apps/api`'s readiness
  check queries a `schema_version` table and refuses to serve traffic if it doesn't match the
  expected version — this is a task in this phase, not deferred to phase 21's `copalibre doctor`.

## Migration Plan

This phase establishes the migration mechanism itself; there is no prior schema to migrate from.
Rollback strategy for future migrations: every migration ships a corresponding `down` migration;
`apps/migrate` supports applying and reverting one step, consistent with the "migration ordering and
rollback/forward-fix policy" requirement in the architecture doc's "Backup, restore, and upgrade"
section (full backup/restore tooling is phase 21's scope; this phase only guarantees migrations are
individually reversible).
